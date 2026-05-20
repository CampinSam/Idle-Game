/**
 * Outcome-spec normalization (write-side migration).
 *
 * Historically, currency / item / entity_xp / keeper_xp outcome entries used
 * a single `amount` field. The canonical authoring + runtime shape is
 * `{ key, min, max }` (rolled per-grant by GameRulesService.resolveOutcomes).
 *
 * This util walks an outcomeSpec value and converts any legacy `{ amount: N }`
 * entry into `{ min: N, max: N }`, recursing through nested `bundle` arrays.
 * It is invoked at every write boundary — bootstrap definition load, seed
 * upsert, and admin save — so the database only ever stores canonical specs.
 *
 * It is NOT a runtime fallback: the resolver itself reads `min`/`max` only.
 * This file exists purely to migrate legacy data on the way in.
 */

const SKIP_TYPES = new Set(['bundle', 'bundle_ref', 'flag', 'text', 'emitEvent']);

export interface NormalizeResult {
  value: any;
  changed: number;
}

function walkArray(items: any[], counter: { n: number }): any[] {
  return items.map((item) => walkEntry(item, counter));
}

function walkEntry(item: any, counter: { n: number }): any {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;

  let next: any = item;

  if (Array.isArray(item.bundle)) {
    next = { ...next, bundle: walkArray(item.bundle, counter) };
  }

  const isBundleEntry = Array.isArray(next.bundle);
  const skipByType = typeof next.type === 'string' && SKIP_TYPES.has(next.type);

  if (!isBundleEntry && !skipByType && 'amount' in next) {
    const raw = next.amount;
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    const { amount: _amount, ...rest } = next;
    if (Number.isFinite(n)) {
      next = {
        ...rest,
        min: rest.min !== undefined ? rest.min : n,
        max: rest.max !== undefined ? rest.max : n,
      };
    } else {
      next = {
        ...rest,
        min: rest.min !== undefined ? rest.min : 0,
        max: rest.max !== undefined ? rest.max : 0,
      };
    }
    counter.n += 1;
  }

  return next;
}

export function normalizeOutcomeSpec(value: any): NormalizeResult {
  const counter = { n: 0 };

  if (value == null) return { value, changed: 0 };

  if (Array.isArray(value)) {
    return { value: walkArray(value, counter), changed: counter.n };
  }

  if (typeof value === 'object') {
    if (Array.isArray((value as any).rewards)) {
      return {
        value: { ...value, rewards: walkArray((value as any).rewards, counter) },
        changed: counter.n,
      };
    }
    if (Array.isArray((value as any).bundle)) {
      return {
        value: { ...value, bundle: walkArray((value as any).bundle, counter) },
        changed: counter.n,
      };
    }
    return { value: walkEntry(value, counter), changed: counter.n };
  }

  return { value, changed: 0 };
}

/**
 * Migrate a GiftDef rewardSpec from legacy formats to the canonical array shape.
 *
 * Two legacy forms are handled:
 *  1. Single-object spec  `{ type, key, ... }` — wrapped in a one-element array.
 *  2. `lootTable` entry   `{ type: 'lootTable', lootboxDefId, qty }` — rewritten
 *     to a canonical item entry `{ type: 'item', key: lootboxDefId, min: qty,
 *     max: qty, odds: 1 }`. A lootbox is just an item; nothing about granting it
 *     is special — the lootbox-open behavior triggers later when the player opens
 *     the item instance, not at grant time.
 *
 * Returns the migrated value and how many mutations were applied (for logging).
 * Idempotent: if the input is already a canonical array with no lootTable entries,
 * changed === 0 and value is returned unchanged.
 */
export function migrateGiftRewardSpec(value: any): NormalizeResult {
  if (value == null) return { value, changed: 0 };

  let entries: any[];
  let wrappingCount = 0;

  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === 'object' && value.type) {
    // Legacy single bare-object — wrap in array.
    entries = [value];
    wrappingCount = 1;
  } else {
    // Empty object `{}` or unrecognised shape — normalise to empty array.
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      return { value: [], changed: 1 };
    }
    return { value, changed: 0 };
  }

  let lootTableCount = 0;
  const migrated = entries.map((entry: any) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry.type !== 'lootTable') return entry;
    if (!entry.lootboxDefId) return entry;
    const qty = entry.qty ?? 1;
    lootTableCount += 1;
    return { type: 'item', key: entry.lootboxDefId, min: qty, max: qty, odds: 1 };
  });

  const totalChanged = wrappingCount + lootTableCount;
  return { value: migrated, changed: totalChanged };
}

/**
 * Map of Prisma model name → list of JSON columns that hold an outcomeSpec.
 *
 * Single source of truth for outcomeSpec storage. Verified against:
 *   1. `apps/web/src/features/admin/smart/tableSchemas.ts` (every field with
 *      `type: 'outcomeSpec'` — what the editor authors).
 *   2. `prisma/schema.prisma` JSON columns — only entries listed here hold
 *      reward outcome arrays. Other Json fields on def models are unrelated:
 *        - missionDef.rewardPreview → display string[]
 *        - modalDef.spec            → modal config
 *        - checkInDef.rewards       → checkInDays array (gift: GiftSpec entries)
 */
export const OUTCOME_SPEC_FIELDS_BY_MODEL: Record<string, string[]> = {
  missionDef: ['success', 'failure'],
  recipeDef: ['rewards'],
  giftDef: ['rewardSpec'],
  lootboxDef: ['outcomes'],
  bundleDef: ['bundle'],
  questDef: ['rewardSpec'],
};

/**
 * In-place: normalize every outcomeSpec field on `data` for the given model.
 * For giftDef.rewardSpec, also runs the gift-specific legacy migration
 * (lootTable → item, single-object → array) before the general normalization.
 * Returns the total number of legacy entries that were rewritten.
 */
export function normalizeOutcomeFieldsForModel(modelName: string, data: any): number {
  if (!data || typeof data !== 'object') return 0;
  const fields = OUTCOME_SPEC_FIELDS_BY_MODEL[modelName];
  if (!fields) return 0;
  let total = 0;
  for (const f of fields) {
    if (data[f] === undefined) continue;
    // Gift rewardSpec gets a gift-specific migration pass first:
    // lootTable → item conversion and single-object → array wrapping.
    if (modelName === 'giftDef' && f === 'rewardSpec') {
      const { value: migrated, changed: giftChanged } = migrateGiftRewardSpec(data[f]);
      data[f] = migrated;
      total += giftChanged;
    }
    const { value, changed } = normalizeOutcomeSpec(data[f]);
    data[f] = value;
    total += changed;
  }
  return total;
}

/**
 * Outcome-spec normalization.
 *
 * Historically, currency / item / entity_xp / keeper_xp outcome entries used
 * a single `amount` field. The canonical authoring + runtime shape is now
 * `min` / `max` (rolled per-grant via rollAmount). This util walks an
 * outcomeSpec value and converts any legacy `{ amount: N, ... }` entry into
 * `{ min: N, max: N, ... }`, recursing through nested `bundle` arrays.
 *
 * Bundle / bundle_ref / flag / text / emitEvent entries do not carry `amount`
 * and are passed through untouched (besides recursing into nested bundles).
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
    // Old resolver path: `amount` was passed through `Number(...)` and any
    // resulting value <= 0 (including null→0, undefined→NaN→falsy compare,
    // 'abc'→NaN, etc.) skipped the entry. Preserve that semantic by mapping
    // any non-finite or non-positive legacy amount to min=0/max=0, which
    // the new resolver will likewise skip via `if (amount <= 0) continue`.
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
 * Map of Prisma model name → list of JSON columns that hold an outcomeSpec.
 * Mirrors `apps/web/src/features/admin/smart/tableSchemas.ts`.
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
 * Returns the total number of legacy `amount` entries that were rewritten.
 */
export function normalizeOutcomeFieldsForModel(modelName: string, data: any): number {
  if (!data || typeof data !== 'object') return 0;
  const fields = OUTCOME_SPEC_FIELDS_BY_MODEL[modelName];
  if (!fields) return 0;
  let total = 0;
  for (const f of fields) {
    if (data[f] === undefined) continue;
    const { value, changed } = normalizeOutcomeSpec(data[f]);
    data[f] = value;
    total += changed;
  }
  return total;
}

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
 *
 * Single source of truth for outcomeSpec storage. Verified against:
 *   1. `apps/web/src/features/admin/smart/tableSchemas.ts` (every field with
 *      `type: 'outcomeSpec'` — what the editor authors).
 *   2. `prisma/schema.prisma` JSON columns — only entries listed here hold
 *      reward outcome arrays. Other Json fields on def models are unrelated:
 *        - missionDef.rewardPreview → display string[]
 *        - modalDef.spec            → modal config
 *        - checkInDef.rewards       → checkInDays array (giftDefId pointers)
 *
 * The unit test in `outcome-spec.util.spec.ts` pins this map exactly so any
 * future drift is caught at CI time.
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
 * Resolve the "how much" for a single reward entry, supporting both shapes:
 *   - legacy: `{ amount: N }` (or `{ qty: N }` for items)
 *   - canonical: `{ min: N, max: M }` (rolled per-grant)
 *
 * `rng.nextInt(lo, hi)` is used when both min and max are finite and lo < hi;
 * otherwise the call falls back to `Math.random()` so callers without an RNG
 * (gift/quest claims today) still roll a real number.
 *
 * Returns 0 for null / undefined / non-finite / negative inputs — callers gate
 * on `amount > 0` to skip empty entries (matching the resolver's contract).
 */
export function pickSpecAmount(
  spec: { amount?: any; qty?: any; min?: any; max?: any } | null | undefined,
  rng?: { nextInt: (min: number, max: number) => number },
): number {
  if (!spec || typeof spec !== 'object') return 0;

  const legacyRaw = spec.amount !== undefined && spec.amount !== null
    ? spec.amount
    : spec.qty;
  if (legacyRaw !== undefined && legacyRaw !== null) {
    const n = Number(legacyRaw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }

  const minRaw = spec.min;
  const maxRaw = spec.max;
  const minN = minRaw === undefined || minRaw === null ? NaN : Number(minRaw);
  const maxN = maxRaw === undefined || maxRaw === null ? NaN : Number(maxRaw);
  const haveMin = Number.isFinite(minN);
  const haveMax = Number.isFinite(maxN);
  if (!haveMin && !haveMax) return 0;

  const lo = Math.floor(haveMin ? minN : maxN);
  const hi = Math.floor(haveMax ? maxN : minN);
  if (hi <= 0) return 0;
  const clampedLo = Math.max(0, Math.min(lo, hi));
  if (clampedLo === hi) return hi;
  if (rng) return rng.nextInt(clampedLo, hi);
  return Math.floor(Math.random() * (hi - clampedLo + 1)) + clampedLo;
}

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

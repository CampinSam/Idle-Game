import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves a definition identifier (UUID or key slug) to the full record.
 * Tries UUID lookup (`id`) first; falls back to key-based lookup if not found.
 * Returns null if not found or if the model does not support key-based lookup.
 */
export async function resolveDefRecord(model: any, value: string): Promise<any | null> {
  const byId = await model.findUnique({ where: { id: value } });
  if (byId) return byId;
  try {
    return (await model.findFirst({ where: { key: value } })) ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves a definition identifier (UUID or key slug) to its UUID string.
 * Returns null if not found.
 */
export async function resolveDefId(model: any, value: string): Promise<string | null> {
  const record = await resolveDefRecord(model, value);
  return record?.id ?? null;
}

/**
 * Map from screen section prop field name to the Prisma delegate name.
 * Used by resolveScreenSectionProps to normalise *DefId / *Id prop fields to UUID.
 */
const PROP_FIELD_TO_MODEL: Record<string, string> = {
  missionDefId: 'missionDef',
  recipeDefId: 'recipeDef',
  lootboxDefId: 'lootboxDef',
  giftDefId: 'giftDef',
  bundleDefId: 'bundleDef',
  checkInDefId: 'checkInDef',
  questDefId: 'questDef',
  itemDefId: 'itemDefinition',
  nftCollectionDefId: 'nftCollectionDef',
  modalDefId: 'modalDef',
  defaultModalDefId: 'defaultModalDef',
  shopItemDefId: 'shopItemDef',
  shopTabDefId: 'shopTabDef',
  shopSectionDefId: 'shopSectionDef',
  homeBannerDefId: 'homeBannerDef',
  systemIconDefId: 'systemIconDef',
  selectionRuleDefId: 'selectionRuleDef',
  eventDefId: 'eventDefinition',
  displayDefId: 'displayDef',
  tagDefId: 'tagDef',
  visualEffectDefId: 'visualEffectDef',
  missionCategoryDefId: 'missionCategoryDef',
  buildingDefId: 'buildingDef',
  roomDefId: 'roomDef',
  entityDefId: 'entityDefinition',
  locationDefId: 'locationDefinition',
  seasonId: 'season',
  currencyId: 'currency',
  // Screen composer picker prop field names (may differ from the *DefId convention)
  telemetryDefId: 'telemetryDef',
  locationId: 'locationDefinition',
  offerId: 'shopItemDef',
  storeItemId: 'shopItemDef',
  // Entity instance picker — entity instances already use UUIDs; this entry
  // ensures the field is recognised so a non-UUID value is flagged as unresolvable
  // rather than silently skipped.
  entityId: 'entity',
};

/** The full set of field names tracked by PROP_FIELD_TO_MODEL, exported for backfill use. */
export const KNOWN_DEF_PROP_FIELDS = new Set(Object.keys(PROP_FIELD_TO_MODEL));

// ---------------------------------------------------------------------------
// Audit types
// ---------------------------------------------------------------------------

/**
 * A single non-UUID ref found during a read-only audit pass.
 * model    — Prisma model name (e.g. "lootboxDef")
 * recordId — UUID primary key of the owning record
 * fieldPath — dot/bracket path to the offending value (e.g. "outcomes[2].key")
 * value    — the raw non-UUID string that was not resolved during the backfill
 */
export type AuditFinding = {
  model: string;
  recordId: string;
  fieldPath: string;
  value: string;
};

// ---------------------------------------------------------------------------
// Outcome-spec UUID resolver
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a single key-string value to a UUID using the given Prisma model.
 * Returns the original value if it is already a UUID or cannot be resolved.
 */
async function resolveKeyOrUuid(model: any, value: string): Promise<string> {
  if (!value || UUID_RE.test(value)) return value;
  try {
    const uuid = await resolveDefId(model, value);
    return uuid ?? value;
  } catch {
    return value;
  }
}

/**
 * Recursively walks an outcome-spec entry (a single object) and resolves any
 * key-string references to UUIDs.  Returns `{ entry, changed }` where `changed`
 * is the number of fields that were rewritten.
 *
 * Fields resolved:
 *  - `type: 'item'`       → `entry.key`                       → itemDefinition.id
 *  - `type: 'currency'`   → `entry.key`                       → currency.id
 *  - `type: 'bundle_ref'` → `entry.bundleDefId`               → bundleDef.id
 *  - `type: 'emitEvent'`  → `entry.payload.gift.giftDefId`    → giftDef.id
 *  - Inline `bundle[]`    → recursed via resolveOutcomeArrayUuids
 */
async function resolveOutcomeEntryUuids(
  prisma: PrismaService,
  entry: unknown,
): Promise<{ entry: unknown; changed: number }> {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { entry, changed: 0 };
  }

  let next: any = entry as any;
  let changed = 0;

  // Recurse into inline bundle arrays first
  if (Array.isArray(next.bundle)) {
    const { result: newBundle, changed: bundleChanged } = await resolveOutcomeArrayUuids(prisma, next.bundle);
    if (bundleChanged > 0) {
      next = { ...next, bundle: newBundle };
      changed += bundleChanged;
    }
  }

  const type: string = typeof next.type === 'string' ? next.type : '';

  // Resolve item / currency key
  if ((type === 'item' || type === 'currency') && typeof next.key === 'string' && next.key) {
    const modelName = type === 'item' ? 'itemDefinition' : 'currency';
    const model = (prisma as any)[modelName];
    if (model) {
      const uuid = await resolveKeyOrUuid(model, next.key);
      if (uuid !== next.key) {
        next = { ...next, key: uuid };
        changed++;
      }
    }
  }

  // Resolve bundle_ref bundleDefId
  if (type === 'bundle_ref' && typeof next.bundleDefId === 'string' && next.bundleDefId) {
    const uuid = await resolveKeyOrUuid((prisma as any).bundleDef, next.bundleDefId);
    if (uuid !== next.bundleDefId) {
      next = { ...next, bundleDefId: uuid };
      changed++;
    }
  }

  // Resolve emitEvent payload.gift.giftDefId
  if (
    type === 'emitEvent' &&
    next.payload &&
    typeof next.payload === 'object' &&
    next.payload.gift &&
    typeof next.payload.gift === 'object' &&
    typeof next.payload.gift.giftDefId === 'string' &&
    next.payload.gift.giftDefId
  ) {
    const uuid = await resolveKeyOrUuid((prisma as any).giftDef, next.payload.gift.giftDefId);
    if (uuid !== next.payload.gift.giftDefId) {
      next = {
        ...next,
        payload: { ...next.payload, gift: { ...next.payload.gift, giftDefId: uuid } },
      };
      changed++;
    }
  }

  return { entry: next, changed };
}

/**
 * Walks an array of outcome-spec entries, resolving all key-string def references
 * to UUIDs.  Returns the (potentially mutated) array and total change count.
 */
export async function resolveOutcomeArrayUuids(
  prisma: PrismaService,
  items: unknown[],
): Promise<{ result: unknown[]; changed: number }> {
  let changed = 0;
  const result: unknown[] = [];
  for (const item of items) {
    const { entry, changed: c } = await resolveOutcomeEntryUuids(prisma, item);
    result.push(entry);
    changed += c;
  }
  return { result, changed };
}

/**
 * Resolves UUID refs inside a tiered-object blob.
 * A tiered object has the shape `{ [tierKey]: { rewards: OutcomeEntry[] } }`.
 * Returns the updated object and total change count.
 */
export async function resolveTieredObjectUuids(
  prisma: PrismaService,
  tiered: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; changed: number }> {
  let changed = 0;
  const result: Record<string, unknown> = {};
  for (const [tierKey, tier] of Object.entries(tiered)) {
    if (tier && typeof tier === 'object' && !Array.isArray(tier) && Array.isArray((tier as any).rewards)) {
      const { result: newRewards, changed: c } = await resolveOutcomeArrayUuids(prisma, (tier as any).rewards);
      changed += c;
      result[tierKey] = { ...(tier as any), rewards: newRewards };
    } else {
      result[tierKey] = tier;
    }
  }
  return { result, changed };
}

/**
 * Resolves UUID refs inside a phases array.
 * Each phase entry may contain:
 *   - `tiers`: tiered object (resolved via resolveTieredObjectUuids)
 *   - `success`: { rewards: [] } (resolved via resolveOutcomeArrayUuids)
 *   - `failure`: { rewards: [] } (resolved via resolveOutcomeArrayUuids)
 */
export async function resolvePhasesArrayUuids(
  prisma: PrismaService,
  phases: unknown[],
): Promise<{ result: unknown[]; changed: number }> {
  let changed = 0;
  const result: unknown[] = [];
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) {
      result.push(phase);
      continue;
    }
    let next: any = phase;

    if (next.tiers && typeof next.tiers === 'object' && !Array.isArray(next.tiers)) {
      const { result: newTiers, changed: c } = await resolveTieredObjectUuids(prisma, next.tiers);
      if (c > 0) { next = { ...next, tiers: newTiers }; changed += c; }
    }

    for (const subKey of ['success', 'failure'] as const) {
      if (next[subKey] && typeof next[subKey] === 'object' && Array.isArray(next[subKey].rewards)) {
        const { result: newRewards, changed: c } = await resolveOutcomeArrayUuids(prisma, next[subKey].rewards);
        if (c > 0) { next = { ...next, [subKey]: { ...next[subKey], rewards: newRewards } }; changed += c; }
      }
    }

    result.push(next);
  }
  return { result, changed };
}

/**
 * Resolves giftDefId references inside a checkInDef rewards array.
 * Each entry has the shape `{ gift: { giftDefId: string } }`.
 */
export async function resolveCheckInRewardsUuids(
  prisma: PrismaService,
  rewards: unknown[],
): Promise<{ result: unknown[]; changed: number }> {
  let changed = 0;
  const result: unknown[] = [];
  for (const day of rewards) {
    if (!day || typeof day !== 'object' || Array.isArray(day)) { result.push(day); continue; }
    const dayObj: any = day;
    if (!dayObj.gift || typeof dayObj.gift !== 'object' || typeof dayObj.gift.giftDefId !== 'string') {
      result.push(day);
      continue;
    }
    const uuid = await resolveKeyOrUuid((prisma as any).giftDef, dayObj.gift.giftDefId);
    if (uuid !== dayObj.gift.giftDefId) {
      result.push({ ...dayObj, gift: { ...dayObj.gift, giftDefId: uuid } });
      changed++;
    } else {
      result.push(day);
    }
  }
  return { result, changed };
}

/**
 * Resolve the `defId` field within a single `resources` array entry.
 * The `type` field ("currency" | "item") determines which model to query.
 * Returns the entry unchanged when type is unknown or resolution fails.
 */
async function resolveResourceEntry(
  prisma: PrismaService,
  entry: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const defId = entry.defId;
  if (typeof defId !== 'string' || !defId) return entry;

  const modelName =
    entry.type === 'currency' ? 'currency'
    : entry.type === 'item'     ? 'itemDefinition'
    : null;
  if (!modelName) return entry;

  try {
    const model = (prisma as any)[modelName];
    if (!model) return entry;
    const uuid = await resolveDefId(model, defId);
    return uuid && uuid !== defId ? { ...entry, defId: uuid } : entry;
  } catch {
    return entry;
  }
}

/**
 * Normalises all recognised *DefId / *Id fields in a section props object to UUIDs.
 * Values already stored as UUIDs pass through unchanged (they match on the id lookup).
 * Unknown fields and resolution failures are preserved as-is — best-effort only.
 *
 * Handles both flat prop fields (via PROP_FIELD_TO_MODEL) and the following
 * known nested structures:
 *   - `resources` array — each entry `{ type: "currency"|"item", defId: string }`
 *     (used by ResourceSummaryBar)
 */
export async function resolveScreenSectionProps(
  prisma: PrismaService,
  props: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...props };

  // 1. Flat *DefId / *Id fields
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string' || !value) continue;
    const modelName = PROP_FIELD_TO_MODEL[key];
    if (!modelName) continue;
    try {
      const model = (prisma as any)[modelName];
      if (!model) continue;
      const uuid = await resolveDefId(model, value);
      if (uuid && uuid !== value) {
        result[key] = uuid;
      }
    } catch {
      // Preserve original value on resolution failure
    }
  }

  // 2. Nested: resources[] — each entry { type, defId }
  if (Array.isArray(props.resources)) {
    result.resources = await Promise.all(
      (props.resources as any[]).map(entry =>
        entry && typeof entry === 'object'
          ? resolveResourceEntry(prisma, entry as Record<string, unknown>)
          : entry,
      ),
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Read-only audit walkers — same shape coverage as the resolvers above,
// but synchronous and non-mutating. Collect AuditFinding entries for any
// non-UUID key / bundleDefId / giftDefId values found in JSON blobs.
// ---------------------------------------------------------------------------

/**
 * Walk a single outcome-spec entry and append any non-UUID def refs to `out`.
 */
function auditOutcomeEntry(
  record: { model: string; id: string },
  entry: unknown,
  fieldPath: string,
  out: AuditFinding[],
): void {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
  const e = entry as any;

  // Recurse into inline bundle arrays first
  if (Array.isArray(e.bundle)) {
    e.bundle.forEach((item: unknown, idx: number) =>
      auditOutcomeEntry(record, item, `${fieldPath}.bundle[${idx}]`, out),
    );
  }

  const type: string = typeof e.type === 'string' ? e.type : '';

  // item / currency key
  if (
    (type === 'item' || type === 'currency') &&
    typeof e.key === 'string' && e.key &&
    !UUID_RE.test(e.key)
  ) {
    out.push({ model: record.model, recordId: record.id, fieldPath: `${fieldPath}.key`, value: e.key });
  }

  // bundle_ref bundleDefId
  if (
    type === 'bundle_ref' &&
    typeof e.bundleDefId === 'string' && e.bundleDefId &&
    !UUID_RE.test(e.bundleDefId)
  ) {
    out.push({ model: record.model, recordId: record.id, fieldPath: `${fieldPath}.bundleDefId`, value: e.bundleDefId });
  }

  // emitEvent payload.gift.giftDefId
  if (
    type === 'emitEvent' &&
    e.payload?.gift &&
    typeof e.payload.gift.giftDefId === 'string' && e.payload.gift.giftDefId &&
    !UUID_RE.test(e.payload.gift.giftDefId)
  ) {
    out.push({
      model: record.model,
      recordId: record.id,
      fieldPath: `${fieldPath}.payload.gift.giftDefId`,
      value: e.payload.gift.giftDefId,
    });
  }
}

/**
 * Walk an array of outcome-spec entries and append findings for non-UUID refs.
 */
export function auditOutcomeArray(
  record: { model: string; id: string },
  items: unknown[],
  fieldPath: string,
  out: AuditFinding[],
): void {
  items.forEach((item, idx) =>
    auditOutcomeEntry(record, item, `${fieldPath}[${idx}]`, out),
  );
}

/**
 * Walk a tiered object `{ [tierKey]: { rewards: [] } }` and collect findings.
 */
export function auditTieredObject(
  record: { model: string; id: string },
  tiered: Record<string, unknown>,
  fieldPath: string,
  out: AuditFinding[],
): void {
  for (const [tierKey, tier] of Object.entries(tiered)) {
    if (tier && typeof tier === 'object' && !Array.isArray(tier) && Array.isArray((tier as any).rewards)) {
      auditOutcomeArray(record, (tier as any).rewards, `${fieldPath}.${tierKey}.rewards`, out);
    }
  }
}

/**
 * Walk a phases array and collect findings from tiers and success/failure blocks.
 */
export function auditPhasesArray(
  record: { model: string; id: string },
  phases: unknown[],
  fieldPath: string,
  out: AuditFinding[],
): void {
  phases.forEach((phase, idx) => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) return;
    const p = phase as any;
    const pPath = `${fieldPath}[${idx}]`;

    if (p.tiers && typeof p.tiers === 'object' && !Array.isArray(p.tiers)) {
      auditTieredObject(record, p.tiers, `${pPath}.tiers`, out);
    }

    for (const subKey of ['success', 'failure'] as const) {
      if (p[subKey] && typeof p[subKey] === 'object' && Array.isArray(p[subKey].rewards)) {
        auditOutcomeArray(record, p[subKey].rewards, `${pPath}.${subKey}.rewards`, out);
      }
    }
  });
}

/**
 * Walk a checkInDef rewards array `[{ gift: { giftDefId } }]` and collect findings.
 */
export function auditCheckInRewards(
  record: { model: string; id: string },
  rewards: unknown[],
  fieldPath: string,
  out: AuditFinding[],
): void {
  rewards.forEach((day, idx) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) return;
    const d = day as any;
    if (
      d.gift &&
      typeof d.gift.giftDefId === 'string' && d.gift.giftDefId &&
      !UUID_RE.test(d.gift.giftDefId)
    ) {
      out.push({
        model: record.model,
        recordId: record.id,
        fieldPath: `${fieldPath}[${idx}].gift.giftDefId`,
        value: d.gift.giftDefId,
      });
    }
  });
}

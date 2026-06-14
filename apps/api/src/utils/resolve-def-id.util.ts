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

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
};

/**
 * Normalises all recognised *DefId / *Id fields in a section props object to UUIDs.
 * Values already stored as UUIDs pass through unchanged (they match on the id lookup).
 * Unknown fields and resolution failures are preserved as-is — best-effort only.
 */
export async function resolveScreenSectionProps(
  prisma: PrismaService,
  props: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...props };
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
  return result;
}

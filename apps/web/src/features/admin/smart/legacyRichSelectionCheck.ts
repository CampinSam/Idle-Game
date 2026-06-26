export interface BadRichSelectionField {
  field: string;
  path: string;
  rawValue: unknown;
}

export interface BrokenRuleRefField {
  field: string;
  path: string;
  refId: string;
}

function isRichSelection(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'op' in (v as object) &&
    'rules' in (v as object) &&
    Array.isArray((v as any).rules)
  );
}

const ARRAY_CONTAINER_TYPES = new Set([
  'objectivesArray', 'checkInDaysArray', 'effectsArray', 'synergyEffectsArray',
  'telemetrySubEventsArray', 'missionPhases', 'costArray',
]);

const OBJECT_CONTAINER_TYPES = new Set([
  'statMap', 'slotStatsMap', 'slotArchetypesMap', 'equipmentSlotsMap',
  'traits', 'giftPresentation', 'giftClaimRules', 'itemEquipData',
  'homeBannerConfig', 'eventSecurity',
]);

export function detectBadStructuredFields(
  record: Record<string, any>,
  schema: { fields: Record<string, { type: string; typeResolver?: (r: any) => string }> },
  tableLabel: string,
): BadRichSelectionField[] {
  const bad: BadRichSelectionField[] = [];
  for (const [fname, fdef] of Object.entries(schema.fields)) {
    const effectiveType = fdef.typeResolver ? fdef.typeResolver(record) : fdef.type;
    const v = record[fname];
    if (v === null || v === undefined) continue;

    if (effectiveType === 'richSelection') {
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      if (!isRichSelection(v)) {
        bad.push({ field: fname, path: `${tableLabel} → ${record.id ?? 'new'} → ${fname}`, rawValue: v });
      }
    } else if (ARRAY_CONTAINER_TYPES.has(effectiveType)) {
      if (!Array.isArray(v)) {
        bad.push({ field: fname, path: `${tableLabel} → ${record.id ?? 'new'} → ${fname}`, rawValue: v });
      }
    } else if (OBJECT_CONTAINER_TYPES.has(effectiveType)) {
      if (typeof v !== 'object' || Array.isArray(v)) {
        bad.push({ field: fname, path: `${tableLabel} → ${record.id ?? 'new'} → ${fname}`, rawValue: v });
      }
    }
  }
  return bad;
}

export function detectBadRichSelectionFields(
  record: Record<string, any>,
  schema: { fields: Record<string, { type: string; typeResolver?: (r: any) => string }> },
  tableLabel: string,
): BadRichSelectionField[] {
  return detectBadStructuredFields(record, schema, tableLabel);
}

function collectBrokenRuleRefs(node: any, knownIds: Set<string>, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'rule_ref') {
    const id: string = node.id ?? '';
    if (id.trim() && !knownIds.has(id)) out.push(id);
    return;
  }
  if (Array.isArray(node.rules)) {
    for (const child of node.rules) collectBrokenRuleRefs(child, knownIds, out);
  }
}

export function detectBrokenRuleRefFields(
  record: Record<string, any>,
  schema: { fields: Record<string, { type: string; typeResolver?: (r: any) => string }> },
  tableLabel: string,
  knownRuleDefIds: Set<string>,
): BrokenRuleRefField[] {
  const broken: BrokenRuleRefField[] = [];
  for (const [fname, fdef] of Object.entries(schema.fields)) {
    const effectiveType = fdef.typeResolver ? fdef.typeResolver(record) : fdef.type;
    if (effectiveType !== 'richSelection') continue;
    const v = record[fname];
    if (!isRichSelection(v)) continue;
    const brokenIds: string[] = [];
    collectBrokenRuleRefs(v, knownRuleDefIds, brokenIds);
    for (const refId of brokenIds) {
      broken.push({
        field: fname,
        path: `${tableLabel} → ${record.id ?? 'new'} → ${fname} → rule_ref("${refId}")`,
        refId,
      });
    }
  }
  return broken;
}

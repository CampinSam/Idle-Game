export interface BadRichSelectionField {
  field: string;
  path: string;
  rawValue: unknown;
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

export function detectBadRichSelectionFields(
  record: Record<string, any>,
  schema: { fields: Record<string, { type: string; typeResolver?: (r: any) => string }> },
  tableLabel: string,
): BadRichSelectionField[] {
  const bad: BadRichSelectionField[] = [];
  for (const [fname, fdef] of Object.entries(schema.fields)) {
    const effectiveType = fdef.typeResolver ? fdef.typeResolver(record) : fdef.type;
    if (effectiveType !== 'richSelection') continue;
    const v = record[fname];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    if (isRichSelection(v)) continue;
    bad.push({
      field: fname,
      path: `${tableLabel} → ${record.id ?? 'new'} → ${fname}`,
      rawValue: v,
    });
  }
  return bad;
}

export function isEntityTargetedConsumable(item: any): boolean {
  const cd = item?.consumableData ?? item?.definition?.consumableData;
  if (!cd) return false;

  const effects = Array.isArray(cd.effects) ? cd.effects : [];
  if (effects.length === 0) return false;

  return effects.some((e: any) => {
    const tt = (e?.targetType ?? '').toString().toLowerCase();
    if (!tt) return true;
    return tt === 'entity';
  });
}

export function isPerfectSpecimen(entity: any): boolean {
  const traits = entity?.traits;
  if (!traits || typeof traits !== 'object') return false;
  const values = Object.values(traits).filter((v) => typeof v === 'string' && v.length > 0);
  if (values.length < 2) return false;
  return new Set(values).size === 1;
}

export function getPerfectSpecimenTrait(entity: any): string | null {
  if (!isPerfectSpecimen(entity)) return null;
  const first = Object.values(entity.traits).find((v) => typeof v === 'string') as string | undefined;
  return first ?? null;
}

import type { UniqueLocationEntry } from '@derp/shared';

export function getUniqueEntry(
  instance: { nftAssetId?: string | null },
  definition: { rules?: any } | null | undefined,
): UniqueLocationEntry | null {
  if (!instance?.nftAssetId) return null;
  const uniques = definition?.rules?.uniques as Record<string, UniqueLocationEntry> | undefined;
  if (!uniques) return null;
  return uniques[instance.nftAssetId] ?? null;
}

/**
 * Shared backward-compatibility helper for The Forge migration: pre-Forge
 * CraftingJobs were stored without `data.locationId`. The new place-based UI
 * filters jobs by locationId, so legacy in-flight jobs would otherwise be
 * invisible. Both `QueryService.bootstrap` and `CraftingService.getActiveJobs`
 * call into this helper to adopt orphan jobs and persist the patch.
 *
 * The mutation is in-place on the supplied `jobs` array so the caller's
 * subsequent serialization sees the patched `data.locationId`.
 */
export interface AdoptableJob {
  id: string;
  type: string;
  data?: any;
}

export interface AdoptableLocation {
  id: string;
  buildings?: Array<{
    enabled?: boolean;
    buildingDef?: { category?: string };
  }>;
}

export async function adoptLegacyCraftingJobLocations(
  prisma: any,
  jobs: AdoptableJob[],
  resolveFallbackLocationId: () => Promise<string | null> | string | null,
): Promise<void> {
  const legacy = (jobs || []).filter(
    (j) => j.type === 'CraftingJob' && !((j.data as any)?.locationId),
  );
  if (legacy.length === 0) return;

  const fallback = await Promise.resolve(resolveFallbackLocationId());
  if (!fallback) return;

  for (const j of legacy) {
    const nextData = { ...((j.data as any) || {}), locationId: fallback };
    try {
      await prisma.job.update({ where: { id: j.id }, data: { data: nextData } });
      j.data = nextData;
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Picks the first enabled WORKSHOP locationId from a snapshot of locations
 * (with eager-loaded buildings + buildingDef.category), falling back to the
 * first WORKSHOP-bearing location if none is currently enabled.
 */
export function pickFallbackWorkshopLocationId(
  locations: AdoptableLocation[] | null | undefined,
): string | null {
  if (!locations) return null;
  for (const loc of locations) {
    const ws = (loc.buildings || []).find(
      (b) => b?.buildingDef?.category === 'WORKSHOP' && b?.enabled !== false,
    );
    if (ws) return loc.id;
  }
  for (const loc of locations) {
    const anyWs = (loc.buildings || []).find(
      (b) => b?.buildingDef?.category === 'WORKSHOP',
    );
    if (anyWs) return loc.id;
  }
  return null;
}

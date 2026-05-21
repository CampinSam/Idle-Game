/**
 * Migrates old missionDef records that store outcomes as top-level `success` /
 * `failure` fields into the new `tiers` object shape (`tiers.common` /
 * `tiers.failure`).  Returns the migrated record and a flag indicating whether
 * any migration was performed.  The original record is never mutated.
 */
export function migrateMissionOutcomes(record: Record<string, any>): {
  record: Record<string, any>;
  migrated: boolean;
} {
  const hasLegacySuccess = 'success' in record && record.success !== undefined;
  const hasLegacyFailure = 'failure' in record && record.failure !== undefined;

  if (!hasLegacySuccess && !hasLegacyFailure) {
    return { record, migrated: false };
  }

  const existingTiers: Record<string, any> =
    record.tiers && typeof record.tiers === 'object' ? { ...record.tiers } : {};

  if (hasLegacySuccess && !existingTiers.common) {
    existingTiers.common = record.success;
  }

  if (hasLegacyFailure && !existingTiers.failure) {
    existingTiers.failure = record.failure;
  }

  const { success: _s, failure: _f, ...rest } = record;
  return {
    record: { ...rest, tiers: existingTiers },
    migrated: true,
  };
}

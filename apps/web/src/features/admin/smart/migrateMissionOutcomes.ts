/**
 * Detects and migrates legacy MissionDef records.
 *
 * Legacy fields that are converted to the unified `tiers` format:
 *   - `success`            → `tiers.common`   (outcome rewards/effects/text)
 *   - `failure`            → `tiers.failure`  (outcome rewards/effects/text)
 *   - `completedModalDefId`→ `tiers.common.modalDefId`   (modal fallback for all success tiers)
 *   - `failedModalDefId`   → `tiers.failure.modalDefId`
 *
 * After migration the original fields are stripped from the returned record.
 * The caller receives the migrated record and a flag indicating whether any
 * migration was actually performed.
 */

export function needsMissionMigration(record: Record<string, any>): boolean {
  return (
    ('success' in record && record.success !== null && record.success !== undefined) ||
    ('failure' in record && record.failure !== null && record.failure !== undefined) ||
    ('completedModalDefId' in record && record.completedModalDefId !== null && record.completedModalDefId !== undefined) ||
    ('failedModalDefId' in record && record.failedModalDefId !== null && record.failedModalDefId !== undefined)
  );
}

export function migrateMissionOutcomes(record: Record<string, any>): {
  record: Record<string, any>;
  migrated: boolean;
} {
  const hasLegacySuccess = 'success' in record && record.success !== null && record.success !== undefined;
  const hasLegacyFailure = 'failure' in record && record.failure !== null && record.failure !== undefined;
  const hasLegacyCompleted = 'completedModalDefId' in record && record.completedModalDefId !== null && record.completedModalDefId !== undefined;
  const hasLegacyFailed = 'failedModalDefId' in record && record.failedModalDefId !== null && record.failedModalDefId !== undefined;

  if (!hasLegacySuccess && !hasLegacyFailure && !hasLegacyCompleted && !hasLegacyFailed) {
    return { record, migrated: false };
  }

  const existingTiers: Record<string, any> =
    record.tiers && typeof record.tiers === 'object' ? { ...record.tiers } : {};

  if (hasLegacySuccess && !existingTiers.common) {
    existingTiers.common = { ...record.success };
  }

  if (hasLegacyFailure && !existingTiers.failure) {
    existingTiers.failure = { ...record.failure };
  }

  if (hasLegacyCompleted) {
    existingTiers.common = {
      ...(existingTiers.common ?? {}),
      modalDefId: existingTiers.common?.modalDefId ?? record.completedModalDefId,
    };
  }

  if (hasLegacyFailed) {
    existingTiers.failure = {
      ...(existingTiers.failure ?? {}),
      modalDefId: existingTiers.failure?.modalDefId ?? record.failedModalDefId,
    };
  }

  const { success: _s, failure: _f, completedModalDefId: _c, failedModalDefId: _fd, ...rest } = record;
  return {
    record: { ...rest, tiers: existingTiers },
    migrated: true,
  };
}

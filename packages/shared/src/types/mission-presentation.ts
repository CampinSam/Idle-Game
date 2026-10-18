/** Presentation only. Commands, eligibility and rewards are never designer formulas. */
export interface MissionPresentation {
  version: 1;
  spacing?: 'compact' | 'comfortable';
  variant?: 'plain' | 'panel';
}

export function assertMissionPresentation(value: unknown): asserts value is MissionPresentation | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Mission presentation must be an object');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(k => !['version', 'spacing', 'variant'].includes(k))) throw new Error('Unsupported mission presentation option');
  if (data.version !== 1) throw new Error('Mission presentation requires version 1');
  if (data.spacing !== undefined && (typeof data.spacing !== 'string' || !['compact', 'comfortable'].includes(data.spacing))) throw new Error('Unknown mission spacing');
  if (data.variant !== undefined && (typeof data.variant !== 'string' || !['plain', 'panel'].includes(data.variant))) throw new Error('Unknown mission variant');
}

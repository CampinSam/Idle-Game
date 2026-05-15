/**
 * Helpers that read EntityDefinition.progression and turn it into the
 * primitive numbers/objects the level loop and stat-gain math need.
 *
 * The schema-side shape is documented in admin-schemas.md; this module
 * is the single canonical reader so consumers don't reach into the JSON
 * blob directly.
 */
import type { StatGainConfig } from '@derp/math';

export interface XpCurveGeometric {
  kind: 'geometric';
  base: number;
  ratio: number;
}
export interface XpCurveTable {
  kind: 'table';
  perLevel: number[]; // perLevel[L-2] = XP needed to go from L → L+1
}
export type XpCurve = XpCurveGeometric | XpCurveTable;

export interface ProgressionRules {
  enabled?: boolean;
  maxLevel?: number;
  xpCurve?: XpCurve;
  statGain?: StatGainConfig;
}

export class MissingProgressionRulesError extends Error {
  constructor(definitionId: string, field: string) {
    super(
      `EntityDefinition "${definitionId}" is missing required progression rule "${field}". ` +
        `Definitions must declare progression.maxLevel and progression.xpCurve.`,
    );
  }
}

export function getProgressionRules(definition: any, definitionId: string): ProgressionRules {
  const p = (definition?.progression as ProgressionRules) || {};
  if (typeof p.maxLevel !== 'number' || p.maxLevel <= 0) {
    throw new MissingProgressionRulesError(definitionId, 'maxLevel');
  }
  if (!p.xpCurve || typeof p.xpCurve !== 'object') {
    throw new MissingProgressionRulesError(definitionId, 'xpCurve');
  }
  return p;
}

/**
 * XP required to advance from `currentLevel` → `currentLevel + 1`.
 * Mirrors the legacy `XP_PER_LEVEL(level)` semantics: pass the level you
 * are leaving (e.g. 1 for the L1→L2 threshold).
 */
export function xpForNextLevel(rules: ProgressionRules, currentLevel: number): number {
  const curve = rules.xpCurve!;
  if (curve.kind === 'geometric') {
    return Math.floor(curve.base * Math.pow(curve.ratio, currentLevel - 1));
  }
  if (curve.kind === 'table') {
    const idx = currentLevel - 1;
    const v = curve.perLevel[idx];
    if (typeof v !== 'number') {
      throw new Error(`xpCurve.table is missing entry for level ${currentLevel}`);
    }
    return Math.floor(v);
  }
  throw new Error(`Unknown xpCurve kind: ${(curve as any).kind}`);
}

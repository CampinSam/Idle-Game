import type { RichSelection, RichSelectionChild } from '@derp/shared';
import type { GameRulesService } from './game-rules.service';

export type TopLevelRuleStatus = { label?: string; met: boolean };

export function evaluateTopLevelRules(
  selection: RichSelection | null | undefined,
  reqContext: Parameters<GameRulesService['checkRequirements']>[1],
  gameRules: Pick<GameRulesService, 'checkRequirements'>,
): TopLevelRuleStatus[] {
  if (!selection || !Array.isArray(selection.rules)) return [];
  return selection.rules.map((rule: RichSelectionChild) => ({
    label: (rule as { label?: string }).label,
    met: gameRules.checkRequirements({ op: 'AND', rules: [rule] }, reqContext),
  }));
}

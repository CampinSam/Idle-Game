import type { RichSelection, RichSelectionChild } from '@derp/shared';
import type { GameRulesService } from './game-rules.service';

export type TopLevelRuleStatus = { label?: string; met: boolean; text?: string };

export function evaluateTopLevelRules(
  selection: RichSelection | null | undefined,
  reqContext: Parameters<GameRulesService['checkRequirements']>[1],
  gameRules: Pick<GameRulesService, 'checkRequirements'>,
): TopLevelRuleStatus[] {
  if (!selection || !Array.isArray(selection.rules)) return [];
  return selection.rules.map((rule: RichSelectionChild) => {
    const met = gameRules.checkRequirements({ op: 'AND', rules: [rule] }, reqContext);
    const r = rule as { label?: string; failText?: string; passText?: string };
    const text = met ? r.passText : r.failText;
    return {
      label: r.label,
      met,
      ...(text !== undefined && { text }),
    };
  });
}

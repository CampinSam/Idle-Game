import type { RichSelection, RichSelectionChild } from '@derp/shared';
import type { GameRulesService } from './game-rules.service';

export type TopLevelRuleStatus = { label?: string; met: boolean; text?: string };

export function evaluateTopLevelRules(
  selection: RichSelection | null | undefined,
  reqContext: Parameters<GameRulesService['checkRequirements']>[1],
  gameRules: Pick<GameRulesService, 'checkRequirements' | 'getRuleDefLabel'>,
): TopLevelRuleStatus[] {
  if (!selection || !Array.isArray(selection.rules)) return [];
  return selection.rules.map((rule: RichSelectionChild) => {
    const met = gameRules.checkRequirements({ op: 'AND', rules: [rule] }, reqContext);
    const r = rule as { type?: string; id?: string; label?: string; failText?: string; passText?: string };
    const isRef = r.type === 'rule_ref' && typeof r.id === 'string';
    const defLabel = isRef ? gameRules.getRuleDefLabel(r.id!) : undefined;
    const label = r.label ?? defLabel;
    const text = met ? r.passText : r.failText;
    return {
      ...(label !== undefined && { label }),
      met,
      ...(text !== undefined && { text }),
    };
  });
}

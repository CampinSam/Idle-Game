import type { GameRulesService } from './game-rules.service';

export type TopLevelRuleStatus = { label?: string; met: boolean };

export function evaluateTopLevelRules(
  selection: unknown,
  reqContext: Parameters<GameRulesService['checkRequirements']>[1],
  gameRules: Pick<GameRulesService, 'checkRequirements'>,
): TopLevelRuleStatus[] {
  if (!selection || !Array.isArray((selection as any).rules)) return [];
  return (selection as any).rules.map((rule: any) => ({
    label: rule.label,
    met: gameRules.checkRequirements({ op: 'AND', rules: [rule] }, reqContext),
  }));
}

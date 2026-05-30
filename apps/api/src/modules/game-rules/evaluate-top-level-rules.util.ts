import type { RichSelection, RichSelectionChild } from '@derp/shared';
import type { GameRulesService } from './game-rules.service';

export type TopLevelRuleStatus = { label?: string; met: boolean; text?: string };

function toTitleCase(s: string): string {
  return s.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function operatorLabel(operator: string, value: unknown): string {
  switch (operator) {
    case 'gte': return `${value}+`;
    case 'gt': return `> ${value}`;
    case 'lte': return `≤ ${value}`;
    case 'lt': return `< ${value}`;
    case 'eq': return String(value);
    case 'neq': return `not ${value}`;
    case 'exists': return 'present';
    case 'not_exists': return 'absent';
    case 'in': return `one of ${Array.isArray(value) ? value.join(', ') : value}`;
    default: return `${operator} ${value ?? ''}`.trim();
  }
}

function synthesizeRuleLabel(rule: RichSelectionChild): string | undefined {
  const r = rule as Record<string, any>;

  // Nested AND/OR/NOT group — use its explicit label if set
  if ('op' in r && 'rules' in r) {
    return typeof r['label'] === 'string' ? r['label'] : undefined;
  }

  // rule_ref handled by caller via getRuleDefLabel
  if (r['type'] === 'rule_ref') return undefined;

  const scope: string = r['scope'];
  const field: string = r['field'];
  const operator: string = r['operator'];
  const value: unknown = r['value'];

  if (!scope || !field) return undefined;

  // Keeper level requirement
  if (scope === 'player' && field === 'keeperLevel') {
    if (operator === 'gte') return `Keeper Level ${value}+`;
    if (operator === 'gt') return `Keeper Level > ${value}`;
    if (operator === 'lte') return `Keeper Level ≤ ${value}`;
    if (operator === 'lt') return `Keeper Level < ${value}`;
    if (operator === 'eq') return `Keeper Level ${value}`;
    return `Keeper Level ${operatorLabel(operator, value)}`;
  }

  // Player flag requirements
  if (scope === 'player' && field.startsWith('flags.')) {
    const flagKey = field.substring(6);
    const humanFlag = toTitleCase(flagKey);
    if (operator === 'eq' && value === true) return `${humanFlag} completed`;
    if (operator === 'eq' && value === false) return `${humanFlag} not yet completed`;
    return `${humanFlag}: ${operatorLabel(operator, value)}`;
  }

  // Location/currentLocation — building presence
  if ((scope === 'location' || scope === 'currentLocation') && field.startsWith('buildings.')) {
    const buildingId = field.substring(10);
    const humanId = toTitleCase(buildingId);
    if (operator === 'gte' || operator === 'exists') return `${humanId} must be built`;
    if (operator === 'not_exists') return `${humanId} must not exist`;
    if (operator === 'eq' && value) return `${humanId} must be built`;
    if (operator === 'eq' && !value) return `${humanId} must not exist`;
    return `${humanId} ${operatorLabel(operator, value)}`;
  }

  // Location/currentLocation — room presence
  if ((scope === 'location' || scope === 'currentLocation') && field.startsWith('rooms.')) {
    const roomId = field.substring(6);
    return `${toTitleCase(roomId)} room required`;
  }

  // Location level
  if ((scope === 'location' || scope === 'currentLocation') && field === 'level') {
    if (operator === 'gte') return `Outpost Level ${value}+`;
    if (operator === 'eq') return `Outpost Level ${value}`;
    return `Outpost Level ${operatorLabel(operator, value)}`;
  }

  // Team size
  if (scope === 'context' && field === 'teamSize') {
    if (operator === 'gte') return `Team Size: ${value}+`;
    if (operator === 'lte') return `Team Size: ≤ ${value}`;
    if (operator === 'eq') return `Team Size: ${value}`;
    return `Team Size ${operatorLabel(operator, value)}`;
  }

  // Currency balance
  if (scope === 'currency_balance') {
    const humanCurrency = toTitleCase(field);
    if (operator === 'gte') return `${humanCurrency}: ${value}+`;
    return `${humanCurrency} ${operatorLabel(operator, value)}`;
  }

  // Item count
  if (scope === 'item') {
    const humanItem = toTitleCase(field);
    if (operator === 'gte') return `${humanItem}: ${value}+`;
    return `${humanItem} ${operatorLabel(operator, value)}`;
  }

  // Generic fallback — always produce something rather than nothing
  const humanScope = toTitleCase(scope);
  const humanField = toTitleCase(field);
  return `${humanScope}: ${humanField} ${operatorLabel(operator, value)}`.trim();
}

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
    const label = r.label ?? defLabel ?? synthesizeRuleLabel(rule);
    const text = met ? r.passText : r.failText;
    return {
      ...(label !== undefined && { label }),
      met,
      ...(text !== undefined && { text }),
    };
  });
}

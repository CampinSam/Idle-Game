export type ScopeType =
  | 'player'
  | 'entity'
  | 'entity_slot'
  | 'team'
  | 'team_member'
  | 'inventory'
  | 'currency_balance'
  | 'item'
  | 'location'
  | 'currentLocation'
  | 'building'
  | 'room'
  | 'job'
  | 'mission'
  | 'recipe'
  | 'season'
  | 'event'
  | 'context'
  | 'tempflag';

export type AggregateType =
  | 'self'
  | 'any'
  | 'all'
  | 'none'
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'distinct_count'
  | 'ratio';

export type OperatorType =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'between'
  | 'starts_with'
  | 'ends_with'
  | 'regex';

export interface RuleRefNode {
  type: 'rule_ref';
  id: string;
  label?: string;
}

export type RichSelectionChild = RichSelection | RichSelectionRule | RuleRefNode;

export interface RichSelection {
  op: 'AND' | 'OR' | 'NOT';
  rules: Array<RichSelectionChild>;
  label?: string;
  description?: string;
  failText?: string;
  passText?: string;
  data?: Record<string, any>;
}

export interface RichSelectionRule {
  id?: string;
  label?: string;
  description?: string;
  scope: ScopeType;
  field: string;
  aggregate?: AggregateType;
  operator: OperatorType;
  value?: any;
  where?: RichSelection;
  includeTemporary?: boolean;
  includeDerived?: boolean;
  caseSensitive?: boolean;
  failText?: string;
  passText?: string;
  data?: Record<string, any>;
}

export interface ConditionalEffect {
  id?: string;
  label?: string;
  condition: RichSelection;
  effects: any[];
  priority?: number;
  stackingPolicy?: 'stack' | 'highest_only' | 'exclusive' | 'replace';
  maxApplications?: number;
  data?: Record<string, any>;
}

export type Requirements = RichSelection;
export type VisibilityRequirements = RichSelection;
export type SynergyCondition = RichSelection;
export type BonusCondition = RichSelection;
export type UnlockCondition = RichSelection;

export function isRuleRefNode(node: unknown): node is RuleRefNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    (node as any).type === 'rule_ref' &&
    typeof (node as any).id === 'string'
  );
}

export function isRichSelectionGroup(
  node: RichSelection | RichSelectionRule | RuleRefNode,
): node is RichSelection {
  return (
    node !== null &&
    typeof node === 'object' &&
    'op' in node &&
    'rules' in node &&
    Array.isArray((node as any).rules)
  );
}

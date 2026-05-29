import type { AggregateType, OperatorType, ScopeType } from '@derp/shared';

export const enum FieldType {
  Numeric = 'numeric',
  StringId = 'string',
  Array = 'array',
  Boolean01 = 'boolean01',
  Flag = 'flag',
  EntitiesCount = 'entities-count',
}

export const SINGLE_VALUE_SCOPES = new Set<ScopeType>([
  'player',
  'currency_balance',
  'item',
  'currentLocation',
  'building',
  'context',
  'event',
]);

export const STUBBED_SCOPES = new Set<ScopeType>([
  'inventory',
  'mission',
  'recipe',
  'job',
  'room',
  'season',
  'entity_slot',
]);

const NUMERIC_FIELDS = new Set([
  'level',
  'keeperLevel',
  'traitCount',
  'teamSize',
]);

const ARRAY_FIELDS = new Set([
  'traitValues',
  'missionTags',
  'buildingTags',
  'locationTypes',
]);

export function classifyField(scope: ScopeType, field: string): FieldType {
  if (!field) return FieldType.StringId;

  if (scope === 'team' && field === 'entities') {
    return FieldType.EntitiesCount;
  }

  if (scope === 'event') {
    if (field === 'amount') return FieldType.Numeric;
    return FieldType.StringId;
  }

  if (field.startsWith('flags.')) return FieldType.Flag;

  if (field.startsWith('stats.')) return FieldType.Numeric;
  if (field.startsWith('buildings.')) return FieldType.Boolean01;
  if (field.startsWith('rooms.')) return FieldType.Boolean01;
  if (field.startsWith('tags.')) return FieldType.Boolean01;

  if (NUMERIC_FIELDS.has(field)) return FieldType.Numeric;
  if (ARRAY_FIELDS.has(field)) return FieldType.Array;

  if (scope === 'context' && field === 'missionTags') return FieldType.Array;
  if (scope === 'context' && field === 'teamSize') return FieldType.Numeric;

  return FieldType.StringId;
}

const AGGREGATES_ENTITIES_COUNT: AggregateType[] = ['count'];
const AGGREGATES_NUMERIC: AggregateType[] = [
  'any', 'all', 'none', 'count', 'sum', 'avg', 'min', 'max', 'distinct_count', 'ratio',
];
const AGGREGATES_ARRAY: AggregateType[] = ['any', 'all', 'none', 'count'];
const AGGREGATES_STRING: AggregateType[] = ['any', 'all', 'none', 'count', 'distinct_count'];

export function allowedAggregates(scope: ScopeType, field: string): AggregateType[] {
  if (SINGLE_VALUE_SCOPES.has(scope)) return [];

  const ft = classifyField(scope, field);
  switch (ft) {
    case FieldType.EntitiesCount:
      return AGGREGATES_ENTITIES_COUNT;
    case FieldType.Numeric:
    case FieldType.Boolean01:
      return AGGREGATES_NUMERIC;
    case FieldType.Array:
      return AGGREGATES_ARRAY;
    case FieldType.Flag:
    case FieldType.StringId:
    default:
      return AGGREGATES_STRING;
  }
}

const OPERATORS_NUMERIC: OperatorType[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'exists', 'not_exists',
];
const OPERATORS_STRING: OperatorType[] = [
  'eq', 'neq', 'in', 'not_in', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'regex', 'exists', 'not_exists',
];
const OPERATORS_ARRAY: OperatorType[] = [
  'contains', 'not_contains', 'in', 'not_in', 'exists', 'not_exists',
];
const OPERATORS_BOOLEAN01: OperatorType[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists',
];
const OPERATORS_FLAG: OperatorType[] = ['eq', 'neq', 'exists', 'not_exists'];

export function allowedOperators(scope: ScopeType, field: string): OperatorType[] {
  const ft = classifyField(scope, field);
  switch (ft) {
    case FieldType.EntitiesCount:
    case FieldType.Numeric:
      return OPERATORS_NUMERIC;
    case FieldType.Array:
      return OPERATORS_ARRAY;
    case FieldType.Boolean01:
      return OPERATORS_BOOLEAN01;
    case FieldType.Flag:
      return OPERATORS_FLAG;
    case FieldType.StringId:
    default:
      return OPERATORS_STRING;
  }
}

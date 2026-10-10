import type { AggregateType, OperatorType } from '@derp/shared';
import { applyOperator } from './operator.util';

export function applyAggregate(
  aggregate: AggregateType = 'self',
  values: any[],
  operator: OperatorType,
  expected: any,
  caseSensitive = false,
): boolean {
  const op = (v: any) => applyOperator(operator, v, expected, caseSensitive);

  switch (aggregate) {
    case 'self':
      return op(values[0]);
    case 'any':
      return values.length > 0 && values.some(op);
    case 'all':
      return values.length > 0 && values.every(op);
    case 'none':
      return values.length === 0 || !values.some(op);
    case 'count':
      return op(values.length);
    case 'sum': {
      const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
      return op(total);
    }
    case 'avg': {
      if (values.length === 0) return op(0);
      const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
      return op(total / values.length);
    }
    case 'min': {
      if (values.length === 0) return false;
      return op(Math.min(...values.map(Number)));
    }
    case 'max': {
      if (values.length === 0) return false;
      return op(Math.max(...values.map(Number)));
    }
    case 'distinct_count': {
      const unique = new Set(values);
      return op(unique.size);
    }
    case 'ratio': {
      if (values.length === 0) return op(0);
      const passing = values.filter(
        v => v !== undefined && v !== null && v !== false && v !== 0 && v !== '',
      ).length;
      return op(passing / values.length);
    }
    default:
      return op(values[0]);
  }
}

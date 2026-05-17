import type { OperatorType } from '@derp/shared';

export function applyOperator(
  operator: OperatorType,
  actual: any,
  expected: any,
  caseSensitive = false,
): boolean {
  if (operator === 'exists') return actual !== undefined && actual !== null;
  if (operator === 'not_exists') return actual === undefined || actual === null;

  if (actual === undefined || actual === null) return false;

  const norm = (v: any): any =>
    !caseSensitive && typeof v === 'string' ? v.toLowerCase() : v;
  const a = norm(actual);
  const e = norm(expected);

  switch (operator) {
    case 'eq':
      return a === e;
    case 'neq':
      return a !== e;
    case 'gt':
      return Number(a) > Number(e);
    case 'gte':
      return Number(a) >= Number(e);
    case 'lt':
      return Number(a) < Number(e);
    case 'lte':
      return Number(a) <= Number(e);
    case 'in': {
      if (!Array.isArray(expected)) return false;
      const normExpected = expected.map(norm);
      return normExpected.includes(a);
    }
    case 'not_in': {
      if (!Array.isArray(expected)) return true;
      const normExpected = expected.map(norm);
      return !normExpected.includes(a);
    }
    case 'contains':
      return typeof a === 'string' && a.includes(String(e));
    case 'not_contains':
      return typeof a === 'string' && !a.includes(String(e));
    case 'between': {
      if (!Array.isArray(expected) || expected.length < 2) return false;
      const n = Number(a);
      return n >= Number(expected[0]) && n <= Number(expected[1]);
    }
    case 'starts_with':
      return typeof a === 'string' && a.startsWith(String(e));
    case 'ends_with':
      return typeof a === 'string' && a.endsWith(String(e));
    case 'regex': {
      try {
        const flags = caseSensitive ? '' : 'i';
        return new RegExp(String(expected), flags).test(String(actual));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

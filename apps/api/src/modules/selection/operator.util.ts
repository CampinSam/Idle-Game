import type { OperatorType } from '@derp/shared';

/**
 * Apply a comparison operator against an actual value and an expected value.
 *
 * Array-aware semantics (when actual is an array):
 *   contains      → actual array includes the expected scalar (tag membership)
 *   not_contains  → actual array does NOT include the expected scalar
 *   in            → at least one element of actual is present in expected array
 *   not_in        → no element of actual is present in expected array
 *   exists        → actual array is non-null (array presence check)
 *   not_exists    → actual is null/undefined
 *   eq / neq      → delegate to JSON-serialised equality when both sides are arrays
 *
 * All string comparisons are case-insensitive by default (caseSensitive=false).
 */
export function applyOperator(
  operator: OperatorType,
  actual: any,
  expected: any,
  caseSensitive = false,
): boolean {
  if (operator === 'exists') return actual !== undefined && actual !== null;
  if (operator === 'not_exists') return actual === undefined || actual === null;

  if (actual === undefined || actual === null) return false;

  const normStr = (v: any): any =>
    !caseSensitive && typeof v === 'string' ? v.toLowerCase() : v;

  // ── Array-actual branch ────────────────────────────────────────────────────
  if (Array.isArray(actual)) {
    const normArr = actual.map(normStr);
    switch (operator) {
      case 'contains': {
        const e = normStr(expected);
        return normArr.includes(e);
      }
      case 'not_contains': {
        const e = normStr(expected);
        return !normArr.includes(e);
      }
      case 'in': {
        if (!Array.isArray(expected)) return false;
        const normExpected = expected.map(normStr);
        return normArr.some(v => normExpected.includes(v));
      }
      case 'not_in': {
        if (!Array.isArray(expected)) return true;
        const normExpected = expected.map(normStr);
        return !normArr.some(v => normExpected.includes(v));
      }
      case 'eq':
        return JSON.stringify(normArr) === JSON.stringify(Array.isArray(expected) ? expected.map(normStr) : expected);
      case 'neq':
        return JSON.stringify(normArr) !== JSON.stringify(Array.isArray(expected) ? expected.map(normStr) : expected);
      default:
        return false;
    }
  }

  // ── Scalar-actual branch ───────────────────────────────────────────────────
  const a = normStr(actual);
  const e = normStr(expected);

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
      const normExpected = expected.map(normStr);
      return normExpected.includes(a);
    }
    case 'not_in': {
      if (!Array.isArray(expected)) return true;
      const normExpected = expected.map(normStr);
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

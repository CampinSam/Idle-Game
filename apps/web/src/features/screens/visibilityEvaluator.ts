import type { VisibilityRuleGroup, VisibilityRule, VisibilityOperator } from '@derp/shared';

export interface ClientVisibilityContext {
  user: {
    id?: string;
    keeperLevel?: number;
    keeperXp?: number;
    prestigeTokens?: number;
  } | null;
  wallet: {
    isConnected: boolean;
    count: number;
  };
  flags: Record<string, boolean>;
  platform: string;
  local: Record<string, unknown>;
}

function getAtPath(ctx: ClientVisibilityContext, path: string): unknown {
  if (path.startsWith('local.')) {
    const key = path.slice('local.'.length);
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return undefined;
    }
  }

  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function applyOperator(
  actual: unknown,
  operator: VisibilityOperator,
  expected: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'greater_than':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'greater_than_or_equal':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'less_than':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'less_than_or_equal':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'includes':
      if (typeof actual === 'string' && typeof expected === 'string')
        return actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    case 'not_includes':
      if (typeof actual === 'string' && typeof expected === 'string')
        return !actual.includes(expected);
      if (Array.isArray(actual)) return !actual.includes(expected);
      return true;
    case 'exists':
      return actual !== null && actual !== undefined;
    case 'not_exists':
      return actual === null || actual === undefined;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual);
    default: {
      const _exhaustive: never = operator;
      console.warn('[visibilityEvaluator] Unknown operator:', _exhaustive);
      return false;
    }
  }
}

function evaluateRule(rule: VisibilityRule, ctx: ClientVisibilityContext): boolean {
  const actual = getAtPath(ctx, rule.path);
  return applyOperator(actual, rule.operator, rule.value);
}

export function evaluateVisibilityGroup(
  group: VisibilityRuleGroup | undefined,
  ctx: ClientVisibilityContext,
): boolean {
  if (!group) return true;

  if (group.all?.length) {
    if (!group.all.every((r) => evaluateRule(r, ctx))) return false;
  }
  if (group.any?.length) {
    if (!group.any.some((r) => evaluateRule(r, ctx))) return false;
  }
  if (group.none?.length) {
    if (group.none.some((r) => evaluateRule(r, ctx))) return false;
  }
  return true;
}

export function buildVisibilityContext(
  player: any,
  walletState?: { isConnected: boolean; count: number },
): ClientVisibilityContext {
  return {
    user: player
      ? {
          id: player.id,
          keeperLevel: player.keeperLevel ?? 1,
          keeperXp: player.keeperXp ?? 0,
          prestigeTokens: player.prestigeTokens ?? 0,
        }
      : null,
    wallet: walletState ?? {
      isConnected: false,
      count: 0,
    },
    flags: {},
    platform: 'web',
    local: {},
  };
}

import type { CSSProperties } from 'react';

export const ERROR_BORDER_COLOR = '#ef4444';

export const errorTextStyle: CSSProperties = {
  color: '#ef4444',
  fontSize: 11,
  marginTop: 2,
};

export const errorWrapperStyle: CSSProperties = {
  outline: `1px solid ${ERROR_BORDER_COLOR}`,
  outlineOffset: 0,
  borderRadius: 4,
};

function isBlank(v: any): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function isMissingNumber(v: any): boolean {
  if (v === undefined || v === null || v === '') return true;
  const n = Number(v);
  return isNaN(n);
}

export interface CostEntryErrors {
  id?: string;
  amount?: string;
}

export function validateCostEntry(entry: any): CostEntryErrors {
  const errs: CostEntryErrors = {};
  const type = entry?.type || 'currency';
  const refKey = type === 'entity' ? entry?.definitionId : entry?.id;
  if (isBlank(refKey)) {
    errs.id = type === 'entity' ? 'definitionId required' : 'id required';
  }
  if (isMissingNumber(entry?.amount)) {
    errs.amount = 'amount required';
  } else if (Number(entry.amount) <= 0) {
    errs.amount = 'amount must be > 0';
  }
  return errs;
}

export function validateCostList(value: any): CostEntryErrors[] {
  const items = Array.isArray(value) ? value : [];
  return items.map(validateCostEntry);
}

export function costListErrorCount(value: any): number {
  return validateCostList(value).reduce((n, e) => n + Object.keys(e).length, 0);
}

export interface RequirementErrors {
  key?: string;
  value?: string;
}

const REQUIREMENT_TYPES_NEEDING_KEY = new Set([
  'flag',
  'building',
  'currency',
  'item',
  'trait',
]);

const OPERATORS_REQUIRING_VALUE = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

export function validateRequirement(req: any): RequirementErrors {
  const errs: RequirementErrors = {};
  const type = req?.type || 'keeper_level';
  if (REQUIREMENT_TYPES_NEEDING_KEY.has(type) && isBlank(req?.key)) {
    errs.key = 'key required';
  }
  const operator = req?.operator || 'eq';
  if (OPERATORS_REQUIRING_VALUE.has(operator)) {
    if (req?.value === undefined || req?.value === null || req?.value === '') {
      errs.value = 'value required';
    }
  }
  return errs;
}

export function validateRequirements(value: any): RequirementErrors[] {
  const items = Array.isArray(value) ? value : [];
  return items.map(validateRequirement);
}

export function requirementsErrorCount(value: any): number {
  return validateRequirements(value).reduce((n, e) => n + Object.keys(e).length, 0);
}

export interface OutcomeErrors {
  key?: string;
  message?: string;
  bundle?: string;
  bundleDefId?: string;
  pickRange?: string;
  range?: string;
}

function detectOutcomeKind(entry: any): string {
  if (entry?.type === 'bundle_ref') return 'bundle_ref';
  if (entry && Array.isArray(entry.bundle)) {
    if (entry.pickMin !== undefined || entry.pickMax !== undefined) return 'pick_bundle';
    return 'bundle';
  }
  return entry?.type || 'currency';
}

export function validateOutcome(o: any): OutcomeErrors {
  const errs: OutcomeErrors = {};
  const kind = detectOutcomeKind(o);

  if (kind === 'currency' || kind === 'item' || kind === 'flag') {
    if (isBlank(o?.key)) errs.key = 'key required';
  }

  if (kind === 'text' && isBlank(o?.message)) {
    errs.message = 'message required';
  }

  if (kind === 'currency' || kind === 'item' || kind === 'entity_xp' || kind === 'keeper_xp') {
    const min = o?.min;
    const max = o?.max;
    if (isMissingNumber(min) || isMissingNumber(max)) {
      errs.range = 'min/max required';
    } else if (Number(min) > Number(max)) {
      errs.range = 'min cannot exceed max';
    }
  }

  if (kind === 'bundle' || kind === 'pick_bundle') {
    if (!Array.isArray(o?.bundle) || o.bundle.length === 0) {
      errs.bundle = 'bundle must have at least one entry';
    }
  }

  if (kind === 'pick_bundle') {
    const min = Number(o?.pickMin ?? 0);
    const max = Number(o?.pickMax ?? 0);
    if (!(min >= 1) || !(max >= min)) {
      errs.pickRange = 'invalid pickMin/pickMax';
    }
  }

  if (kind === 'bundle_ref') {
    if (isBlank(o?.bundleDefId)) {
      errs.bundleDefId = 'bundle def required';
    }
    // Range check for overrides: only validate when both are explicitly set
    if (o?.pickMin !== undefined && o?.pickMax !== undefined) {
      const min = Number(o.pickMin);
      const max = Number(o.pickMax);
      if (!isNaN(min) && !isNaN(max) && (min < 0 || max < min)) {
        errs.pickRange = 'pickMax must be ≥ pickMin (and ≥ 0)';
      }
    }
  }

  return errs;
}

export function validateOutcomeArray(items: any): OutcomeErrors[] {
  const arr = Array.isArray(items) ? items : [];
  return arr.map(validateOutcome);
}

function outcomeArrayErrorCount(items: any): number {
  const arr = Array.isArray(items) ? items : [];
  let n = 0;
  arr.forEach((o) => {
    n += Object.keys(validateOutcome(o)).length;
    if (Array.isArray(o?.bundle)) {
      n += outcomeArrayErrorCount(o.bundle);
    }
  });
  return n;
}

export function outcomeSpecErrorCount(value: any): number {
  if (Array.isArray(value)) return outcomeArrayErrorCount(value);
  if (value && typeof value === 'object' && Array.isArray((value as any).rewards)) {
    return outcomeArrayErrorCount((value as any).rewards);
  }
  return 0;
}

export interface TimerErrors {
  duration?: string;
}

export function validateTimer(value: any): TimerErrors {
  const errs: TimerErrors = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return errs;
  if (Object.keys(value).length === 0) return errs;
  if (isMissingNumber(value.duration) || Number(value.duration) < 0) {
    errs.duration = 'duration must be a number ≥ 0';
  }
  return errs;
}

export function timerErrorCount(value: any): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  if (Object.keys(value).length === 0) return 0;
  let n = Object.keys(validateTimer(value)).length;
  if (value.skipable && Array.isArray(value.skip_cost)) {
    n += costListErrorCount(value.skip_cost);
  }
  return n;
}

export function structuredFieldErrorCount(type: string | undefined, value: any): number {
  switch (type) {
    case 'costArray':
      return costListErrorCount(value);
    case 'requirementsArray':
      return requirementsErrorCount(value);
    case 'outcomeSpec':
      return outcomeSpecErrorCount(value);
    case 'timerSpec':
      return timerErrorCount(value);
    default:
      return 0;
  }
}

import { synergySelectorErrorCount } from './SynergySelectorEditor';
import { synergyContextErrorCount } from './SynergyContextEditor';
import { synergyEffectsErrorCount } from './SynergyEffectsEditor';
import { giftPresentationErrorCount } from './GiftPresentationEditor';
import { giftClaimRulesErrorCount } from './GiftClaimRulesEditor';
import { itemEquipDataErrorCount } from './ItemEquipDataEditor';
import { homeBannerConfigErrorCount } from './HomeBannerConfigEditor';
import { eventSecurityErrorCount } from './EventSecurityEditor';
import { levelRulesErrorCount } from './LevelRulesEditor';
import { locationLevelRulesErrorCount } from './LocationLevelRulesEditor';
import { productionProfileErrorCount } from './ProductionProfileEditor';

// Re-export shared contract types so existing editor imports keep working.
export type { StructuredEditorProps, ValidationResult } from './editorContract';
export { ERROR_BORDER_COLOR, errorTextStyle, errorWrapperStyle } from './editorContract';

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

export function richSelectionErrorCount(value: any): number {
  if (!value) return 0;
  if (Array.isArray(value)) return 0;
  if (typeof value !== 'object' || !('op' in value) || !('rules' in value)) return 0;
  let n = 0;
  for (const rule of (value.rules ?? [])) {
    if (Array.isArray(rule?.rules)) {
      n += richSelectionErrorCount(rule);
    } else {
      if (!rule?.scope) n++;
      if (!rule?.field) n++;
      if (!rule?.operator) n++;
    }
  }
  return n;
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

export interface ProgressionErrors {
  maxLevel?: string;
  xpKind?: string;
  xpBase?: string;
  xpRatio?: string;
  perLevel?: string;
  uniformShare?: string;
  weightedShare?: string;
  bonusBase?: string;
  bonusExponent?: string;
  bonusAmount?: string;
}

export function validateProgression(value: any): ProgressionErrors {
  const errs: ProgressionErrors = {};
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  if (isMissingNumber(v.maxLevel) || Number(v.maxLevel) < 1) {
    errs.maxLevel = 'maxLevel must be ≥ 1';
  }
  const xp = v.xpCurve;
  if (!xp || typeof xp !== 'object') {
    errs.xpKind = 'xpCurve required';
  } else if (xp.kind === 'geometric') {
    if (isMissingNumber(xp.base) || Number(xp.base) <= 0) errs.xpBase = 'base must be > 0';
    if (isMissingNumber(xp.ratio) || Number(xp.ratio) <= 0) errs.xpRatio = 'ratio must be > 0';
  } else if (xp.kind === 'table') {
    if (!Array.isArray(xp.perLevel) || xp.perLevel.length === 0) {
      errs.perLevel = 'perLevel must have at least one entry';
    }
  } else {
    errs.xpKind = 'kind must be geometric or table';
  }
  const sg = v.statGain;
  if (sg && typeof sg === 'object') {
    const bp = sg.bonusPool;
    if (bp && typeof bp === 'object') {
      if (bp.kind === 'rarityScaled') {
        if (isMissingNumber(bp.base)) errs.bonusBase = 'base required';
        if (isMissingNumber(bp.exponent)) errs.bonusExponent = 'exponent required';
      } else if (bp.kind === 'flat') {
        if (isMissingNumber(bp.amount)) errs.bonusAmount = 'amount required';
      }
    }
    const dist = sg.distribution;
    if (dist && typeof dist === 'object') {
      if (dist.uniformShare !== undefined && isMissingNumber(dist.uniformShare)) errs.uniformShare = 'must be a number';
      if (dist.weightedShare !== undefined && isMissingNumber(dist.weightedShare)) errs.weightedShare = 'must be a number';
    }
  }
  return errs;
}

export function progressionErrorCount(value: any): number {
  return Object.keys(validateProgression(value)).length;
}

export interface InitErrors {
  startingLevel?: string;
  baseStats?: string;
  slotFillKind?: string;
  slotFillCount?: string;
  slotFillFixed?: string;
  attributeMap?: string;
  missingSlotPolicy?: string;
  nftDefaults?: string;
}

export function validateInit(value: any): InitErrors {
  const errs: InitErrors = {};
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  if (!v.baseStats || typeof v.baseStats !== 'object' || Array.isArray(v.baseStats)) {
    errs.baseStats = 'baseStats map required';
  }
  const scratch = v.scratch;
  if (!scratch || typeof scratch !== 'object') {
    errs.startingLevel = 'scratch required';
    return errs;
  }
  if (isMissingNumber(scratch.startingLevel) || Number(scratch.startingLevel) < 1) {
    errs.startingLevel = 'startingLevel must be ≥ 1';
  }
  const sf = scratch.slotFill;
  if (!sf || typeof sf !== 'object') {
    errs.slotFillKind = 'slotFill required';
  } else {
    const k = sf.kind;
    if (k !== 'singleRandomArchetype' && k !== 'multiRandomArchetype' && k !== 'fixed') {
      errs.slotFillKind = 'kind must be singleRandomArchetype | multiRandomArchetype | fixed';
    }
    if (k === 'multiRandomArchetype' && (isMissingNumber(sf.count) || Number(sf.count) < 1)) {
      errs.slotFillCount = 'count must be ≥ 1';
    }
    if (k === 'fixed' && (!sf.fixed || typeof sf.fixed !== 'object' || Array.isArray(sf.fixed))) {
      errs.slotFillFixed = 'fixed map required';
    }
  }
  if (v.nft !== undefined) {
    const nft = v.nft;
    if (!nft || typeof nft !== 'object') {
      errs.attributeMap = 'nft must be an object';
    } else {
      if (!nft.attributeMap || typeof nft.attributeMap !== 'object' || Array.isArray(nft.attributeMap)) {
        errs.attributeMap = 'attributeMap required';
      }
      const p = nft.missingSlotPolicy;
      if (p !== 'error' && p !== 'skip' && p !== 'default') {
        errs.missingSlotPolicy = 'must be error | skip | default';
      }
      if (nft.defaults !== undefined && (typeof nft.defaults !== 'object' || nft.defaults === null || Array.isArray(nft.defaults))) {
        errs.nftDefaults = 'defaults must be an object';
      }
    }
  }
  return errs;
}

export function initErrorCount(value: any): number {
  return Object.keys(validateInit(value)).length;
}

export function ascensionErrorCount(value: any): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 1;
  if (typeof value.enabled !== 'boolean') return 1;
  return 0;
}

export function masteryErrorCount(value: any): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 1;
  if (typeof value.enabled !== 'boolean') return 1;
  return 0;
}

export interface PowerErrors {
  powerType?: string;
  value?: string;
  durationMinutes?: string;
  dailyLimit?: string;
}

export function validatePower(p: any): PowerErrors {
  const errs: PowerErrors = {};
  if (!p || typeof p !== 'object') return { powerType: 'invalid power' };
  if (!p.powerType) errs.powerType = 'powerType required';
  if (isMissingNumber(p.value)) {
    errs.value = 'value required';
  }
  if (!p.durationMinutes || Number(p.durationMinutes) < 1) {
    errs.durationMinutes = 'durationMinutes must be ≥ 1';
  }
  if (!p.dailyLimit || Number(p.dailyLimit) < 1) {
    errs.dailyLimit = 'dailyLimit must be ≥ 1';
  }
  return errs;
}

export function uniquesErrorCount(value: any): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  let n = 0;
  for (const [key, entry] of Object.entries(value) as [string, any][]) {
    if (!key || key.trim() === '') { n++; }
    if (!entry || typeof entry !== 'object') { n++; continue; }
    const powers = entry.powers;
    if (!Array.isArray(powers)) { n++; continue; }
    for (const p of powers) {
      if (!p || typeof p !== 'object') { n++; continue; }
      if (!p.powerType) n++;
      if (p.value === undefined || p.value === null || isNaN(Number(p.value))) n++;
      if (!p.durationMinutes || Number(p.durationMinutes) < 1) n++;
      if (!p.dailyLimit || Number(p.dailyLimit) < 1) n++;
    }
  }
  return n;
}

export function structuredFieldErrorCount(type: string | undefined, value: any): number {
  switch (type) {
    case 'costArray':
      return costListErrorCount(value);
    case 'richSelection':
      return richSelectionErrorCount(value);
    case 'outcomeSpec':
      return outcomeSpecErrorCount(value);
    case 'timerSpec':
      return timerErrorCount(value);
    case 'progression':
      return progressionErrorCount(value);
    case 'init':
      return initErrorCount(value);
    case 'ascension':
      return ascensionErrorCount(value);
    case 'mastery':
      return masteryErrorCount(value);
    case 'rulesWithUniques':
      return uniquesErrorCount((value as any)?.uniques);
    case 'synergySelector':
      return synergySelectorErrorCount(value);
    case 'synergyContext':
      return synergyContextErrorCount(value);
    case 'synergyEffectsArray':
      return synergyEffectsErrorCount(value);
    case 'giftPresentation':
      return giftPresentationErrorCount(value);
    case 'giftClaimRules':
      return giftClaimRulesErrorCount(value);
    case 'itemEquipData':
      return itemEquipDataErrorCount(value);
    case 'homeBannerConfig':
      return homeBannerConfigErrorCount(value);
    case 'eventSecurity':
      return eventSecurityErrorCount(value);
    case 'levelRules':
      return levelRulesErrorCount(value);
    case 'locationLevelRules':
      return locationLevelRulesErrorCount(value);
    case 'productionProfile':
      return productionProfileErrorCount(value);
    default:
      return 0;
  }
}

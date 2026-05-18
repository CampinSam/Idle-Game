import {
  mergeDisplayStyles,
  overlayToCss,
  textStyleToCss,
  type DisplayStyle,
} from '@derp/shared';
import { resolveAssetUrl } from '../../../utils/iconResolver';

export const DEFAULT_DISPLAY = {
  borderColor: '#3B82F6',
  backgroundImage: '/images/mission-quick.png',
  cardBackground: '#1a1a2e',
};

export interface ReqStatusEntry {
  type: string;
  met: boolean;
  label?: string;
  [key: string]: unknown;
}

export function getCategoryIcon(categoryName: string): string {
  const n = (categoryName || '').toLowerCase();
  if (n.includes('prologue') || n.includes('story')) return '📜';
  if (n.includes('quick') || n.includes('fast')) return '⚡';
  if (n.includes('outpost') || n.includes('base')) return '🏰';
  if (n.includes('elite') || n.includes('hard')) return '💀';
  if (n.includes('daily')) return '📅';
  return '⚔️';
}

export function bgImageCss(value: string | null | undefined): string {
  const url = resolveAssetUrl(value);
  return url ? `url(${url})` : 'none';
}

export function resolveDisplay(def: any, categoryDefs: any[]) {
  const missionDisplay = def.display || {};
  const catDef = categoryDefs.find((c: any) => c.id === def.missionCategoryDefId);
  const catDisplay = catDef?.displayDef || {};

  const style: DisplayStyle = mergeDisplayStyles(
    catDisplay.style as DisplayStyle | undefined,
    missionDisplay.style as DisplayStyle | undefined,
  );

  return {
    borderColor: missionDisplay.borderColor || catDisplay.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: missionDisplay.backgroundImage || catDisplay.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: missionDisplay.cardBackground || catDisplay.cardBackground || DEFAULT_DISPLAY.cardBackground,
    style,
  };
}

export function resolveCategoryDisplay(catDef: any) {
  const d = catDef?.displayDef || {};
  return {
    borderColor: d.borderColor || DEFAULT_DISPLAY.borderColor,
    backgroundImage: d.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
    cardBackground: d.cardBackground || DEFAULT_DISPLAY.cardBackground,
    style: (d.style || {}) as DisplayStyle,
  };
}

export const DEFAULT_OVERLAY = 'linear-gradient(90deg, rgba(15,10,40,0.75) 0%, rgba(15,10,40,0.4) 60%, rgba(15,10,40,0.15) 100%)';

export function displayCssVars(
  display: { style?: DisplayStyle },
  opts?: { hero?: boolean },
): { vars: Record<string, string>; overlay: string | null; titleStyle: React.CSSProperties } {
  const style = display.style || {};
  const overlay = overlayToCss(style.overlay);
  const bg = style.background || {};
  const body = style.body || {};
  const vars: Record<string, string> = {};
  void opts;
  if (bg.position) vars['--card-bg-position'] = bg.position;
  if (bg.size) vars['--card-bg-size'] = bg.size;
  if (bg.repeat) vars['--card-bg-repeat'] = bg.repeat;
  if (body.color) vars['--card-body-color'] = body.color;
  if (body.fontFamily) vars['--card-body-font-family'] = body.fontFamily;
  if (body.fontSize) vars['--card-body-font-size'] = String(body.fontSize);
  if (body.fontWeight !== undefined && body.fontWeight !== '') vars['--card-body-font-weight'] = String(body.fontWeight);
  if (body.lineHeight) vars['--card-body-line-height'] = String(body.lineHeight);
  return {
    vars,
    overlay,
    titleStyle: textStyleToCss(style.title) as React.CSSProperties,
  };
}

export function meetsNonTeamRequirements(def: any): boolean {
  const status = def.requirementStatus;
  if (Array.isArray(status) && status.length > 0) {
    return status.every((r: any) => r.met);
  }
  return true;
}

export function extractTeamSizeBounds(
  requirements: any,
  _out = { min: 1, max: 1 },
): { min: number; max: number } {
  if (!requirements || typeof requirements !== 'object') return _out;

  // Legacy flat-array format: [{ type: 'team_size', operator: 'gte', value: N }]
  if (Array.isArray(requirements)) {
    for (const r of requirements) {
      if (r?.type === 'team_size') {
        const op = r.operator ?? 'gte';
        const v = Number(r.value ?? 1);
        if (op === 'gte' || op === 'gt') _out.min = Math.max(_out.min, op === 'gt' ? v + 1 : v);
        else if (op === 'lte' || op === 'lt') _out.max = Math.min(_out.max, op === 'lt' ? v - 1 : v);
        else if (op === 'eq') { _out.min = Math.max(_out.min, v); _out.max = Math.min(_out.max, v); }
      }
    }
    return _out;
  }

  // Rich selector group node: { op, rules: [...] }
  if (Array.isArray(requirements.rules)) {
    for (const child of requirements.rules) {
      extractTeamSizeBounds(child, _out);
    }
    return _out;
  }

  // Rich selector leaf rule: { scope: 'context', field: 'teamSize', operator, value }
  if (requirements.scope === 'context' && requirements.field === 'teamSize') {
    const { operator, value } = requirements;
    if (operator === 'gte' || operator === 'gt') {
      const v = Number(value) + (operator === 'gt' ? 1 : 0);
      _out.min = Math.max(_out.min, v);
    } else if (operator === 'lte' || operator === 'lt') {
      const v = Number(value) - (operator === 'lt' ? 1 : 0);
      _out.max = Math.min(_out.max, v);
    } else if (operator === 'between' && Array.isArray(value)) {
      _out.min = Math.max(_out.min, Number(value[0]));
      _out.max = Math.min(_out.max, Number(value[1]));
    } else if (operator === 'eq') {
      _out.min = Math.max(_out.min, Number(value));
      _out.max = Math.min(_out.max, Number(value));
    }
  }
  return _out;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const rm = Math.floor((s % 3600) / 60);
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

// Maps a legacy requirement type+key to the equivalent RichSelection scope+field.
function legacyToScopeField(r: any): [string, string] | null {
  switch (r?.type) {
    case 'keeper_level': return ['player', 'keeperLevel'];
    case 'team_size':    return ['context', 'teamSize'];
    case 'trait':        return ['entity', `traits.${r.key ?? ''}`];
    case 'flag':         return ['player', `flags.${r.key ?? ''}`];
    default:             return r?.type ? ['player', `${r.type}.${r.key ?? ''}`] : null;
  }
}

// Internal recursive walk — returns undefined when no match found.
function _walkRuleValue(node: any, scope: string, field: string, operator: string | undefined): any {
  if (!node || typeof node !== 'object') return undefined;

  // Leaf rule: { scope, field, operator, value }
  if ('scope' in node && 'field' in node) {
    if (node.scope === scope && node.field === field) {
      if (!operator || node.operator === operator) return node.value;
    }
    return undefined;
  }

  // Group node: { op, rules: [...] }
  if (Array.isArray(node.rules)) {
    for (const child of node.rules) {
      const v = _walkRuleValue(child, scope, field, operator);
      if (v !== undefined) return v;
    }
  }

  return undefined;
}

/**
 * Walks a RichSelection tree and returns the value of the first leaf rule
 * that matches scope + field (and optionally operator).
 * Falls back to reading the legacy flat-array format for in-flight data.
 * Returns defaultValue when no match is found.
 */
export function extractRuleValue(
  requirements: any,
  scope: string,
  field: string,
  operator?: string,
  defaultValue: any = 0,
): any {
  if (!requirements) return defaultValue;

  // Legacy flat-array fallback (data still in old format during migration window)
  if (Array.isArray(requirements)) {
    for (const r of requirements) {
      const mapped = legacyToScopeField(r);
      if (!mapped) continue;
      const [rScope, rField] = mapped;
      if (rScope === scope && rField === field) {
        if (!operator || (r.operator ?? 'gte') === operator) {
          return r.value ?? defaultValue;
        }
      }
    }
    return defaultValue;
  }

  const found = _walkRuleValue(requirements, scope, field, operator);
  return found !== undefined ? found : defaultValue;
}

/**
 * Extracts all trait requirements from a RichSelection tree.
 * Falls back to reading the legacy flat-array format for in-flight data.
 * Returns an array of { key, value } for display (traits are advisory/recommended, not hard-blocking).
 */
export function extractTraitRequirements(requirements: any): Array<{ key: string; value: number }> {
  if (!requirements) return [];

  // Legacy flat-array fallback
  if (Array.isArray(requirements)) {
    return requirements
      .filter((r: any) => r?.type === 'trait' && r.key)
      .map((r: any) => ({ key: r.key as string, value: Number(r.value ?? 1) }));
  }

  if (typeof requirements !== 'object') return [];

  // Leaf rule: { scope: 'entity', field: 'traits.KEY', ... }
  if ('scope' in requirements && 'field' in requirements) {
    if (requirements.scope === 'entity' && typeof requirements.field === 'string' && requirements.field.startsWith('traits.')) {
      const key = requirements.field.slice('traits.'.length);
      return [{ key, value: Number(requirements.value ?? 1) }];
    }
    return [];
  }

  // Group node
  if (Array.isArray(requirements.rules)) {
    const results: Array<{ key: string; value: number }> = [];
    for (const child of requirements.rules) {
      results.push(...extractTraitRequirements(child));
    }
    return results;
  }

  return [];
}

export function formatTimeShort(ms: number) {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function renderTags(tags: any[]) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag: any, i: number) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: tag.color || '#3B82F6' }}
        >
          {tag.text}
        </span>
      ))}
    </div>
  );
}

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
  const reqs = def.requirements;
  if (Array.isArray(reqs) && reqs.some((r: any) => r.type !== 'team_size')) {
    return false;
  }
  return true;
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

export function getReqValue(reqs: any[], type: string, defaultValue: any = 0, operator?: string): any {
  if (!Array.isArray(reqs)) return defaultValue;
  if (operator) {
    const found = reqs.find((r: any) => r.type === type && (r.operator ?? 'gte') === operator);
    return found ? found.value : defaultValue;
  }
  const found = reqs.find((r: any) => r.type === type);
  return found ? found.value : defaultValue;
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

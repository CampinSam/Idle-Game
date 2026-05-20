export const FORGE_FALLBACK = {
  borderColor: '#f97316',
  backgroundImage: '/images/regions/sandcrypt-badlands.png',
  cardBackground: 'linear-gradient(180deg, rgba(249,115,22,0.18) 0%, rgba(34,24,88,0.95) 60%)',
};

export const QUALITY_COLOURS: Record<string, string> = {
  failure:   '#ef4444',
  common:    '#94a3b8',
  uncommon:  '#34d399',
  scare:     '#4db0da',
  rare:      '#a98aff',
  epic:      '#ff6090',
  legendary: '#ffe040',
};

export function bgImageCss(bg?: string | null): string {
  if (!bg) return 'none';
  if (/^(linear-gradient|radial-gradient|url\()/i.test(bg)) return bg;
  return `url(${bg})`;
}

export function fmtSeconds(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export interface QualityProb { key: string; label: string; probability: number }
export interface ForecastResponse {
  cap: number;
  tiers: Array<{ key: string; label: string; center: number }>;
  workshopTier: number;
  luckFloor: number;
  slotsTotal?: number;
  slotsUsed?: number;
  slotsOpen?: number;
  timerMultiplier?: number;
  recipeTierCap?: number;
  entities: Array<{
    entityId: string;
    name: string;
    level: number;
    status: string;
    idle: boolean;
    stats: { FOC: number; LCK: number };
    craftingLuck: number;
    rawCraftingLuck: number;
    luckFloor: number;
    probabilities: QualityProb[];
    expectedQuality: string;
    expectedQualityLabel: string;
  }>;
}

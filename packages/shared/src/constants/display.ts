import type { EntityArchetype, EntityStatus } from '../types/entity';

// ---------------------------------------------------------------------------
// Archetype display
// ---------------------------------------------------------------------------

export interface ArchetypeDisplay {
  emoji: string;
  /** Solid accent color (CSS hex). */
  color: string;
  /** Canonical 135deg gradient string for card backgrounds. */
  gradient: string;
}

export const ARCHETYPE_DISPLAY: Record<EntityArchetype | 'default', ArchetypeDisplay> = {
  Dave:         { emoji: '🐦', color: '#3A5080', gradient: 'linear-gradient(135deg, #1e1850 0%, #2a2060 50%, #3a3080 100%)' },
  Astro:        { emoji: '🚀', color: '#3B82F6', gradient: 'linear-gradient(135deg, #0c0032 0%, #190061 50%, #240090 100%)' },
  Magician:     { emoji: '🎩', color: '#A855F7', gradient: 'linear-gradient(135deg, #2d1b69 0%, #5b2c8e 50%, #7b2ff7 100%)' },
  Ninja:        { emoji: '🥷', color: '#6366F1', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  Redneck:      { emoji: '🤠', color: '#CD853F', gradient: 'linear-gradient(135deg, #4a1a00 0%, #8b4513 50%, #cd853f 100%)' },
  Stoner:       { emoji: '🍄', color: '#2d7a2d', gradient: 'linear-gradient(135deg, #0a2a0a 0%, #1a4a1a 50%, #2d7a2d 100%)' },
  DJ:           { emoji: '🎧', color: '#8000ff', gradient: 'linear-gradient(135deg, #1a0033 0%, #4a0080 50%, #8000ff 100%)' },
  Viking:       { emoji: '⚔️', color: '#F59E0B', gradient: 'linear-gradient(135deg, #1a0a0a 0%, #4a1c1c 50%, #8b0000 100%)' },
  Monk:         { emoji: '🧘', color: '#DAA520', gradient: 'linear-gradient(135deg, #2a1a00 0%, #5a3a00 50%, #daa520 100%)' },
  Corpo:        { emoji: '💼', color: '#4a4a6e', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 50%, #4a4a6e 100%)' },
  Cyborg:       { emoji: '🤖', color: '#2a5a8a', gradient: 'linear-gradient(135deg, #0a1a2a 0%, #1a3a5a 50%, #2a5a8a 100%)' },
  Buff:         { emoji: '💪', color: '#10B981', gradient: 'linear-gradient(135deg, #1a3a1a 0%, #2d5a2d 50%, #228B22 100%)' },
  MadScientist: { emoji: '🧪', color: '#7aff00', gradient: 'linear-gradient(135deg, #1a2a0a 0%, #3a5a1a 50%, #7aff00 100%)' },
  Deity:        { emoji: '👑', color: '#FFD700', gradient: 'linear-gradient(135deg, #2a1a00 0%, #5a3a0a 50%, #ffd700 100%)' },
  default:      { emoji: '🐦', color: '#8B5CF6', gradient: 'linear-gradient(135deg, #2D1B69 0%, #7C3AED 50%, #A78BFA 100%)' },
};

/** Returns the display data for an archetype, falling back to 'default'. */
export function getArchetypeDisplay(archetype: string | undefined): ArchetypeDisplay {
  return ARCHETYPE_DISPLAY[archetype as EntityArchetype] ?? ARCHETYPE_DISPLAY.default;
}

// ---------------------------------------------------------------------------
// Entity status display
// ---------------------------------------------------------------------------

export interface StatusDisplay {
  icon: string;
  color: string;
}

export const ENTITY_STATUS_DISPLAY: Record<EntityStatus | 'default', StatusDisplay> = {
  idle:    { icon: '🟢', color: '#10B981' },
  mission: { icon: '🔵', color: '#3B82F6' },
  working: { icon: '🟡', color: '#F59E0B' },
  injured: { icon: '🔴', color: '#EF4444' },
  default: { icon: '⚪', color: '#6B7280' },
};

/** Returns the status display data, falling back to 'default'. */
export function getStatusDisplay(status: string | undefined): StatusDisplay {
  return ENTITY_STATUS_DISPLAY[status as EntityStatus] ?? ENTITY_STATUS_DISPLAY.default;
}

// ---------------------------------------------------------------------------
// Stat display
// ---------------------------------------------------------------------------

export interface StatDisplay {
  color: string;
}

export const STAT_DISPLAY: Record<string, StatDisplay> = {
  ATK: { color: '#EF4444' },
  DEF: { color: '#3B82F6' },
  SPD: { color: '#10B981' },
  FOC: { color: '#F59E0B' },
  LCK: { color: '#A855F7' },
  VIT: { color: '#EC4899' },
};

// ---------------------------------------------------------------------------
// Trait slot display
// ---------------------------------------------------------------------------

export interface TraitSlotDisplay {
  icon: string;
}

export const TRAIT_SLOT_DISPLAY: Record<string, TraitSlotDisplay> = {
  head:  { icon: '👑' },
  ears:  { icon: '👂' },
  beak:  { icon: '🦷' },
  eyes:  { icon: '👁️' },
  body:  { icon: '🦺' },
  back:  { icon: '🎒' },
  tail:  { icon: '🪶' },
};

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

export interface DifficultyTier {
  label: string;
  color: string;
  tier: string;
}

export const DIFFICULTY_TIERS: Array<{ maxDifficulty: number } & DifficultyTier> = [
  { maxDifficulty: 60,       label: 'EASY',    color: '#10B981', tier: 'BEGINNER' },
  { maxDifficulty: 100,      label: 'MEDIUM',  color: '#3B82F6', tier: 'STANDARD' },
  { maxDifficulty: 150,      label: 'HARD',    color: '#F59E0B', tier: 'ADVANCED' },
  { maxDifficulty: Infinity, label: 'EXTREME', color: '#EF4444', tier: 'ADVANCED' },
];

/** Returns the difficulty tier display info for a given difficulty value. */
export function getDifficultyDisplay(difficulty: number): DifficultyTier {
  return (
    DIFFICULTY_TIERS.find((t) => difficulty <= t.maxDifficulty) ??
    DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1]
  );
}

// ---------------------------------------------------------------------------
// Notification display
// ---------------------------------------------------------------------------

export interface NotificationCategoryDisplay {
  icon: string;
}

export const NOTIFICATION_CATEGORY_DISPLAY: Record<string, NotificationCategoryDisplay> = {
  missions:    { icon: '⚔️' },
  crafting:    { icon: '🔮' },
  locations:   { icon: '🏰' },
  boost:       { icon: '⚡' },
  gift:        { icon: '🎁' },
  progression: { icon: '⭐' },
  system:      { icon: '🔔' },
};

export const NOTIFICATION_PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f59e0b',
  normal:   '#8b5cf6',
  low:      '#64748b',
};

// ---------------------------------------------------------------------------
// Building category display
// ---------------------------------------------------------------------------

export interface BuildingCategoryDisplay {
  icon: string;
}

export const BUILDING_CATEGORY_DISPLAY: Record<string, BuildingCategoryDisplay> = {
  GENERATOR: { icon: '⚡' },
  DEFENSE:   { icon: '🛡️' },
  STORAGE:   { icon: '📦' },
  WORKSHOP:  { icon: '⚒️' },
  default:   { icon: '🏗️' },
};

/** Returns building category display, falling back to 'default'. */
export function getBuildingCategoryDisplay(category: string | undefined): BuildingCategoryDisplay {
  if (category && BUILDING_CATEGORY_DISPLAY[category]) return BUILDING_CATEGORY_DISPLAY[category];
  return BUILDING_CATEGORY_DISPLAY.default;
}

// ---------------------------------------------------------------------------
// Region display
// ---------------------------------------------------------------------------

export interface RegionDisplay {
  displayName: string;
  /** Canonical image path under /images/regions/. */
  imagePath: string;
}

export const REGION_DISPLAY: Record<string, RegionDisplay> = {
  derpshire_valley:    { displayName: 'Derpshire Valley',    imagePath: '/images/regions/derpshire-valley.png' },
  chillarctica_drifts: { displayName: 'Chillarctica Drifts', imagePath: '/images/regions/chillarctica-drifts.png' },
  sandcrypt_badlands:  { displayName: 'Sandcrypt Badlands',  imagePath: '/images/regions/sandcrypt-badlands.png' },
  chillvine_jungle:    { displayName: 'Chillvine Jungle',    imagePath: '/images/regions/chillvine-jungle.png' },
  pinnacle_perch:      { displayName: 'Pinnacle Perch',      imagePath: '/images/regions/pinnacle-perch.png' },
  baldos_bog:          { displayName: "Baldo's Bog",         imagePath: '/images/regions/baldos-bog.png' },
  lavalode_peaks:      { displayName: 'LavaLode Peaks',      imagePath: '/images/regions/lavalode-peaks.png' },
  frostpeak_mountains: { displayName: 'Frostpeak Mountains', imagePath: '/images/regions/frostpeak-mountains.png' },
};

/** Returns the display data for a region id, falling back to a sensible default. */
export function getRegionDisplay(regionId: string | undefined): RegionDisplay {
  if (regionId && REGION_DISPLAY[regionId]) return REGION_DISPLAY[regionId];
  return { displayName: regionId ?? 'Unknown Region', imagePath: '/images/regions/fallback.png' };
}

export const IMAGE_CATEGORIES = {
  ENTITY: 'entities',
  ITEM: 'items',
  MISSION: 'missions',
  REGION: 'regions',
  AVATAR: 'avatars',
  EFFECT: 'effects',
} as const;

export type ImageCategory = typeof IMAGE_CATEGORIES[keyof typeof IMAGE_CATEGORIES];

export interface ImageSpec {
  width: number;
  height: number;
  aspectRatio: string;
}

export const IMAGE_SPECS: Record<ImageCategory, ImageSpec> = {
  entities: { width: 512, height: 512, aspectRatio: '1:1' },
  items: { width: 256, height: 256, aspectRatio: '1:1' },
  missions: { width: 1040, height: 400, aspectRatio: '5:2' },
  regions: { width: 1040, height: 400, aspectRatio: '5:2' },
  avatars: { width: 256, height: 256, aspectRatio: '1:1' },
  effects: { width: 128, height: 128, aspectRatio: '1:1' },
};

export const IMAGE_FALLBACKS: Record<ImageCategory, string> = {
  entities: '/images/birds/fallback.png',
  items: '/images/items/fallback.png',
  missions: '/images/missions/fallback.png',
  regions: '/images/regions/fallback.png',
  avatars: '/images/avatars/fallback.png',
  effects: '/images/effects/fallback.png',
};

export const ENTITY_ARCHETYPE_IMAGES: Record<string, string> = {
  Warrior: '/images/birds/archetype-warrior.png',
  Scout: '/images/birds/archetype-scout.png',
  Mage: '/images/birds/archetype-mage.png',
  Healer: '/images/birds/archetype-healer.png',
};

export function getEntityImagePath(entityId?: string, archetype?: string, imageUrl?: string): string {
  if (imageUrl) return imageUrl;
  if (archetype && ENTITY_ARCHETYPE_IMAGES[archetype]) return ENTITY_ARCHETYPE_IMAGES[archetype];
  if (entityId) return `/images/birds/${entityId}.png`;
  return IMAGE_FALLBACKS.entities;
}

export function getRegionImagePath(regionSlug?: string): string {
  if (regionSlug) return `/images/regions/${regionSlug}.png`;
  return IMAGE_FALLBACKS.regions;
}

export function slugifyRegion(region: string): string {
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

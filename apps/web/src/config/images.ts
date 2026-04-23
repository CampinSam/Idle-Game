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

export type EntityImageVariant = 'full' | 'thumb';

const NFT_MEDIA_PREFIX = '/media/nft/cardano/';
const NFT_IPFS_PREFIX = 'ipfs://';
const NFT_THUMB_SUFFIX = '.thumb.webp';

/**
 * Resolve the URL for an entity's portrait.
 *
 * - `ipfs://<cid>` URLs are normalized to `/media/nft/cardano/<cid>` so they
 *   hit our lazy-cache endpoint instead of an IPFS gateway directly. New NFT
 *   collections can therefore be seeded with raw `ipfs://` URLs and served
 *   without any backfill step.
 * - When `variant === 'thumb'` and the URL points at a hosted NFT, the
 *   sibling `.thumb.webp` path is returned so list/grid views download a
 *   tiny WebP instead of the multi-MB original.
 * - The detail view keeps the default `'full'` variant so it shows the
 *   original artwork.
 */
export function getEntityImagePath(
  _entityId?: string,
  archetype?: string,
  imageUrl?: string,
  variant: EntityImageVariant = 'full',
): string {
  if (imageUrl) {
    let normalized = imageUrl;
    if (normalized.startsWith(NFT_IPFS_PREFIX)) {
      const cid = normalized.slice(NFT_IPFS_PREFIX.length);
      if (cid) normalized = `${NFT_MEDIA_PREFIX}${cid}`;
    }
    if (
      variant === 'thumb' &&
      normalized.startsWith(NFT_MEDIA_PREFIX) &&
      !normalized.endsWith(NFT_THUMB_SUFFIX)
    ) {
      return `${normalized}${NFT_THUMB_SUFFIX}`;
    }
    return normalized;
  }
  if (archetype && ENTITY_ARCHETYPE_IMAGES[archetype]) return ENTITY_ARCHETYPE_IMAGES[archetype];
  return IMAGE_FALLBACKS.entities;
}

export function getRegionImagePath(regionSlug?: string): string {
  if (regionSlug) return `/images/regions/${regionSlug}.png`;
  return IMAGE_FALLBACKS.regions;
}

export function slugifyRegion(region: string): string {
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

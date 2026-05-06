export interface ModalSpecV1 {
  version: 1;
  id: string;
  kind: string;
  dismiss: { backdrop: boolean; x: boolean; escape: boolean };
  header: ModalHeader;
  body: ModalBlock[];
  buttons: ModalButton[];
  telemetry?: ModalTelemetry;
}

export interface ModalHeader {
  title: string;
  subtitle?: string;
  icon?: AssetRef;
  banner?: AssetRef;
}

export interface AssetRef {
  assetKey: string;
  alt?: string;
}

export interface ModalTelemetry {
  sourceType?: string;
  sourceId?: string;
  notificationId?: string;
  jobId?: string;
  templateId?: string;
  experiment?: string;
}

export interface ModalButton {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  action: ModalAction;
  requiresConfirm?: {
    title: string;
    body: RichTextDoc;
    confirmLabel?: string;
    cancelLabel?: string;
  };
}

export type ModalAction =
  | { type: 'CLOSE_MODAL' }
  | { type: 'NAVIGATE'; route: string; params?: Record<string, unknown> }
  | { type: 'ACK_NOTIFICATION'; notificationId: string }
  | { type: 'COMPLETE_JOB'; jobId: string }
  | { type: 'CLAIM_GIFT'; giftId: string }
  | { type: 'OPEN_INVENTORY' }
  | { type: 'OPEN_MISSIONS' }
  | { type: 'OPEN_CRAFTING' }
  | { type: 'REPEAT_MISSION'; defId: string; entityIds?: string[] }
  | { type: 'CRAFT_AGAIN'; recipeDefId: string }
  | { type: 'API_CALL'; apiKey: string; payload?: Record<string, unknown> }
  | { type: 'BUILD_BUILDING'; locationId: string; buildingDefId: string }
  | { type: 'UPGRADE_BUILDING'; locationId: string; buildingId: string }
  | { type: 'SHOP_PURCHASE'; shopItemDefId: string }
  | { type: 'DEPOSIT_LOCATION_XP'; locationId: string; costOption: { type: 'currency' | 'item'; id: string; amount: number }; charges?: number }
  | { type: 'PRESTIGE' };

export type ModalBlock =
  | ModalBlockRichText
  | ModalBlockDivider
  | ModalBlockImage
  | ModalBlockMetaRows
  | ModalBlockTimer
  | ModalBlockProgress
  | ModalBlockRewardsPreview
  | ModalBlockRewardsList
  | ModalBlockInventoryDelta
  | ModalBlockGiftReveal
  | ModalBlockList
  | ModalBlockClickReveal
  | ModalBlockError;

export interface ModalBlockRichText {
  type: 'richText';
  doc: RichTextDoc;
  from?: string;
}

export interface ModalBlockDivider {
  type: 'divider';
}

export interface ModalBlockImage {
  type: 'image';
  image: AssetRef;
  caption?: string;
  from?: string;
}

export interface ModalBlockMetaRows {
  type: 'metaRows';
  rows: { label: string; value: string }[];
  from?: string;
}

export interface ModalBlockTimer {
  type: 'timer';
  endsAt: string;
  label?: string;
  from?: string;
}

export interface ModalBlockProgress {
  type: 'progress';
  label?: string;
  current: number;
  max: number;
  from?: string;
}

export interface ModalBlockRewardsPreview {
  type: 'rewardsPreview';
  items: RewardItem[];
  from?: string;
}

export interface ModalBlockRewardsList {
  type: 'rewardsList';
  title?: string;
  items: RewardItem[];
  from?: string;
}

export interface ModalBlockInventoryDelta {
  type: 'inventoryDelta';
  items: { assetKey?: string; name: string; qtyDelta: number }[];
  from?: string;
}

export interface ModalBlockGiftReveal {
  type: 'giftReveal';
  gift: { giftId: string; title: string; image?: AssetRef };
  rewards?: RewardItem[];
  from?: string;
}

export interface ModalBlockList {
  type: 'list';
  list: string;
  children: ModalBlock[];
  emptyText?: string;
}

export interface ModalBlockClickReveal {
  type: 'clickReveal';
  cover?: string;
  coverImage?: AssetRef;
  tags?: string;
  soundMap?: string;
  fxMap?: string;
  children: ModalBlock[];
}

export interface ModalBlockError {
  type: 'error';
  message: string;
  from?: string;
}

export interface RewardItem {
  assetKey?: string;
  name: string;
  qty?: number;
  rarity?: string;
  note?: string;
}

export type RichTextDoc = RichTextNode[];

export type RichTextNode =
  | { t: 'p' | 'h1' | 'h2' | 'ul' | 'li' | 'strong' | 'em' | 'code'; c: RichTextNode[] }
  | { t: 'link'; c: RichTextNode[]; href: string }
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'token'; key: string };

export const MODAL_ACTION_TYPES = [
  'CLOSE_MODAL',
  'NAVIGATE',
  'ACK_NOTIFICATION',
  'COMPLETE_JOB',
  'CLAIM_GIFT',
  'OPEN_INVENTORY',
  'OPEN_MISSIONS',
  'OPEN_CRAFTING',
  'REPEAT_MISSION',
  'CRAFT_AGAIN',
  'API_CALL',
  'BUILD_BUILDING',
  'UPGRADE_BUILDING',
  'SHOP_PURCHASE',
  'DEPOSIT_LOCATION_XP',
  'PRESTIGE',
] as const;

export type ModalActionType = (typeof MODAL_ACTION_TYPES)[number];

export const MODAL_BLOCK_TYPES = [
  'richText',
  'divider',
  'image',
  'metaRows',
  'timer',
  'progress',
  'rewardsPreview',
  'rewardsList',
  'inventoryDelta',
  'giftReveal',
  'list',
  'clickReveal',
  'error',
] as const;

/**
 * Parse a "k1=v1, k2=v2, *=fallback" string into ordered [key, value] pairs.
 * Whitespace around keys/values is trimmed. Empty entries are dropped.
 */
export function parseTagMap(src: string | undefined | null): [string, string][] {
  if (!src || typeof src !== 'string') return [];
  const out: [string, string][] = [];
  for (const raw of src.split(',')) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    const key = raw.slice(0, eq).trim();
    const val = raw.slice(eq + 1).trim();
    if (!val) continue;
    out.push([key, val]);
  }
  return out;
}

/**
 * Resolve the first matching value from a tag map for a given list of tags.
 * Tags are checked in order; for each tag, the first map entry whose key
 * equals that tag wins. After all tags are tried, a `*` (or empty `""`) key
 * acts as a final fallback.
 */
export function lookupTagMap(
  pairs: [string, string][],
  tags: string[],
): string | undefined {
  if (pairs.length === 0) return undefined;
  for (const tag of tags) {
    const t = tag.trim();
    if (!t) continue;
    for (const [k, v] of pairs) {
      if (k === t) return v;
    }
  }
  for (const [k, v] of pairs) {
    if (k === '*' || k === '') return v;
  }
  return undefined;
}

/** Split a free-form tag string ("legendary", "rare,shiny") into a clean list. */
export function splitTags(src: string | undefined | null): string[] {
  if (!src || typeof src !== 'string') return [];
  return src.split(',').map(s => s.trim()).filter(Boolean);
}

export type ModalBlockType = (typeof MODAL_BLOCK_TYPES)[number];

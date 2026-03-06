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
  | { type: 'UPGRADE_BUILDING'; locationId: string; buildingId: string };

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
  | ModalBlockError;

export interface ModalBlockRichText {
  type: 'richText';
  doc: RichTextDoc;
}

export interface ModalBlockDivider {
  type: 'divider';
}

export interface ModalBlockImage {
  type: 'image';
  image: AssetRef;
  caption?: string;
}

export interface ModalBlockMetaRows {
  type: 'metaRows';
  rows: { label: string; value: string }[];
}

export interface ModalBlockTimer {
  type: 'timer';
  endsAt: string;
  label?: string;
}

export interface ModalBlockProgress {
  type: 'progress';
  label?: string;
  current: number;
  max: number;
}

export interface ModalBlockRewardsPreview {
  type: 'rewardsPreview';
  items: RewardItem[];
}

export interface ModalBlockRewardsList {
  type: 'rewardsList';
  title?: string;
  items: RewardItem[];
}

export interface ModalBlockInventoryDelta {
  type: 'inventoryDelta';
  items: { assetKey?: string; name: string; qtyDelta: number }[];
}

export interface ModalBlockGiftReveal {
  type: 'giftReveal';
  gift: { giftId: string; title: string; image?: AssetRef };
  rewards?: RewardItem[];
}

export interface ModalBlockError {
  type: 'error';
  message: string;
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
  'error',
] as const;

export type ModalBlockType = (typeof MODAL_BLOCK_TYPES)[number];

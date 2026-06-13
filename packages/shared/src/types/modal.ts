export interface ModalSpecV1 {
  version: 1;
  id: string;
  kind: string;
  dismiss: { backdrop: boolean; x: boolean; escape: boolean };
  header: ModalHeader;
  buttons: ModalButton[];
  pages: ModalPageSpec[];
  showPageIndicator?: boolean;
  telemetry?: ModalTelemetry;
}

export interface ModalPageSpec {
  body: ModalBlock[];
  header?: Partial<ModalHeader>;
  buttons?: ModalButton[];
  dismiss?: { backdrop?: boolean; x?: boolean; escape?: boolean };
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

export interface ModalSkipCost {
  assetKey?: string;
  label: string;
  amount: number;
  currencyId?: string;
}

export interface ModalButton {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  action: ModalAction;
  requiresConfirm?: {
    title: string;
    body?: ModalBlock[];
    confirmLabel?: string;
    cancelLabel?: string;
  };
  skipMeta?: {
    baseCosts: ModalSkipCost[];
    skipType: 'absolute' | 'scaling';
  };
}

export type ModalAction =
  | { type: 'CLOSE_MODAL' }
  | { type: 'NEXT_PAGE' }
  | { type: 'PREV_PAGE' }
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
  | { type: 'DEPOSIT_LOCATION_XP'; locationId: string; costOption: { type: 'currency' | 'item'; id: string; amount: number }; charges?: number; chargesBindingId?: string }
  | { type: 'PRESTIGE' }
  | { type: 'SKIP'; targetType: string; targetId: string }
  | { type: 'EXECUTE_COMMAND'; command: string; payload: Record<string, unknown> };

/**
 * Per-item reveal options for list-style blocks.
 * Each rendered item is wrapped in a tap-to-reveal cover.
 *
 * `tagsFrom` is a dot-path into each item's data object used to resolve a
 * per-item tag for soundMap/fxMap lookup (e.g. "rarity" on a rewardsList uses
 * each reward's rarity field). It takes precedence over the static `tags`
 * string when both are present. Silently ignored on the `list` block whose
 * children are ModalBlock objects rather than data items.
 */
export interface ModalRevealOptions {
  cover?: string;
  coverImage?: AssetRef;
  /** Static tag string applied uniformly to every item. Overridden per-item by tagsFrom. */
  tags?: string;
  /** Dot-path into each item's data to resolve a per-item tag (e.g. "rarity"). Takes precedence over tags when both are present. */
  tagsFrom?: string;
  soundMap?: string;
  fxMap?: string;
}

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
  | ModalBlockError
  | ModalBlockCharacterEvents
  | ModalBlockEntityRoster
  | ModalBlockQuantityInput
  | ModalBlockMissionPhases;

export interface ModalBlockRichText {
  type: 'richText';
  doc: RichTextDoc;
  from?: string;
}

export interface ModalBlockDivider {
  type: 'divider';
}

export interface ImageDisplay {
  /** Horizontal alignment of the image within its container. Default: 'center'. */
  align?: 'left' | 'center' | 'right';
  /**
   * How the image width is determined.
   * - 'stretch' — fills the full container width (default)
   * - 'percent' — uses `width` as a percentage of the container
   * - 'px'      — uses `width` as an absolute pixel value
   */
  sizing?: 'stretch' | 'percent' | 'px';
  /** Numeric value used when sizing is 'percent' or 'px'. */
  width?: number;
  /** Corner rounding in pixels. Default: 12. */
  borderRadius?: number;
}

export interface ModalBlockImage {
  type: 'image';
  /** Optional when `from` is used to populate the image at resolve time. */
  image?: AssetRef;
  caption?: string;
  display?: ImageDisplay;
  from?: string;
}

export interface MetaRowValueItem {
  assetKey: string;
  amount: number;
}

export interface ModalBlockMetaRows {
  type: 'metaRows';
  /** Optional when populated via `from` at resolve time. */
  rows?: { label: string; value: string; valueItems?: MetaRowValueItem[] }[];
  from?: string;
  revealOptions?: ModalRevealOptions;
}

export interface ModalBlockTimer {
  type: 'timer';
  /** Game tick when the timer started. Primary (tick-native) mode — renderer reads currentTick live from the Redux store. */
  startTick?: number;
  /** Total duration in game ticks. Primary (tick-native) mode. */
  durationTicks?: number;
  /** UTC ISO timestamp the timer counts down to. Wall-clock mode only; requires wallClock: true. */
  endsAt?: string;
  /** Set to true when endsAt is a genuine wall-clock anchor (daily resets, season ends). Tick-native fields take priority when present. */
  wallClock?: boolean;
  label?: string;
  from?: string;
}

export interface ModalBlockProgress {
  type: 'progress';
  label?: string;
  /** Game tick when the job started. Tick-native mode (preferred over startsAt/endsAt). */
  startTick?: number;
  /** Total duration in game ticks. Tick-native mode. */
  durationTicks?: number;
  /** Current progress count. Count mode — used only when tick fields are absent. */
  current?: number;
  /** Maximum progress count. Count mode. */
  max?: number;
  startsAt?: string;
  endsAt?: string;
  from?: string;
}

export interface ModalBlockRewardsPreview {
  type: 'rewardsPreview';
  items?: RewardItem[];
  from?: string;
  revealOptions?: ModalRevealOptions;
}

export interface ModalBlockRewardsList {
  type: 'rewardsList';
  title?: string;
  items?: RewardItem[];
  from?: string;
  revealOptions?: ModalRevealOptions;
}

export interface ModalBlockInventoryDelta {
  type: 'inventoryDelta';
  items?: { assetKey?: string; name: string; qtyDelta: number }[];
  from?: string;
  revealOptions?: ModalRevealOptions;
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
  revealOptions?: ModalRevealOptions;
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

export type CharacterEvent =
  | { type: 'level_up'; entityName: string; newLevel: number }
  | { type: 'injured'; entityName: string };

export interface ModalBlockCharacterEvents {
  type: 'characterEvents';
  items?: CharacterEvent[];
  from?: string;
  revealOptions?: ModalRevealOptions;
}

export interface ModalBlockEntityRosterEntity {
  id: string;
  name: string;
  level: number;
  portraitKey?: string;
  powerContribution?: number;
  outcome?: {
    injured: boolean;
    xpGained: number;
    levelBefore: number;
    levelAfter: number;
  };
}

export interface ModalBlockEntityRoster {
  type: 'entityRoster';
  editable: boolean;
  entities?: ModalBlockEntityRosterEntity[];
  from?: string;
  revealOptions?: ModalRevealOptions;
}

export interface ModalBlockQuantityInput {
  type: 'quantityInput';
  id: string;
  min: number;
  max: number;
  defaultValue: number;
  resourceId: string;
  costAmount: number;
  xpPerCharge: number;
  from?: string;
}

export interface ModalBlockMissionPhaseDef {
  durationTicks: number;
  count?: number;
  label?: string;
}

export interface ModalBlockMissionPhases {
  type: 'mission_phases';
  currentPhaseIndex: number;
  totalPhases: number;
  phaseResults: Array<{ phaseIndex: number; success: boolean }>;
  currentPhaseSuccesses: number;
  phases: ModalBlockMissionPhaseDef[];
  tickRate: number;
  timerEndsAt?: string;
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
  'NEXT_PAGE',
  'PREV_PAGE',
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
  'SKIP',
  'EXECUTE_COMMAND',
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
  'characterEvents',
  'entityRoster',
  'quantityInput',
  'mission_phases',
] as const;

/**
 * Compute the effective header/buttons/dismiss/body for a given page index
 * by applying page overrides cumulatively from page 0 through pageIdx.
 *
 * Root-level `header`, `buttons`, and `dismiss` are intentional defaults —
 * they serve as the base that individual pages can override. They are NOT
 * legacy; this is the intended multi-page inheritance design.
 *
 * Defensive: returns safe fallbacks if `spec.pages` is absent or empty
 * (e.g. a DB record not yet migrated to the pages schema).
 */
export function computeEffectivePage(
  spec: ModalSpecV1,
  pageIdx: number,
): { header: ModalHeader; buttons: ModalButton[]; dismiss: ModalSpecV1['dismiss']; body: ModalBlock[] } {
  const pages = Array.isArray(spec.pages) && spec.pages.length > 0 ? spec.pages : [{ body: [] as ModalBlock[] }];

  let header: ModalHeader = { ...(spec.header ?? { title: '' }) };
  let buttons: ModalButton[] = [...(spec.buttons ?? [])];
  let dismiss = { ...(spec.dismiss ?? { backdrop: true, x: true, escape: true }) };

  const clampedIdx = Math.max(0, Math.min(pageIdx, pages.length - 1));
  for (let i = 0; i <= clampedIdx; i++) {
    const page = pages[i];
    if (page.header) header = { ...header, ...page.header };
    if (page.buttons !== undefined) buttons = page.buttons;
    if (page.dismiss) dismiss = { ...dismiss, ...page.dismiss };
  }

  return { header, buttons, dismiss, body: pages[clampedIdx].body };
}

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

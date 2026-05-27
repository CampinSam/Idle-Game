// ─── Platform ────────────────────────────────────────────────────────────────

export type PlatformKey = 'ios' | 'android' | 'web' | 'desktop';

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  version: number;
  date: string;
  author?: string;
  summary: string;
}

export interface ScreenMetadata {
  name?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  notes?: string;
  changelog?: ChangelogEntry[];
}

// ─── Platform rule ────────────────────────────────────────────────────────────

export interface PlatformRule {
  include?: PlatformKey[];
  exclude?: PlatformKey[];
  minAppVersion?: string;
  maxAppVersion?: string;
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface AvailabilityRule {
  startsAt?: string | null;
  endsAt?: string | null;
  seasonIds?: string[];
  eventIds?: string[];
  featureFlags?: string[];
}

// ─── Audience ─────────────────────────────────────────────────────────────────

export interface AudienceRule {
  includeUserSegments?: string[];
  excludeUserSegments?: string[];
  minKeeperLevel?: number;
  maxKeeperLevel?: number | null;
  requiredFlags?: string[];
  excludedFlags?: string[];
  walletStatus?: 'any' | 'connected' | 'not_connected';
  nftStatus?: 'any' | 'has_nft' | 'no_nft';
}

// ─── Visibility rules ─────────────────────────────────────────────────────────

export type VisibilityOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'includes'
  | 'not_includes'
  | 'exists'
  | 'not_exists'
  | 'in'
  | 'not_in';

export interface VisibilityRule {
  path: string;
  operator: VisibilityOperator;
  value?: unknown;
}

export interface VisibilityRuleGroup {
  all?: VisibilityRule[];
  any?: VisibilityRule[];
  none?: VisibilityRule[];
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface NavigateAction {
  type: 'navigate';
  target: string;
  params?: Record<string, unknown>;
}

export interface OpenModalAction {
  type: 'open_modal';
  modalKey: string;
  params?: Record<string, unknown>;
}

export interface CloseModalAction {
  type: 'close_modal';
}

export interface ConfirmationConfig {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ApiAction {
  type: 'api';
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  body?: Record<string, unknown>;
  confirm?: ConfirmationConfig;
  successToast?: string;
  errorToast?: string;
  refreshDataSources?: string[];
}

export interface ClaimRewardAction {
  type: 'claim_reward';
  rewardSource: 'daily_quest' | 'battle_pass' | 'event' | 'mail' | 'achievement';
  rewardIdPath?: string;
  endpoint: string;
  successToast?: string;
  refreshDataSources?: string[];
}

export interface OpenStoreItemAction {
  type: 'open_store_item';
  storeItemId: string;
  presentation?: 'modal' | 'screen' | 'bottom_sheet';
}

export interface OpenExternalLinkAction {
  type: 'open_external_link';
  url: string;
  mode?: 'browser' | 'webview';
  confirmExternal?: boolean;
}

export interface TrackOnlyAction {
  type: 'track_only';
  eventName: string;
  payload?: Record<string, unknown>;
}

export interface NoOpAction {
  type: 'noop';
}

export type ActionDefinition =
  | NavigateAction
  | OpenModalAction
  | CloseModalAction
  | ApiAction
  | ClaimRewardAction
  | OpenStoreItemAction
  | OpenExternalLinkAction
  | TrackOnlyAction
  | NoOpAction;

// ─── Component key registry ───────────────────────────────────────────────────

export type ScreenComponentKey =
  | 'ResourceSummaryBar'
  | 'SeasonBanner'
  | 'QuickStatusCards'
  | 'DailyQuestPanel'
  | 'FeaturedBirdCard'
  | 'StoreOfferCard'
  | 'StoreOfferCarousel'
  | 'StoreItemGrid'
  | 'StoreItemRail'
  | 'BattlePassProgress'
  | 'BattlePassTierList'
  | 'EventCarousel'
  | 'EventCardList'
  | 'SeasonBossPanel'
  | 'NewsCard'
  | 'AnnouncementFeed'
  | 'MissionCategoryRail'
  | 'MissionFeaturedCard'
  | 'CraftingQueuePreview'
  | 'RecipeCategoryRail'
  | 'OutpostReadyList'
  | 'OutpostSummaryCards'
  | 'InventoryCategoryGrid'
  | 'WalletPromptCard'
  | 'NFTCapacityInfoCard'
  | 'EmptyStateCard'
  | 'HelpTipCard'
  | 'CTAButtonGroup'
  | 'PatchNotesCard'
  | 'SkeletonCard'
  | 'BannerCarousel'
  | 'DailyCheckInCard'
  | 'ActiveMissionList'
  | 'FeaturedShopRail'
  | 'GemPackGrid'
  | 'EntityRoster'
  | 'EntityDetailView'
  | 'InventoryItemBrowser'
  | 'MissionBrowser'
  | (string & Record<never, never>);

// ─── Layout ───────────────────────────────────────────────────────────────────

export type ScreenLayoutType =
  | 'vertical_feed'
  | 'tabbed_feed'
  | 'grid'
  | 'split_panel'
  | 'modal_stack'
  | 'wizard'
  | 'fixed_structure'
  | 'hero_stack'
  | 'grid_feed'
  | 'carousel_feed'
  | 'pass_through';

export type SpacingToken = 'none' | 'tight' | 'standard' | 'loose';

export interface LayoutTabDefinition {
  id: string;
  label: string;
  icon?: string;
  default?: boolean;
  visibility?: VisibilityRuleGroup;
}

export interface LayoutColumnDefinition {
  id: string;
  width: 'fixed' | 'flex' | 'content';
  size?: number;
}

export interface ModalLayoutConfig {
  size: 'small' | 'medium' | 'large' | 'full_screen_mobile';
  dismissible: boolean;
  closeOnBackdrop?: boolean;
}

export interface ResponsiveLayoutConfig {
  mobile?: Record<string, unknown>;
  tablet?: Record<string, unknown>;
  desktop?: Record<string, unknown>;
}

export interface ScreenLayoutConfig {
  layoutType: ScreenLayoutType;
  safeArea?: boolean;
  maxWidth?: 'mobile_full' | 'content' | 'wide';
  padding?: SpacingToken;
  gap?: SpacingToken;
  scroll?: boolean;
  refreshBehavior?: 'none' | 'pull_to_refresh' | 'auto_refresh';
  tabs?: LayoutTabDefinition[];
  columns?: LayoutColumnDefinition[];
  modal?: ModalLayoutConfig;
  responsive?: ResponsiveLayoutConfig;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type NavigationTabKey =
  | 'home'
  | 'outposts'
  | 'missions'
  | 'birds'
  | 'crafting'
  | 'inventory'
  | 'season'
  | 'store'
  | 'more';

export interface TopBarActionDefinition {
  id: string;
  icon: string;
  label?: string;
  action: ActionDefinition;
  visibility?: VisibilityRuleGroup;
}

export interface NavigationConfig {
  showTopBar?: boolean;
  showBottomNav?: boolean;
  selectedTab?: NavigationTabKey;
  title?: string;
  subtitle?: string;
  backBehavior?: 'none' | 'default' | 'close_modal' | 'custom_target';
  customBackTarget?: string;
  topBarActions?: TopBarActionDefinition[];
}

// ─── Data sources ─────────────────────────────────────────────────────────────

export type DataSourceType = 'api' | 'definition' | 'local_state' | 'computed';

export interface DataSourceDefinition {
  id: string;
  sourceType: DataSourceType;
  endpoint?: string;
  method?: 'GET';
  params?: Record<string, unknown>;
  definitionType?: string;
  definitionKey?: string;
  localPath?: string;
  computedKey?: string;
  cacheTtlSeconds?: number;
  required?: boolean;
  fallbackValue?: unknown;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export interface SectionRefreshConfig {
  refreshOnScreenFocus?: boolean;
  refreshIntervalSeconds?: number;
  refreshDataSources?: string[];
}

export interface SectionFallbackConfig {
  component?: ScreenComponentKey;
  message?: string;
}

export interface SectionAnalyticsConfig {
  impressionEvent?: string;
  params?: Record<string, unknown>;
}

export interface ScreenSectionDefinition {
  id: string;
  component: ScreenComponentKey;
  slot?: string;
  priority: number;
  visibility?: VisibilityRuleGroup;
  props?: Record<string, unknown>;
  actions?: Record<string, ActionDefinition>;
  analytics?: SectionAnalyticsConfig;
  refresh?: SectionRefreshConfig;
  fallback?: SectionFallbackConfig;
}

// ─── Analytics + fallback + validation ───────────────────────────────────────

export interface AnalyticsEvent {
  event: string;
  params?: Record<string, unknown>;
}

export interface AnalyticsConfig {
  screenView?: AnalyticsEvent;
  events?: Record<string, AnalyticsEvent>;
}

export interface FallbackConfig {
  screenKey?: string;
  componentKey?: string;
  message?: string;
}

export interface ScreenValidationConfig {
  strict?: boolean;
  allowUnknownComponents?: boolean;
}

// ─── Top-level definition ─────────────────────────────────────────────────────

export interface ScreenCompositionDefinition {
  id: string;
  type: 'screen_composition';
  screenKey: string;
  version: number;
  status: 'draft' | 'active' | 'archived';

  metadata?: ScreenMetadata;
  platform?: PlatformRule;
  availability?: AvailabilityRule;
  audience?: AudienceRule;

  navigation?: NavigationConfig;
  layout: ScreenLayoutConfig;
  dataSources?: DataSourceDefinition[];
  sections: ScreenSectionDefinition[];

  analytics?: AnalyticsConfig;
  fallback?: FallbackConfig;
  validation?: ScreenValidationConfig;
}

// ─── Resolution context ───────────────────────────────────────────────────────

export interface ScreenUserContext {
  id: string;
  keeperLevel: number;
  walletCount: number;
}

export interface ScreenResolutionContext {
  user?: ScreenUserContext;
  platform?: PlatformKey;
}

// ─── DB row shape ─────────────────────────────────────────────────────────────

export interface GameDefinitionRow {
  id: string;
  type: string;
  key: string;
  version: number;
  data: Record<string, any>;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

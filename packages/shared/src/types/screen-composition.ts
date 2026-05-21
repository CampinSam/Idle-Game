export type PlatformKey = 'ios' | 'android' | 'web' | 'desktop';

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

export interface PlatformRule {
  include?: PlatformKey[];
  exclude?: PlatformKey[];
  minAppVersion?: string;
  maxAppVersion?: string;
}

export interface AvailabilityRule {
  startsAt?: string | null;
  endsAt?: string | null;
  seasonId?: string | null;
  eventIds?: string[];
  alwaysOn?: boolean;
}

export interface AudienceRule {
  selection?: Record<string, any>;
  segments?: string[];
  excludeSegments?: string[];
}

export type HeaderStyle = 'default' | 'transparent' | 'hidden';

export interface NavigationConfig {
  title?: string;
  showBackButton?: boolean;
  showBottomNav?: boolean;
  bottomNavActiveKey?: string;
  headerStyle?: HeaderStyle;
}

export type LayoutStyle = 'scroll' | 'fixed' | 'tabs' | 'pager';

export interface ScreenLayoutConfig {
  style: LayoutStyle;
  backgroundColor?: string;
  paddingTop?: number | string;
  paddingBottom?: number | string;
  gap?: number | string;
  maxWidth?: number | string;
}

export type DataSourceType = 'server' | 'definition' | 'local' | 'computed';

export interface DataSourceDefinition {
  id: string;
  type: DataSourceType;
  endpoint?: string;
  definitionType?: string;
  definitionKey?: string;
  params?: Record<string, any>;
  cacheSeconds?: number;
}

export interface VisibilityRule {
  selection?: Record<string, any>;
  platforms?: PlatformKey[];
  minAppVersion?: string;
  segments?: string[];
  dataSourceId?: string;
  condition?: string;
}

export interface ComponentAction {
  type: string;
  route?: string;
  params?: Record<string, any>;
  commandType?: string;
  commandPayload?: Record<string, any>;
}

export interface ScreenComponentDefinition {
  id: string;
  componentKey: string;
  props?: Record<string, any>;
  actions?: Record<string, ComponentAction>;
  visibility?: VisibilityRule;
  dataSourceId?: string;
  order?: number;
}

export interface ScreenSectionDefinition {
  id: string;
  label?: string;
  visibility?: VisibilityRule;
  components: ScreenComponentDefinition[];
  order?: number;
  layout?: Partial<ScreenLayoutConfig>;
}

export interface AnalyticsEvent {
  event: string;
  params?: Record<string, any>;
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

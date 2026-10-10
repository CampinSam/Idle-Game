/** Values that can cross the JSON command, bootstrap, delta, or stream boundary. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type DecimalCursor = string;
export type NumericValue = number | string;

/** Entity names accepted by the sync patch applier. */
export type PatchEntity =
  | 'entity'
  | 'location'
  | 'building'
  | 'room'
  | 'item'
  | 'job'
  | 'notification'
  | 'currency'
  | 'mission'
  | 'quest'
  | 'achievement'
  | 'checkin'
  | 'gift'
  | 'activeEffect'
  | 'player'
  | 'season'
  | 'homeBanner'
  | 'currencyBalance'
  | 'entityPowerUsage'
  | 'locationPowerUsage'
  | 'categoryDef'
  | 'missionDef';

export type SerializedEntity = JsonObject;

/** Ordinary table rows replace the prior row; the special entities below merge or replace a list. */
export type Patch =
  | { op: 'upsert'; entity: Exclude<PatchEntity, 'player' | 'season' | 'homeBanner' | 'currencyBalance' | 'entityPowerUsage' | 'locationPowerUsage'>; id: string; data: SerializedEntity }
  | { op: 'upsert'; entity: 'player'; id: string; data: Partial<SerializedEntity> }
  | { op: 'upsert'; entity: 'season'; id: string; data: SerializedEntity | null }
  | { op: 'upsert'; entity: 'homeBanner'; id: string; data: SerializedEntity[] }
  | { op: 'upsert'; entity: 'currencyBalance'; id: string; data: Record<string, NumericValue> }
  | { op: 'upsert'; entity: 'entityPowerUsage' | 'locationPowerUsage'; id: string; data: Record<string, PowerChargeStatus> }
  | { op: 'delete'; entity: PatchEntity; id: string };

/** UI commands are declarative server output; modal content follows shared ModalSpecV1. */
export type UiIntent =
  | { type: 'modal'; spec: import('./modal').ModalSpecV1 }
  | { type: 'notification'; notificationId: string }
  | { type: 'local_toast'; tone: 'success' | 'error' | 'info'; title: string; body: string; durationMs?: number }
  | { type: 'navigate'; deepLink: string }
  | { type: 'full_reset' };

export interface CommandRequest<TType extends string = string, TPayload extends JsonObject = JsonObject> {
  type: TType;
  payload: TPayload;
  idempotencyKey: string;
}

export interface SynergyPreview extends JsonObject {
  matchedRules: Array<{
    ruleId: string;
    name: string;
    applications: number;
    scoreContrib: number;
    mpBonusContrib: number;
    durationBonusContrib: number;
    isPenalty: boolean;
    [key: string]: JsonValue;
  }>;
  synergyScore: number;
  missionPowerBonus: number;
  durationBonus: number;
}

export interface CommandResponseMeta {
  synergyPreview?: SynergyPreview;
}

export interface CommandResponse {
  patches: Patch[];
  ui: UiIntent[];
  cursor: { delta: DecimalCursor };
  meta?: CommandResponseMeta;
}

export interface BootstrapTickAnchor {
  currentTick: number;
  tickRate: number;
  /** ISO date-time. The top-level bootstrap serverTime remains a JS timestamp number. */
  serverTime: string;
  activeBoosts?: Array<{
    id: string;
    name: string;
    multiplier: number;
    endTime: string;
  }>;
}

export interface BootstrapSnapshotState {
  entities?: SerializedEntity[];
  locations?: SerializedEntity[];
  buildings?: SerializedEntity[];
  rooms?: SerializedEntity[];
  quests?: SerializedEntity[];
  achievements?: SerializedEntity[];
  checkins?: SerializedEntity[];
  gifts?: SerializedEntity[];
  missions?: SerializedEntity[];
  /** Definition catalogs have historically been returned as either arrays or keyed objects. */
  tagDefs?: JsonValue;
  visualEffectDefs?: JsonValue;
  systemIconDefs?: JsonValue;
}

export interface HomeBannerSnapshot {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  backgroundImage?: string | null;
  ctaLabel?: string | null;
  ctaRoute?: string | null;
  priority?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  seasonId?: string | null;
  config?: JsonObject;
  display?: JsonObject;
}

export interface PowerChargeStatus extends JsonObject {
  grantId: string;
  chargeUnits: number;
  maxChargeUnits: number;
  costPerUse: number;
  /** Absolute JS timestamp in milliseconds, not an ISO date. */
  readyAtMs: number | null;
}

export interface ActivePowerSnapshot extends JsonObject {
  id: string;
  label: string;
  effectDefId: string | null;
  effectDefName: string | null;
  effectCategory: string | null;
  value: number;
  valueMode: string;
  endTime: string;
  selection: JsonObject | null;
}

export interface BootstrapSnapshot {
  player: SerializedEntity | null;
  state: BootstrapSnapshotState;
  inventory?: SerializedEntity[];
  jobs?: SerializedEntity[];
  notifications?: SerializedEntity[];
  currencies?: Record<string, NumericValue>;
  activeEffects?: SerializedEntity[];
  homeBanners?: HomeBannerSnapshot[];
  activeSeason?: (SerializedEntity & {
    startsAt?: string;
    endsAt?: string;
  }) | null;
  activePowers?: ActivePowerSnapshot[];
  entityPowerUsages?: Record<string, Record<string, PowerChargeStatus>>;
  locationPowerUsages?: Record<string, Record<string, PowerChargeStatus>>;
}

export interface BootstrapResponse {
  serverTime: number;
  tickAnchor?: BootstrapTickAnchor;
  snapshot: BootstrapSnapshot;
  cursor: { delta: DecimalCursor };
  ui?: UiIntent[];
}

export interface DeltaResponse {
  from: DecimalCursor;
  to: DecimalCursor;
  patches: Patch[];
  ui: UiIntent[];
}

export interface DeltaResetResponse {
  resetRequired: true;
  reason?: string;
  message?: string;
}

export interface CommandHandlerResult {
  patches: Patch[];
  ui: UiIntent[];
}

export type StreamEventName =
  | 'hello'
  | 'ping'
  | 'delta.available'
  | 'reset.required'
  | 'tick.sync'
  | 'home_banners.updated'
  | 'global_power.changed'
  | 'boost.changed'
  | 'purchase.confirmed';

export interface StreamEventDataMap {
  hello: { userId: string; serverTime: number };
  ping: { time: number };
  'delta.available': { delta: DecimalCursor };
  'reset.required': { reason?: string; message?: string };
  'tick.sync': {
    currentTick: number;
    tickRate: number;
    serverTime: string;
    boosts: Array<{ id: string; name: string; multiplier: number; endTime: string }>;
  };
  'home_banners.updated': { banners: HomeBannerSnapshot[] };
  'global_power.changed': {
    active: Array<ActivePowerSnapshot & {
      durationMinutes: number;
      startTime: string;
      status: string;
      triggeredByUserId?: string;
    }>;
    changes: Array<{
      event: 'started' | 'ended';
      id: string;
      label: string;
      durationMinutes: number;
    }>;
  };
  'boost.changed': {
    active: Array<{ id: string; name: string; percentBoost: number; endTime: string }>;
    combinedPercent: number;
  };
  'purchase.confirmed': {
    purchaseId: string;
    gemAmount: number;
    packId: string;
    paymentMethod: string;
  };
}

export type StreamEvent = {
  [TName in StreamEventName]: { event: TName; data: StreamEventDataMap[TName] }
}[StreamEventName];

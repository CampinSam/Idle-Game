import type {
  BootstrapResponse,
  CommandRequest,
  CommandResponse,
  DeltaResetResponse,
  DeltaResponse,
  JsonObject,
  JsonValue,
  Patch,
  PatchEntity,
  StreamEvent,
  StreamEventDataMap,
  StreamEventName,
  UiIntent,
} from './command-pipeline';

const PATCH_ENTITIES: readonly PatchEntity[] = [
  'entity', 'location', 'building', 'room', 'item', 'job', 'notification',
  'currency', 'mission', 'quest', 'achievement', 'checkin', 'gift',
  'activeEffect', 'player', 'season', 'homeBanner', 'currencyBalance',
  'entityPowerUsage', 'locationPowerUsage', 'categoryDef', 'missionDef',
];

const STREAM_EVENT_NAMES: readonly StreamEventName[] = [
  'hello', 'ping', 'delta.available', 'reset.required', 'tick.sync',
  'home_banners.updated', 'global_power.changed', 'boost.changed',
  'purchase.confirmed',
];

const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'readAt', 'dismissedAt', 'expiresAt',
  'startsAt', 'endsAt', 'startTime', 'endTime',
]);

function fail(path: string, expectation: string): never {
  throw new TypeError(`${path} must be ${expectation}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function assertJsonValue(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'a finite JSON number');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) fail(path, 'a JSON-safe value');
  for (const [key, entry] of Object.entries(value)) {
    if (DATE_FIELDS.has(key) && entry !== null) {
      // Timestamp fields emitted as ISO strings are checked, while older records
      // that represented the same timestamp numerically remain readable.
      if (typeof entry === 'string' && !isIsoDateTime(entry)) {
        fail(`${path}.${key}`, 'an ISO date-time string or null');
      }
      if (typeof entry !== 'string' && typeof entry !== 'number') {
        fail(`${path}.${key}`, 'an ISO date-time string, number, or null');
      }
    }
    assertJsonValue(entry, `${path}.${key}`);
  }
}

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'an object');
}

function assertString(value: unknown, path: string, nonEmpty = true): asserts value is string {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) {
    fail(path, nonEmpty ? 'a non-empty string' : 'a string');
  }
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a finite number');
}

function assertDecimal(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(path, 'a decimal cursor string');
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array');
}

function assertObjectArray(value: unknown, path: string): void {
  assertArray(value, path);
  value.forEach((entry, index) => assertObject(entry, `${path}[${index}]`));
}

function assertPowerUsageMaps(value: unknown, path: string): void {
  assertObject(value, path);
  for (const [ownerId, usage] of Object.entries(value)) {
    assertObject(usage, `${path}.${ownerId}`);
    for (const [powerKey, status] of Object.entries(usage)) {
      assertPowerChargeStatus(status, `${path}.${ownerId}.${powerKey}`);
    }
  }
}

function assertPowerChargeStatus(value: unknown, path: string): void {
  assertObject(value, path);
  assertStringField(value, 'grantId', path);
  for (const field of ['chargeUnits', 'maxChargeUnits', 'costPerUse']) {
    assertNumber(value[field], `${path}.${field}`);
  }
  if (value.readyAtMs !== null) assertNumber(value.readyAtMs, `${path}.readyAtMs`);
}

function assertStringField(record: Record<string, unknown>, key: string, path: string): void {
  assertString(record[key], `${path}.${key}`);
}

function assertCursor(value: unknown, path: string): void {
  assertObject(value, path);
  assertDecimal(value.delta, `${path}.delta`);
  assertJsonValue(value, path);
}

export function assertPatch(value: unknown, path = 'patch'): asserts value is Patch {
  assertObject(value, path);
  if (value.op !== 'upsert' && value.op !== 'delete') fail(`${path}.op`, '"upsert" or "delete"');
  if (typeof value.entity !== 'string' || !PATCH_ENTITIES.includes(value.entity as PatchEntity)) {
    fail(`${path}.entity`, 'a supported patch entity');
  }
  assertStringField(value, 'id', path);
  if (value.op === 'delete') {
    if (Object.prototype.hasOwnProperty.call(value, 'data')) {
      fail(`${path}.data`, 'absent on delete patches');
    }
  } else {
    if (!Object.prototype.hasOwnProperty.call(value, 'data') || value.data === undefined) {
      fail(`${path}.data`, 'present on upsert patches');
    }
    assertJsonValue(value.data, `${path}.data`);
    if (value.entity === 'homeBanner') {
      assertObjectArray(value.data, `${path}.data`);
    } else if (value.entity === 'season') {
      if (value.data !== null) assertObject(value.data, `${path}.data`);
    } else {
      assertObject(value.data, `${path}.data`);
    }
    if (value.entity === 'currencyBalance') {
      for (const [currencyId, amount] of Object.entries(value.data as Record<string, unknown>)) {
        if (typeof amount !== 'number' && typeof amount !== 'string') {
          fail(`${path}.data.${currencyId}`, 'a numeric value or decimal string');
        }
      }
    } else if (value.entity === 'entityPowerUsage' || value.entity === 'locationPowerUsage') {
      for (const [powerKey, status] of Object.entries(value.data as Record<string, unknown>)) {
        assertPowerChargeStatus(status, `${path}.data.${powerKey}`);
      }
    }
  }
  assertJsonValue(value, path);
}

export function assertUiIntent(value: unknown, path = 'uiIntent'): asserts value is UiIntent {
  assertObject(value, path);
  switch (value.type) {
    case 'modal': {
      const spec = value.spec;
      assertObject(spec, `${path}.spec`);
      if (spec.version !== 1) fail(`${path}.spec.version`, '1');
      assertStringField(spec, 'id', `${path}.spec`);
      assertStringField(spec, 'kind', `${path}.spec`);
      assertObject(spec.dismiss, `${path}.spec.dismiss`);
      assertObject(spec.header, `${path}.spec.header`);
      assertArray(spec.buttons, `${path}.spec.buttons`);
      assertArray(spec.pages, `${path}.spec.pages`);
      break;
    }
    case 'notification':
      assertStringField(value, 'notificationId', path);
      break;
    case 'local_toast':
      if (value.tone !== 'success' && value.tone !== 'error' && value.tone !== 'info') {
        fail(`${path}.tone`, '"success", "error", or "info"');
      }
      assertStringField(value, 'title', path);
      assertStringField(value, 'body', path);
      if (value.durationMs !== undefined) assertNumber(value.durationMs, `${path}.durationMs`);
      break;
    case 'navigate':
      assertStringField(value, 'deepLink', path);
      break;
    case 'full_reset':
      break;
    default:
      fail(`${path}.type`, 'a supported UI intent type');
  }
  assertJsonValue(value, path);
}

export function isPatch(value: unknown): value is Patch {
  try {
    assertPatch(value);
    return true;
  } catch {
    return false;
  }
}

export function isUiIntent(value: unknown): value is UiIntent {
  try {
    assertUiIntent(value);
    return true;
  } catch {
    return false;
  }
}

function assertPatchesAndUi(value: Record<string, unknown>, path: string): void {
  assertArray(value.patches, `${path}.patches`);
  value.patches.forEach((patch, index) => assertPatch(patch, `${path}.patches[${index}]`));
  assertArray(value.ui, `${path}.ui`);
  value.ui.forEach((intent, index) => assertUiIntent(intent, `${path}.ui[${index}]`));
}

/** Runtime check for values before they are serialized onto a protocol boundary. */
export function isJsonSafe(value: unknown): value is JsonValue {
  try {
    assertJsonValue(value, 'value');
    return true;
  } catch {
    return false;
  }
}

export function assertJsonSafe(value: unknown): asserts value is JsonValue {
  assertJsonValue(value, 'value');
}

export function isCommandRequest(value: unknown): value is CommandRequest {
  try {
    assertCommandRequest(value);
    return true;
  } catch {
    return false;
  }
}

export function assertCommandRequest(value: unknown): asserts value is CommandRequest {
  assertObject(value, 'commandRequest');
  assertStringField(value, 'type', 'commandRequest');
  assertStringField(value, 'idempotencyKey', 'commandRequest');
  if (value.payload !== undefined) assertObject(value.payload, 'commandRequest.payload');
  assertJsonValue(value, 'commandRequest');
}

export function isCommandResponse(value: unknown): value is CommandResponse {
  try {
    assertCommandResponse(value);
    return true;
  } catch {
    return false;
  }
}

export function assertCommandResponse(value: unknown): asserts value is CommandResponse {
  assertObject(value, 'commandResponse');
  assertPatchesAndUi(value, 'commandResponse');
  assertCursor(value.cursor, 'commandResponse.cursor');
  if (value.meta !== undefined) assertObject(value.meta, 'commandResponse.meta');
  assertJsonValue(value, 'commandResponse');
}

export function isBootstrapResponse(value: unknown): value is BootstrapResponse {
  try {
    assertBootstrapResponse(value);
    return true;
  } catch {
    return false;
  }
}

export function assertBootstrapResponse(value: unknown): asserts value is BootstrapResponse {
  assertObject(value, 'bootstrap');
  assertNumber(value.serverTime, 'bootstrap.serverTime');
  assertObject(value.snapshot, 'bootstrap.snapshot');
  const snapshot = value.snapshot;
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'player')
      || (snapshot.player !== null && !isRecord(snapshot.player))) {
    fail('bootstrap.snapshot.player', 'an object or null');
  }
  assertObject(snapshot.state, 'bootstrap.snapshot.state');

  const arrayFields = [
    'inventory', 'jobs', 'notifications', 'activeEffects', 'homeBanners', 'activePowers',
  ];
  for (const field of arrayFields) {
    if (snapshot[field] !== undefined) {
      assertObjectArray(snapshot[field], `bootstrap.snapshot.${field}`);
    }
  }
  const stateArrayFields = [
    'entities', 'locations', 'buildings', 'rooms', 'quests', 'achievements',
    'checkins', 'gifts', 'missions',
  ];
  for (const field of stateArrayFields) {
    if (snapshot.state[field] !== undefined) {
      assertObjectArray(snapshot.state[field], `bootstrap.snapshot.state.${field}`);
    }
  }
  if (snapshot.currencies !== undefined) {
    assertObject(snapshot.currencies, 'bootstrap.snapshot.currencies');
    for (const [currencyId, amount] of Object.entries(snapshot.currencies)) {
      if (typeof amount !== 'number' && typeof amount !== 'string') {
        fail(`bootstrap.snapshot.currencies.${currencyId}`, 'a numeric value or decimal string');
      }
    }
  }
  if (snapshot.entityPowerUsages !== undefined) {
    assertPowerUsageMaps(snapshot.entityPowerUsages, 'bootstrap.snapshot.entityPowerUsages');
  }
  if (snapshot.locationPowerUsages !== undefined) {
    assertPowerUsageMaps(snapshot.locationPowerUsages, 'bootstrap.snapshot.locationPowerUsages');
  }
  if (snapshot.activeSeason !== undefined && snapshot.activeSeason !== null) {
    assertObject(snapshot.activeSeason, 'bootstrap.snapshot.activeSeason');
  }
  if (value.tickAnchor !== undefined) {
    assertObject(value.tickAnchor, 'bootstrap.tickAnchor');
    assertNumber(value.tickAnchor.currentTick, 'bootstrap.tickAnchor.currentTick');
    assertNumber(value.tickAnchor.tickRate, 'bootstrap.tickAnchor.tickRate');
    assertString(value.tickAnchor.serverTime, 'bootstrap.tickAnchor.serverTime');
    if (!isIsoDateTime(value.tickAnchor.serverTime)) {
      fail('bootstrap.tickAnchor.serverTime', 'an ISO date-time string');
    }
    if (value.tickAnchor.activeBoosts !== undefined) {
      const activeBoosts = value.tickAnchor.activeBoosts;
      assertObjectArray(activeBoosts, 'bootstrap.tickAnchor.activeBoosts');
      (activeBoosts as unknown[]).forEach((boost, index) => {
        const path = `bootstrap.tickAnchor.activeBoosts[${index}]`;
        assertStringField(boost as Record<string, unknown>, 'id', path);
        assertStringField(boost as Record<string, unknown>, 'name', path);
        assertNumber((boost as Record<string, unknown>).multiplier, `${path}.multiplier`);
        const endTime = (boost as Record<string, unknown>).endTime;
        assertString(endTime, `${path}.endTime`);
        if (!isIsoDateTime(endTime)) fail(`${path}.endTime`, 'an ISO date-time string');
      });
    }
  }
  assertCursor(value.cursor, 'bootstrap.cursor');
  if (value.ui !== undefined) {
    assertArray(value.ui, 'bootstrap.ui');
    value.ui.forEach((intent, index) => assertUiIntent(intent, `bootstrap.ui[${index}]`));
  }
  assertJsonValue(value, 'bootstrap');
}

export function isDeltaResponse(value: unknown): value is DeltaResponse {
  try {
    assertDeltaResponse(value);
    return true;
  } catch {
    return false;
  }
}

export function assertDeltaResponse(value: unknown): asserts value is DeltaResponse {
  assertObject(value, 'delta');
  assertDecimal(value.from, 'delta.from');
  assertDecimal(value.to, 'delta.to');
  assertPatchesAndUi(value, 'delta');
  assertJsonValue(value, 'delta');
}

export function isDeltaResetResponse(value: unknown): value is DeltaResetResponse {
  try {
    assertDeltaResetResponse(value);
    return true;
  } catch {
    return false;
  }
}

export function assertDeltaResetResponse(value: unknown): asserts value is DeltaResetResponse {
  assertObject(value, 'deltaReset');
  if (value.resetRequired !== true) fail('deltaReset.resetRequired', 'true');
  if (value.reason !== undefined) assertString(value.reason, 'deltaReset.reason');
  if (value.message !== undefined) assertString(value.message, 'deltaReset.message');
  assertJsonValue(value, 'deltaReset');
}

function assertEventData(event: StreamEventName, value: unknown): asserts value is StreamEventDataMap[typeof event] {
  assertObject(value, `${event}.data`);
  switch (event) {
    case 'hello':
      assertStringField(value, 'userId', `${event}.data`);
      assertNumber(value.serverTime, `${event}.data.serverTime`);
      break;
    case 'ping':
      assertNumber(value.time, `${event}.data.time`);
      break;
    case 'delta.available':
      assertDecimal(value.delta, `${event}.data.delta`);
      break;
    case 'reset.required':
      if (value.reason !== undefined) assertString(value.reason, `${event}.data.reason`);
      if (value.message !== undefined) assertString(value.message, `${event}.data.message`);
      break;
    case 'tick.sync':
      assertNumber(value.currentTick, `${event}.data.currentTick`);
      assertNumber(value.tickRate, `${event}.data.tickRate`);
      assertString(value.serverTime, `${event}.data.serverTime`);
      if (!isIsoDateTime(value.serverTime)) fail(`${event}.data.serverTime`, 'an ISO date-time string');
      assertArray(value.boosts, `${event}.data.boosts`);
      value.boosts.forEach((boost, index) => {
        const path = `${event}.data.boosts[${index}]`;
        assertObject(boost, path);
        assertStringField(boost, 'id', path);
        assertStringField(boost, 'name', path);
        assertNumber(boost.multiplier, `${path}.multiplier`);
        assertString(boost.endTime, `${path}.endTime`);
        if (!isIsoDateTime(boost.endTime)) fail(`${path}.endTime`, 'an ISO date-time string');
      });
      break;
    case 'home_banners.updated':
      assertArray(value.banners, `${event}.data.banners`);
      break;
    case 'global_power.changed':
      assertArray(value.active, `${event}.data.active`);
      value.active.forEach((power, index) => {
        const path = `${event}.data.active[${index}]`;
        assertObject(power, path);
        for (const field of ['id', 'label', 'valueMode', 'startTime', 'endTime', 'status']) {
          assertStringField(power, field, path);
        }
        for (const field of ['value', 'durationMinutes']) assertNumber(power[field], `${path}.${field}`);
        if (power.effectDefId !== null) assertString(power.effectDefId, `${path}.effectDefId`);
        if (power.effectDefName !== null) assertString(power.effectDefName, `${path}.effectDefName`);
        if (power.effectCategory !== null) assertString(power.effectCategory, `${path}.effectCategory`);
        if (power.selection !== null) assertObject(power.selection, `${path}.selection`);
        if (power.triggeredByUserId !== undefined) assertString(power.triggeredByUserId, `${path}.triggeredByUserId`);
      });
      assertArray(value.changes, `${event}.data.changes`);
      value.changes.forEach((change, index) => {
        const path = `${event}.data.changes[${index}]`;
        assertObject(change, path);
        if (change.event !== 'started' && change.event !== 'ended') fail(`${path}.event`, '"started" or "ended"');
        assertStringField(change, 'id', path);
        assertStringField(change, 'label', path);
        assertNumber(change.durationMinutes, `${path}.durationMinutes`);
      });
      break;
    case 'boost.changed':
      assertArray(value.active, `${event}.data.active`);
      value.active.forEach((boost, index) => {
        const path = `${event}.data.active[${index}]`;
        assertObject(boost, path);
        assertStringField(boost, 'id', path);
        assertStringField(boost, 'name', path);
        assertNumber(boost.percentBoost, `${path}.percentBoost`);
        assertString(boost.endTime, `${path}.endTime`);
        if (!isIsoDateTime(boost.endTime)) fail(`${path}.endTime`, 'an ISO date-time string');
      });
      assertNumber(value.combinedPercent, `${event}.data.combinedPercent`);
      break;
    case 'purchase.confirmed':
      for (const field of ['purchaseId', 'packId', 'paymentMethod']) {
        assertStringField(value, field, `${event}.data`);
      }
      assertNumber(value.gemAmount, `${event}.data.gemAmount`);
      break;
  }
  assertJsonValue(value, `${event}.data`);
}

/** Validates event name and its corresponding SSE data payload together. */
export function isStreamEvent(event: unknown, data: unknown): event is StreamEventName {
  try {
    assertStreamEvent(event, data);
    return true;
  } catch {
    return false;
  }
}

export function assertStreamEvent(
  event: unknown,
  data: unknown,
): asserts event is StreamEventName {
  if (typeof event !== 'string' || !STREAM_EVENT_NAMES.includes(event as StreamEventName)) {
    fail('streamEvent.event', 'a supported stream event name');
  }
  assertEventData(event as StreamEventName, data);
}

/** Convenience validator for an already-paired `{ event, data }` value. */
export function isStreamEventEnvelope(value: unknown): value is StreamEvent {
  if (!isRecord(value)) return false;
  return isStreamEvent(value.event, value.data);
}

export function assertStreamEventEnvelope(value: unknown): asserts value is StreamEvent {
  assertObject(value, 'streamEvent');
  assertStreamEvent(value.event, value.data);
  assertJsonValue(value, 'streamEvent');
}

/** Exposed for callers that need to validate arbitrary JSON object payloads. */
export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonSafe(value);
}
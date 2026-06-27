import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Patch, BootstrapResponse } from '../services/api';

export type SyncStatus = 'disconnected' | 'bootstrapping' | 'connected' | 'reconnecting';

interface EntityTable {
  [id: string]: any;
}

export interface ActiveBoost {
  id: string;
  name: string;
  multiplier: number;
  endTime: string;
}

export interface TickBroadcast {
  currentTick: number;
  tickRate: number;
  serverTime: string;
  boosts: ActiveBoost[];
  receivedAt: number;
}

export interface TickAnchor {
  currentTick: number;
  tickRate: number;
  serverTime: string;
  activeBoosts?: Array<{ id: string; name: string; multiplier: number; endTime: string }>;
}

export interface HomeBannerSnapshot {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  backgroundImage: string | null;
  ctaLabel: string | null;
  ctaRoute: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  seasonId: string | null;
  config: Record<string, any>;
  display: Record<string, any>;
}

export interface GlobalPowerSnapshot {
  id: string;
  label: string;
  /** null for tick_speed_boost powers (handled by BoostEvent machinery). */
  effectDefId: string | null;
  /** Human-readable name of the linked EffectDef; null for tick_speed_boost. */
  effectDefName: string | null;
  /** EffectCategory of the linked EffectDef; null for tick_speed_boost. */
  effectCategory: string | null;
  value: number;
  valueMode: string;
  endTime: string;
  selection: Record<string, any> | null;
}

export interface PowerChargeStatus {
  grantId: string;
  chargeUnits: number;
  maxChargeUnits: number;
  costPerUse: number;
  /** Absolute JS timestamp (ms) when enough charges will be ready via tick drip.
   *  null when there are already enough charges or when there is no TICK recharge rule. */
  readyAtMs: number | null;
}

interface SyncState {
  status: SyncStatus;
  cursor: string | null;
  serverTime: number | null;

  player: any | null;
  entities: EntityTable;
  locations: EntityTable;
  buildings: EntityTable;
  rooms: EntityTable;
  items: EntityTable;
  jobs: EntityTable;
  notifications: EntityTable;
  currencies: EntityTable;
  missions: EntityTable;
  quests: EntityTable;
  achievements: EntityTable;
  checkins: EntityTable;
  gifts: EntityTable;
  activeEffects: EntityTable;
  currencyBalances: Record<string, number>;
  activeSeason: any | null;

  // Home banner carousel — server-resolved list of currently active banners
  // (filtered by status + start/end window + season-derive substitution).
  // Stored as an ordered array (priority desc) since order is meaningful.
  homeBanners: HomeBannerSnapshot[];

  // Active global powers — populated from the bootstrap snapshot and kept
  // current by the global_power.changed SSE broadcast.
  globalPowers: GlobalPowerSnapshot[];

  // Entity power usage — keyed by entityId → { [powerKey]: PowerChargeStatus }
  // Populated from the bootstrap snapshot and patched after TriggerEntityPower commands.
  entityPowerUsages: Record<string, Record<string, PowerChargeStatus>>;

  // Location power usage — keyed by locationId → { [powerKey]: PowerChargeStatus }
  // Populated from the bootstrap snapshot and patched after TriggerLocationPower commands.
  locationPowerUsages: Record<string, Record<string, PowerChargeStatus>>;

  // Visual catalog — read-only, comes down in bootstrap. Keyed by `key`
  // so `<Tag tagKey>` is a single dictionary lookup.
  tagDefs: Record<string, any>;
  visualEffectDefs: Record<string, any>;

  // System icon registry — keyed by icon key (e.g. `entity_xp`). Populated
  // from the bootstrap snapshot; updated without a code deploy when admins
  // add new SystemIconDef rows via the admin panel.
  systemIconDefs: Record<string, any>;

  tickAnchor: TickAnchor | null;
  tickBroadcast: TickBroadcast | null;
  lastError: string | null;
}

const initialState: SyncState = {
  status: 'disconnected',
  cursor: null,
  serverTime: null,

  player: null,
  entities: {},
  locations: {},
  buildings: {},
  rooms: {},
  items: {},
  jobs: {},
  notifications: {},
  currencies: {},
  missions: {},
  quests: {},
  achievements: {},
  checkins: {},
  gifts: {},
  activeEffects: {},
  currencyBalances: {},
  activeSeason: null,
  homeBanners: [],
  globalPowers: [],
  entityPowerUsages: {},
  locationPowerUsages: {},

  tagDefs: {},
  visualEffectDefs: {},
  systemIconDefs: {},

  tickAnchor: null,
  tickBroadcast: null,
  lastError: null,
};

const ENTITY_KEY_MAP: Record<string, keyof Pick<SyncState,
  'entities' | 'locations' | 'buildings' | 'rooms' | 'items' |
  'jobs' | 'notifications' | 'currencies' | 'missions' | 'quests' | 'achievements' | 'checkins' | 'gifts' | 'activeEffects'
>> = {
  entity: 'entities',
  location: 'locations',
  building: 'buildings',
  room: 'rooms',
  item: 'items',
  job: 'jobs',
  notification: 'notifications',
  currency: 'currencies',
  mission: 'missions',
  quest: 'quests',
  achievement: 'achievements',
  checkin: 'checkins',
  gift: 'gifts',
  activeEffect: 'activeEffects',
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<SyncStatus>) {
      state.status = action.payload;
    },

    setSnapshot(state, action: PayloadAction<BootstrapResponse>) {
      const { snapshot, cursor, serverTime } = action.payload;
      state.serverTime = serverTime;
      state.cursor = cursor.delta;
      state.player = snapshot.player;

      state.entities = {};
      state.locations = {};
      state.buildings = {};
      state.rooms = {};
      state.items = {};
      state.jobs = {};
      state.notifications = {};
      state.currencies = {};
      state.missions = {};
      state.quests = {};
      state.achievements = {};
      state.checkins = {};
      state.gifts = {};
      state.activeEffects = {};
      state.currencyBalances = {};
      state.entityPowerUsages = {};
      state.locationPowerUsages = {};

      // Catalog tables: rebuilt in full on every bootstrap (rare changes,
      // small payload). Keyed by stable `key` not `id` so callers can do
      // `state.tagDefs['rarity-epic']` without an O(n) find.
      state.tagDefs = {};
      state.visualEffectDefs = {};

      if (snapshot.state) {
        const s = snapshot.state;
        if ((s as any).tagDefs) for (const t of (s as any).tagDefs) state.tagDefs[t.key] = t;
        if ((s as any).visualEffectDefs) for (const v of (s as any).visualEffectDefs) state.visualEffectDefs[v.key] = v;
        state.systemIconDefs = {};
        if ((s as any).systemIconDefs) for (const d of (s as any).systemIconDefs) state.systemIconDefs[d.id] = d;
        if (s.entities) for (const e of s.entities) state.entities[e.id] = e;
        if (s.locations) for (const l of s.locations) state.locations[l.id] = l;
        if (s.buildings) for (const b of s.buildings) state.buildings[b.id] = b;
        if (s.rooms) for (const r of s.rooms) state.rooms[r.id] = r;
        if (s.missions) for (const m of s.missions) state.missions[m.id] = m;
        // Key quests by questDefId so not_started stubs (id = questDefId) and
        // real instances (id = UUID, questDefId = def.id) occupy the same slot,
        // preventing duplicates after universal lazy init materializes a real instance.
        if (s.quests) for (const q of s.quests) state.quests[q.questDefId ?? q.id] = q;
        // Key achievements by questDefId so not_started stubs (id = questDefId)
        // and real instances (id = UUID, questDefId = def.id) map to the same
        // slot, preventing duplicates after lazy init creates a real instance.
        if (s.achievements) for (const a of s.achievements) state.achievements[a.questDefId ?? a.id] = a;
        if (s.checkins) for (const ci of s.checkins) state.checkins[ci.id] = ci;
        if (s.gifts) for (const g of s.gifts) state.gifts[g.id] = g;
      }

      if (snapshot.activeEffects) {
        for (const ae of snapshot.activeEffects) state.activeEffects[ae.id] = ae;
      }

      if (snapshot.inventory) {
        const inv = Array.isArray(snapshot.inventory) ? snapshot.inventory : snapshot.inventory.items || [];
        for (const item of inv) state.items[item.id] = item;
      }

      if (snapshot.jobs) {
        const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
        for (const job of jobs) state.jobs[job.id] = job;
      }

      if (snapshot.notifications) {
        const notifs = Array.isArray(snapshot.notifications)
          ? snapshot.notifications
          : snapshot.notifications.items || [];
        for (const n of notifs) state.notifications[n.id] = n;
      }

      if (snapshot.currencies) {
        if (typeof snapshot.currencies === 'object' && !Array.isArray(snapshot.currencies)) {
          state.currencyBalances = snapshot.currencies as Record<string, number>;
        } else if (Array.isArray(snapshot.currencies)) {
          for (const c of snapshot.currencies) state.currencies[c.id || c.currencyId] = c;
        }
      }

      state.activeSeason = snapshot.activeSeason ?? (snapshot.state as any)?.activeSeason ?? null;
      state.homeBanners = Array.isArray((snapshot.state as any)?.homeBanners)
        ? (snapshot.state as any).homeBanners
        : Array.isArray((snapshot as any).homeBanners)
        ? (snapshot as any).homeBanners
        : [];

      state.globalPowers = Array.isArray(snapshot.activePowers)
        ? snapshot.activePowers
        : Array.isArray((snapshot.state as any)?.activePowers)
        ? (snapshot.state as any).activePowers
        : [];

      if (snapshot.entityPowerUsages && typeof snapshot.entityPowerUsages === 'object') {
        state.entityPowerUsages = snapshot.entityPowerUsages;
      }

      if (snapshot.locationPowerUsages && typeof snapshot.locationPowerUsages === 'object') {
        state.locationPowerUsages = snapshot.locationPowerUsages;
      }

      if ((action.payload as any).tickAnchor) {
        state.tickAnchor = (action.payload as any).tickAnchor;
      }
    },

    setHomeBanners(state, action: PayloadAction<HomeBannerSnapshot[]>) {
      state.homeBanners = Array.isArray(action.payload) ? action.payload : [];
    },

    setGlobalPowers(state, action: PayloadAction<GlobalPowerSnapshot[]>) {
      state.globalPowers = Array.isArray(action.payload) ? action.payload : [];
    },

    applyPatches(state, action: PayloadAction<{ patches: Patch[]; cursor?: string }>) {
      const { patches, cursor } = action.payload;

      for (const patch of patches) {
        if (patch.entity === 'player') {
          if (patch.op === 'upsert') {
            state.player = { ...state.player, ...patch.data };
          }
          continue;
        }

        if (patch.entity === 'season') {
          if (patch.op === 'upsert') {
            state.activeSeason = patch.data ?? null;
          } else if (patch.op === 'delete') {
            state.activeSeason = null;
          }
          continue;
        }

        if (patch.entity === 'homeBanner') {
          // Whole-list replacement is the simplest delta shape for this
          // table — the active set is small and ordering matters. The
          // server emits a single upsert with `data` as the full new list.
          if (patch.op === 'upsert' && Array.isArray(patch.data)) {
            state.homeBanners = patch.data as HomeBannerSnapshot[];
          } else if (patch.op === 'delete') {
            state.homeBanners = [];
          }
          continue;
        }

        if (patch.entity === 'currencyBalance') {
          if (patch.op === 'upsert' && patch.data) {
            state.currencyBalances = { ...state.currencyBalances, ...patch.data };
          }
          continue;
        }

        if (patch.entity === 'entityPowerUsage') {
          if (patch.op === 'upsert' && patch.id && patch.data) {
            // Merge into existing map so a single-power patch doesn't wipe other powers.
            state.entityPowerUsages[patch.id] = {
              ...(state.entityPowerUsages[patch.id] ?? {}),
              ...(patch.data as Record<string, PowerChargeStatus>),
            };
          } else if (patch.op === 'delete' && patch.id) {
            delete state.entityPowerUsages[patch.id];
          }
          continue;
        }

        if (patch.entity === 'locationPowerUsage') {
          if (patch.op === 'upsert' && patch.id && patch.data) {
            // Merge into existing map so a single-power patch doesn't wipe other powers.
            state.locationPowerUsages[patch.id] = {
              ...(state.locationPowerUsages[patch.id] ?? {}),
              ...(patch.data as Record<string, PowerChargeStatus>),
            };
          } else if (patch.op === 'delete' && patch.id) {
            delete state.locationPowerUsages[patch.id];
          }
          continue;
        }

        // Quest and achievement patches are keyed by questDefId (not instance UUID)
        // so stubs and real instances for the same def always occupy the same slot,
        // preventing duplicates after universal lazy init materializes a real instance.
        if (patch.entity === 'quest' || patch.entity === 'achievement') {
          const stateKey = patch.entity === 'achievement' ? 'achievements' : 'quests';
          if (patch.op === 'upsert') {
            const slotKey = (patch.data as any)?.questDefId ?? patch.id;
            state[stateKey][slotKey] = patch.data;
          } else if (patch.op === 'delete') {
            // On delete we only have patch.id; clean up both the UUID slot and any
            // questDefId-keyed slot. The questDefId is unknown here so we scan once.
            delete state[stateKey][patch.id];
            for (const [k, v] of Object.entries(state[stateKey])) {
              if ((v as any)?.id === patch.id) { delete state[stateKey][k]; break; }
            }
          }
          continue;
        }

        const tableKey = ENTITY_KEY_MAP[patch.entity];
        if (!tableKey) continue;

        const table = state[tableKey] as EntityTable;

        if (patch.op === 'upsert') {
          table[patch.id] = patch.data;
        } else if (patch.op === 'delete') {
          delete table[patch.id];
        }
      }

      if (cursor) {
        state.cursor = cursor;
      }
    },

    setCursor(state, action: PayloadAction<string>) {
      state.cursor = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.lastError = action.payload;
    },

    patchPlayerOptimistic(state, action: PayloadAction<Record<string, unknown>>) {
      if (state.player) {
        state.player = { ...state.player, ...action.payload };
      }
    },

    patchBuildingEnabled(state, action: PayloadAction<{ locationId: string; buildingId: string; enabled: boolean }>) {
      const { locationId, buildingId, enabled } = action.payload;
      if (state.buildings[buildingId]) {
        state.buildings[buildingId] = { ...state.buildings[buildingId], enabled };
      }
      const loc = state.locations[locationId];
      if (loc && Array.isArray(loc.buildings)) {
        const idx = loc.buildings.findIndex((b: any) => b.id === buildingId);
        if (idx !== -1) {
          loc.buildings[idx] = { ...loc.buildings[idx], enabled };
        }
      }
    },

    setTickBroadcast(state, action: PayloadAction<TickBroadcast>) {
      state.tickBroadcast = action.payload;
    },

    setTickSync(state, action: PayloadAction<TickBroadcast>) {
      state.tickBroadcast = action.payload;
      state.tickAnchor = {
        currentTick: action.payload.currentTick,
        tickRate: action.payload.tickRate,
        serverTime: action.payload.serverTime,
      };
    },

    resetSync() {
      return initialState;
    },
  },
});

export const { setStatus, setSnapshot, applyPatches, setCursor, setError, resetSync, patchPlayerOptimistic, patchBuildingEnabled, setTickBroadcast, setTickSync, setHomeBanners, setGlobalPowers } = syncSlice.actions;
export default syncSlice.reducer;

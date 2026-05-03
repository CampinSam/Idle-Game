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
  tickRate: number;
  boosts: ActiveBoost[];
  receivedAt: number;
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

  // Visual catalog — read-only, comes down in bootstrap. Keyed by `key`
  // so `<Tag tagKey>` is a single dictionary lookup.
  tagDefs: Record<string, any>;
  visualEffectDefs: Record<string, any>;

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

  tagDefs: {},
  visualEffectDefs: {},

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

      // Catalog tables: rebuilt in full on every bootstrap (rare changes,
      // small payload). Keyed by stable `key` not `id` so callers can do
      // `state.tagDefs['rarity-epic']` without an O(n) find.
      state.tagDefs = {};
      state.visualEffectDefs = {};

      if (snapshot.state) {
        const s = snapshot.state;
        if ((s as any).tagDefs) for (const t of (s as any).tagDefs) state.tagDefs[t.key] = t;
        if ((s as any).visualEffectDefs) for (const v of (s as any).visualEffectDefs) state.visualEffectDefs[v.key] = v;
        if (s.entities) for (const e of s.entities) state.entities[e.id] = e;
        if (s.locations) for (const l of s.locations) state.locations[l.id] = l;
        if (s.buildings) for (const b of s.buildings) state.buildings[b.id] = b;
        if (s.rooms) for (const r of s.rooms) state.rooms[r.id] = r;
        if (s.missions) for (const m of s.missions) state.missions[m.id] = m;
        if (s.quests) for (const q of s.quests) state.quests[q.id] = q;
        if (s.achievements) for (const a of s.achievements) state.achievements[a.id] = a;
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

      state.activeSeason = snapshot.activeSeason ?? null;
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

        if (patch.entity === 'currencyBalance') {
          if (patch.op === 'upsert' && patch.data) {
            state.currencyBalances = { ...state.currencyBalances, ...patch.data };
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

    resetSync() {
      return initialState;
    },
  },
});

export const { setStatus, setSnapshot, applyPatches, setCursor, setError, resetSync, patchBuildingEnabled, setTickBroadcast } = syncSlice.actions;
export default syncSlice.reducer;

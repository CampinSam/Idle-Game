import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Patch, BootstrapResponse } from '../services/api';

export type SyncStatus = 'disconnected' | 'bootstrapping' | 'connected' | 'reconnecting';

interface EntityTable {
  [id: string]: any;
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
  checkins: EntityTable;
  activeEffects: EntityTable;
  currencyBalances: Record<string, number>;

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
  checkins: {},
  activeEffects: {},
  currencyBalances: {},

  lastError: null,
};

const ENTITY_KEY_MAP: Record<string, keyof Pick<SyncState,
  'entities' | 'locations' | 'buildings' | 'rooms' | 'items' |
  'jobs' | 'notifications' | 'currencies' | 'missions' | 'quests' | 'checkins' | 'activeEffects'
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
  checkin: 'checkins',
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
      state.checkins = {};
      state.activeEffects = {};
      state.currencyBalances = {};

      if (snapshot.state) {
        const s = snapshot.state;
        if (s.entities) for (const e of s.entities) state.entities[e.id] = e;
        if (s.locations) for (const l of s.locations) state.locations[l.id] = l;
        if (s.buildings) for (const b of s.buildings) state.buildings[b.id] = b;
        if (s.rooms) for (const r of s.rooms) state.rooms[r.id] = r;
        if (s.missions) for (const m of s.missions) state.missions[m.id] = m;
        if (s.quests) for (const q of s.quests) state.quests[q.id] = q;
        if (s.checkins) for (const ci of s.checkins) state.checkins[ci.id] = ci;
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

    resetSync() {
      return initialState;
    },
  },
});

export const { setStatus, setSnapshot, applyPatches, setCursor, setError, resetSync } = syncSlice.actions;
export default syncSlice.reducer;

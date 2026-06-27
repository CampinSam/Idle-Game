import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api';

// Note: entities, locations, missions, inventory, and currencyBalances are served
// by the sync bootstrap pipeline (syncSlice). Only definition tables that are not
// included in the bootstrap payload are fetched here.
interface GameState {
  missionDefs: any[];
  missionCategoryDefs: any[];
  craftingRecipes: any[];
  currencyDefs: any[];
  itemDefs: any[];
  effectDefs: any[];
  loading: boolean;
}

const initialState: GameState = {
  missionDefs: [],
  missionCategoryDefs: [],
  craftingRecipes: [],
  currencyDefs: [],
  itemDefs: [],
  effectDefs: [],
  loading: false,
};

export const fetchMissionDefs = createAsyncThunk('game/fetchMissionDefs', () => api.getMissionDefinitions());
export const fetchMissionCategoryDefs = createAsyncThunk('game/fetchMissionCategoryDefs', () => api.getMissionCategoryDefs());
export const fetchCraftingRecipes = createAsyncThunk('game/fetchCraftingRecipes', () => api.getCraftingRecipes());
export const fetchCurrencyDefs = createAsyncThunk('game/fetchCurrencyDefs', () => api.getCurrencies());
export const fetchItemDefs = createAsyncThunk('game/fetchItemDefs', () => api.getItemDefs());
export const fetchEffectDefs = createAsyncThunk('game/fetchEffectDefs', () => api.getEffectDefs());

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMissionDefs.fulfilled, (state, action) => { state.missionDefs = action.payload; })
      .addCase(fetchMissionCategoryDefs.fulfilled, (state, action) => { state.missionCategoryDefs = action.payload; })
      .addCase(fetchCraftingRecipes.fulfilled, (state, action) => { state.craftingRecipes = action.payload; })
      .addCase(fetchCurrencyDefs.fulfilled, (state, action) => { state.currencyDefs = action.payload; })
      .addCase(fetchItemDefs.fulfilled, (state, action) => { state.itemDefs = action.payload; })
      .addCase(fetchEffectDefs.fulfilled, (state, action) => { state.effectDefs = action.payload; })
      // Handle categoryDef / missionDef requirement-status patches emitted by the
      // server (e.g. after CompleteMission sets player flags). These arrive via
      // applyPatches (syncSlice) so we intercept the same action here to keep
      // game defs in sync without a separate HTTP refetch.
      .addMatcher(
        (action) => action.type === 'sync/applyPatches',
        (state, action: any) => {
          const patches: any[] = action.payload?.patches ?? [];
          for (const patch of patches) {
            if (patch.op !== 'upsert' || !patch.id || !patch.data) continue;
            if (patch.entity === 'categoryDef') {
              const idx = state.missionCategoryDefs.findIndex((c: any) => c.id === patch.id);
              if (idx !== -1) {
                state.missionCategoryDefs[idx] = { ...state.missionCategoryDefs[idx], ...patch.data };
              }
            } else if (patch.entity === 'missionDef') {
              const idx = state.missionDefs.findIndex((d: any) => d.id === patch.id);
              if (idx !== -1) {
                state.missionDefs[idx] = { ...state.missionDefs[idx], ...patch.data };
              }
            }
          }
        },
      );
  },
});

export default gameSlice.reducer;

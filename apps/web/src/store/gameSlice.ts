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
      .addCase(fetchEffectDefs.fulfilled, (state, action) => { state.effectDefs = action.payload; });
  },
});

export default gameSlice.reducer;

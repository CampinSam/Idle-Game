import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api';

interface GameState {
  profile: any | null;
  entities: any[];
  locations: any[];
  missionHistory: any[];
  missionDefs: any[];
  missionCategoryDefs: any[];
  craftingRecipes: any[];
  currencyBalances: Record<string, number>;
  currencyDefs: any[];
  itemDefs: any[];
  inventory: any | null;
  loading: boolean;
}

const initialState: GameState = {
  profile: null,
  entities: [],
  locations: [],
  missionHistory: [],
  missionDefs: [],
  missionCategoryDefs: [],
  craftingRecipes: [],
  currencyBalances: {},
  currencyDefs: [],
  itemDefs: [],
  inventory: null,
  loading: false,
};

export const fetchProfile = createAsyncThunk('game/fetchProfile', () => api.getProfile());
export const fetchEntities = createAsyncThunk('game/fetchEntities', () => api.getEntities());
export const fetchLocations = createAsyncThunk('game/fetchLocations', () => api.getLocations());
export const fetchMissionDefs = createAsyncThunk('game/fetchMissionDefs', () => api.getMissionDefinitions());
export const fetchMissionCategoryDefs = createAsyncThunk('game/fetchMissionCategoryDefs', () => api.getMissionCategoryDefs());
export const fetchMissionHistory = createAsyncThunk('game/fetchMissionHistory', () => api.getMissionHistory());
export const fetchCraftingRecipes = createAsyncThunk('game/fetchCraftingRecipes', () => api.getCraftingRecipes());
export const fetchCurrencyBalances = createAsyncThunk('game/fetchCurrencyBalances', () => api.getCurrencyBalances());
export const fetchCurrencyDefs = createAsyncThunk('game/fetchCurrencyDefs', () => api.getCurrencies());
export const fetchItemDefs = createAsyncThunk('game/fetchItemDefs', () => api.getItemDefs());
export const fetchInventory = createAsyncThunk('game/fetchInventory', () => api.getInventory());



const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.fulfilled, (state, action) => { state.profile = action.payload; })
      .addCase(fetchEntities.fulfilled, (state, action) => { state.entities = action.payload; })
      .addCase(fetchLocations.fulfilled, (state, action) => { state.locations = action.payload; })
      .addCase(fetchMissionDefs.fulfilled, (state, action) => { state.missionDefs = action.payload; })
      .addCase(fetchMissionCategoryDefs.fulfilled, (state, action) => { state.missionCategoryDefs = action.payload; })
      .addCase(fetchMissionHistory.fulfilled, (state, action) => { state.missionHistory = action.payload; })
      .addCase(fetchCraftingRecipes.fulfilled, (state, action) => { state.craftingRecipes = action.payload; })
      .addCase(fetchCurrencyBalances.fulfilled, (state, action) => { state.currencyBalances = action.payload; })
      .addCase(fetchCurrencyDefs.fulfilled, (state, action) => { state.currencyDefs = action.payload; })
      .addCase(fetchItemDefs.fulfilled, (state, action) => { state.itemDefs = action.payload; })
      .addCase(fetchInventory.fulfilled, (state, action) => { state.inventory = action.payload; });
  },
});

export default gameSlice.reducer;

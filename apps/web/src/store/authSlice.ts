import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api';

interface AuthState {
  token: string | null;
  player: any | null;
  loading: boolean;
  initializing: boolean;
  error: string | null;
}

const saved = localStorage.getItem('derp_token');
if (saved) api.setToken(saved);

const initialState: AuthState = {
  token: saved,
  player: null,
  loading: false,
  initializing: !!saved,
  error: null,
};

export const register = createAsyncThunk(
  'auth/register',
  async (data: { username: string; email: string; password: string }) => {
    const res = await api.register(data.username, data.email, data.password);
    api.setToken(res.accessToken);
    localStorage.setItem('derp_token', res.accessToken);
    return res;
  },
);

export const login = createAsyncThunk(
  'auth/login',
  async (data: { email: string; password: string }) => {
    const res = await api.login(data.email, data.password);
    api.setToken(res.accessToken);
    localStorage.setItem('derp_token', res.accessToken);
    return res;
  },
);

export const restoreSession = createAsyncThunk(
  'auth/restoreSession',
  async (_, { rejectWithValue }) => {
    try {
      const player = await api.getProfile();
      return player;
    } catch {
      api.setToken(null);
      localStorage.removeItem('derp_token');
      return rejectWithValue('Session expired');
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.token = null;
      state.player = null;
      state.initializing = false;
      api.setToken(null);
      localStorage.removeItem('derp_token');
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(register.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.accessToken;
        state.player = action.payload.player;
        state.initializing = false;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Registration failed';
      })
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.accessToken;
        state.player = action.payload.player;
        state.initializing = false;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Login failed';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.player = action.payload;
        state.initializing = false;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.token = null;
        state.player = null;
        state.initializing = false;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;

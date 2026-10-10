import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../store/authSlice';
import gameReducer from '../store/gameSlice';
import syncReducer from '../store/syncSlice';
import { ModalProvider } from '../context/ModalContext';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Pre-combine so `configureStore` sees a single concrete `Reducer` instead of
// a slice map. Without this, TS overload resolution gets confused by the
// `preloadedState as any` cast and picks the wrong overload — which then
// flags the slice keys ("auth", "game", "sync") as unknown properties.
const testRootReducer = combineReducers({
  auth: authReducer,
  game: gameReducer,
  sync: syncReducer,
});

export function makeTestStore(preloadedState?: Record<string, any>) {
  return configureStore({
    reducer: testRootReducer,
    preloadedState: preloadedState as any,
  });
}

export type TestStore = ReturnType<typeof makeTestStore>;

interface ProvidersProps {
  children: ReactNode;
  store: TestStore;
  initialEntries?: string[];
}

function AllProviders({ children, store, initialEntries }: ProvidersProps) {
  return (
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries ?? ['/']}>
        <ModalProvider>{children}</ModalProvider>
      </MemoryRouter>
    </Provider>
  );
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: DeepPartial<{ auth: any; game: any; sync: any }>;
  store?: TestStore;
  initialEntries?: string[];
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const { preloadedState, store = makeTestStore(preloadedState as any), initialEntries, ...rest } = options;
  const utils = render(ui, {
    wrapper: ({ children }) => (
      <AllProviders store={store} initialEntries={initialEntries}>
        {children}
      </AllProviders>
    ),
    ...rest,
  });
  return { store, ...utils };
}

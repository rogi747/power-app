// store.ts
import {configureStore} from '@reduxjs/toolkit';
import rpaBuilderReducer from './store/rpa-builder-slice';

export const store = configureStore({
  reducer: {
    rpaBuilder: rpaBuilderReducer,
  },
  // The workflow model contains plain JSON only, but disable the strict
  // serializability check for incoming IPC payloads to avoid dev warnings.
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({serializableCheck: false}),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

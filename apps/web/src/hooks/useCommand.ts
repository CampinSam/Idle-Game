import { useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { CommandResponse, UiIntent } from '../services/api';
import { useAppDispatch } from '../store';
import { applyPatches } from '../store/syncSlice';
import { useNotifications } from '../context/NotificationContext';

let commandCounter = 0;

function generateIdempotencyKey(commandType: string): string {
  commandCounter++;
  return `${commandType}-${Date.now()}-${commandCounter}`;
}

export interface UseCommandOptions {
  onUiIntent?: (intent: UiIntent) => void;
}

const TONE_ACCENT: Record<string, string> = {
  success: '#10B981',
  error: '#EF4444',
  info: '#8B5CF6',
};

export function useCommand(options?: UseCommandOptions) {
  const dispatch = useAppDispatch();
  const { addLocalToast } = useNotifications();
  const pendingRef = useRef(false);

  const execute = useCallback(
    async (
      type: string,
      payload: Record<string, any> = {},
      idempotencyKey?: string,
    ): Promise<CommandResponse> => {
      if (pendingRef.current) {
        throw new Error('A command is already in progress');
      }

      pendingRef.current = true;

      try {
        const key = idempotencyKey || generateIdempotencyKey(type);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Command timed out')), 30000),
        );
        const response = await Promise.race([
          api.sendCommand({ type, payload, idempotencyKey: key }),
          timeoutPromise,
        ]);

        if (response.patches.length > 0) {
          dispatch(applyPatches({
            patches: response.patches,
            cursor: response.cursor.delta,
          }));
        }

        for (const intent of response.ui) {
          if (intent.type === 'local_toast') {
            addLocalToast({
              title: intent.title,
              body: intent.body,
              accentColor: TONE_ACCENT[intent.tone] ?? '#8B5CF6',
              durationMs: intent.durationMs,
            });
          } else if (options?.onUiIntent) {
            options.onUiIntent(intent);
          }
        }

        return response;
      } finally {
        pendingRef.current = false;
      }
    },
    [dispatch, addLocalToast, options],
  );

  return { execute };
}

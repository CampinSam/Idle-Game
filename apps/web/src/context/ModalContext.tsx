import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ModalSpecV1 } from '@derp/shared';
import { audioEngine } from '../services/AudioEngine';

interface ModalContextValue {
  currentModal: ModalSpecV1 | null;
  currentModalGeneration: number | null;
  loading: boolean;
  pushModal: (spec: ModalSpecV1) => void;
  replaceModal: (spec: ModalSpecV1, expectedGeneration?: number) => void;
  dismissModal: (expectedGeneration?: number) => void;
  queueLength: number;
}

const ModalContext = createContext<ModalContextValue>({
  currentModal: null,
  currentModalGeneration: null,
  loading: false,
  pushModal: () => {},
  replaceModal: () => {},
  dismissModal: () => {},
  queueLength: 0,
});

export function useModal() {
  return useContext(ModalContext);
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<{ spec: ModalSpecV1; generation: number }[]>([]);
  const [loading] = useState(false);
  const nextGeneration = useRef(0);
  const currentModal = queue[0]?.spec || null;
  const currentModalGeneration = queue[0]?.generation ?? null;

  const pushModal = useCallback((spec: ModalSpecV1) => {
    audioEngine.play('ui.modal_open');
    const entry = { spec, generation: ++nextGeneration.current };
    setQueue((prev) => [...prev, entry]);
  }, []);

  const replaceModal = useCallback((spec: ModalSpecV1, expectedGeneration?: number) => {
    const generation = expectedGeneration ?? ++nextGeneration.current;
    setQueue((prev) => {
      if (expectedGeneration !== undefined && prev[0]?.generation !== expectedGeneration) return prev;
      return [{ spec, generation }, ...prev.slice(1)];
    });
  }, []);

  const dismissModal = useCallback((expectedGeneration?: number) => {
    audioEngine.play('ui.modal_close');
    setQueue((prev) => expectedGeneration !== undefined && prev[0]?.generation !== expectedGeneration ? prev : prev.slice(1));
  }, []);

  return (
    <ModalContext.Provider
      value={{
        currentModal,
        currentModalGeneration,
        loading,
        pushModal,
        replaceModal,
        dismissModal,
        queueLength: queue.length,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

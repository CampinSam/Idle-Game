import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ModalSpecV1 } from '@derp/shared';

interface ModalContextValue {
  currentModal: ModalSpecV1 | null;
  loading: boolean;
  pushModal: (spec: ModalSpecV1) => void;
  replaceModal: (spec: ModalSpecV1) => void;
  dismissModal: () => void;
  queueLength: number;
}

const ModalContext = createContext<ModalContextValue>({
  currentModal: null,
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
  const [queue, setQueue] = useState<ModalSpecV1[]>([]);
  const [loading] = useState(false);
  const currentModal = queue[0] || null;

  const pushModal = useCallback((spec: ModalSpecV1) => {
    setQueue((prev) => [...prev, spec]);
  }, []);

  const replaceModal = useCallback((spec: ModalSpecV1) => {
    setQueue((prev) => {
      if (prev.length <= 1) return [spec];
      return [spec, ...prev.slice(1)];
    });
  }, []);

  const dismissModal = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return (
    <ModalContext.Provider
      value={{
        currentModal,
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

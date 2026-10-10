import { useEffect } from 'react';
import { useModal } from '../context/ModalContext';
import { syncEngine } from '../services/syncEngineSingleton';

/**
 * Subscribes to bootstrap UI intents emitted by the SyncEngine after a
 * successful bootstrap response. For each modal intent the server sends
 * (e.g. welcome modal, season intro), pushes the spec into the modal queue
 * so it is rendered by GameModalHost.
 *
 * Mount this hook once inside a component that is already beneath
 * ModalContext (e.g. Layout).
 */
export function useBootstrapModals() {
  const { pushModal } = useModal();

  useEffect(() => {
    const unsub = syncEngine.onBootstrapUiIntents((intents) => {
      for (const intent of intents) {
        if (intent.type === 'modal' && intent.spec) {
          pushModal(intent.spec);
        }
      }
    });
    return unsub;
  }, [pushModal]);
}

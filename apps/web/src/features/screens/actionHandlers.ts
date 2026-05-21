import type { ActionDefinition } from '@derp/shared';
import type { ModalSpecV1 } from '@derp/shared';
import { api } from '../../services/api';

export interface ActionHandlerContext {
  navigate: (path: string) => void;
  pushModal: (spec: ModalSpecV1) => void;
  dismissModal: () => void;
}

export async function executeAction(
  action: ActionDefinition,
  ctx: ActionHandlerContext,
): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      ctx.navigate(action.target);
      break;
    }
    case 'close_modal': {
      ctx.dismissModal();
      break;
    }
    case 'open_modal': {
      console.warn(
        '[actionHandlers] open_modal: modalKey routing not yet supported via screen composition —',
        action.modalKey,
      );
      break;
    }
    case 'api': {
      const doRequest = async () => {
        try {
          await api.rawRequest(action.method, action.endpoint, action.body);
          if (action.successToast) {
            console.info('[actionHandlers] api action success:', action.successToast);
          }
        } catch (err: unknown) {
          console.error('[actionHandlers] api action failed:', (err as any)?.message);
          if (action.errorToast) {
            console.error('[actionHandlers]', action.errorToast);
          }
        }
      };

      if (action.confirm) {
        const message = action.confirm.body
          ? `${action.confirm.title}\n${action.confirm.body}`
          : action.confirm.title;
        if (!window.confirm(message)) break;
      }
      await doRequest();
      break;
    }
    case 'open_external_link': {
      window.open(action.url, '_blank', 'noopener,noreferrer');
      break;
    }
    case 'noop': {
      break;
    }
    case 'claim_reward':
    case 'open_store_item':
    case 'track_only': {
      console.warn(`[actionHandlers] Action type "${action.type}" is not yet implemented`);
      break;
    }
    default: {
      const _exhaustive: never = action;
      console.warn('[actionHandlers] Unknown action type:', (_exhaustive as any)?.type);
      break;
    }
  }
}

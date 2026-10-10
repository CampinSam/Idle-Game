import type { ActionDefinition } from '@derp/shared';
import type { ModalSpecV1 } from '@derp/shared';
import { api } from '../../services/api';

export interface ActionHandlerContext {
  navigate: (path: string) => void;
  pushModal: (spec: ModalSpecV1) => void;
  dismissModal: () => void;
}

const SAFE_PROTOCOLS = new Set(['https:', 'http:']);

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
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
      try {
        const params: Parameters<typeof api.getModalSpec>[0] = {};
        const p = action.params ?? {};
        if (p.jobId) params.jobId = String(p.jobId);
        if (p.notificationId) params.notificationId = String(p.notificationId);
        if (p.giftId) params.giftId = String(p.giftId);
        if (p.buildingDefId) params.buildingDefId = String(p.buildingDefId);
        if (p.locationId) params.locationId = String(p.locationId);
        if (p.buildingId) params.buildingId = String(p.buildingId);
        if (p.depositXp) params.depositXp = true;
        if (p.levelUp) params.levelUp = true;
        if (action.modalKey) params.modalKey = action.modalKey as any;
        const spec = await api.getModalSpec(params);
        if (spec?.version === 1) {
          ctx.pushModal(spec);
        }
      } catch (err: unknown) {
        console.warn('[actionHandlers] open_modal failed for key', action.modalKey, err);
      }
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
      const { url } = action;
      if (!isSafeUrl(url)) {
        console.warn('[actionHandlers] Blocked external link with unsafe URL:', url);
        break;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
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

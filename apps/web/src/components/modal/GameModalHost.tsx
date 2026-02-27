import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ModalAction } from '@derp/shared';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import { useCommand } from '../../hooks/useCommand';
import { useAppSelector } from '../../store';
import GameModal from './GameModal';

export default function GameModalHost() {
  const { currentModal, dismissModal, replaceModal } = useModal();
  const navigate = useNavigate();
  const { execute } = useCommand();
  const jobs = useAppSelector((s) => s.sync.jobs);

  const handleNavigate = useCallback(
    (route: string) => {
      navigate(route.startsWith('/') ? route : `/${route}`);
    },
    [navigate],
  );

  const tryFetchFollowUp = useCallback(
    async (params: { jobId?: string; notificationId?: string; giftId?: string }): Promise<boolean> => {
      try {
        const spec = await api.getModalSpec(params);
        if (spec?.version === 1) {
          replaceModal(spec);
          return true;
        }
      } catch {}
      return false;
    },
    [replaceModal],
  );

  const handleAction = useCallback(
    async (action: ModalAction) => {
      switch (action.type) {
        case 'CLOSE_MODAL':
          dismissModal();
          return;

        case 'NAVIGATE':
          handleNavigate(action.route);
          dismissModal();
          return;

        case 'OPEN_INVENTORY':
          handleNavigate('/inventory');
          dismissModal();
          return;

        case 'OPEN_MISSIONS':
          handleNavigate('/missions');
          dismissModal();
          return;

        case 'OPEN_CRAFTING':
          handleNavigate('/crafting');
          dismissModal();
          return;

        case 'ACK_NOTIFICATION': {
          await api.markNotificationsRead([action.notificationId]);
          dismissModal();
          return;
        }

        case 'COMPLETE_JOB': {
          const jobId = action.jobId;
          const jobData = jobs[jobId];
          if (!jobData) {
            console.warn('[GameModalHost] Job not found in sync store:', jobId);
            dismissModal();
            return;
          }
          const { type, data: jd } = jobData;

          if (type === 'MissionJob') {
            await execute('CompleteMission', { jobId });
          } else if (type === 'CraftingJob') {
            await execute('CollectCrafting', { jobId });
          } else if (type === 'BuildingJob') {
            const locationId = jd?.locationId;
            const buildingId = jd?.buildingId;
            if (locationId && buildingId) {
              await execute('CompleteBuilding', { locationId, buildingId });
            }
          }

          const replaced = await tryFetchFollowUp({ jobId });
          if (!replaced) {
            dismissModal();
          }
          return;
        }

        case 'CLAIM_GIFT': {
          await api.claimGift(action.giftId);

          const replaced = await tryFetchFollowUp({ giftId: action.giftId });
          if (!replaced) {
            dismissModal();
          }
          return;
        }

        case 'REPEAT_MISSION': {
          if (action.entityIds && action.entityIds.length > 0) {
            try {
              await execute('StartMission', {
                defId: action.defId,
                entityIds: action.entityIds,
              });
              dismissModal();
            } catch (err: any) {
              console.warn('[GameModalHost] Failed to repeat mission, navigating instead:', err?.message);
              handleNavigate(`/missions?repeat=${action.defId}`);
              dismissModal();
            }
          } else {
            handleNavigate(`/missions?repeat=${action.defId}`);
            dismissModal();
          }
          return;
        }

        case 'CRAFT_AGAIN':
          handleNavigate('/crafting');
          dismissModal();
          return;

        case 'API_CALL': {
          const { apiKey, payload } = action;

          if (apiKey === 'jobs.skip' && payload?.jobId) {
            const jobId = payload.jobId as string;
            await api.skipJob(jobId);
            const replaced = await tryFetchFollowUp({ jobId });
            if (!replaced) {
              dismissModal();
            }
            return;
          }

          console.warn(`[GameModalHost] Unhandled apiKey: ${apiKey}`);
          dismissModal();
          return;
        }

        default: {
          const _never: never = action;
          console.warn('Unknown action', _never);
          dismissModal();
        }
      }
    },
    [dismissModal, execute, handleNavigate, tryFetchFollowUp, jobs],
  );

  if (!currentModal) return null;

  return (
    <GameModal
      spec={currentModal}
      isOpen={true}
      onRequestClose={dismissModal}
      navigate={handleNavigate}
      onAction={handleAction}
    />
  );
}

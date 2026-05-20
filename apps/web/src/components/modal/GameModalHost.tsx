import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ModalAction } from '@derp/shared';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import { useCommand } from '../../hooks/useCommand';
import { useAppSelector } from '../../store';
import { audioEngine } from '../../services/AudioEngine';
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
        case 'NEXT_PAGE':
        case 'PREV_PAGE':
          return;

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

        case 'PRESTIGE': {
          try {
            await execute('Prestige', {});
            audioEngine.play('sfx.player.prestige');
            dismissModal();
          } catch (err: any) {
            audioEngine.play('ui.error');
            console.warn('[GameModalHost] Prestige failed:', err?.message);
          }
          return;
        }

        case 'CRAFT_AGAIN':
          handleNavigate('/crafting');
          dismissModal();
          return;

        case 'BUILD_BUILDING': {
          try {
            await execute('BuildBuilding', { locationId: action.locationId, buildingDefId: action.buildingDefId });
            dismissModal();
          } catch (err: any) {
            audioEngine.play('ui.error');
            alert(err?.message || 'Build failed. Please try again.');
          }
          return;
        }

        case 'UPGRADE_BUILDING': {
          try {
            await execute('UpgradeBuilding', { locationId: action.locationId, buildingId: action.buildingId });
            audioEngine.play('sfx.building.upgrade');
            dismissModal();
          } catch (err: any) {
            audioEngine.play('ui.error');
            console.warn('[GameModalHost] UpgradeBuilding failed:', err?.message);
          }
          return;
        }

        case 'DEPOSIT_LOCATION_XP': {
          try {
            await execute('DepositLocationXp', {
              locationId: action.locationId,
              costOption: action.costOption,
              charges: action.charges ?? 1,
            });
            audioEngine.play('sfx.economy.purchase');
          } catch (err: any) {
            audioEngine.play('ui.error');
            console.warn('[GameModalHost] DepositLocationXp failed:', err?.message);
          }
          return;
        }

        case 'SHOP_PURCHASE': {
          try {
            const response = await execute('ShopPurchase', { shopItemDefId: action.shopItemDefId });
            audioEngine.play('sfx.economy.purchase');
            const modalIntent = response.ui.find((i) => i.type === 'modal');
            if (modalIntent && modalIntent.type === 'modal') {
              replaceModal(modalIntent.spec);
            } else {
              dismissModal();
            }
          } catch (err: any) {
            audioEngine.play('ui.error');
            console.warn('[GameModalHost] ShopPurchase failed:', err?.message);
          }
          return;
        }

        case 'SKIP': {
          const { targetType, targetId } = action;
          if (targetType === 'job') {
            try {
              await api.skipJob(targetId);
              const replaced = await tryFetchFollowUp({ jobId: targetId });
              if (!replaced) dismissModal();
            } catch (err: any) {
              audioEngine.play('ui.error');
              console.warn('[GameModalHost] SKIP job failed:', err?.message);
            }
          } else {
            console.warn(`[GameModalHost] SKIP: unhandled targetType "${targetType}"`);
            dismissModal();
          }
          return;
        }

        case 'API_CALL': {
          const { apiKey, payload } = action;

          if (apiKey === 'jobs.cancel' && payload?.jobId) {
            const jobId = payload.jobId as string;
            try {
              await api.cancelJob(jobId);
            } catch (err: any) {
              audioEngine.play('ui.error');
              console.warn('[GameModalHost] jobs.cancel failed:', err?.message);
            }
            dismissModal();
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

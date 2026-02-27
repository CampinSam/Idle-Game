import { useCallback } from 'react';
import { useAppSelector } from '../store';
import { useCommand } from './useCommand';
import { useModal } from '../context/ModalContext';
import { api } from '../services/api';

export function useCollectJob() {
  const { execute } = useCommand();
  const { pushModal } = useModal();
  const jobs = useAppSelector((s) => s.sync.jobs);

  const collectJob = useCallback(
    async (jobId: string) => {
      const jobData = jobs[jobId];
      if (!jobData) {
        console.warn('[useCollectJob] Job not found in sync store:', jobId);
        return;
      }

      const { type, data: jd } = jobData;
      let completed = false;

      if (type === 'MissionJob') {
        await execute('CompleteMission', { jobId });
        completed = true;
      } else if (type === 'CraftingJob') {
        await execute('CollectCrafting', { jobId });
        completed = true;
      } else if (type === 'BuildingJob') {
        const locationId = jd?.locationId;
        const buildingId = jd?.buildingId;
        if (locationId && buildingId) {
          await execute('CompleteBuilding', { locationId, buildingId });
          completed = true;
        } else {
          console.warn('[useCollectJob] BuildingJob missing locationId or buildingId', jobId);
        }
      } else {
        console.warn('[useCollectJob] Unknown job type:', type, jobId);
      }

      if (!completed) return;

      try {
        const spec = await api.getModalSpec({ jobId });
        if (spec?.version === 1) {
          pushModal(spec);
        }
      } catch (err) {
        console.warn('[useCollectJob] Failed to fetch results modal:', err);
      }
    },
    [execute, pushModal, jobs],
  );

  return { collectJob };
}

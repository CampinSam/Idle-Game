import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export interface JobPreviewRequirement {
  label?: string;
  met: boolean;
  source: 'requirements' | 'launchRequirements';
}

export interface MissionPreviewData {
  teamMin: number;
  teamMax: number;
  missionPower: number;
  difficulty: number;
  successChance: number;
  injuryChance: number;
  synergy: {
    synergyScore: number;
    missionPowerBonus: number;
    durationBonus: number;
    matchedRules: {
      ruleId: string;
      name: string;
      applications: number;
      scoreContrib: number;
      mpBonusContrib: number;
      durationBonusContrib: number;
      isPenalty: boolean;
    }[];
  } | null;
}

export interface JobPreviewResult {
  jobType: string;
  requirements: JobPreviewRequirement[];
  allRequirementsMet: boolean;
  canAfford: boolean;
  cost: { type: string; id: string; amount: number }[];
  durationSeconds: number;
  mission?: MissionPreviewData;
}

interface UseJobPreviewOptions {
  jobType: 'mission' | 'crafting' | 'building';
  defId: string;
  entityIds?: string[];
  locationId?: string;
  debounceMs?: number;
}

interface UseJobPreviewReturn {
  preview: JobPreviewResult | null;
  loading: boolean;
  error: string | null;
}

export function useJobPreview({
  jobType,
  defId,
  entityIds,
  locationId,
  debounceMs = 250,
}: UseJobPreviewOptions): UseJobPreviewReturn {
  const [preview, setPreview] = useState<JobPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityKey = JSON.stringify(entityIds ?? []);

  useEffect(() => {
    if (!defId) return;

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const result = await api.jobPreview(
          { jobType, defId, entityIds: entityIds ?? [], locationId },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setPreview(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err?.message ?? 'Preview failed');
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobType, defId, entityKey, locationId, debounceMs]);

  return { preview, loading, error };
}

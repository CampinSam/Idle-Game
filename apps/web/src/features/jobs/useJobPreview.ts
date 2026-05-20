import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export interface JobPreviewRequirement {
  label?: string;
  met: boolean;
  text?: string;
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

export interface CostEntry {
  type: string;
  id: string;
  amount: number;
}

export interface BuildingUpgradePreview {
  toLevel: number;
  cost: CostEntry[];
  durationSeconds: number;
  effectiveDurationTicks: number;
  canAfford: boolean;
}

export interface BuildingPreviewData {
  buildingDefId: string;
  name: string;
  description: string | null;
  category: string | null;
  buildLevel: number;
  maxLevel: number;
  effectiveDurationTicks: number;
  upgrade: BuildingUpgradePreview | null;
}

export interface QualityProbEntry {
  key: string;
  label: string;
  probability: number;
}

export interface CraftingPreviewData {
  recipeId: string;
  recipeName: string;
  recipeTier: number;
  requiredKeeperLevel: number;
  keeperLevelMet: boolean;
  effectiveDurationTicks: number;
  rewards: any;
  workshopTier: number;
  slotsTotal: number;
  slotsUsed: number;
  slotsOpen: number;
  recipeTierCap: number;
  timerMultiplier: number;
  recipeTierMet: boolean | null;
  difficulty: number;
  entityCl: number | null;
  passRate: number | null;
  qualityProbabilities: QualityProbEntry[] | null;
  scaledCost: CostEntry[];
}

export interface JobPreviewResult {
  jobType: string;
  requirements: JobPreviewRequirement[];
  allRequirementsMet: boolean;
  canAfford: boolean;
  cost: CostEntry[];
  durationSeconds: number;
  mission?: MissionPreviewData;
  building?: BuildingPreviewData;
  crafting?: CraftingPreviewData;
}

interface UseJobPreviewOptions {
  jobType: 'mission' | 'crafting' | 'building';
  defId: string;
  entityIds?: string[];
  entityId?: string;
  quantity?: number;
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
  entityId,
  quantity,
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
          { jobType, defId, entityIds: entityIds ?? [], entityId, quantity, locationId },
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
  }, [jobType, defId, entityKey, entityId, quantity, locationId, debounceMs]);

  return { preview, loading, error };
}

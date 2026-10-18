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
  spdTimerMultiplier: number;
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
  /** Invalidates a preview when authoritative inputs change without changing IDs. */
  revision?: string;
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
  revision = '',
}: UseJobPreviewOptions): UseJobPreviewReturn {
  const [result, setResult] = useState<{ key: string; preview: JobPreviewResult | null; error: string | null } | null>(null);

  const entityKey = JSON.stringify(entityIds ?? []);
  const requestKey = JSON.stringify([jobType, defId, entityKey, entityId, quantity, locationId, revision]);

  useEffect(() => {
    if (!defId) return;

    const controller = new AbortController();

    setResult(null);

    const timer = setTimeout(async () => {
      try {
        const result = await api.jobPreview(
          { jobType, defId, entityIds: JSON.parse(entityKey) as string[], entityId, quantity, locationId },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, preview: result, error: null });
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, preview: null, error: err?.message ?? 'Preview failed' });
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobType, defId, entityKey, entityId, quantity, locationId, debounceMs, requestKey]);

  // Key comparison invalidates during render, before the next effect can run.
  const current = result?.key === requestKey ? result : null;
  return { preview: current?.preview ?? null, loading: !!defId && !current, error: current?.error ?? null };
}

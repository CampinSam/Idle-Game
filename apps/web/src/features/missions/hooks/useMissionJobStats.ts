import { useState, useEffect } from 'react';
import { api } from '../../../services/api';

export interface MissionJobStats {
  missionPower: number;
  difficulty: number;
  successChance: number;
  injuryChance: number;
  injuryRate: number;
  powerRatio: number;
  synergy: {
    matchedRules: {
      ruleId: string;
      name: string;
      applications: number;
      scoreContrib: number;
      mpBonusContrib: number;
      durationBonusContrib: number;
      isPenalty: boolean;
    }[];
    missionPowerBonus: number;
    synergyScore: number;
  } | null;
  entities: { id: string; name: string; level: number }[];
  def: {
    id: string;
    name: string;
    difficulty: number;
    timer: any;
    display: any;
    injuryRate: number;
    tags: any[];
    missionCategoryDefId: string;
  };
  job: {
    id: string;
    status: string;
    startTick: number;
    durationTicks: number;
    defId: string;
    results: any;
  };
}

interface UseMissionJobStatsReturn {
  stats: MissionJobStats | null;
  loading: boolean;
  error: string | null;
}

export function useMissionJobStats(jobId: string | undefined): UseMissionJobStatsReturn {
  const [stats, setStats] = useState<MissionJobStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStats(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getMissionJobStats(jobId).then((data) => {
      if (!cancelled) {
        setStats(data);
        setLoading(false);
      }
    }).catch((err: any) => {
      if (!cancelled) {
        setError(err?.message ?? 'Failed to load mission stats');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [jobId]);

  return { stats, loading, error };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

export interface ActiveBoostInfo {
  boostActive: boolean;
  boostPercent: number;
  boostLabel: string;
  boostNames: string[];
  refresh: () => void;
}

export function useActiveBoosts(): ActiveBoostInfo {
  const [boosts, setBoosts] = useState<any[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBoosts = useCallback(async () => {
    try {
      const data = await api.getActiveBoosts();
      setBoosts(Array.isArray(data) ? data : []);
    } catch {
      setBoosts([]);
    }
  }, []);

  useEffect(() => {
    fetchBoosts();
    const poll = setInterval(fetchBoosts, 60_000);
    return () => clearInterval(poll);
  }, [fetchBoosts]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (boosts.length === 0) return;

    const now = Date.now();
    const earliestEnd = boosts.reduce((min: number, b: any) => {
      const end = new Date(b.endTime).getTime();
      return end < min ? end : min;
    }, Infinity);

    const delay = Math.max(earliestEnd - now + 1000, 1000);
    timerRef.current = setTimeout(fetchBoosts, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [boosts, fetchBoosts]);

  const meaningful = boosts.filter((b: any) => (b.multiplier || 1) > 1);
  const combinedMultiplier = meaningful.reduce((acc: number, b: any) => acc * b.multiplier, 1);
  const boostPercent = Math.round((combinedMultiplier - 1) * 100);
  const boostNames = meaningful.map((b: any) => b.name || 'Boost');

  let boostLabel = '';
  if (meaningful.length > 0) {
    const nameStr = boostNames.join(', ');
    boostLabel = `Global ${boostPercent}% boost active — ${nameStr}`;
  }

  return {
    boostActive: meaningful.length > 0 && boostPercent > 0,
    boostPercent,
    boostLabel,
    boostNames,
    refresh: fetchBoosts,
  };
}

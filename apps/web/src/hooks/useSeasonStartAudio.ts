import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { audioEngine } from '../services/AudioEngine';

export function useSeasonStartAudio() {
  const activeSeason = useAppSelector((state: any) =>
    state.sync?.activeSeason ?? null
  );
  const prevSeasonIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const seasonId = activeSeason?.id ?? null;
    if (prevSeasonIdRef.current === undefined) {
      prevSeasonIdRef.current = seasonId;
      return;
    }
    if (prevSeasonIdRef.current !== seasonId && seasonId !== null) {
      audioEngine.play('sfx.season.start');
    }
    prevSeasonIdRef.current = seasonId;
  }, [activeSeason?.id]);
}

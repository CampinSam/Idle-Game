import { useEffect, useRef } from 'react';
import { useSyncPlayer } from './useSyncSelectors';
import { audioEngine } from '../services/AudioEngine';

export function useLevelUpAudio() {
  const player = useSyncPlayer();
  const prevLevelRef = useRef<number | null>(null);

  useEffect(() => {
    const level = (player as any)?.keeperLevel ?? null;
    if (level === null) return;
    if (prevLevelRef.current !== null && level > prevLevelRef.current) {
      audioEngine.play('sfx.player.level_up');
    }
    prevLevelRef.current = level;
  }, [(player as any)?.keeperLevel]);
}

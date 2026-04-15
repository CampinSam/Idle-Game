import { useEffect, useRef } from 'react';
import { useAppSelector } from '../store';
import { audioEngine } from '../services/AudioEngine';

export function useEntityProgressionAudio() {
  const entities = useAppSelector((s) => s.sync.entities);
  const prevEntitiesRef = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    if (prevEntitiesRef.current === null) {
      prevEntitiesRef.current = entities;
      return;
    }

    const prev = prevEntitiesRef.current;
    let tierUp = false;
    let levelUp = false;

    for (const id of Object.keys(entities)) {
      const curr = entities[id];
      const prevEntity = prev[id];
      if (!prevEntity) continue;

      const currTier = curr?.tier ?? null;
      const prevTier = prevEntity?.tier ?? null;
      if (currTier !== null && prevTier !== null && currTier > prevTier) {
        tierUp = true;
      }

      const currLevel = curr?.level ?? null;
      const prevLevel = prevEntity?.level ?? null;
      if (currLevel !== null && prevLevel !== null && currLevel > prevLevel) {
        levelUp = true;
      }
    }

    if (tierUp) {
      audioEngine.play('sfx.entity.tier_upgrade');
    } else if (levelUp) {
      audioEngine.play('sfx.entity.level_up');
    }

    prevEntitiesRef.current = entities;
  }, [entities]);
}

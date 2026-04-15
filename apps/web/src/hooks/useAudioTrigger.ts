import { useCallback } from 'react';
import { audioEngine } from '../services/AudioEngine';

export function useAudioTrigger() {
  const play = useCallback((actionKey: string) => {
    audioEngine.play(actionKey);
  }, []);

  return { play };
}

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { audioEngine } from '../services/AudioEngine';
import { useAppSelector } from '../store';

export function useAudioNavigation() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);
  const prevSeasonIdRef = useRef<string | null>(null);

  const activeSeason = useAppSelector((state: any) =>
    state.sync?.activeSeason ?? null
  );

  useEffect(() => {
    const path = location.pathname;
    const seasonId = activeSeason?.id ?? null;
    if (prevPathRef.current === path && prevSeasonIdRef.current === seasonId) return;
    prevPathRef.current = path;
    prevSeasonIdRef.current = seasonId;

    if (path === '/' || path === '/home') {
      if (activeSeason?.id) {
        audioEngine.crossfadeChain([`music.season.${activeSeason.id}`, 'music.main_menu']);
      } else {
        audioEngine.crossfadeTo('music.main_menu');
      }
      audioEngine.crossfadeTo('ambient.default');
    } else if (path.startsWith('/missions')) {
      if (activeSeason?.id) {
        audioEngine.crossfadeChain([`music.season.${activeSeason.id}`, 'music.mission_active', 'music.default']);
      } else {
        audioEngine.crossfadeChain(['music.mission_active', 'music.default']);
      }
      audioEngine.crossfadeTo('ambient.default');
    } else if (path.startsWith('/locations/')) {
      const locationId = path.split('/').filter(Boolean).pop();
      if (locationId) {
        if (activeSeason?.id) {
          audioEngine.crossfadeChain([
            `music.season.${activeSeason.id}`,
            `music.location.${locationId}`,
            'music.default',
          ]);
        } else {
          audioEngine.crossfadeChain([`music.location.${locationId}`, 'music.default']);
        }
        audioEngine.crossfadeChain([`ambient.location.${locationId}`, 'ambient.default']);
      } else {
        if (activeSeason?.id) {
          audioEngine.crossfadeChain([`music.season.${activeSeason.id}`, 'music.default']);
        } else {
          audioEngine.crossfadeTo('music.default');
        }
        audioEngine.crossfadeTo('ambient.default');
      }
    } else {
      if (activeSeason?.id) {
        audioEngine.crossfadeChain([`music.season.${activeSeason.id}`, 'music.default']);
      } else {
        audioEngine.crossfadeTo('music.default');
      }
      audioEngine.crossfadeTo('ambient.default');
    }

    audioEngine.play('ui.tab_switch');
  }, [location.pathname, activeSeason?.id]);
}

import { useState, useEffect } from 'react';
import { serverNow } from '../services/clockSync';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => setNow(serverNow());
    const id = setInterval(tick, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}

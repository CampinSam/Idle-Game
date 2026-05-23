import { useState, useEffect } from 'react';
import { serverNow } from '../services/clockSync';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

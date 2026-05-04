import { useEffect } from 'react';

export function useScrollLock() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.content');
    if (!el) return;
    const prev = el.style.overflowY;
    el.style.overflowY = 'hidden';
    return () => {
      el.style.overflowY = prev;
    };
  }, []);
}

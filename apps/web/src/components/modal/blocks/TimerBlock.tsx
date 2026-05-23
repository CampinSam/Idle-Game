import { useEffect, useMemo, useRef, useState } from 'react';

export default function TimerBlock({
  endsAt,
  label,
  onExpire,
}: {
  endsAt: string;
  label?: string;
  onExpire?: () => void;
}) {
  const endMs = useMemo(() => Date.parse(endsAt), [endsAt]);
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = Math.max(0, endMs - now);

  useEffect(() => {
    if (remaining <= 0 && !firedRef.current && onExpire) {
      firedRef.current = true;
      onExpire();
    }
  }, [remaining, onExpire]);

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  let display: string;
  if (remaining <= 0) {
    display = 'Ready!';
  } else if (h > 0) {
    display = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    display = `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="gm-timer-block">
      <div className="gm-timer-label">{label ?? 'Time remaining'}</div>
      <div className={`gm-timer-value ${remaining <= 0 ? 'gm-timer-ready' : ''}`}>{display}</div>
    </div>
  );
}

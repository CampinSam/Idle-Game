import { useMemo } from 'react';
import { QUALITY_COLOURS, type ForecastResponse } from './forgeUtils';

interface ForecastBarProps {
  cap: number;
  tiers: ForecastResponse['tiers'];
  marker: number | null;
  qualityKey: string | null;
}

export function ForecastBar({ cap, tiers, marker, qualityKey }: ForecastBarProps) {
  const segs = useMemo(() => {
    const sorted = [...tiers].sort((a, b) => a.center - b.center);
    return sorted.map((t, i) => {
      const prevMid = i === 0 ? 0 : (sorted[i - 1].center + t.center) / 2;
      const nextMid = i === sorted.length - 1 ? cap : (t.center + sorted[i + 1].center) / 2;
      const widthPct = ((nextMid - prevMid) / cap) * 100;
      return { ...t, segStart: prevMid, segEnd: nextMid, widthPct };
    });
  }, [tiers, cap]);

  const markerPct = marker == null ? null : Math.max(0, Math.min(100, (marker / cap) * 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-[26px] rounded-lg overflow-hidden border border-white/10">
        {segs.map((s) => (
          <div
            key={s.key}
            className={`flex items-center justify-center text-[10px] uppercase tracking-[0.08em] text-slate-900 font-extrabold transition-opacity duration-200 ${qualityKey === s.key ? 'opacity-100' : 'opacity-55'}`}
            style={{ width: `${s.widthPct}%`, background: QUALITY_COLOURS[s.key] || '#475569' }}
            title={`${s.label} — CL center ${s.center}`}
          >
            <span>{s.label}</span>
          </div>
        ))}
        {markerPct != null && (
          <div
            className="absolute -top-1 -bottom-1 w-[3px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] -translate-x-[1.5px]"
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="relative flex text-[10px] text-slate-400">
        {segs.map((s) => (
          <span key={s.key} className="text-left pl-0.5" style={{ width: `${s.widthPct}%` }}>
            <small>{s.center}</small>
          </span>
        ))}
        <span className="absolute right-0"><small>{cap}+</small></span>
      </div>
    </div>
  );
}

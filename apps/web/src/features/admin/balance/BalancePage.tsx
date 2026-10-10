import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { adminApi, getAdminToken } from '../adminApi';
import {
  simulateEntityProgression,
  type BalanceBundle,
  type EntityDef,
  type SimulationResult,
} from './simulator';
import { STAT_KEYS } from '@derp/math';
import type React from 'react';

const MAX_LEVEL = 50;

interface DefinitionResults {
  defId: string;
  defName: string;
  result: SimulationResult;
}

interface SimulationOutput {
  primary: DefinitionResults | null;
  overlays: DefinitionResults[];
  sampleSize: number;
  durationMs: number;
}

function useBalanceBundle() {
  const [bundle, setBundle] = useState<BalanceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi.getBalanceBundle()
      .then((b) => { if (active) { setBundle(b); setError(null); } })
      .catch((e) => { if (active) setError(e?.message || 'Failed to load bundle'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { bundle, loading, error };
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function BalancePage() {
  const { bundle, loading, error } = useBalanceBundle();
  const [primaryId, setPrimaryId] = useState<string>('');
  const [overlayIds, setOverlayIds] = useState<Set<string>>(new Set());
  const [sampleSize, setSampleSize] = useState<number>(500);
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [autoRan, setAutoRan] = useState(false);

  useEffect(() => {
    if (bundle && !primaryId && bundle.entityDefinitions.length > 0) {
      setPrimaryId(bundle.entityDefinitions[0].id);
    }
  }, [bundle, primaryId]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Entity Progress Simulator';
    return () => { document.title = previous; };
  }, []);

  const definitionsById = useMemo(() => {
    const map = new Map<string, EntityDef>();
    for (const d of bundle?.entityDefinitions || []) map.set(d.id, d);
    return map;
  }, [bundle]);

  const runSimulation = useCallback(() => {
    if (!bundle || !primaryId) return;
    const primaryDef = definitionsById.get(primaryId);
    if (!primaryDef) return;

    const overlayDefs = Array.from(overlayIds)
      .filter((id) => id !== primaryId)
      .map((id) => definitionsById.get(id))
      .filter((d): d is EntityDef => !!d);

    setRunning(true);
    setRunMsg(null);
    setTimeout(() => {
      try {
        const start = performance.now();
        const primary: DefinitionResults = {
          defId: primaryDef.id,
          defName: primaryDef.name,
          result: simulateEntityProgression(primaryDef, bundle.traitDefinitions, sampleSize, MAX_LEVEL),
        };
        const overlays: DefinitionResults[] = overlayDefs.map((d) => ({
          defId: d.id,
          defName: d.name,
          result: simulateEntityProgression(d, bundle.traitDefinitions, sampleSize, MAX_LEVEL),
        }));
        const durationMs = performance.now() - start;
        setOutput({ primary, overlays, sampleSize, durationMs });
      } catch (e: any) {
        setRunMsg(e?.message || 'Simulation failed');
      } finally {
        setRunning(false);
      }
    }, 16);
  }, [bundle, primaryId, overlayIds, sampleSize, definitionsById]);

  useEffect(() => {
    if (!autoRan && bundle && primaryId && !running && !output) {
      setAutoRan(true);
      runSimulation();
    }
  }, [autoRan, bundle, primaryId, running, output, runSimulation]);

  const toggleOverlay = (id: string) => {
    setOverlayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!getAdminToken() && !import.meta.env.DEV) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f0f2e] text-[#888] text-center p-8">
        <p>Open the <a href="/admin">admin dashboard</a> first to authenticate.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 min-h-screen bg-[#0f0f2e] text-[#e0e0ff]">
      <header className="mb-6 border-b border-[#1a1a3e] pb-5">
        <a
          href="/admin"
          className="inline-flex items-center gap-2 text-[#8888ff] no-underline text-[0.85rem] mb-3 hover:text-[#b8b8ff] transition-colors"
          title="Back to admin"
        >
          <ArrowLeft size={16} /> Admin
        </a>
        <h1 className="text-[24px] font-bold m-0 mb-1 text-[#d4d4f0]">Entity Progress Simulator</h1>
        <p className="m-0 mt-2 text-[#6a6a8a] text-[0.85rem] leading-relaxed max-w-[680px]">
          Monte-Carlo simulation of average power score from level 1 to {MAX_LEVEL}.
          Uses the same trait rolling, scaling, and weighted level-up math the server runs.
        </p>
      </header>

      {loading && (
        <div className="px-4 py-3 rounded-lg bg-[#1a1a2e] text-[#a0a0c0] text-[0.85rem] mb-4">
          Loading entity definitions…
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg text-[0.85rem] mb-4 bg-[rgba(220,38,38,0.1)] text-[#f87171] border border-[rgba(220,38,38,0.3)]">
          {error}
        </div>
      )}

      {bundle && (
        <>
          <section className="bg-[#0d0e1f] border border-[#1a1b35] rounded-xl p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-end mb-4">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6060a0]">Primary definition</span>
                <select
                  value={primaryId}
                  onChange={(e) => setPrimaryId(e.target.value)}
                  className="bg-[#1a1b35] border border-[#2a2b55] text-[#d4d4f0] rounded-lg py-2 px-3 text-[13px] cursor-pointer"
                >
                  {bundle.entityDefinitions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-[6px] min-w-[120px] max-w-[160px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6060a0]">Birds per definition</span>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  step={10}
                  value={sampleSize}
                  onChange={(e) => {
                    const raw = Math.floor(Number(e.target.value) || 0);
                    setSampleSize(Math.min(5000, Math.max(10, raw)));
                  }}
                  className="bg-[#1a1b35] border border-[#2a2b55] text-[#d4d4f0] rounded-lg py-2 px-3 text-[13px] w-[100px]"
                />
              </label>

              <button
                onClick={runSimulation}
                disabled={running || !primaryId}
                className="py-[10px] px-5 bg-[#6c63ff] border-0 rounded-lg text-white text-[13px] font-semibold cursor-pointer hover:bg-[#5a52d5] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? 'Running…' : (output ? 'Re-run' : 'Run simulation')}
              </button>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6060a0] mb-2">Overlay definitions</div>
              <div className="flex flex-wrap gap-2">
                {bundle.entityDefinitions.map((d) => {
                  const isPrimary = d.id === primaryId;
                  const checked = overlayIds.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-2 py-[5px] px-3 border rounded-full text-[12px] select-none transition-colors ${
                        isPrimary
                          ? 'bg-[rgba(255,209,102,0.1)] border-[rgba(255,209,102,0.4)] text-[#c9a227] cursor-default'
                          : checked
                          ? 'bg-[rgba(108,99,255,0.2)] border-[rgba(108,99,255,0.6)] text-[#a0a0ff] cursor-pointer'
                          : 'bg-[rgba(108,99,255,0.05)] border-[rgba(108,99,255,0.2)] text-[#6060a0] cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isPrimary}
                        checked={isPrimary || checked}
                        onChange={() => toggleOverlay(d.id)}
                      />
                      <span>{d.name}</span>
                      {isPrimary && <small className="text-[10px] opacity-60">(primary)</small>}
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          {runMsg && (
            <div className="px-4 py-3 rounded-lg text-[0.85rem] mb-4 bg-[rgba(220,38,38,0.1)] text-[#f87171] border border-[rgba(220,38,38,0.3)]">
              {runMsg}
            </div>
          )}

          {output && output.primary && (
            <>
              <div className="flex gap-3 text-[12px] text-[#4a4a7a] mb-3 items-center">
                <span>{output.sampleSize.toLocaleString()} birds × {MAX_LEVEL} levels × {1 + output.overlays.length} definitions</span>
                <span>·</span>
                <span>simulated in {output.durationMs.toFixed(0)} ms</span>
              </div>
              <BalanceChart output={output} />
              <ResultsTable output={output} />
            </>
          )}
        </>
      )}
    </div>
  );
}

const PRIMARY_COLOR = '#ffd166';
const OVERLAY_COLORS = ['#b8b8ff', '#7df9aa', '#ff9f7f', '#ff7fbf', '#9ff7ff', '#c8a2ff'];
const STAT_COLORS: Record<string, string> = {
  ATK: '#ff6b6b',
  DEF: '#4dabf7',
  SPD: '#51cf66',
  FOC: '#cc8df0',
  LCK: '#ffd43b',
  VIT: '#ff922b',
};

function niceCeil(value: number): number {
  if (!isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const pow = Math.pow(10, exp);
  const frac = value / pow;
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 2.5) nice = 2.5;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function formatTickValue(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'k';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function BalanceChart({ output }: { output: SimulationOutput }) {
  const primary = output.primary!;
  const maxLevel = primary.result.mean.length;
  const [hoverLevel, setHoverLevel] = useState<number | null>(null);

  const series = useMemo(() => {
    const all: { id: string; name: string; color: string; result: SimulationResult; isPrimary: boolean }[] = [
      { id: primary.defId, name: primary.defName, color: PRIMARY_COLOR, result: primary.result, isPrimary: true },
    ];
    output.overlays.forEach((o, i) => {
      all.push({
        id: o.defId,
        name: o.defName,
        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
        result: o.result,
        isPrimary: false,
      });
    });
    return all;
  }, [primary, output.overlays]);

  const yMax = useMemo(() => {
    let m = 0;
    for (const v of primary.result.mean) if (v > m) m = v;
    for (const o of output.overlays) {
      for (const v of o.result.mean) if (v > m) m = v;
    }
    for (const k of STAT_KEYS) {
      const arr = primary.result.statMeans?.[k];
      if (!arr) continue;
      for (const v of arr) if (v > m) m = v;
    }
    return niceCeil(m * 1.05);
  }, [primary, output.overlays]);

  const W = 920;
  const H = 360;
  const PAD = { top: 16, right: 18, bottom: 32, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xFor = (lv: number) => PAD.left + ((lv - 1) / Math.max(1, maxLevel - 1)) * innerW;
  const yFor = (val: number) => PAD.top + innerH - (val / yMax) * innerH;

  const buildLine = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i + 1).toFixed(2)},${yFor(v).toFixed(2)}`).join(' ');

  const meanPath = buildLine(primary.result.mean);
  const bandPath = (() => {
    const top = primary.result.p90.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i + 1).toFixed(2)},${yFor(v).toFixed(2)}`).join(' ');
    const bottom = primary.result.p10
      .map((_, i) => {
        const idx = maxLevel - 1 - i;
        return `L${xFor(idx + 1).toFixed(2)},${yFor(primary.result.p10[idx]).toFixed(2)}`;
      })
      .join(' ');
    return `${top} ${bottom} Z`;
  })();

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (yMax * i) / yTicks);
  const xTickStep = maxLevel >= 40 ? 10 : maxLevel >= 20 ? 5 : 2;
  const xTickValues = Array.from(
    new Set(
      [1, ...Array.from({ length: maxLevel }, (_, i) => i + 1).filter((lv) => lv % xTickStep === 0), maxLevel],
    ),
  ).sort((a, b) => a - b);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * W;
    if (xPx < PAD.left || xPx > PAD.left + innerW) {
      setHoverLevel(null);
      return;
    }
    const frac = (xPx - PAD.left) / innerW;
    const lv = Math.round(1 + frac * (maxLevel - 1));
    setHoverLevel(Math.max(1, Math.min(maxLevel, lv)));
  };

  const tooltip = hoverLevel != null ? (() => {
    const idx = hoverLevel - 1;
    const tx = xFor(hoverLevel);
    const tipW = 220;
    const rowCount = series.length + STAT_KEYS.length;
    const tipH = 30 + 18 * rowCount + 12;
    const tipX = tx + 12 + tipW > W - PAD.right ? tx - 12 - tipW : tx + 12;
    const tipY = Math.max(PAD.top, Math.min(PAD.top + innerH - tipH, yFor(primary.result.mean[idx]) - tipH / 2));
    return { idx, tx, tipX, tipY, tipW, tipH };
  })() : null;

  return (
    <div className="mb-6 border border-[#1a1b35] rounded-xl overflow-hidden" role="img" aria-label="Power score progression chart">
      <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-b border-[#1a1b35] text-[11px]">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-[6px] text-[#8888aa]">
            <span className="w-3 h-[3px] rounded-sm inline-block" style={{ background: s.color }} />
            <span className={s.isPrimary ? 'text-[#d4d4f0] font-semibold' : ''}>
              {s.name}{s.isPrimary ? ' (primary, mean ± p10–p90)' : ' (mean)'}
            </span>
          </span>
        ))}
        {STAT_KEYS.map((k) => (
          <span key={'stat-' + k} className="flex items-center gap-[6px] text-[#8888aa]">
            <span className="w-3 h-[2px] rounded-sm inline-block" style={{ background: STAT_COLORS[k] }} />
            <span>{k} (mean)</span>
          </span>
        ))}
      </div>
      <svg
        className="w-full block bg-[#0d0e1f] cursor-crosshair"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverLevel(null)}
      >
        {yTickValues.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={'yg-' + i}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                style={{ stroke: '#21214a', strokeWidth: 1, shapeRendering: 'crispEdges' }}
              />
              <text x={PAD.left - 8} y={y + 4} style={{ fill: '#8a8ac4', fontSize: 11 }} textAnchor="end">
                {formatTickValue(v)}
              </text>
            </g>
          );
        })}

        {xTickValues.map((lv) => {
          const x = xFor(lv);
          return (
            <g key={'xg-' + lv}>
              <line
                x1={x} x2={x}
                y1={PAD.top + innerH} y2={PAD.top + innerH + 4}
                style={{ stroke: '#2a2a4e', strokeWidth: 1 }}
              />
              <text
                x={x} y={PAD.top + innerH + 18}
                style={{ fill: '#8a8ac4', fontSize: 11 }}
                textAnchor="middle"
              >
                {lv}
              </text>
            </g>
          );
        })}
        <text
          x={PAD.left + innerW / 2} y={H - 4}
          style={{ fill: '#6060a0', fontSize: 11 }}
          textAnchor="middle"
        >
          Level
        </text>

        <path d={bandPath} fill={PRIMARY_COLOR} fillOpacity={0.16} stroke="none" />

        {STAT_KEYS.map((k) => {
          const arr = primary.result.statMeans?.[k];
          if (!arr || arr.length === 0) return null;
          return (
            <path
              key={'stat-' + k}
              d={buildLine(arr)}
              fill="none"
              stroke={STAT_COLORS[k]}
              strokeWidth={1.25}
              strokeOpacity={0.85}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {output.overlays.map((o, i) => (
          <path
            key={'ov-' + o.defId}
            d={buildLine(o.result.mean)}
            fill="none"
            stroke={OVERLAY_COLORS[i % OVERLAY_COLORS.length]}
            strokeWidth={1.75}
            strokeDasharray="5 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        <path
          d={meanPath}
          fill="none"
          stroke={PRIMARY_COLOR}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoverLevel != null && tooltip && (
          <g>
            <line
              x1={tooltip.tx} x2={tooltip.tx}
              y1={PAD.top} y2={PAD.top + innerH}
              style={{ stroke: '#6c63ff', strokeDasharray: '3 3', strokeWidth: 1 }}
            />
            {series.map((s) => (
              <circle
                key={'pt-' + s.id}
                cx={tooltip.tx}
                cy={yFor(s.result.mean[tooltip.idx])}
                r={3.5}
                fill={s.color}
                stroke="#0f0f2e"
                strokeWidth={1.5}
              />
            ))}
            {STAT_KEYS.map((k) => {
              const arr = primary.result.statMeans?.[k];
              if (!arr) return null;
              return (
                <circle
                  key={'pt-stat-' + k}
                  cx={tooltip.tx}
                  cy={yFor(arr[tooltip.idx])}
                  r={2.5}
                  fill={STAT_COLORS[k]}
                  stroke="#0f0f2e"
                  strokeWidth={1}
                />
              );
            })}
            <g>
              <rect
                x={tooltip.tipX} y={tooltip.tipY}
                width={tooltip.tipW} height={tooltip.tipH}
                rx={6} ry={6}
                style={{ fill: '#0f0f2e', stroke: '#2a2a4e', strokeWidth: 1 }}
              />
              <text
                x={tooltip.tipX + 10} y={tooltip.tipY + 18}
                style={{ fill: '#ffffff', fontSize: 12, fontWeight: 600 }}
              >
                Level {hoverLevel}
              </text>
              {series.map((s, i) => {
                const ty = tooltip.tipY + 36 + i * 18;
                const m = s.result.mean[tooltip.idx];
                const detail = s.isPrimary
                  ? `${formatTickValue(m)} (p10 ${formatTickValue(s.result.p10[tooltip.idx])} – p90 ${formatTickValue(s.result.p90[tooltip.idx])})`
                  : formatTickValue(m);
                return (
                  <g key={'tt-' + s.id}>
                    <rect x={tooltip.tipX + 10} y={ty - 8} width={8} height={8} fill={s.color} rx={1.5} />
                    <text x={tooltip.tipX + 24} y={ty} style={{ fill: '#c8c8ee', fontSize: 11 }}>
                      <tspan style={{ fill: '#b8b8ff' }}>{s.name}: </tspan>
                      <tspan>{detail}</tspan>
                    </text>
                  </g>
                );
              })}
              {STAT_KEYS.map((k, i) => {
                const arr = primary.result.statMeans?.[k];
                if (!arr) return null;
                const ty = tooltip.tipY + 36 + (series.length + i) * 18;
                return (
                  <g key={'tt-stat-' + k}>
                    <rect x={tooltip.tipX + 10} y={ty - 8} width={8} height={8} fill={STAT_COLORS[k]} rx={1.5} />
                    <text x={tooltip.tipX + 24} y={ty} style={{ fill: '#c8c8ee', fontSize: 11 }}>
                      <tspan style={{ fill: '#b8b8ff' }}>{k}: </tspan>
                      <tspan>{formatTickValue(arr[tooltip.idx])}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

function ResultsTable({ output }: { output: SimulationOutput }) {
  const primary = output.primary!;

  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full border-collapse text-[12px] bg-[#0d0e1f] rounded-xl overflow-hidden">
        <thead>
          <tr>
            <th rowSpan={2} className="py-[10px] px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6060a0] bg-[#141427] sticky left-0 z-[1]">Lv</th>
            <th
              colSpan={4}
              className="py-[10px] px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#ffd166] bg-[rgba(255,209,102,0.05)] text-center"
            >
              {primary.defName} <small>(primary)</small>
            </th>
            {output.overlays.map((o) => (
              <th key={o.defId} className="py-[10px] px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#b8b8ff] bg-[rgba(184,184,255,0.04)] text-center">{o.defName}</th>
            ))}
          </tr>
          <tr>
            <th className="py-[7px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#4a4a7a] bg-[#0f0f24] text-center">mean</th>
            <th className="py-[7px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#4a4a7a] bg-[#0f0f24] text-center">p10</th>
            <th className="py-[7px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#4a4a7a] bg-[#0f0f24] text-center">p50</th>
            <th className="py-[7px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#4a4a7a] bg-[#0f0f24] text-center">p90</th>
            {output.overlays.map((o) => (
              <th key={o.defId + '-mean'} className="py-[7px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#3a3a6a] bg-[#0f0f24] text-center">mean</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: primary.result.mean.length }).map((_, idx) => {
            const lv = idx + 1;
            return (
              <tr key={lv}>
                <td className="py-[7px] px-3 text-[#4a4a7a] font-semibold sticky left-0 bg-[#0d0e1f] z-[1] text-right">{lv}</td>
                <td className="py-[7px] px-3 text-[#ffd166] text-right">{formatNumber(primary.result.mean[idx])}</td>
                <td className="py-[7px] px-3 text-right">{formatNumber(primary.result.p10[idx])}</td>
                <td className="py-[7px] px-3 text-right">{formatNumber(primary.result.p50[idx])}</td>
                <td className="py-[7px] px-3 text-right">{formatNumber(primary.result.p90[idx])}</td>
                {output.overlays.map((o) => (
                  <td key={o.defId} className="py-[7px] px-3 text-[#b8b8ff] text-right">{formatNumber(o.result.mean[idx])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

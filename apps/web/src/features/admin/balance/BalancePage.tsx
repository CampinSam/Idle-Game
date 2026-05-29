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
import '../admin.css';
import './BalancePage.css';

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

  // Pick a default primary once the bundle loads.
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
    // Defer to the next frame so the "Running…" state can paint.
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

  // Auto-run once after the bundle loads and a primary is selected.
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
      <div className="balance-page-empty">
        <p>Open the <a href="/admin">admin dashboard</a> first to authenticate.</p>
      </div>
    );
  }

  return (
    <div className="balance-page">
      <header className="balance-header">
        <a href="/admin" className="balance-back-link" title="Back to admin">
          <ArrowLeft size={16} /> Admin
        </a>
        <h1>Entity Progress Simulator</h1>
        <p className="balance-subtitle">
          Monte-Carlo simulation of average power score from level 1 to {MAX_LEVEL}.
          Uses the same trait rolling, scaling, and weighted level-up math the server runs.
        </p>
      </header>

      {loading && <div className="balance-status">Loading entity definitions…</div>}
      {error && <div className="balance-status balance-error">{error}</div>}

      {bundle && (
        <>
          <section className="balance-controls">
            <div className="balance-control-row">
              <label className="balance-field">
                <span className="balance-field-label">Primary definition</span>
                <select
                  value={primaryId}
                  onChange={(e) => setPrimaryId(e.target.value)}
                  className="balance-select"
                >
                  {bundle.entityDefinitions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                </select>
              </label>

              <label className="balance-field balance-field-narrow">
                <span className="balance-field-label">Birds per definition</span>
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
                  className="balance-input"
                />
              </label>

              <button
                onClick={runSimulation}
                disabled={running || !primaryId}
                className="balance-run-btn"
              >
                {running ? 'Running…' : (output ? 'Re-run' : 'Run simulation')}
              </button>
            </div>

            <div className="balance-overlay-section">
              <div className="balance-field-label">Overlay definitions</div>
              <div className="balance-overlay-grid">
                {bundle.entityDefinitions.map((d) => {
                  const isPrimary = d.id === primaryId;
                  const checked = overlayIds.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`balance-overlay-chip${isPrimary ? ' is-primary' : ''}${checked ? ' is-on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        disabled={isPrimary}
                        checked={isPrimary || checked}
                        onChange={() => toggleOverlay(d.id)}
                      />
                      <span>{d.name}</span>
                      {isPrimary && <small>(primary)</small>}
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          {runMsg && <div className="balance-status balance-error">{runMsg}</div>}

          {output && output.primary && (
            <>
              <div className="balance-meta">
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
    for (const v of primary.result.p90) if (v > m) m = v;
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
    <div className="balance-chart-wrap" role="img" aria-label="Power score progression chart">
      <div className="balance-chart-legend">
        {series.map((s) => (
          <span key={s.id} className="balance-chart-legend-item">
            <span className="balance-chart-swatch" style={{ background: s.color }} />
            <span className={s.isPrimary ? 'balance-chart-legend-primary' : ''}>
              {s.name}{s.isPrimary ? ' (primary, mean ± p10–p90)' : ' (mean)'}
            </span>
          </span>
        ))}
        {STAT_KEYS.map((k) => (
          <span key={'stat-' + k} className="balance-chart-legend-item">
            <span className="balance-chart-swatch balance-chart-swatch-stat" style={{ background: STAT_COLORS[k] }} />
            <span>{k} (mean)</span>
          </span>
        ))}
      </div>
      <svg
        className="balance-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverLevel(null)}
      >
        {yTickValues.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={'yg-' + i} className="balance-chart-grid">
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} />
              <text x={PAD.left - 8} y={y + 4} className="balance-chart-axis-label" textAnchor="end">
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
                x1={x}
                x2={x}
                y1={PAD.top + innerH}
                y2={PAD.top + innerH + 4}
                className="balance-chart-axis-tick"
              />
              <text
                x={x}
                y={PAD.top + innerH + 18}
                className="balance-chart-axis-label"
                textAnchor="middle"
              >
                {lv}
              </text>
            </g>
          );
        })}
        <text
          x={PAD.left + innerW / 2}
          y={H - 4}
          className="balance-chart-axis-title"
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
              x1={tooltip.tx}
              x2={tooltip.tx}
              y1={PAD.top}
              y2={PAD.top + innerH}
              className="balance-chart-crosshair"
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
                x={tooltip.tipX}
                y={tooltip.tipY}
                width={tooltip.tipW}
                height={tooltip.tipH}
                rx={6}
                ry={6}
                className="balance-chart-tooltip-bg"
              />
              <text x={tooltip.tipX + 10} y={tooltip.tipY + 18} className="balance-chart-tooltip-title">
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
                    <text x={tooltip.tipX + 24} y={ty} className="balance-chart-tooltip-text">
                      <tspan className="balance-chart-tooltip-name">{s.name}: </tspan>
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
                    <text x={tooltip.tipX + 24} y={ty} className="balance-chart-tooltip-text">
                      <tspan className="balance-chart-tooltip-name">{k}: </tspan>
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
    <div className="balance-table-wrap">
      <table className="balance-table">
        <thead>
          <tr>
            <th rowSpan={2} className="balance-th-level">Lv</th>
            <th colSpan={4} className="balance-th-primary">
              {primary.defName} <small>(primary)</small>
            </th>
            {output.overlays.map((o) => (
              <th key={o.defId} className="balance-th-overlay">{o.defName}</th>
            ))}
          </tr>
          <tr>
            <th className="balance-th-sub">mean</th>
            <th className="balance-th-sub">p10</th>
            <th className="balance-th-sub">p50</th>
            <th className="balance-th-sub">p90</th>
            {output.overlays.map((o) => (
              <th key={o.defId + '-mean'} className="balance-th-sub balance-th-sub-overlay">mean</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: primary.result.mean.length }).map((_, idx) => {
            const lv = idx + 1;
            return (
              <tr key={lv}>
                <td className="balance-td-level">{lv}</td>
                <td className="balance-td-primary">{formatNumber(primary.result.mean[idx])}</td>
                <td>{formatNumber(primary.result.p10[idx])}</td>
                <td>{formatNumber(primary.result.p50[idx])}</td>
                <td>{formatNumber(primary.result.p90[idx])}</td>
                {output.overlays.map((o) => (
                  <td key={o.defId} className="balance-td-overlay">{formatNumber(o.result.mean[idx])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { adminApi, getAdminKey } from '../adminApi';
import {
  simulateEntityProgression,
  type BalanceBundle,
  type EntityDef,
  type SimulationResult,
} from './simulator';
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

  if (!getAdminKey()) {
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
        <h1>Bird Power Progression Simulator</h1>
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
              <ResultsTable output={output} />
            </>
          )}
        </>
      )}
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

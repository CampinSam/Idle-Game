import { useMemo } from 'react';
import { qualityProbabilities, QUALITY_TIERS } from '@derp/math';
import { ForecastBar } from './ForecastBar';
import { QUALITY_COLOURS, type ForecastResponse } from './forgeUtils';
import type { EntityForecast } from '../../entities/types';

interface ForgeForecastPanelProps {
  forecast: ForecastResponse;
  selectedEntityForecast: EntityForecast | null;
  difficulty: number;
  recipeTiers: Record<string, { rewards?: any[]; clRequirement?: number }>;
  busy: boolean;
  blockedReasons: string[];
  error: string;
  onStart: () => void;
}

export function ForgeForecastPanel({
  forecast,
  selectedEntityForecast,
  difficulty,
  recipeTiers,
  busy,
  blockedReasons,
  error,
  onStart,
}: ForgeForecastPanelProps) {
  const cl = selectedEntityForecast?.craftingLuck ?? 0;
  const passRate = difficulty > 0 ? cl / (cl + difficulty) : 1;

  // Build per-recipe center overrides from clRequirement fields on each tier
  const centerOverrides = useMemo((): Partial<Record<string, number>> => {
    const overrides: Partial<Record<string, number>> = {};
    for (const [key, block] of Object.entries(recipeTiers)) {
      if (key !== 'failure' && block && typeof block.clRequirement === 'number') {
        overrides[key] = block.clRequirement;
      }
    }
    return overrides;
  }, [recipeTiers]);

  // Recompute probabilities client-side when recipe has tier center overrides
  const adjustedProbabilities = useMemo(() => {
    if (!selectedEntityForecast) return null;
    if (Object.keys(centerOverrides).length === 0) return selectedEntityForecast.probabilities;
    return qualityProbabilities(cl, centerOverrides);
  }, [selectedEntityForecast, cl, centerOverrides]);

  // Filter to only tiers that have at least one reward configured
  const visibleProbabilities = useMemo(() => {
    const probs = adjustedProbabilities ?? selectedEntityForecast?.probabilities ?? [];
    if (!recipeTiers || Object.keys(recipeTiers).length === 0) return probs;
    return probs.filter((p) => {
      const block = recipeTiers[p.key];
      if (!block) return false;
      return Array.isArray(block.rewards) && block.rewards.length > 0;
    });
  }, [adjustedProbabilities, selectedEntityForecast, recipeTiers]);

  // Find the best tier from adjusted probabilities for display
  const topTier = useMemo(() => {
    const probs = adjustedProbabilities ?? selectedEntityForecast?.probabilities;
    if (!probs) return null;
    return probs.reduce((best, p) => (p.probability > best.probability ? p : best), probs[0]);
  }, [adjustedProbabilities, selectedEntityForecast]);

  const passRateColor = passRate >= 0.75 ? '#34d399' : passRate >= 0.4 ? '#fcd34d' : '#ef4444';

  return (
    <div className="flex flex-col gap-3 p-3 border-t border-[rgba(139,92,246,0.18)]">
      <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-black/20 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[12px] font-bold tracking-wide text-[#c4b5fd]">
          <span>Crafting Luck</span>
          {selectedEntityForecast && topTier && (
            <span style={{ color: QUALITY_COLOURS[topTier.key] || '#94a3b8' }}>
              CL {selectedEntityForecast.craftingLuck.toFixed(0)} → {topTier.label}
            </span>
          )}
        </div>

        {/* Step-1 pass/fail gate — always shown (100% when difficulty = 0) */}
        {selectedEntityForecast && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">
                {difficulty > 0 ? `Success chance (difficulty ${difficulty})` : 'Success chance'}
              </span>
              <span className="font-bold tabular-nums" style={{ color: passRateColor }}>
                {(passRate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${passRate * 100}%`, background: passRateColor }}
              />
            </div>
          </div>
        )}

        <ForecastBar
          cap={forecast.cap}
          tiers={forecast.tiers}
          marker={selectedEntityForecast?.craftingLuck ?? null}
          qualityKey={topTier?.key ?? null}
        />

        {selectedEntityForecast ? (
          <div className="flex flex-col gap-1.5">
            {(visibleProbabilities.length > 0
              ? visibleProbabilities
              : (adjustedProbabilities ?? selectedEntityForecast.probabilities)
            ).map((p) => (
              <div key={p.key} className="grid grid-cols-[80px_1fr_42px] items-center gap-2">
                <div
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: QUALITY_COLOURS[p.key] || '#94a3b8' }}
                >
                  {QUALITY_TIERS.find((t) => t.key === p.key)?.label ?? p.key}
                </div>
                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${p.probability * 100}%`,
                      background: QUALITY_COLOURS[p.key] || '#475569',
                    }}
                  />
                </div>
                <div className="text-[11px] font-bold text-text-primary text-right tabular-nums">
                  {(p.probability * 100).toFixed(0)}%
                </div>
              </div>
            ))}
            {forecast.luckFloor > 0 && (selectedEntityForecast.rawCraftingLuck ?? 0) < forecast.luckFloor && (
              <div className="text-[11px] text-[#fcd34d] mt-1">
                ⚒️ Workshop Tier {forecast.workshopTier} sets a luck floor of {forecast.luckFloor} (raw CL {(selectedEntityForecast.rawCraftingLuck ?? 0).toFixed(0)}).
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-text-secondary italic">Loading forecast…</div>
        )}
      </div>

      {error && (
        <div className="text-[12px] text-[#fca5a5] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {blockedReasons.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-1" role="alert">
          {blockedReasons.map((r, i) => (
            <li key={i} className="text-[11px] text-[#fbbf24]">⚠️ {r}</li>
          ))}
        </ul>
      )}

      <button
        disabled={busy || blockedReasons.length > 0}
        onClick={onStart}
        title={blockedReasons[0] ?? undefined}
        className="w-full py-3 rounded-xl text-white text-[14px] font-extrabold uppercase tracking-[0.08em] cursor-pointer transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
      >
        {busy
          ? 'Igniting…'
          : blockedReasons.length > 0
            ? blockedReasons[0]
            : 'Begin Crafting'}
      </button>
    </div>
  );
}

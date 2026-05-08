import { ForecastBar } from './ForecastBar';
import { QUALITY_COLOURS, type ForecastResponse } from './forgeUtils';
import type { EntityForecast } from '../../entities/types';

interface ForgeForecastPanelProps {
  forecast: ForecastResponse;
  selectedEntityForecast: EntityForecast | null;
  busy: boolean;
  blockedReasons: string[];
  error: string;
  onStart: () => void;
}

export function ForgeForecastPanel({
  forecast,
  selectedEntityForecast,
  busy,
  blockedReasons,
  error,
  onStart,
}: ForgeForecastPanelProps) {
  return (
    <div className="flex flex-col gap-3 p-3 border-t border-[rgba(139,92,246,0.18)]">
      <div className="rounded-xl border border-[rgba(139,92,246,0.2)] bg-black/20 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[12px] font-bold tracking-wide text-[#c4b5fd]">
          <span>Crafting Luck</span>
          {selectedEntityForecast && (
            <span style={{ color: QUALITY_COLOURS[selectedEntityForecast.expectedQuality] || '#94a3b8' }}>
              CL {selectedEntityForecast.craftingLuck.toFixed(0)} → {selectedEntityForecast.expectedQualityLabel}
            </span>
          )}
        </div>
        <ForecastBar
          cap={forecast.cap}
          tiers={forecast.tiers}
          marker={selectedEntityForecast?.craftingLuck ?? null}
          qualityKey={selectedEntityForecast?.expectedQuality ?? null}
        />
        {selectedEntityForecast ? (
          <div className="flex flex-col gap-1.5">
            {selectedEntityForecast.probabilities.map((p) => (
              <div key={p.key} className="grid grid-cols-[80px_1fr_42px] items-center gap-2">
                <div
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: QUALITY_COLOURS[p.key] || '#94a3b8' }}
                >
                  {p.label}
                </div>
                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${p.probability * 100}%`, background: QUALITY_COLOURS[p.key] || '#475569' }}
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

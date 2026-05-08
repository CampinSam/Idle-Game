import { useMemo } from 'react';
import {
  mergeDisplayStyles,
  overlayToCss,
  textStyleToCss,
  type DisplayStyle,
} from '@derp/shared';
import { workshopParallelSlots, workshopTimerMultiplier } from '@derp/math';
import { Chip } from '../../../components/ui';
import { FORGE_FALLBACK, bgImageCss, type ForecastResponse } from './forgeUtils';

interface ForgeHeroProps {
  workshopInfo: any;
  workshopLevel: number;
  forecast: ForecastResponse | null;
  activeJobsCount: number;
}

export function ForgeHero({ workshopInfo, workshopLevel, forecast, activeJobsCount }: ForgeHeroProps) {
  const heroStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, workshopInfo?.displayDef?.style),
    [workshopInfo],
  );
  const heroOverlay = overlayToCss(heroStyle.overlay);
  const heroBgImage = workshopInfo?.displayDef?.backgroundImage || FORGE_FALLBACK.backgroundImage;
  const heroBorderColor = workshopInfo?.displayDef?.borderColor || FORGE_FALLBACK.borderColor;
  const heroTitleStyle = textStyleToCss(heroStyle.title);
  const heroBodyStyle = textStyleToCss(heroStyle.body);

  const tier = forecast?.workshopTier ?? Math.max(1, Number(workshopLevel || 1));
  const slotsTotal = forecast?.slotsTotal ?? workshopParallelSlots(tier);
  const slotsUsed = forecast?.slotsUsed ?? activeJobsCount;
  const multiplier = forecast?.timerMultiplier ?? workshopTimerMultiplier(tier);
  const speedupPct = Math.round((1 - multiplier) * 100);
  const slotsFull = slotsUsed >= slotsTotal;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-cover bg-center min-h-[200px] sm:min-h-[180px] flex-shrink-0 isolate pb-6 border-b-[rgba(249,115,22,0.55)]"
      style={{
        backgroundImage: bgImageCss(heroBgImage),
        borderColor: heroBorderColor,
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: heroOverlay || 'rgba(12,10,26,0.55)' }} />
      <div className="relative z-10 p-4 flex flex-col gap-2">
        <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#fcd34d]" style={heroBodyStyle}>
          ⚒️  {workshopInfo?.locationName ? workshopInfo.locationName.toUpperCase() : 'WORKSHOP'}
        </div>
        <h1
          className="m-0 font-cinzel text-[24px] font-black tracking-[0.04em] leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]"
          style={heroTitleStyle}
        >
          {workshopInfo?.name || 'The Forge'}
        </h1>
        <p className="m-0 text-[13px] leading-relaxed text-white/80" style={heroBodyStyle}>
          Crucibles roar, anvils sing. Pick a recipe, assign a Derp, and let server-side luck shape what you'll pull from the flames.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1" aria-label="Workshop perks">
          <Chip tone={(`tier-${Math.min(3, Math.max(1, tier))}` as 'tier-1' | 'tier-2' | 'tier-3')}>
            T{tier} Workshop
          </Chip>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide border ${
              slotsFull
                ? 'text-[#fca5a5] bg-[rgba(239,68,68,0.18)] border-[rgba(239,68,68,0.4)]'
                : 'text-[#86efac] bg-[rgba(16,185,129,0.18)] border-[rgba(16,185,129,0.4)]'
            }`}
          >
            {slotsUsed} / {slotsTotal} {slotsTotal === 1 ? 'slot' : 'slots'}
          </span>
          <Chip tone={speedupPct > 0 ? 'success' : 'neutral'}>
            {speedupPct > 0 ? `−${speedupPct}% craft time` : 'Standard craft time'}
          </Chip>
        </div>
      </div>
    </div>
  );
}

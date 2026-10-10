import { getDifficultyDisplay } from '@derp/shared';
import ItemQty from '../../../components/ItemQty';
import {
  DEFAULT_DISPLAY,
  DEFAULT_OVERLAY,
  bgImageCss,
  displayCssVars,
  meetsNonTeamRequirements,
  renderTags,
} from './missionUtils';

interface MissionsListProps {
  missions: any[];
  missionCategoryDefs: any[];
  currencyBalances: Record<string, number>;
  inventoryItems: Record<string, any>;
  onSelect: (id: string) => void;
}

export function MissionsList({
  missions,
  missionCategoryDefs,
  currencyBalances,
  inventoryItems,
  onSelect,
}: MissionsListProps) {
  const resolveDisplay = (def: any) => {
    const missionDisplay = def.display || {};
    const catDef = missionCategoryDefs.find((c: any) => c.id === def.missionCategoryDefId);
    const catDisplay = catDef?.displayDef || {};
    return {
      borderColor: missionDisplay.borderColor || catDisplay.borderColor || DEFAULT_DISPLAY.borderColor,
      backgroundImage: missionDisplay.backgroundImage || catDisplay.backgroundImage || DEFAULT_DISPLAY.backgroundImage,
      cardBackground: missionDisplay.cardBackground || catDisplay.cardBackground || DEFAULT_DISPLAY.cardBackground,
      style: missionDisplay.style || catDisplay.style || {},
    };
  };

  return (
    <div className="flex flex-col gap-2.5">
      {missions.map((def: any) => {
        const locked = !meetsNonTeamRequirements(def);
        const missionEnabled = def.enabled ?? true;
        const unavailable = locked || !missionEnabled;
        const diffInfo = getDifficultyDisplay(def.difficulty);
        const display = resolveDisplay(def);
        const { vars, overlay, titleStyle } = displayCssVars(display);
        const missionTags = def.tags || [];
        const listCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(def.cost) ? def.cost : [];
        const getListHave = (entry: { type: string; id: string }) =>
          entry.type === 'currency'
            ? (currencyBalances[entry.id] ?? 0)
            : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
        const bgImg = bgImageCss(display.backgroundImage);
        return (
          <div
            key={def.id}
            className={`relative overflow-hidden rounded-xl border-2 min-h-[110px] transition-all duration-200 motion-safe:animate-[card-enter_0.25s_ease-out_both] hover:not-disabled:brightness-110 hover:not-disabled:-translate-y-px ${unavailable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{
              backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
              borderColor: display.borderColor,
              ...vars,
            } as React.CSSProperties}
            onClick={() => !unavailable && onSelect(def.id)}
          >
            {bgImg && bgImg !== 'none' && (
              <div
                aria-hidden
                className="absolute inset-0 z-0"
                style={{
                  backgroundImage: bgImg,
                  backgroundPosition: 'var(--card-bg-position, center)',
                  backgroundSize: 'var(--card-bg-size, cover)',
                  backgroundRepeat: 'var(--card-bg-repeat, no-repeat)',
                }}
              />
            )}
            <div
              aria-hidden
              className="absolute inset-0 z-0 pointer-events-none"
              style={{ background: overlay ?? DEFAULT_OVERLAY }}
            />
            <div className="relative z-10 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 font-cinzel text-[15px] font-extrabold text-white tracking-[0.02em] truncate" style={titleStyle}>
                  {def.name}
                </h3>
                <span
                  className="text-[10px] font-extrabold tracking-wide uppercase px-2 py-0.5 rounded-full text-white whitespace-nowrap"
                  style={{ background: diffInfo.color }}
                >
                  {diffInfo.label}
                </span>
              </div>
              {missionTags.length > 0 && renderTags(missionTags)}
              {listCost.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {listCost.map((entry, i) => {
                    const have = getListHave(entry);
                    const canAffordEntry = have >= entry.amount;
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          canAffordEntry
                            ? 'text-white/90 bg-black/30'
                            : 'text-[#fca5a5] bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.35)]'
                        }`}
                      >
                        <ItemQty src={entry.id} amount={entry.amount} size={14} />
                      </span>
                    );
                  })}
                </div>
              )}
              {locked && (() => {
                const unmet: Array<{ label?: string; met: boolean }> =
                  Array.isArray(def.requirementStatus)
                    ? (def.requirementStatus as any[]).filter((r: any) => !r.met)
                    : [];
                const lockText = unmet.length > 0 && unmet[0].label
                  ? unmet.map((r) => r.label).join(', ')
                  : 'Requirements not met';
                return (
                  <div className="text-[11px] text-[#fbbf24] font-semibold mt-1">
                    🔒 {lockText}
                  </div>
                );
              })()}
              {!missionEnabled && !locked && (
                <div className="text-[11px] text-[#f87171] font-semibold mt-1">🚫 Currently Unavailable</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

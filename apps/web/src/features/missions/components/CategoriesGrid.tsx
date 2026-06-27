import { DEFAULT_DISPLAY, DEFAULT_OVERLAY, bgImageCss, displayCssVars, renderTags } from './missionUtils';

interface CategoryView {
  id: string;
  name: string;
  display: any;
  tags: any[];
  locked: boolean;
  enabled: boolean;
  hasChildren: boolean;
  inlineOnly: boolean;
  requirementStatus?: Array<{ label?: string; met: boolean }>;
}

interface CategoriesGridProps {
  visibleCategories: CategoryView[];
  getInlineMissions: (catId: string) => any[];
  getInlineLabel: (def: any) => string;
  currencyBalances: Record<string, number>;
  inventoryItems: Record<string, any>;
  onPushCategory: (catId: string) => void;
  onSelectInlineMission: (catId: string, missionId: string) => void;
}

export function CategoriesGrid({
  visibleCategories,
  getInlineMissions,
  getInlineLabel,
  currencyBalances,
  inventoryItems,
  onPushCategory,
  onSelectInlineMission,
}: CategoriesGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {visibleCategories.map((cat) => {
        const display = cat.display;
        const { vars, overlay, titleStyle } = displayCssVars(display);
        const unavailable = cat.locked || !cat.enabled;
        const inlineMissions = getInlineMissions(cat.id);
        const navigable = !cat.inlineOnly;
        const bgImg = bgImageCss(display.backgroundImage);
        const inlineButtonsCfg = display.style?.inlineButtons || {};
        const bottomPlacement = !unavailable && inlineMissions.length > 0 && inlineButtonsCfg.placement === 'bottom';
        return (
          <div
            key={cat.id}
            className={`relative overflow-hidden rounded-xl border-2 min-h-[110px] transition-all duration-200 motion-safe:animate-[card-enter_0.25s_ease-out_both] ${bottomPlacement ? 'flex flex-col' : ''} ${unavailable ? 'opacity-60' : 'hover:brightness-110 hover:-translate-y-px'}`}
            style={{
              backgroundColor: display.cardBackground || DEFAULT_DISPLAY.cardBackground,
              borderColor: display.borderColor,
              cursor: navigable && !unavailable ? 'pointer' : 'default',
              ...vars,
            } as React.CSSProperties}
            onClick={() => navigable && !unavailable && onPushCategory(cat.id)}
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
            <div className={`relative z-10 p-3 flex flex-col gap-2 ${bottomPlacement ? 'flex-1' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 font-cinzel text-[15px] font-extrabold text-white tracking-[0.02em] truncate" style={titleStyle}>
                  {cat.name}
                </h3>
                {cat.hasChildren && navigable && (
                  <span className="text-white/60 text-lg font-bold leading-none">›</span>
                )}
              </div>
              {cat.tags.length > 0 && renderTags(cat.tags)}
              {cat.locked && (() => {
                const unmet = (cat.requirementStatus ?? []).filter((r) => !r.met);
                const lockText = unmet.length > 0 && unmet[0].label
                  ? unmet.map((r) => r.label).join(', ')
                  : 'Requirements not met';
                return (
                  <div className="text-[11px] text-[#fbbf24] font-semibold mt-1">🔒 {lockText}</div>
                );
              })()}
              {!cat.enabled && !cat.locked && (
                <div className="text-[11px] text-[#f87171] font-semibold mt-1">🚫 Currently Unavailable</div>
              )}
              {!unavailable && inlineMissions.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 ${bottomPlacement ? 'mt-auto pt-1' : 'mt-1.5'}`} onClick={(e) => e.stopPropagation()}>
                  {inlineMissions.map((def: any) => {
                    const inlineCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(def.cost) ? def.cost : [];
                    const isDisabled = def.enabled === false;
                    const canAffordInline = !isDisabled && inlineCost.every((entry) => {
                      const have = entry.type === 'currency'
                        ? (currencyBalances[entry.id] ?? 0)
                        : Object.values(inventoryItems).filter((it: any) => it.definitionId === entry.id).reduce((s: number, it: any) => s + (it.quantity ?? 1), 0);
                      return have >= entry.amount;
                    });
                    const customState = isDisabled
                      ? (inlineButtonsCfg.disabled || null)
                      : canAffordInline
                        ? (inlineButtonsCfg.normal || null)
                        : (inlineButtonsCfg.requirementsNotMet || null);
                    const buttonStyle: React.CSSProperties = {};
                    if (canAffordInline && !customState?.background) {
                      buttonStyle.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
                    }
                    if (customState?.background) buttonStyle.background = customState.background;
                    if (customState?.color) buttonStyle.color = customState.color;
                    if (customState?.borderColor) buttonStyle.borderColor = customState.borderColor;
                    if (customState?.opacity != null) buttonStyle.opacity = customState.opacity;
                    const buttonClassName = `px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase border transition-[filter,transform] active:scale-95 ${
                      isDisabled
                        ? 'text-white/30 border-white/10 bg-[#3f3f46] cursor-not-allowed'
                        : canAffordInline
                          ? 'text-white border-[#a78bfa] hover:brightness-110 cursor-pointer'
                          : 'text-white/50 border-white/20 bg-[#3f3f46] cursor-pointer'
                    }`;
                    return (
                      <button
                        key={def.id}
                        title={!canAffordInline && !isDisabled ? 'View requirements' : undefined}
                        disabled={isDisabled}
                        onClick={() => !isDisabled && onSelectInlineMission(cat.id, def.id)}
                        className={buttonClassName}
                        style={buttonStyle}
                      >
                        {getInlineLabel(def)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

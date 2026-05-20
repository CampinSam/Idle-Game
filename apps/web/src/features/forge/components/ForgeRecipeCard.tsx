import ItemQty from '../../../components/ItemQty';
import { fmtSeconds } from './forgeUtils';

interface ForgeRecipeCardProps {
  recipe: any | null;
  isActive: boolean;
  multicraft: any | null;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onClick: () => void;
  /** Live requirement status from job preview. */
  requirements?: Array<{ label: string; met: boolean }>;
}

export function ForgeRecipeCard({
  recipe,
  isActive,
  multicraft,
  quantity,
  onQuantityChange,
  onClick,
  requirements = [],
}: ForgeRecipeCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={recipe ? `Change recipe (${recipe.name})` : 'Choose recipe'}
      className={`text-left rounded-[14px] border p-3 flex flex-col gap-2 transition-[border-color,filter] cursor-pointer hover:brightness-110 min-h-[148px] ${
        isActive
          ? 'border-[rgba(167,139,250,0.75)] bg-[rgba(139,92,246,0.13)]'
          : recipe
            ? ''
            : 'border-dashed border-white/20 bg-white/[0.02]'
      }`}
      style={recipe ? {
        background: recipe.displayDef?.cardBackground
          || 'linear-gradient(160deg,rgba(249,115,22,0.12) 0%,rgba(34,24,88,0.85) 100%)',
        borderColor: isActive
          ? 'rgba(167,139,250,0.75)'
          : (recipe.displayDef?.borderColor || 'rgba(249,115,22,0.45)'),
      } : undefined}
    >
      {recipe ? (
        <>
          {/* Category + tier row */}
          <div className="flex items-center justify-between gap-1">
            <div className="text-[9px] font-extrabold tracking-[0.12em] uppercase text-[#fcd34d]">
              {recipe.category || recipe.group || 'General'}
            </div>
            {recipe.tier && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[rgba(139,92,246,0.25)] border border-[rgba(139,92,246,0.4)] text-[#c4b5fd]">
                T{recipe.tier}
              </span>
            )}
          </div>

          {/* Recipe name */}
          <div className="text-[13px] font-cinzel font-extrabold text-white leading-snug line-clamp-2">
            {recipe.name}
          </div>

          {/* Description */}
          {recipe.description && (
            <div className="text-[10px] text-white/55 line-clamp-2 leading-relaxed">
              {recipe.description}
            </div>
          )}

          {/* Requirements from live preview */}
          {requirements.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {requirements.slice(0, 2).map((req, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className="text-[11px] leading-none flex-shrink-0">{req.met ? '✅' : '❌'}</span>
                  <span style={{ color: req.met ? '#6ee7b7' : '#fca5a5' }} className="truncate">
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Cost + duration */}
          <div className="mt-auto flex items-center justify-between gap-1 flex-wrap">
            <span className="flex items-center gap-0.5">
              {(recipe.cost ?? []).length === 0
                ? <span className="text-[10px] text-white/50">Free</span>
                : (recipe.cost ?? []).map((c: any, i: number) => (
                    <ItemQty key={i} src={c.id} amount={c.amount} size={12} />
                  ))}
            </span>
            <span className="text-[10px] text-white/45 tabular-nums flex-shrink-0">
              {fmtSeconds(recipe.timer?.duration ?? 0)}
            </span>
          </div>

          {/* Quantity selector */}
          {multicraft && (
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[9px] font-bold text-[#c4b5fd] uppercase tracking-wide">Qty</span>
              {multicraft.mode === 'tiers' && Array.isArray(multicraft.tiers) ? (
                <div className="flex gap-1">
                  {(multicraft.tiers as number[]).map((qty: number) => (
                    <button
                      key={qty}
                      onClick={(e) => { e.stopPropagation(); onQuantityChange(qty); }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        quantity === qty
                          ? 'bg-[rgba(139,92,246,0.35)] border-[rgba(139,92,246,0.8)] text-white'
                          : 'bg-black/20 border-white/15 text-slate-400'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuantityChange(Math.max(1, quantity - 1)); }}
                    className="w-5 h-5 rounded border border-white/15 bg-black/20 text-slate-300 text-[12px] flex items-center justify-center cursor-pointer"
                  >−</button>
                  <span className="w-5 text-center text-[10px] font-bold text-white tabular-nums">{quantity}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuantityChange(Math.min(multicraft.max ?? 99, quantity + 1)); }}
                    className="w-5 h-5 rounded border border-white/15 bg-black/20 text-slate-300 text-[12px] flex items-center justify-center cursor-pointer"
                  >+</button>
                </div>
              )}
            </div>
          )}

          <div className="text-[9px] text-white/35 italic">tap to change</div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-2">
          <span className="text-[28px]">📜</span>
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide text-center">
            Choose Recipe
          </span>
        </div>
      )}
    </button>
  );
}

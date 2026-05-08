import { mergeDisplayStyles, textStyleToCss, type DisplayStyle } from '@derp/shared';
import ItemQty from '../../../components/ItemQty';
import { Chip, EmptyState } from '../../../components/ui';
import { computeInventoryAmount } from '../../../utils/locationProduction';
import { fmtSeconds, type ForecastResponse } from './forgeUtils';

interface ForgeRecipePickerProps {
  recipes: any[];
  selectedRecipeId: string | null;
  recipeSearch: string;
  setRecipeSearch: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  availabilityFilter: 'available' | 'locked' | 'favorites' | 'all';
  setAvailabilityFilter: (v: 'available' | 'locked' | 'favorites' | 'all') => void;
  recipeCategories: string[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
  onSelect: (r: any) => void;
  recipeIsLocked: (r: any) => boolean;
  currencyBalances: Record<string, number>;
  syncItemsTable: any;
  profile: any;
  forecast: ForecastResponse | null;
}

export function ForgeRecipePicker({
  recipes,
  selectedRecipeId,
  recipeSearch,
  setRecipeSearch,
  categoryFilter,
  setCategoryFilter,
  availabilityFilter,
  setAvailabilityFilter,
  recipeCategories,
  favorites,
  onToggleFavorite,
  onClose,
  onSelect,
  recipeIsLocked,
  currencyBalances,
  syncItemsTable,
  profile,
  forecast,
}: ForgeRecipePickerProps) {
  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.3)] bg-black/30 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd] font-cinzel">
          Select a Recipe
        </h3>
        <button
          onClick={onClose}
          aria-label="Close recipe picker"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white text-lg leading-none hover:bg-white/10 cursor-pointer"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Search recipes…"
          value={recipeSearch}
          onChange={(e) => setRecipeSearch(e.target.value)}
          aria-label="Search recipes"
          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-text-primary text-[13px] placeholder:text-text-secondary focus:outline-none focus:border-[rgba(167,139,250,0.5)]"
        />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Availability filter">
          {(['available', 'locked', 'favorites', 'all'] as const).map((key) => {
            const isActive = availabilityFilter === key;
            const label = key === 'all' ? 'All' : key === 'available' ? '✓ Available' : key === 'locked' ? '🔒 Locked' : '★ Favorites';
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setAvailabilityFilter(key)}
                className="cursor-pointer p-0 bg-transparent border-0"
              >
                <Chip tone={isActive ? 'tier-2' : 'neutral'}>{label}</Chip>
              </button>
            );
          })}
        </div>
        {recipeCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category filter">
            <button
              role="tab"
              aria-selected={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              className="cursor-pointer p-0 bg-transparent border-0"
            >
              <Chip tone={categoryFilter === 'all' ? 'tier-2' : 'neutral'}>All</Chip>
            </button>
            {recipeCategories.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                className="cursor-pointer p-0 bg-transparent border-0"
              >
                <Chip tone={categoryFilter === cat ? 'tier-2' : 'neutral'}>{cat}</Chip>
              </button>
            ))}
          </div>
        )}
      </div>
      {recipes.length === 0 && <EmptyState message="No recipes match your search." />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {recipes.map((r: any) => {
          const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
          const canAfford = cost.every((c) =>
            c.type === 'currency'
              ? (currencyBalances[c.id] ?? 0) >= c.amount
              : computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances) >= c.amount);
          const meetsLevel = !profile || profile.keeperLevel >= (r.requiredKeeperLevel || 1);
          const isLocked = recipeIsLocked(r);
          const recipeTierNum = Number(r.tier ?? 1);
          const tierCap = forecast?.recipeTierCap;
          const tierLocked = typeof tierCap === 'number' && recipeTierNum > tierCap;
          const dd = r.displayDef;
          const cardStyle: DisplayStyle = mergeDisplayStyles(undefined, dd?.style);
          const isFav = favorites.has(r.id);
          return (
            <div key={r.id} className="relative">
              <button
                onClick={() => onSelect(r)}
                title={
                  !meetsLevel
                    ? `Requires Keeper Lvl ${r.requiredKeeperLevel}`
                    : tierLocked
                      ? `Requires Tier ${recipeTierNum} Workshop`
                      : undefined
                }
                className={`w-full text-left p-3 rounded-xl border transition-[border-color,filter] hover:brightness-110 cursor-pointer flex flex-col gap-1.5 ${
                  selectedRecipeId === r.id ? 'ring-2 ring-[rgba(167,139,250,0.6)]' : ''
                } ${isLocked ? 'opacity-55 grayscale-[40%]' : ''}`}
                style={{
                  background: dd?.cardBackground || 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(34,24,88,0.6))',
                  borderColor: dd?.borderColor || 'rgba(139,92,246,0.45)',
                }}
              >
                <div className="font-cinzel text-[14px] font-extrabold text-white tracking-[0.02em] truncate" style={textStyleToCss(cardStyle.title) as React.CSSProperties}>
                  {r.name}
                </div>
                {r.description && (
                  <div className="text-[11px] leading-relaxed text-white/70 line-clamp-2" style={textStyleToCss(cardStyle.body) as React.CSSProperties}>
                    {r.description}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      canAfford ? 'text-white/90' : 'text-[#fca5a5]'
                    }`}
                  >
                    {cost.length === 0
                      ? 'Free'
                      : cost.map((c, ci) => (
                          <ItemQty key={ci} src={c.id} amount={c.amount} size={12} />
                        ))}
                  </span>
                  <span className="text-[11px] font-bold text-text-secondary tabular-nums">{fmtSeconds(r.timer?.duration ?? 0)}</span>
                  {!meetsLevel && (
                    <span className="text-[10px] font-extrabold tracking-wide uppercase text-[#fbbf24] bg-[rgba(245,158,11,0.15)] px-2 py-0.5 rounded">
                      Lvl {r.requiredKeeperLevel}
                    </span>
                  )}
                  {tierLocked && (
                    <span className="text-[10px] font-extrabold tracking-wide uppercase text-[#f87171] bg-[rgba(239,68,68,0.15)] px-2 py-0.5 rounded">
                      Needs T{recipeTierNum} Workshop
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(r.id); }}
                aria-label={isFav ? 'Unfavorite recipe' : 'Favorite recipe'}
                aria-pressed={isFav}
                type="button"
                className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-base leading-none border transition-colors cursor-pointer ${
                  isFav
                    ? 'text-[#fcd34d] bg-[rgba(252,211,77,0.15)] border-[rgba(252,211,77,0.45)]'
                    : 'text-white/60 bg-black/30 border-white/15 hover:text-white'
                }`}
              >
                {isFav ? '★' : '☆'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

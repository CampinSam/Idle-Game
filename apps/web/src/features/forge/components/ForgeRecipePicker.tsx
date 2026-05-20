import { mergeDisplayStyles, textStyleToCss, type DisplayStyle } from '@derp/shared';
import ItemQty from '../../../components/ItemQty';
import { EmptyState } from '../../../components/ui';
import { computeInventoryAmount } from '../../../utils/locationProduction';
import { fmtSeconds, type ForecastResponse } from './forgeUtils';

interface ForgeRecipePickerProps {
  recipes: any[];
  selectedRecipeId: string | null;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onSelect: (r: any) => void;
  recipeIsLocked: (r: any) => boolean;
  currencyBalances: Record<string, number>;
  syncItemsTable: any;
  profile: any;
  forecast: ForecastResponse | null;
}

function RecipeGrid({
  recipes,
  selectedRecipeId,
  favorites,
  onToggleFavorite,
  onSelect,
  recipeIsLocked,
  currencyBalances,
  syncItemsTable,
  profile,
  forecast,
}: Pick<
  ForgeRecipePickerProps,
  'recipes' | 'selectedRecipeId' | 'favorites' | 'onToggleFavorite' | 'onSelect' |
  'recipeIsLocked' | 'currencyBalances' | 'syncItemsTable' | 'profile' | 'forecast'
>) {
  if (recipes.length === 0) return <EmptyState message="No recipes match your search." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {recipes.map((r: any) => {
        const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
        const canAfford = cost.every((c) =>
          c.type === 'currency'
            ? (currencyBalances[c.id] ?? 0) >= c.amount
            : computeInventoryAmount('ITEM', c.id, syncItemsTable, currencyBalances) >= c.amount);
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
                tierLocked
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
              <div
                className="font-cinzel text-[14px] font-extrabold text-white tracking-[0.02em] truncate"
                style={textStyleToCss(cardStyle.title) as React.CSSProperties}
              >
                {r.name}
              </div>
              {r.description && (
                <div
                  className="text-[11px] leading-relaxed text-white/70 line-clamp-2"
                  style={textStyleToCss(cardStyle.body) as React.CSSProperties}
                >
                  {r.description}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${canAfford ? 'text-white/90' : 'text-[#fca5a5]'}`}>
                  {cost.length === 0
                    ? 'Free'
                    : cost.map((c, ci) => <ItemQty key={ci} src={c.id} amount={c.amount} size={12} />)}
                </span>
                <span className="text-[11px] font-bold text-text-secondary tabular-nums">
                  {fmtSeconds(r.timer?.duration ?? 0)}
                </span>
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
  );
}

export function ForgeRecipePicker({
  recipes,
  selectedRecipeId,
  favorites,
  onToggleFavorite,
  onSelect,
  recipeIsLocked,
  currencyBalances,
  syncItemsTable,
  profile,
  forecast,
}: ForgeRecipePickerProps) {
  return (
    <RecipeGrid
      recipes={recipes}
      selectedRecipeId={selectedRecipeId}
      favorites={favorites}
      onToggleFavorite={onToggleFavorite}
      onSelect={onSelect}
      recipeIsLocked={recipeIsLocked}
      currencyBalances={currencyBalances}
      syncItemsTable={syncItemsTable}
      profile={profile}
      forecast={forecast}
    />
  );
}

import { EntityList } from '../../entities/components';
import { buildCollectionOptions, SORT_OPTIONS } from '../../entities/entityListUtils';
import type { EntityFilter, EntitySortBy } from '../../entities/types';
import { ForgeRecipePicker } from './ForgeRecipePicker';
import { QUALITY_COLOURS } from './forgeUtils';
import { ListControls } from '../../../components/ui';

export type RecipeSort = 'name-asc' | 'name-desc' | 'tier-asc' | 'tier-desc';

const AVAILABILITY_OPTIONS = [
  { key: 'available', label: '✓ Available' },
  { key: 'locked', label: '🔒 Locked' },
  { key: 'favorites', label: '★ Favorites' },
  { key: 'all', label: 'All' },
];

const RECIPE_SORT_OPTIONS = [
  { key: 'name-asc', label: 'Name A→Z' },
  { key: 'name-desc', label: 'Name Z→A' },
  { key: 'tier-asc', label: 'Tier ↑' },
  { key: 'tier-desc', label: 'Tier ↓' },
];

interface ForgePickerAreaProps {
  activePicker: 'recipe' | 'entity' | null;
  /** If undefined, no close button is rendered (e.g. when picker is mandatory). */
  onClose?: () => void;

  // Recipe picker props (filter state lives in parent — controlled)
  recipes: any[];
  selectedRecipeId: string | null;
  recipeSearch: string;
  setRecipeSearch: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  availabilityFilter: 'available' | 'locked' | 'favorites' | 'all';
  setAvailabilityFilter: (v: 'available' | 'locked' | 'favorites' | 'all') => void;
  recipeSort: RecipeSort;
  setRecipeSort: (v: RecipeSort) => void;
  recipeCategories: string[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onRecipeSelect: (r: any) => void;
  recipeIsLocked: (r: any) => boolean;
  currencyBalances: Record<string, number>;
  syncItemsTable: any;
  profile: any;

  // Entity picker props
  idleEntities: any[];
  selectedEntityId: string | null;
  entitySearch: string;
  setEntitySearch: (v: string) => void;
  entityFilter: EntityFilter;
  setEntityFilter: (v: EntityFilter) => void;
  entitySort: EntitySortBy;
  setEntitySort: (v: EntitySortBy) => void;
  onEntitySelect: (entity: any) => void;
}

/**
 * Renders the recipe or entity picker with a sticky filter/search bar.
 *
 * Layout contract:
 *   - The sticky bar has `position: sticky; top: 0` so it pins to the top of the
 *     nearest scroll ancestor (ForgePage's `overflow-y-auto` container).
 *   - ForgePickerArea must NOT have `overflow: hidden` — that would clip the sticky bar.
 *   - When `activePicker === null` nothing is rendered.
 */
export function ForgePickerArea({
  activePicker,
  onClose,
  recipes,
  selectedRecipeId,
  recipeSearch,
  setRecipeSearch,
  categoryFilter,
  setCategoryFilter,
  availabilityFilter,
  setAvailabilityFilter,
  recipeSort,
  setRecipeSort,
  recipeCategories,
  favorites,
  onToggleFavorite,
  onRecipeSelect,
  recipeIsLocked,
  currencyBalances,
  syncItemsTable,
  profile,
  idleEntities,
  selectedEntityId,
  entitySearch,
  setEntitySearch,
  entityFilter,
  setEntityFilter,
  entitySort,
  setEntitySort,
  onEntitySelect,
}: ForgePickerAreaProps) {
  if (activePicker === null) return null;

  const STICKY_BG = 'bg-[rgba(20,16,56,0.97)]';

  if (activePicker === 'recipe') {
    const categorySelects = recipeCategories.length > 1
      ? [{
          label: 'Category',
          value: categoryFilter,
          onChange: setCategoryFilter,
          options: [{ key: 'all', label: 'All' }, ...recipeCategories.map((c) => ({ key: c, label: c }))],
          width: 100,
        }]
      : [];

    return (
      <div className="rounded-xl border border-[rgba(139,92,246,0.3)]">
        {/* ── Sticky filter header — pins to scroll container top when recipe list scrolls ── */}
        <div
          className={`sticky top-0 z-10 ${STICKY_BG} border-b border-[rgba(139,92,246,0.18)] px-3 pt-3 pb-2.5 rounded-t-xl flex flex-col gap-2`}
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}
        >
          {/* Row: title + close */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd] font-cinzel">
              Select a Recipe
            </h3>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close recipe picker"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white text-lg leading-none hover:bg-white/10 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Search + availability + category (conditional) + sort */}
          <ListControls
            search={{ value: recipeSearch, onChange: setRecipeSearch, placeholder: 'Search recipes…' }}
            selects={[
              {
                label: 'Availability filter',
                value: availabilityFilter,
                onChange: (v) => setAvailabilityFilter(v as 'available' | 'locked' | 'favorites' | 'all'),
                options: AVAILABILITY_OPTIONS,
                width: 112,
              },
              ...categorySelects,
              {
                label: 'Sort recipes',
                value: recipeSort,
                onChange: (v) => setRecipeSort(v as RecipeSort),
                options: RECIPE_SORT_OPTIONS,
                width: 100,
              },
            ]}
          />
        </div>

        {/* ── Recipe grid — scrolls under the sticky header ── */}
        <div className="bg-black/30 rounded-b-xl p-3">
          <ForgeRecipePicker
            recipes={recipes}
            selectedRecipeId={selectedRecipeId}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onSelect={onRecipeSelect}
            recipeIsLocked={recipeIsLocked}
            currencyBalances={currencyBalances}
            syncItemsTable={syncItemsTable}
            profile={profile}
            forecast={null}
          />
        </div>
      </div>
    );
  }

  // Entity picker
  const collectionOptions = buildCollectionOptions(idleEntities);

  return (
    <div className="rounded-xl border border-[rgba(96,165,250,0.3)]">
      {/* ── Sticky filter header ── */}
      <div
        className={`sticky top-0 z-10 ${STICKY_BG} border-b border-[rgba(96,165,250,0.18)] px-3 pt-3 pb-2.5 rounded-t-xl flex flex-col gap-2`}
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#93c5fd] font-cinzel">
            Select a Derp
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close Derp picker"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white text-lg leading-none hover:bg-white/10 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Search + collection filter + sort */}
        <ListControls
          search={{ value: entitySearch, onChange: setEntitySearch, placeholder: 'Search…' }}
          selects={[
            {
              label: 'Filter by collection',
              value: entityFilter,
              onChange: (v) => setEntityFilter(v as EntityFilter),
              options: collectionOptions,
              width: 90,
            },
            {
              label: 'Sort by',
              value: entitySort,
              onChange: (v) => setEntitySort(v as EntitySortBy),
              options: SORT_OPTIONS,
              width: 108,
            },
          ]}
        />

        <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary">
          Tap to select · idle Derps only
        </span>
      </div>

      {/* ── Entity list — scrolls under the sticky header ── */}
      <div className="bg-black/30 rounded-b-xl px-3 pt-2 pb-3">
        <EntityList
          entities={idleEntities}
          mode="picker"
          useCase="forge"
          showControls={false}
          search={entitySearch}
          onSearchChange={setEntitySearch}
          activeFilter={entityFilter}
          onFilterChange={setEntityFilter}
          sortBy={entitySort}
          onSortChange={setEntitySort}
          selectedIds={selectedEntityId ? [selectedEntityId] : []}
          onSelect={onEntitySelect}
          qualityColors={QUALITY_COLOURS}
          emptyMessage="No idle Derps. Pull one back from a mission."
        />
      </div>
    </div>
  );
}

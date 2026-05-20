import { EntityList } from '../../entities/components';
import { buildCollectionOptions, SORT_OPTIONS } from '../../entities/entityListUtils';
import type { EntityFilter, EntitySortBy } from '../../entities/types';
import { ForgeRecipePicker } from './ForgeRecipePicker';
import { QUALITY_COLOURS } from './forgeUtils';
import { Chip } from '../../../components/ui';

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

          {/* Search */}
          <div className="flex items-center gap-[7px] bg-black/30 border border-[rgba(139,92,246,0.2)] rounded-lg px-2.5 h-9 focus-within:border-[rgba(139,92,246,0.5)]">
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-text-secondary flex-shrink-0"
            >
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search recipes…"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              aria-label="Search recipes"
              className="flex-1 bg-transparent border-none text-text-primary text-[12px] outline-none placeholder:text-text-secondary"
            />
          </div>

          {/* Availability filter chips */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Availability filter">
            {(['available', 'locked', 'favorites', 'all'] as const).map((key) => {
              const isActive = availabilityFilter === key;
              const label = key === 'available' ? '✓ Available'
                : key === 'locked' ? '🔒 Locked'
                : key === 'favorites' ? '★ Favorites'
                : 'All';
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

          {/* Category chips */}
          {recipeCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category filter">
              {['all', ...recipeCategories].map((cat) => {
                const isActive = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setCategoryFilter(cat)}
                    className="cursor-pointer p-0 bg-transparent border-0"
                  >
                    <Chip tone={isActive ? 'tier-2' : 'neutral'}>
                      {cat === 'all' ? 'All' : cat}
                    </Chip>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recipe grid — scrolls under the sticky header ── */}
        <div className="bg-black/30 rounded-b-xl p-3">
          <ForgeRecipePicker
            recipes={recipes}
            selectedRecipeId={selectedRecipeId}
            recipeSearch={recipeSearch}
            setRecipeSearch={setRecipeSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            availabilityFilter={availabilityFilter}
            setAvailabilityFilter={setAvailabilityFilter}
            recipeCategories={recipeCategories}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onClose={onClose ?? (() => {})}
            onSelect={onRecipeSelect}
            recipeIsLocked={recipeIsLocked}
            currencyBalances={currencyBalances}
            syncItemsTable={syncItemsTable}
            profile={profile}
            forecast={null}
            hideControls
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
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-[7px] bg-black/30 border border-[rgba(96,165,250,0.2)] rounded-lg px-2.5 h-9 focus-within:border-[rgba(96,165,250,0.5)]">
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-text-secondary flex-shrink-0"
            >
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
              className="flex-1 bg-transparent border-none text-text-primary text-[12px] outline-none placeholder:text-text-secondary"
            />
          </div>
          <select
            className="entity-list__select entity-list__select--collection"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
            aria-label="Filter by collection"
          >
            {collectionOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <select
            className="entity-list__select entity-list__select--sort"
            value={entitySort}
            onChange={(e) => setEntitySort(e.target.value as EntitySortBy)}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        <span className="text-[10px] font-extrabold tracking-widest uppercase text-text-secondary">
          Tap to select · idle Derps only
        </span>
      </div>

      {/* ── Entity list — scrolls under the sticky header ── */}
      <div className="bg-black/30 rounded-b-xl px-3 pt-2 pb-3">
        <EntityList
          entities={idleEntities}
          mode="picker"
          useCase="crafting"
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

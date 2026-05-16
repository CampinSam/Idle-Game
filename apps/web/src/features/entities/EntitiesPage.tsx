import { useState, useMemo } from "react";
import { useSyncEntities, useSyncStatus } from "../../hooks/useSyncSelectors";
import { EntityList } from "./components";
import { normalizeFilter } from "./entityListUtils";
import type { EntityFilter, EntitySortBy } from "./types";

function EntitiesPageSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
        <div className="entity-list__controls">
          <div
            className="skeleton"
            style={{ flex: 1, height: 34, borderRadius: 8 }}
          />
          <div
            className="skeleton"
            style={{ width: 90, height: 34, borderRadius: 8 }}
          />
          <div
            className="skeleton"
            style={{ width: 108, height: 34, borderRadius: 8 }}
          />
        </div>
        <div
          className="entity-list__grid"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 180, borderRadius: 12 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const STORAGE_KEY_FILTER = "entities_activeFilter";
const STORAGE_KEY_SORT = "entities_sortBy";
const STORAGE_KEY_SEARCH = "entities_searchQuery";

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readFilter(): EntityFilter {
  return safeLocalStorageGet(STORAGE_KEY_FILTER) ?? "ALL";
}

function readSort(): EntitySortBy {
  const stored = safeLocalStorageGet(STORAGE_KEY_SORT);
  if (
    stored === "name" ||
    stored === "level" ||
    stored === "power" ||
    stored === "collection"
  )
    return stored;
  return "name";
}

function readSearch(): string {
  return safeLocalStorageGet(STORAGE_KEY_SEARCH) ?? "";
}

export default function EntitiesPage() {
  const entities = useSyncEntities();
  const syncStatus = useSyncStatus();
  const [activeFilter, setActiveFilter] = useState<EntityFilter>(readFilter);
  const [searchQuery, setSearchQuery] = useState<string>(readSearch);
  const [sortBy, setSortBy] = useState<EntitySortBy>(readSort);

  const validFilter = useMemo(
    () => normalizeFilter(activeFilter, entities),
    [activeFilter, entities],
  );

  function handleFilterChange(filter: EntityFilter) {
    safeLocalStorageSet(STORAGE_KEY_FILTER, filter);
    setActiveFilter(filter);
  }

  function handleSortChange(sort: EntitySortBy) {
    safeLocalStorageSet(STORAGE_KEY_SORT, sort);
    setSortBy(sort);
  }

  function handleSearchChange(q: string) {
    safeLocalStorageSet(STORAGE_KEY_SEARCH, q);
    setSearchQuery(q);
  }

  if (syncStatus === "disconnected") return <EntitiesPageSkeleton />;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
        <EntityList
          entities={entities}
          mode="display"
          useCase="browse"
          showControls
          activeFilter={validFilter}
          onFilterChange={handleFilterChange}
          search={searchQuery}
          onSearchChange={handleSearchChange}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          emptyMessage="No entities found."
        />
      </div>
    </div>
  );
}

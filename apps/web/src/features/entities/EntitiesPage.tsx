import { useState } from "react";
import { useSyncEntities, useSyncStatus } from "../../hooks/useSyncSelectors";
import { EntityList } from "./components";
import type { EntityFilter, EntitySortBy } from "./types";
import "./EntitiesPage.css";

function EntitiesPageSkeleton() {
  return (
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
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
  const stored = safeLocalStorageGet(STORAGE_KEY_FILTER);
  if (
    stored === "ALL" ||
    stored === "DERPS" ||
    stored === "VAMPS" ||
    stored === "PREDS"
  )
    return stored;
  return "ALL";
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
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
        <EntityList
          entities={entities}
          mode="display"
          useCase="browse"
          showControls
          activeFilter={activeFilter}
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

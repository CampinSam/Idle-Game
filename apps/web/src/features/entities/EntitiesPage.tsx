import { useState } from 'react';
import { useSyncEntities, useSyncStatus } from '../../hooks/useSyncSelectors';
import { EntityList } from './components';
import type { EntityFilter } from './types';
import './EntitiesPage.css';

function EntitiesPageSkeleton() {
  return (
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
        <div className="entity-list__filter-strip">
          {['ALL', 'DERPS', 'VAMPS', 'PREDS'].map((t) => (
            <div key={t} className="entity-list__filter-tab" />
          ))}
        </div>
        <div className="entity-list__search-row">
          <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 8 }} />
        </div>
        <div className="entity-list__grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EntitiesPage() {
  const entities = useSyncEntities();
  const syncStatus = useSyncStatus();
  const [activeFilter, setActiveFilter] = useState<EntityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  if (syncStatus === 'disconnected') return <EntitiesPageSkeleton />;

  return (
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
        <EntityList
          entities={entities}
          mode="display"
          useCase="browse"
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          showFilterTabs
          search={searchQuery}
          onSearchChange={setSearchQuery}
          showSearchBar
          emptyMessage="No entities found."
        />
      </div>
    </div>
  );
}

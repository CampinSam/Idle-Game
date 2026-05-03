import { useState } from 'react';
import { useSyncEntities, useSyncStatus } from '../../hooks/useSyncSelectors';
import { EntityList } from './components';
import type { EntityFilter, EntitySortBy } from './types';
import './EntitiesPage.css';

function EntitiesPageSkeleton() {
  return (
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
        <div className="entity-list__controls">
          <div className="skeleton" style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 90, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 108, height: 34, borderRadius: 8 }} />
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
  const [sortBy, setSortBy] = useState<EntitySortBy>('name');

  if (syncStatus === 'disconnected') return <EntitiesPageSkeleton />;

  return (
    <div className="entities-page page-transition-wrapper">
      <div className="entities-wrapper-card">
        <EntityList
          entities={entities}
          mode="display"
          useCase="browse"
          showControls
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          search={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          emptyMessage="No entities found."
        />
      </div>
    </div>
  );
}

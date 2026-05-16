import type { EntityFilter, EntitySortBy } from './types';
import { getEntityKind, getKindMeta } from './registry';
import { getEntityPower } from './utils';

export interface CollectionOption {
  key: EntityFilter;
  label: string;
}

const ALL_OPTION: CollectionOption = { key: 'ALL', label: 'All' };

export function buildCollectionOptions(entities: any[]): CollectionOption[] {
  const seen = new Set<string>();
  const options: CollectionOption[] = [ALL_OPTION];
  for (const entity of entities) {
    const kind = getEntityKind(entity);
    if (kind && !seen.has(kind)) {
      seen.add(kind);
      const meta = getKindMeta(kind);
      options.push({ key: kind, label: meta.label });
    }
  }
  return options;
}

export const SORT_OPTIONS: Array<{ key: EntitySortBy; label: string }> = [
  { key: 'name',       label: 'Name (A–Z)' },
  { key: 'level',      label: 'Level' },
  { key: 'power',      label: 'Power Score' },
  { key: 'collection', label: 'Collection' },
];

export function normalizeFilter(stored: string | null, entities: any[]): EntityFilter {
  if (!stored || stored === 'ALL') return 'ALL';
  const options = buildCollectionOptions(entities);
  return options.some((o) => o.key === stored) ? stored : 'ALL';
}

export function passesFilter(entity: any, filter: EntityFilter): boolean {
  if (filter === 'ALL') return true;
  return getEntityKind(entity) === filter;
}

export function collectionBucket(entity: any): number {
  const kind = getEntityKind(entity);
  if (!kind) return 99;
  return kind.charCodeAt(0);
}

export function getFilteredSortedEntities(
  entities: any[],
  filter: EntityFilter,
  search: string,
  sortBy: EntitySortBy,
): any[] {
  let list = entities.filter((e) => passesFilter(e, filter));

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter((e: any) => (e.name || '').toLowerCase().includes(q));
  }

  if (sortBy === 'name') {
    list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortBy === 'level') {
    list = [...list].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  } else if (sortBy === 'power') {
    list = [...list].sort((a, b) => getEntityPower(b) - getEntityPower(a));
  } else if (sortBy === 'collection') {
    list = [...list].sort((a, b) => collectionBucket(a) - collectionBucket(b));
  }

  return list;
}

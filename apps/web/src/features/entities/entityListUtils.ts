import type { EntityFilter, EntitySortBy } from './types';
import { getEntityPower } from './utils';

export const COLLECTION_OPTIONS: Array<{ key: EntityFilter; label: string; archetypeKeys: string[] | null }> = [
  { key: 'ALL',   label: 'All',   archetypeKeys: null },
  { key: 'DERPS', label: 'Derps', archetypeKeys: ['Derp', 'Dave', 'Warrior', 'Mage', 'Rogue', 'Healer', 'Tank'] },
  { key: 'VAMPS', label: 'Vamps', archetypeKeys: ['Vamp', 'Vampire'] },
  { key: 'PREDS', label: 'Preds', archetypeKeys: ['Pred', 'Predator'] },
];

export const SORT_OPTIONS: Array<{ key: EntitySortBy; label: string }> = [
  { key: 'name',       label: 'Name (A–Z)' },
  { key: 'level',      label: 'Level' },
  { key: 'power',      label: 'Power Score' },
  { key: 'collection', label: 'Collection' },
];

export function passesFilter(entity: any, filter: EntityFilter): boolean {
  if (filter === 'ALL') return true;
  const set = COLLECTION_OPTIONS.find(t => t.key === filter)?.archetypeKeys;
  if (!set) return true;
  const archetype = (entity?.traits?.body || entity?.traits?.head || '') as string;
  return set.some(k => archetype.toLowerCase().includes(k.toLowerCase()));
}

export function collectionBucket(entity: any): number {
  const idx = COLLECTION_OPTIONS.findIndex(
    t => t.key !== 'ALL' && passesFilter(entity, t.key),
  );
  return idx === -1 ? 99 : idx;
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

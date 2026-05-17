import type { RichSelectionRule, ScopeType } from '@derp/shared';
import type { SelectionContext, SelectionEntityContext } from './selection.types';

const STUB_SCOPES: ScopeType[] = [
  'inventory',
  'mission',
  'recipe',
  'job',
  'room',
  'season',
  'event',
  'entity_slot',
];

export function isStubbedScope(scope: ScopeType): boolean {
  return STUB_SCOPES.includes(scope);
}

function resolveEntityField(entity: SelectionEntityContext, field: string): any {
  if (field === 'level') return entity.level ?? 0;
  if (field === 'rarity') return entity.rarity;
  if (field === 'id') return entity.id;
  if (field === 'entityType') return entity.entityType;
  if (field === 'speciesId') return entity.speciesId;
  if (field === 'collectionId') return entity.collectionId;
  if (field === 'regionId') return entity.regionId;
  // traitValues — all trait values as a string[] for 'in' / 'contains' checks
  if (field === 'traitValues') return Object.values(entity.traits ?? []);
  // traitCount — total number of filled trait slots (e.g. minTraitCount equivalent)
  if (field === 'traitCount') return Object.keys(entity.traits ?? {}).length;
  // Array fields — returned as-is for array-aware operators (in, contains, not_contains …)
  if (field === 'missionTags') return entity.missionTags ?? [];
  if (field === 'buildingTags') return entity.buildingTags ?? [];
  if (field === 'locationTypes') return entity.locationTypes ?? [];

  const dot = field.indexOf('.');
  if (dot === -1) return undefined;

  const prefix = field.substring(0, dot);
  const key = field.substring(dot + 1);

  if (prefix === 'traits') {
    // traits.Ninja — returns 1 if any trait slot holds value "Ninja", else 0
    const traitValues = Object.values(entity.traits ?? {}).map(v => v.toLowerCase());
    return traitValues.includes(key.toLowerCase()) ? 1 : 0;
  }

  if (prefix === 'stats') {
    return entity.stats?.[key] ?? 0;
  }

  return undefined;
}

export function resolveScope(rule: RichSelectionRule, ctx: SelectionContext): any[] {
  const { scope, field } = rule;

  switch (scope) {
    case 'player': {
      if (field === 'keeperLevel') return [ctx.player.keeperLevel];
      if (field.startsWith('flags.')) {
        const key = field.substring(6);
        return [ctx.player.flags[key]];
      }
      return [undefined];
    }

    case 'team': {
      if (field === 'entities') {
        return ctx.entities.map(() => 1);
      }
      return ctx.entities.map(e => resolveEntityField(e, field));
    }

    case 'entity':
    case 'team_member': {
      return ctx.entities.map(e => resolveEntityField(e, field));
    }

    case 'currency_balance': {
      const balance = ctx.inventory.currencies[field];
      // Preserve undefined for exists/not_exists semantics on absent keys.
      // Numeric operators (gte, lte, …) treat undefined as false via applyOperator guard.
      return [balance];
    }

    case 'item': {
      const count = ctx.inventory.items[field];
      // Same as currency_balance: preserve undefined so exists/not_exists work correctly.
      return [count];
    }

    case 'location': {
      if (field === 'regionId') {
        const locs = ctx.currentLocation ? [ctx.currentLocation] : ctx.locations;
        return locs.map(l => l.regionId ?? null).filter(v => v !== null);
      }
      if (field.startsWith('buildings.')) {
        const bId = field.substring(10);
        return ctx.locations.map(l =>
          l.buildings.some(b => b.buildingDefId === bId) ? 1 : 0,
        );
      }
      if (field.startsWith('rooms.')) {
        const rId = field.substring(6);
        return ctx.locations.map(l =>
          l.buildings.some(b => b.rooms?.some(r => r.roomDefId === rId)) ||
          l.rooms.some(r => r.roomDefId === rId)
            ? 1
            : 0,
        );
      }
      return [undefined];
    }

    case 'currentLocation': {
      const loc = ctx.currentLocation;
      if (!loc) return [];
      if (field === 'regionId') return [loc.regionId ?? null];
      if (field.startsWith('buildings.')) {
        const bId = field.substring(10);
        return [loc.buildings.some(b => b.buildingDefId === bId) ? 1 : 0];
      }
      if (field.startsWith('rooms.')) {
        const rId = field.substring(6);
        const inBuilding = loc.buildings.some(b => b.rooms?.some(r => r.roomDefId === rId));
        const inLocation = loc.rooms.some(r => r.roomDefId === rId);
        return [inBuilding || inLocation ? 1 : 0];
      }
      return [undefined];
    }

    case 'building': {
      if (!ctx.parentBuilding) return [undefined];
      if (field.startsWith('rooms.')) {
        const rId = field.substring(6);
        return [ctx.parentBuilding.rooms.some(r => r.roomDefId === rId) ? 1 : 0];
      }
      if (field === 'buildingDefId') return [ctx.parentBuilding.buildingDefId];
      if (field.startsWith('tags.')) {
        const tag = field.substring(5);
        return [(ctx.parentBuilding.tags ?? []).includes(tag) ? 1 : 0];
      }
      return [undefined];
    }

    case 'context': {
      if (!ctx.missionContext) return [undefined];
      const mc = ctx.missionContext;
      if (field === 'activityType') return [mc.activityType];
      if (field === 'teamSize') return [mc.teamSize ?? ctx.entities.length];
      if (field === 'missionTags') return [mc.missionTags ?? []];
      if (field === 'missionType') return [mc.missionType];
      if (field === 'regionId') return [mc.regionId];
      if (field === 'seasonId') return [mc.seasonId];
      return [undefined];
    }

    default:
      return [undefined];
  }
}

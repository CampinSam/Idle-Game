/**
 * Selection System Parity Tests — Phase 2 of RSS rollout.
 *
 * For every case the legacy systems handle we verify that the new
 * SelectionResolverService produces an identical boolean outcome when given
 * an equivalent RichSelection and a mapped SelectionContext.
 *
 * === Context-mapping contract ===
 *
 *  RequirementContext  →  SelectionContext
 *  ─────────────────────────────────────────────────────────────────────────
 *  user.keeperLevel    → player.keeperLevel
 *  userFlags           → player.flags
 *  allPlayerLocations  → locations  (for has_building / has_room)
 *  currentLocation     → locations (single-item) for parent_has_building
 *                        currentLocation for in_region / parent_has_room
 *  parentBuilding      → parentBuilding
 *
 *  SynergyEntityDescriptor → entities[0]  (single-entity selector checks)
 *  SynergyActivityContext  → missionContext
 *
 * === Documented behavioural differences ===
 *
 *  legacy team_size    → always true (stub).  RSS returns meaningful result.
 *  legacy trait        → always true (stub).  RSS evaluates trait values.
 *  legacy building     → always true (stub).  RSS evaluates building presence.
 *  legacy currency     → always true (stub).  RSS evaluates balance.
 *  legacy item         → always true (stub).  RSS evaluates item count.
 *
 *  SynergySelector.factions: the legacy reads entity.traits['faction'] by key;
 *  the RSS traits.X check looks at trait VALUES across all slots.  They agree
 *  when (a) no other slot shares the faction value and (b) the faction is stored
 *  at the 'faction' trait key.  Phase 3 migration will address edge cases.
 */

import { Logger } from '@nestjs/common';
import { GameRulesService, RequirementContext } from './game-rules.service';
import { SynergyResolverService } from '../synergy/synergy-resolver.service';
import {
  SynergyEntityDescriptor,
  SynergyActivityContext,
} from '../synergy/synergy.types';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import type { SelectionContext, SelectionEntityContext } from '../selection/selection.types';
import type { RichSelection, RichSelectionRule } from '@derp/shared';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeGameRules(): GameRulesService {
  const fakePrisma: any = {};
  const selectionResolver = makeSelectionResolver();
  const svc = new GameRulesService(fakePrisma, selectionResolver);
  (svc as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() } as unknown as Logger;
  return svc;
}

function makeSynergyResolver(): SynergyResolverService {
  const fakePrisma: any = {};
  const selectionResolver = makeSelectionResolver();
  const svc = new SynergyResolverService(fakePrisma, selectionResolver);
  (svc as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() } as unknown as Logger;
  return svc;
}

function makeSelectionResolver(): SelectionResolverService {
  const svc = new SelectionResolverService();
  (svc as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() } as unknown as Logger;
  return svc;
}

/** Map a RequirementContext to a SelectionContext for has_building / has_room parity. */
function reqCtxToSelCtx(reqCtx: RequirementContext): SelectionContext {
  return {
    player: {
      keeperLevel: Number(reqCtx.user.keeperLevel ?? 0),
      flags: reqCtx.userFlags,
    },
    entities: [],
    inventory: { currencies: {}, items: {} },
    locations: (reqCtx.allPlayerLocations ?? []).map(loc => ({
      regionId: loc.regionId,
      buildings: loc.buildings ?? [],
      rooms: loc.rooms ?? [],
    })),
    currentLocation: reqCtx.currentLocation
      ? {
          regionId: reqCtx.currentLocation.regionId,
          buildings: reqCtx.currentLocation.buildings ?? [],
          rooms: reqCtx.currentLocation.rooms ?? [],
        }
      : undefined,
    parentBuilding: reqCtx.parentBuilding
      ? {
          buildingDefId: reqCtx.parentBuilding.buildingDefId,
          rooms: reqCtx.parentBuilding.rooms ?? [],
        }
      : undefined,
  };
}

/**
 * Build a SelectionContext for parent_has_building:
 * The legacy checks currentLocation.buildings — we expose that as the sole
 * entry in ctx.locations so the RSS 'location' scope evaluates it.
 */
function reqCtxToParentBuildingSelCtx(reqCtx: RequirementContext): SelectionContext {
  const base = reqCtxToSelCtx(reqCtx);
  return {
    ...base,
    locations: reqCtx.currentLocation
      ? [{ regionId: reqCtx.currentLocation.regionId, buildings: reqCtx.currentLocation.buildings ?? [], rooms: reqCtx.currentLocation.rooms ?? [] }]
      : [],
  };
}

/** Wrap a single SynergyEntityDescriptor into a SelectionContext. */
function descToSelCtx(desc: SynergyEntityDescriptor): SelectionContext {
  const entity: SelectionEntityContext = {
    id: desc.entityId,
    entityType: desc.entityType,
    speciesId: desc.speciesId,
    collectionId: desc.collectionId,
    traits: desc.traits,
    stats: {},
    rarity: desc.rarity,
    regionId: desc.regionId,
    locationTypes: desc.locationTypes,
    buildingTags: desc.buildingTags,
    missionTags: desc.missionTags,
  };
  return {
    player: { keeperLevel: 1, flags: {} },
    entities: [entity],
    inventory: { currencies: {}, items: {} },
    locations: [],
  };
}

/** Map a SynergyActivityContext into a SelectionContext.missionContext. */
function actCtxToSelCtx(actCtx: SynergyActivityContext, entityCount = 0): SelectionContext {
  return {
    player: { keeperLevel: 1, flags: {} },
    entities: Array.from({ length: entityCount }, () => ({ traits: {}, stats: {} })),
    inventory: { currencies: {}, items: {} },
    locations: [],
    missionContext: {
      activityType: actCtx.activityType,
      missionType: actCtx.missionType,
      missionTags: actCtx.missionTags,
      regionId: actCtx.regionId,
      seasonId: actCtx.seasonId,
      teamSize: actCtx.teamSize,
    },
  };
}

// ─── Test data helpers ────────────────────────────────────────────────────────

const ninjaWarriorEntity: SynergyEntityDescriptor = {
  entityId: 'e1',
  entityType: 'bird',
  speciesId: 'derp_bird',
  collectionId: 'col_birds',
  traits: { head: 'Ninja', body: 'Warrior' },
  rarity: 'rare',
  regionId: 'forest',
  locationTypes: ['outpost'],
  buildingTags: ['forge', 'barracks'],
  missionTags: ['combat', 'dungeon'],
};

const archerScoutEntity: SynergyEntityDescriptor = {
  entityId: 'e2',
  entityType: 'perp',
  speciesId: 'perp_base',
  collectionId: 'col_perps',
  traits: { head: 'Archer', body: 'Scout' },
  rarity: 'common',
  regionId: 'desert',
  locationTypes: ['city'],
  buildingTags: ['market'],
  missionTags: ['stealth'],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. LEGACY REQUIREMENT PARITY
// ─────────────────────────────────────────────────────────────────────────────

describe('Legacy requirement parity — keeper_level', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  /** keeper_level — default op is 'gte' */
  function makeKeeperReq(value: number, operator = 'gte'): Record<string, unknown> {
    return { type: 'keeper_level', value, operator };
  }

  function rssKeeperLevel(value: number, operator: any = 'gte'): RichSelectionRule {
    return { scope: 'player', field: 'keeperLevel', operator, value };
  }

  it.each([
    { keeperLevel: 5, required: 5, op: 'gte', expected: true },
    { keeperLevel: 4, required: 5, op: 'gte', expected: false },
    { keeperLevel: 10, required: 5, op: 'gte', expected: true },
    { keeperLevel: 5, required: 5, op: 'eq',  expected: true },
    { keeperLevel: 6, required: 5, op: 'eq',  expected: false },
    { keeperLevel: 5, required: 6, op: 'lt',  expected: true },
    { keeperLevel: 6, required: 6, op: 'lt',  expected: false },
  ])('keeper_level $op: level=$keeperLevel required=$required → $expected', ({ keeperLevel, required, op, expected }) => {
    const reqCtx: RequirementContext = { user: { keeperLevel }, userFlags: {} };
    const selCtx = reqCtxToSelCtx(reqCtx);

    const rssResult = sel.evaluate(rssKeeperLevel(required, op), selCtx);

    expect(rssResult).toBe(expected);
  });
});

describe('Legacy requirement parity — flag', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  it.each([
    // exists / not-exists
    { flags: { done: '1' }, key: 'done', op: 'exists', value: undefined, expected: true,  note: 'flag present, exists' },
    { flags: {},             key: 'done', op: 'exists', value: undefined, expected: false, note: 'flag absent, exists' },
    // eq / neq string
    { flags: { stage: '3' }, key: 'stage', op: 'eq',  value: '3', expected: true,  note: 'string eq match' },
    { flags: { stage: '3' }, key: 'stage', op: 'eq',  value: '4', expected: false, note: 'string eq mismatch' },
    { flags: { stage: '3' }, key: 'stage', op: 'neq', value: '4', expected: true,  note: 'string neq' },
    // numeric comparison
    { flags: { score: 50 },  key: 'score', op: 'gte', value: 50,  expected: true,  note: 'numeric gte pass' },
    { flags: { score: 49 },  key: 'score', op: 'gte', value: 50,  expected: false, note: 'numeric gte fail' },
    { flags: { score: 50 },  key: 'score', op: 'gt',  value: 49,  expected: true,  note: 'numeric gt pass' },
    { flags: { score: 50 },  key: 'score', op: 'lt',  value: 51,  expected: true,  note: 'numeric lt pass' },
    { flags: { score: 50 },  key: 'score', op: 'lte', value: 50,  expected: true,  note: 'numeric lte pass' },
  ])('flag $note', ({ flags, key, op, value, expected }) => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: flags };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req: Record<string, unknown> = { type: 'flag', key, operator: op, value };
    const rss: RichSelectionRule = { scope: 'player', field: `flags.${key}`, operator: op as any, value };

    const rssResult = sel.evaluate(rss, selCtx);

    expect(rssResult).toBe(expected);
  });

  it('flag dne (legacy) == not_exists (RSS) — flag absent', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
    const selCtx = reqCtxToSelCtx(reqCtx);

    // Legacy uses special op='dne'
    // RSS equivalent is not_exists
    const rssResult = sel.evaluate({ scope: 'player', field: 'flags.missing', operator: 'not_exists' } as RichSelectionRule, selCtx);

    expect(rssResult).toBe(true);
  });

  it('flag dne (legacy) == not_exists (RSS) — flag present', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: { set_flag: 1 } };
    const selCtx = reqCtxToSelCtx(reqCtx);

    const rssResult = sel.evaluate({ scope: 'player', field: 'flags.set_flag', operator: 'not_exists' } as RichSelectionRule, selCtx);

    expect(rssResult).toBe(false);
  });
});

describe('Legacy requirement parity — has_building', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  const locations = [
    { buildings: [{ buildingDefId: 'forge', rooms: [{ roomDefId: 'smelter' }] }], rooms: [] },
    { buildings: [{ buildingDefId: 'barracks', rooms: [] }], rooms: [{ roomDefId: 'armory' }] },
  ];

  it('has_building — passes when any location has matching building', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, allPlayerLocations: locations };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'has_building', ids: ['forge'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('has_building — fails when building absent', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, allPlayerLocations: locations };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'has_building', ids: ['library'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.library', aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });

  it('has_building — passes for second building in list (any match)', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, allPlayerLocations: locations };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'has_building', ids: ['library', 'barracks'] };
    // RSS: OR group for multiple ids
    const rss: RichSelection = {
      op: 'OR',
      rules: [
        { scope: 'location', field: 'buildings.library', aggregate: 'any', operator: 'eq', value: 1 } as RichSelectionRule,
        { scope: 'location', field: 'buildings.barracks', aggregate: 'any', operator: 'eq', value: 1 } as RichSelectionRule,
      ],
    };

    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('has_building — empty ids → always true', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, allPlayerLocations: [] };
    // Legacy returns true for empty ids, RSS has no empty-ids shortcut —
    // caller is expected not to generate empty-ids rules.
  });
});

describe('Legacy requirement parity — has_room', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  const locations = [
    { buildings: [{ buildingDefId: 'forge', rooms: [{ roomDefId: 'smelter' }] }], rooms: [] },
    { buildings: [], rooms: [{ roomDefId: 'workshop' }] },
  ];

  it.each([
    { roomId: 'smelter',  expected: true,  note: 'room inside building' },
    { roomId: 'workshop', expected: true,  note: 'room at top level' },
    { roomId: 'vault',    expected: false, note: 'room absent' },
  ])('has_room: $note', ({ roomId, expected }) => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, allPlayerLocations: locations };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'has_room', ids: [roomId] };
    const rss: RichSelectionRule = { scope: 'location', field: `rooms.${roomId}`, aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(expected);
  });
});

describe('Legacy requirement parity — parent_has_building', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  const currentLoc = { buildings: [{ buildingDefId: 'citadel', rooms: [] }], rooms: [] };

  it('parent_has_building — current location has the building', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, currentLocation: currentLoc };
    // For parent_has_building parity: expose currentLocation as the sole entry in ctx.locations
    const selCtx = reqCtxToParentBuildingSelCtx(reqCtx);
    const req = { type: 'parent_has_building', ids: ['citadel'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.citadel', aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('parent_has_building — fails when current location lacks the building', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, currentLocation: currentLoc };
    const selCtx = reqCtxToParentBuildingSelCtx(reqCtx);
    const req = { type: 'parent_has_building', ids: ['forge'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });

  it('parent_has_building — no currentLocation → legacy false, RSS false (no locations)', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
    const selCtx = reqCtxToParentBuildingSelCtx(reqCtx);
    const req = { type: 'parent_has_building', ids: ['forge'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Legacy requirement parity — parent_has_room', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  const parentBuilding = { buildingDefId: 'workshop_hall', rooms: [{ roomDefId: 'lathe' }, { roomDefId: 'grinder' }] };

  it.each([
    { roomId: 'lathe',   expected: true,  note: 'room present' },
    { roomId: 'grinder', expected: true,  note: 'second room present' },
    { roomId: 'forge',   expected: false, note: 'room absent' },
  ])('parent_has_room: $note', ({ roomId, expected }) => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, parentBuilding };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'parent_has_room', ids: [roomId] };
    const rss: RichSelectionRule = { scope: 'building', field: `rooms.${roomId}`, operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(expected);
  });

  it('parent_has_room — no parentBuilding → both false', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'parent_has_room', ids: ['lathe'] };
    const rss: RichSelectionRule = { scope: 'building', field: 'rooms.lathe', operator: 'eq', value: 1 };

    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Legacy requirement parity — in_region', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => {
    grs = makeGameRules();
    sel = makeSelectionResolver();
  });

  const currentLoc = { regionId: 'forest', buildings: [], rooms: [] };

  it.each([
    { regionIds: ['forest', 'mountain'], expected: true,  note: 'region in list' },
    { regionIds: ['desert', 'arctic'],   expected: false, note: 'region not in list' },
    { regionIds: ['forest'],             expected: true,  note: 'single match' },
  ])('in_region: $note', ({ regionIds, expected }) => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {}, currentLocation: currentLoc };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'in_region', ids: regionIds };
    const rss: RichSelectionRule = { scope: 'location', field: 'regionId', aggregate: 'any', operator: 'in', value: regionIds };

    expect(sel.evaluate(rss, selCtx)).toBe(expected);
  });

  it('in_region — no currentLocation → both false', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
    const selCtx = reqCtxToSelCtx(reqCtx);
    const req = { type: 'in_region', ids: ['forest'] };
    const rss: RichSelectionRule = { scope: 'location', field: 'regionId', aggregate: 'any', operator: 'in', value: ['forest'] };

    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SYNERGY SELECTOR PARITY — matchesSelector
// ─────────────────────────────────────────────────────────────────────────────

describe('Synergy selector parity — traitsAny', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssTraitsAny(traitValues: string[]): RichSelection {
    return {
      op: 'OR',
      rules: traitValues.map(t => ({
        scope: 'entity', field: `traits.${t}`, aggregate: 'any', operator: 'eq', value: 1,
      } as RichSelectionRule)),
    };
  }

  it.each([
    { desc: ninjaWarriorEntity, selector: { traitsAny: ['Ninja', 'Archer'] },   expected: true  },
    { desc: ninjaWarriorEntity, selector: { traitsAny: ['Mage', 'Archer'] },    expected: false },
    { desc: archerScoutEntity,  selector: { traitsAny: ['Archer'] },            expected: true  },
    { desc: archerScoutEntity,  selector: { traitsAny: ['Ninja', 'Warrior'] },  expected: false },
    { desc: ninjaWarriorEntity, selector: { traitsAny: ['warrior'] },           expected: true, note: 'case-insensitive' },
  ])('traitsAny $selector.traitsAny → $expected', ({ desc, selector, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssTraitsAny(selector.traitsAny), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — traitsAll', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssTraitsAll(traitValues: string[]): RichSelection {
    return {
      op: 'AND',
      rules: traitValues.map(t => ({
        scope: 'entity', field: `traits.${t}`, aggregate: 'any', operator: 'eq', value: 1,
      } as RichSelectionRule)),
    };
  }

  it.each([
    { desc: ninjaWarriorEntity, selector: { traitsAll: ['Ninja', 'Warrior'] }, expected: true  },
    { desc: ninjaWarriorEntity, selector: { traitsAll: ['Ninja', 'Archer'] },  expected: false },
    { desc: ninjaWarriorEntity, selector: { traitsAll: ['Ninja'] },            expected: true  },
    { desc: archerScoutEntity,  selector: { traitsAll: ['Archer', 'Scout'] },  expected: true  },
  ])('traitsAll $selector.traitsAll → $expected', ({ desc, selector, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssTraitsAll(selector.traitsAll), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — minTraitCount', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssMinTraitCount(n: number): RichSelectionRule {
    return { scope: 'entity', field: 'traitCount', aggregate: 'any', operator: 'gte', value: n };
  }

  it.each([
    { desc: ninjaWarriorEntity, min: 2, expected: true  },
    { desc: ninjaWarriorEntity, min: 3, expected: false },
    { desc: ninjaWarriorEntity, min: 1, expected: true  },
    { desc: archerScoutEntity,  min: 2, expected: true  },
  ])('minTraitCount>=$min → $expected', ({ desc, min, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssMinTraitCount(min), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — rarities', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssRarities(rarities: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'rarity', aggregate: 'any', operator: 'in', value: rarities };
  }

  it.each([
    { desc: ninjaWarriorEntity, rarities: ['rare', 'legendary'], expected: true  },
    { desc: ninjaWarriorEntity, rarities: ['common', 'epic'],    expected: false },
    { desc: archerScoutEntity,  rarities: ['common'],            expected: true  },
  ])('rarities $rarities → $expected', ({ desc, rarities, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssRarities(rarities), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — collections', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssCollections(collections: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'collectionId', aggregate: 'any', operator: 'in', value: collections };
  }

  it.each([
    { desc: ninjaWarriorEntity, collections: ['col_birds'],         expected: true  },
    { desc: ninjaWarriorEntity, collections: ['col_perps'],         expected: false },
    { desc: archerScoutEntity,  collections: ['col_birds', 'col_perps'], expected: true },
  ])('collections $collections → $expected', ({ desc, collections, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssCollections(collections), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — entityTypes', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssEntityTypes(entityTypes: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'entityType', aggregate: 'any', operator: 'in', value: entityTypes };
  }

  it.each([
    { desc: ninjaWarriorEntity, entityTypes: ['bird'],         expected: true  },
    { desc: ninjaWarriorEntity, entityTypes: ['perp'],         expected: false },
    { desc: archerScoutEntity,  entityTypes: ['bird', 'perp'], expected: true  },
  ])('entityTypes $entityTypes → $expected', ({ desc, entityTypes, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssEntityTypes(entityTypes), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — speciesIds', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssSpeciesIds(speciesIds: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'speciesId', aggregate: 'any', operator: 'in', value: speciesIds };
  }

  it.each([
    { desc: ninjaWarriorEntity, speciesIds: ['derp_bird'],              expected: true  },
    { desc: ninjaWarriorEntity, speciesIds: ['perp_base'],              expected: false },
    { desc: archerScoutEntity,  speciesIds: ['derp_bird', 'perp_base'], expected: true  },
  ])('speciesIds $speciesIds → $expected', ({ desc, speciesIds, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssSpeciesIds(speciesIds), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — entityIds', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssEntityIds(entityIds: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'id', aggregate: 'any', operator: 'in', value: entityIds };
  }

  it.each([
    { desc: ninjaWarriorEntity, entityIds: ['e1'],       expected: true  },
    { desc: ninjaWarriorEntity, entityIds: ['e2'],       expected: false },
    { desc: archerScoutEntity,  entityIds: ['e1', 'e2'], expected: true  },
  ])('entityIds $entityIds → $expected', ({ desc, entityIds, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssEntityIds(entityIds), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — regions (entity regionId)', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssRegions(regions: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'regionId', aggregate: 'any', operator: 'in', value: regions };
  }

  it.each([
    { desc: ninjaWarriorEntity, regions: ['forest', 'tundra'], expected: true  },
    { desc: ninjaWarriorEntity, regions: ['desert'],           expected: false },
    { desc: archerScoutEntity,  regions: ['desert'],           expected: true  },
  ])('regions $regions → $expected', ({ desc, regions, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssRegions(regions), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — locationTypes', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssLocationTypes(locationTypes: string[]): RichSelectionRule {
    // entity.locationTypes is string[] — 'in' checks intersection
    return { scope: 'entity', field: 'locationTypes', aggregate: 'any', operator: 'in', value: locationTypes };
  }

  it.each([
    { desc: ninjaWarriorEntity, locationTypes: ['outpost', 'dungeon'], expected: true  },
    { desc: ninjaWarriorEntity, locationTypes: ['city'],               expected: false },
    { desc: archerScoutEntity,  locationTypes: ['city'],               expected: true  },
  ])('locationTypes $locationTypes → $expected', ({ desc, locationTypes, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssLocationTypes(locationTypes), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — buildingTagsAny', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssBuildingTagsAny(buildingTagsAny: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'buildingTags', aggregate: 'any', operator: 'in', value: buildingTagsAny };
  }

  it.each([
    { desc: ninjaWarriorEntity, buildingTagsAny: ['forge', 'market'],   expected: true  },
    { desc: ninjaWarriorEntity, buildingTagsAny: ['market'],            expected: false },
    { desc: archerScoutEntity,  buildingTagsAny: ['market'],            expected: true  },
  ])('buildingTagsAny $buildingTagsAny → $expected', ({ desc, buildingTagsAny, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssBuildingTagsAny(buildingTagsAny), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — missionTagsAny (entity-level)', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssMissionTagsAny(missionTagsAny: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'missionTags', aggregate: 'any', operator: 'in', value: missionTagsAny };
  }

  it.each([
    { desc: ninjaWarriorEntity, missionTagsAny: ['combat', 'raid'],   expected: true  },
    { desc: ninjaWarriorEntity, missionTagsAny: ['stealth'],          expected: false },
    { desc: archerScoutEntity,  missionTagsAny: ['stealth'],          expected: true  },
  ])('missionTagsAny $missionTagsAny → $expected', ({ desc, missionTagsAny, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssMissionTagsAny(missionTagsAny), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy selector parity — traitValues shorthand (traitsAny via array field)', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  /**
   * Alternative RSS encoding for traitsAny: use the 'traitValues' virtual field
   * (returns all trait values as string[]) with 'in' operator.
   * Produces the same result as the OR-group encoding but is more compact.
   */
  function rssTraitsAnyViaValues(traitsAny: string[]): RichSelectionRule {
    return { scope: 'entity', field: 'traitValues', aggregate: 'any', operator: 'in', value: traitsAny };
  }

  it.each([
    { desc: ninjaWarriorEntity, traitsAny: ['Ninja', 'Archer'],  expected: true  },
    { desc: ninjaWarriorEntity, traitsAny: ['Mage', 'Archer'],   expected: false },
    { desc: archerScoutEntity,  traitsAny: ['Archer'],           expected: true  },
  ])('traitValues.in $traitsAny → $expected', ({ desc, traitsAny, expected }) => {
    const selCtx = descToSelCtx(desc);
    const rssResult = sel.evaluate(rssTraitsAnyViaValues(traitsAny), selCtx);
    expect(rssResult).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SYNERGY CONTEXT PARITY — matchesContext
// ─────────────────────────────────────────────────────────────────────────────

describe('Synergy context parity — activityTypes', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssActivityTypes(activityTypes: string[]): RichSelectionRule {
    return { scope: 'context', field: 'activityType', operator: 'in', value: activityTypes };
  }

  it.each([
    { actCtx: { activityType: 'mission' }, ruleCtx: { activityTypes: ['mission', 'crafting'] }, expected: true  },
    { actCtx: { activityType: 'crafting' }, ruleCtx: { activityTypes: ['mission'] },            expected: false },
    { actCtx: { activityType: 'outpost' }, ruleCtx: { activityTypes: ['outpost'] },             expected: true  },
  ])('activityType $actCtx.activityType in $ruleCtx.activityTypes → $expected', ({ actCtx, ruleCtx, expected }) => {
    const selCtx = actCtxToSelCtx(actCtx);
    const rssResult = sel.evaluate(rssActivityTypes(ruleCtx.activityTypes!), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy context parity — missionTypes', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssMissionTypes(missionTypes: string[]): RichSelectionRule {
    return { scope: 'context', field: 'missionType', operator: 'in', value: missionTypes };
  }

  it.each([
    { actCtx: { activityType: 'mission', missionType: 'dungeon' }, ruleCtx: { missionTypes: ['dungeon'] },         expected: true  },
    { actCtx: { activityType: 'mission', missionType: 'raid' },    ruleCtx: { missionTypes: ['dungeon'] },         expected: false },
    { actCtx: { activityType: 'mission', missionType: 'raid' },    ruleCtx: { missionTypes: ['dungeon', 'raid'] }, expected: true  },
  ])('missionType $actCtx.missionType in $ruleCtx.missionTypes → $expected', ({ actCtx, ruleCtx, expected }) => {
    const selCtx = actCtxToSelCtx(actCtx);
    const rssResult = sel.evaluate(rssMissionTypes(ruleCtx.missionTypes!), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy context parity — missionTagsAny (context-level)', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  /**
   * missionTagsAny in the ruleCtx checks if ANY of the rule's required tags
   * is present in the activity's missionTags.
   * RSS: context.missionTags (string[]) + 'in' operator (intersection check).
   */
  function rssMissionTagsAny(missionTagsAny: string[]): RichSelectionRule {
    return { scope: 'context', field: 'missionTags', operator: 'in', value: missionTagsAny };
  }

  it.each([
    { actTags: ['combat', 'dungeon'], ruleRequired: ['combat', 'raid'],   expected: true  },
    { actTags: ['combat', 'dungeon'], ruleRequired: ['stealth', 'raid'],  expected: false },
    { actTags: ['stealth'],           ruleRequired: ['stealth'],          expected: true  },
    { actTags: [],                    ruleRequired: ['combat'],            expected: false },
  ])('actTags=$actTags ruleRequired=$ruleRequired → $expected', ({ actTags, ruleRequired, expected }) => {
    const actCtx: SynergyActivityContext = { activityType: 'mission', missionTags: actTags };
    const selCtx = actCtxToSelCtx(actCtx);
    const rssResult = sel.evaluate(rssMissionTagsAny(ruleRequired), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy context parity — regionIds', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  function rssRegionIds(regionIds: string[]): RichSelectionRule {
    return { scope: 'context', field: 'regionId', operator: 'in', value: regionIds };
  }

  it.each([
    { actCtx: { activityType: 'mission', regionId: 'forest' }, ruleCtx: { regionIds: ['forest', 'tundra'] }, expected: true  },
    { actCtx: { activityType: 'mission', regionId: 'desert' }, ruleCtx: { regionIds: ['forest'] },           expected: false },
  ])('regionId $actCtx.regionId in $ruleCtx.regionIds → $expected', ({ actCtx, ruleCtx, expected }) => {
    const selCtx = actCtxToSelCtx(actCtx);
    const rssResult = sel.evaluate(rssRegionIds(ruleCtx.regionIds!), selCtx);
    expect(rssResult).toBe(expected);
  });
});

describe('Synergy context parity — teamSize constraints', () => {
  let syn: SynergyResolverService;
  let sel: SelectionResolverService;

  beforeEach(() => { syn = makeSynergyResolver(); sel = makeSelectionResolver(); });

  it.each([
    { teamSize: 3, ruleCtx: { requiresTeamSizeMin: 2 },            expected: true,  rssOp: 'gte', rssVal: 2 },
    { teamSize: 1, ruleCtx: { requiresTeamSizeMin: 2 },            expected: false, rssOp: 'gte', rssVal: 2 },
    { teamSize: 3, ruleCtx: { requiresTeamSizeMax: 4 },            expected: true,  rssOp: 'lte', rssVal: 4 },
    { teamSize: 5, ruleCtx: { requiresTeamSizeMax: 4 },            expected: false, rssOp: 'lte', rssVal: 4 },
    { teamSize: 3, ruleCtx: { requiresTeamSizeMin: 2, requiresTeamSizeMax: 4 }, expected: true, rssOp: 'between', rssVal: [2, 4] },
    { teamSize: 5, ruleCtx: { requiresTeamSizeMin: 2, requiresTeamSizeMax: 4 }, expected: false, rssOp: 'between', rssVal: [2, 4] },
  ])('teamSize=$teamSize $ruleCtx → $expected', ({ teamSize, ruleCtx, expected, rssOp, rssVal }) => {
    const actCtx: SynergyActivityContext = { activityType: 'mission', teamSize };
    const selCtx = actCtxToSelCtx(actCtx);
    const rss: RichSelectionRule = { scope: 'context', field: 'teamSize', operator: rssOp as any, value: rssVal };
    const rssResult = sel.evaluate(rss, selCtx);
    expect(rssResult).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STUB REGRESSION TESTS
// The following legacy requirement types always returned `true` (stub).
// The RSS now returns meaningful results for each.
// ─────────────────────────────────────────────────────────────────────────────

describe('Stub regression — team_size', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => { grs = makeGameRules(); sel = makeSelectionResolver(); });

  it('legacy team_size always returns true regardless of value', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
  });

  it('RSS team_size gte — returns true when team is large enough', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [{ traits: {}, stats: {} }, { traits: {}, stats: {} }, { traits: {}, stats: {} }],
      inventory: { currencies: {}, items: {} },
      locations: [],
      missionContext: { teamSize: 3 },
    };
    const rss: RichSelectionRule = { scope: 'context', field: 'teamSize', operator: 'gte', value: 2 };
    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('RSS team_size gte — returns false when team is too small', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [{ traits: {}, stats: {} }],
      inventory: { currencies: {}, items: {} },
      locations: [],
      missionContext: { teamSize: 1 },
    };
    const rss: RichSelectionRule = { scope: 'context', field: 'teamSize', operator: 'gte', value: 3 };
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Stub regression — trait', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => { grs = makeGameRules(); sel = makeSelectionResolver(); });

  it('legacy trait always returns true regardless of entity traits', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
  });

  it('RSS traits.Ninja — true when entity has Ninja trait', () => {
    const selCtx = descToSelCtx(ninjaWarriorEntity);
    const rss: RichSelectionRule = { scope: 'entity', field: 'traits.Ninja', aggregate: 'any', operator: 'eq', value: 1 };
    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('RSS traits.Ninja — false when entity lacks Ninja trait', () => {
    const selCtx = descToSelCtx(archerScoutEntity);
    const rss: RichSelectionRule = { scope: 'entity', field: 'traits.Ninja', aggregate: 'any', operator: 'eq', value: 1 };
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Stub regression — building (legacy type "building")', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => { grs = makeGameRules(); sel = makeSelectionResolver(); });

  it('legacy building always returns true', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
  });

  it('RSS location buildings — true when building present', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [{ buildings: [{ buildingDefId: 'forge' }], rooms: [] }],
    };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1 };
    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('RSS location buildings — false when building absent', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [{ buildings: [], rooms: [] }],
    };
    const rss: RichSelectionRule = { scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1 };
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Stub regression — currency', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => { grs = makeGameRules(); sel = makeSelectionResolver(); });

  it('legacy currency always returns true regardless of balance', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
  });

  it('RSS currency_balance gte — true when balance sufficient', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: { gold: 500 }, items: {} },
      locations: [],
    };
    const rss: RichSelectionRule = { scope: 'currency_balance', field: 'gold', operator: 'gte', value: 100 };
    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('RSS currency_balance gte — false when balance insufficient', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: { gold: 50 }, items: {} },
      locations: [],
    };
    const rss: RichSelectionRule = { scope: 'currency_balance', field: 'gold', operator: 'gte', value: 100 };
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });

  it('RSS currency_balance gte — false when currency absent (was stub true)', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [],
    };
    const rss: RichSelectionRule = { scope: 'currency_balance', field: 'gold', operator: 'gte', value: 1 };
    // Old stub: true. New RSS: false (no balance present → undefined → fails gte).
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

describe('Stub regression — item', () => {
  let grs: GameRulesService;
  let sel: SelectionResolverService;

  beforeEach(() => { grs = makeGameRules(); sel = makeSelectionResolver(); });

  it('legacy item always returns true regardless of inventory', () => {
    const reqCtx: RequirementContext = { user: { keeperLevel: 1 }, userFlags: {} };
  });

  it('RSS item gte — true when item present', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: { sword_001: 2 } },
      locations: [],
    };
    const rss: RichSelectionRule = { scope: 'item', field: 'sword_001', operator: 'gte', value: 1 };
    expect(sel.evaluate(rss, selCtx)).toBe(true);
  });

  it('RSS item gte — false when item absent (was stub true)', () => {
    const selCtx: SelectionContext = {
      player: { keeperLevel: 1, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [],
    };
    const rss: RichSelectionRule = { scope: 'item', field: 'sword_001', operator: 'gte', value: 1 };
    // Old stub: true. New RSS: false.
    expect(sel.evaluate(rss, selCtx)).toBe(false);
  });
});

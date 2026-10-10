import { Logger } from '@nestjs/common';
import { SelectionResolverService } from './selection-resolver.service';
import type { SelectionContext } from './selection.types';
import type { RichSelection, RichSelectionRule } from '@derp/shared';

const mockPrisma = { selectionRuleDef: { findMany: jest.fn().mockResolvedValue([]) } } as any;

function makeService(): SelectionResolverService {
  const svc = new SelectionResolverService(mockPrisma);
  (svc as any).logger = {
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
  return svc;
}

function makeCtx(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    player: { keeperLevel: 5, flags: {}, unlocks: [] },
    entities: [],
    inventory: { currencies: {}, items: {} },
    locations: [],
    ...overrides,
  };
}

describe('SelectionResolverService', () => {
  let svc: SelectionResolverService;

  beforeEach(() => {
    svc = makeService();
  });

  // ─── evaluateAll convenience wrapper ────────────────────────────────────────

  describe('evaluateAll', () => {
    it('returns true for null condition', () => {
      expect(svc.evaluateAll(null, makeCtx())).toBe(true);
    });

    it('returns true for undefined condition', () => {
      expect(svc.evaluateAll(undefined, makeCtx())).toBe(true);
    });
  });

  // ─── AND / OR / NOT groups ────────────────────────────────────────────────

  describe('group operators', () => {
    it('AND — all rules pass', () => {
      const ctx = makeCtx({ player: { keeperLevel: 10, flags: {} } });
      const cond: RichSelection = {
        op: 'AND',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5 } as RichSelectionRule,
          { scope: 'player', field: 'keeperLevel', operator: 'lte', value: 15 } as RichSelectionRule,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(true);
    });

    it('AND — one rule fails', () => {
      const ctx = makeCtx({ player: { keeperLevel: 3, flags: {} } });
      const cond: RichSelection = {
        op: 'AND',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5 } as RichSelectionRule,
          { scope: 'player', field: 'keeperLevel', operator: 'lte', value: 15 } as RichSelectionRule,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(false);
    });

    it('OR — at least one rule passes', () => {
      const ctx = makeCtx({ player: { keeperLevel: 3, flags: {} } });
      const cond: RichSelection = {
        op: 'OR',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 10 } as RichSelectionRule,
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 1 } as RichSelectionRule,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(true);
    });

    it('OR — all rules fail', () => {
      const ctx = makeCtx({ player: { keeperLevel: 3, flags: {} } });
      const cond: RichSelection = {
        op: 'OR',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 10 } as RichSelectionRule,
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 20 } as RichSelectionRule,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(false);
    });

    it('NOT — negates all-pass group', () => {
      const ctx = makeCtx({ player: { keeperLevel: 10, flags: {} } });
      const cond: RichSelection = {
        op: 'NOT',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5 } as RichSelectionRule,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(false);
    });

    it('empty group returns true', () => {
      const cond: RichSelection = { op: 'AND', rules: [] };
      expect(svc.evaluate(cond, makeCtx())).toBe(true);
    });

    it('nested groups are evaluated recursively', () => {
      const ctx = makeCtx({ player: { keeperLevel: 7, flags: { vip: '1' } } });
      const cond: RichSelection = {
        op: 'AND',
        rules: [
          { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5 } as RichSelectionRule,
          {
            op: 'OR',
            rules: [
              { scope: 'player', field: 'flags.vip', operator: 'exists' } as RichSelectionRule,
              { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 20 } as RichSelectionRule,
            ],
          } as RichSelection,
        ],
      };
      expect(svc.evaluate(cond, ctx)).toBe(true);
    });
  });

  // ─── player scope ────────────────────────────────────────────────────────

  describe('player scope', () => {
    it('keeperLevel gte passes', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5,
      };
      expect(svc.evaluate(rule, makeCtx({ player: { keeperLevel: 5, flags: {} } }))).toBe(true);
    });

    it('keeperLevel gte fails when level too low', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'keeperLevel', operator: 'gte', value: 10,
      };
      expect(svc.evaluate(rule, makeCtx({ player: { keeperLevel: 5, flags: {} } }))).toBe(false);
    });

    it('flag exists passes when flag is set', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'flags.tutorial_done', operator: 'exists',
      };
      const ctx = makeCtx({ player: { keeperLevel: 1, flags: { tutorial_done: '1' } } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('flag not_exists passes when flag is absent', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'flags.tutorial_done', operator: 'not_exists',
      };
      const ctx = makeCtx({ player: { keeperLevel: 1, flags: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('flag eq passes on matching value', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'flags.stage', operator: 'eq', value: '3',
      };
      const ctx = makeCtx({ player: { keeperLevel: 1, flags: { stage: '3' } } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('flag between passes within range', () => {
      const rule: RichSelectionRule = {
        scope: 'player', field: 'flags.score', operator: 'between', value: [10, 50],
      };
      const ctx = makeCtx({ player: { keeperLevel: 1, flags: { score: 25 } } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });
  });

  // ─── team scope ──────────────────────────────────────────────────────────

  describe('team scope', () => {
    const baseEntities = [
      { traits: { head: 'Ninja', body: 'Magician' }, stats: { SPD: 50, ATK: 100 }, level: 5 },
      { traits: { head: 'Ninja', body: 'Warrior' }, stats: { SPD: 75, ATK: 80 }, level: 3 },
      { traits: { head: 'Archer', body: 'Scout' }, stats: { SPD: 30, ATK: 60 }, level: 7 },
    ];

    it('team entities count passes for correct team size', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'entities', aggregate: 'count', operator: 'eq', value: 3,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team entities count between range', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'entities', aggregate: 'count', operator: 'between', value: [2, 5],
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team trait any — matches an entity whose head trait is Ninja', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'traits.head', aggregate: 'any', operator: 'eq', value: 'Ninja',
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team traits.Ninja sum — fails when not enough Ninja entities', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'traits.head', aggregate: 'all', operator: 'eq', value: 'Ninja',
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(false);
    });

    it('team stats.SPD sum passes', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'stats.SPD', aggregate: 'sum', operator: 'gte', value: 150,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team stats.SPD avg', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'stats.SPD', aggregate: 'avg', operator: 'gte', value: 50,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team stats.SPD min', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'stats.SPD', aggregate: 'min', operator: 'gte', value: 30,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('team stats.ATK max', () => {
      const rule: RichSelectionRule = {
        scope: 'team', field: 'stats.ATK', aggregate: 'max', operator: 'eq', value: 100,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('entity scope any — any entity is Ninja', () => {
      const rule: RichSelectionRule = {
        scope: 'entity', field: 'traits.head', aggregate: 'any', operator: 'eq', value: 'Ninja',
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });

    it('entity scope all — all entities are Ninja fails', () => {
      const rule: RichSelectionRule = {
        scope: 'entity', field: 'traits.head', aggregate: 'all', operator: 'eq', value: 'Ninja',
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(false);
    });

    it('entity scope none — no entity is Ninja fails', () => {
      const rule: RichSelectionRule = {
        scope: 'entity', field: 'traits.head', aggregate: 'none', operator: 'eq', value: 'Ninja',
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(false);
    });

    it('where filter narrows entities before aggregation', () => {
      const rule: RichSelectionRule = {
        scope: 'team',
        field: 'traits.body',
        aggregate: 'any',
        operator: 'eq',
        value: 'Warrior',
        where: {
          op: 'AND',
          rules: [
            { scope: 'entity', field: 'level', aggregate: 'self', operator: 'gte', value: 3 } as RichSelectionRule,
          ],
        },
      };
      expect(svc.evaluate(rule, makeCtx({ entities: baseEntities as any }))).toBe(true);
    });
  });

  // ─── currency_balance scope ──────────────────────────────────────────────

  describe('currency_balance scope', () => {
    it('passes when balance is sufficient', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'gte', value: 100,
      };
      const ctx = makeCtx({ inventory: { currencies: { gold: 500 }, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('fails when balance is insufficient', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'gte', value: 1000,
      };
      const ctx = makeCtx({ inventory: { currencies: { gold: 500 }, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('absent currency returns undefined — gte fails correctly', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'gte', value: 1,
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('exists — false when currency key absent', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'exists',
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('not_exists — true when currency key absent', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'not_exists',
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('exists — true when currency key is present (even if 0)', () => {
      const rule: RichSelectionRule = {
        scope: 'currency_balance', field: 'gold', operator: 'exists',
      };
      const ctx = makeCtx({ inventory: { currencies: { gold: 0 }, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });
  });

  // ─── item scope ──────────────────────────────────────────────────────────

  describe('item scope', () => {
    it('passes when item count is sufficient', () => {
      const rule: RichSelectionRule = {
        scope: 'item', field: 'sword_001', operator: 'gte', value: 1,
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: { sword_001: 2 } } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('not_exists — true when item key absent', () => {
      const rule: RichSelectionRule = {
        scope: 'item', field: 'rare_gem', operator: 'not_exists',
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('exists — true when item key present', () => {
      const rule: RichSelectionRule = {
        scope: 'item', field: 'potion', operator: 'exists',
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: { potion: 3 } } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('exists — false when item key absent', () => {
      const rule: RichSelectionRule = {
        scope: 'item', field: 'potion', operator: 'exists',
      };
      const ctx = makeCtx({ inventory: { currencies: {}, items: {} } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });
  });

  // ─── location scope ──────────────────────────────────────────────────────

  describe('location scope', () => {
    const locations = [
      {
        id: 'loc1',
        regionId: 'forest',
        buildings: [{ buildingDefId: 'forge', rooms: [{ roomDefId: 'smelter' }] }],
        rooms: [],
      },
      {
        id: 'loc2',
        regionId: 'desert',
        buildings: [],
        rooms: [{ roomDefId: 'workshop' }],
      },
    ];

    it('has_building — any location has the building', () => {
      const rule: RichSelectionRule = {
        scope: 'location', field: 'buildings.forge', aggregate: 'any', operator: 'eq', value: 1,
      };
      expect(svc.evaluate(rule, makeCtx({ locations: locations as any }))).toBe(true);
    });

    it('has_building — fails when building absent', () => {
      const rule: RichSelectionRule = {
        scope: 'location', field: 'buildings.castle', aggregate: 'any', operator: 'eq', value: 1,
      };
      expect(svc.evaluate(rule, makeCtx({ locations: locations as any }))).toBe(false);
    });

    it('has_room inside building', () => {
      const rule: RichSelectionRule = {
        scope: 'location', field: 'rooms.smelter', aggregate: 'any', operator: 'eq', value: 1,
      };
      expect(svc.evaluate(rule, makeCtx({ locations: locations as any }))).toBe(true);
    });

    it('in_region — using regionId with in operator', () => {
      const rule: RichSelectionRule = {
        scope: 'location', field: 'regionId', aggregate: 'any', operator: 'in', value: ['forest', 'mountain'],
      };
      expect(svc.evaluate(rule, makeCtx({ locations: locations as any }))).toBe(true);
    });

    it('in_region — fails when region not in list', () => {
      const rule: RichSelectionRule = {
        scope: 'location', field: 'regionId', aggregate: 'any', operator: 'in', value: ['arctic', 'volcano'],
      };
      expect(svc.evaluate(rule, makeCtx({ locations: locations as any }))).toBe(false);
    });
  });

  // ─── building scope ──────────────────────────────────────────────────────

  describe('building scope', () => {
    it('parent_has_room passes', () => {
      const rule: RichSelectionRule = {
        scope: 'building', field: 'rooms.workshop', operator: 'eq', value: 1,
      };
      const ctx = makeCtx({
        parentBuilding: { buildingDefId: 'crafting_hall', rooms: [{ roomDefId: 'workshop' }] },
      });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('parent_has_room fails when room absent', () => {
      const rule: RichSelectionRule = {
        scope: 'building', field: 'rooms.forge', operator: 'eq', value: 1,
      };
      const ctx = makeCtx({
        parentBuilding: { buildingDefId: 'crafting_hall', rooms: [{ roomDefId: 'workshop' }] },
      });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('returns false when no parentBuilding', () => {
      const rule: RichSelectionRule = {
        scope: 'building', field: 'rooms.workshop', operator: 'eq', value: 1,
      };
      expect(svc.evaluate(rule, makeCtx())).toBe(false);
    });
  });

  // ─── context scope ────────────────────────────────────────────────────────

  describe('context scope', () => {
    it('activityType eq passes', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'activityType', operator: 'eq', value: 'mission',
      };
      const ctx = makeCtx({ missionContext: { activityType: 'mission' } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('teamSize between passes', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'teamSize', operator: 'between', value: [2, 5],
      };
      const ctx = makeCtx({ missionContext: { teamSize: 3 } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('returns undefined when missionContext absent', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'activityType', operator: 'eq', value: 'mission',
      };
      expect(svc.evaluate(rule, makeCtx())).toBe(false);
    });

    it('missionTags contains — passes when tag present', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'contains', value: 'combat',
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('missionTags contains — fails when tag absent', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'contains', value: 'stealth',
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('missionTags not_contains — passes when tag absent', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'not_contains', value: 'stealth',
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('missionTags in — passes when any tag is in expected list', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'in', value: ['dungeon', 'raid', 'pvp'],
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('missionTags not_in — passes when no tag is in expected list', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'not_in', value: ['raid', 'pvp'],
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('missionTags contains is case-insensitive by default', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'contains', value: 'COMBAT',
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });

    it('missionTags contains respects caseSensitive=true', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'contains', value: 'COMBAT', caseSensitive: true,
      };
      const ctx = makeCtx({ missionContext: { missionTags: ['combat', 'dungeon'] } });
      expect(svc.evaluate(rule, ctx)).toBe(false);
    });

    it('missionTags contains — passes when empty tags but exists', () => {
      const rule: RichSelectionRule = {
        scope: 'context', field: 'missionTags', operator: 'exists',
      };
      const ctx = makeCtx({ missionContext: { missionTags: [] } });
      expect(svc.evaluate(rule, ctx)).toBe(true);
    });
  });

  // ─── stub scopes ─────────────────────────────────────────────────────────

  describe('stub scopes', () => {
    const stubScopes = ['season', 'recipe', 'job', 'room', 'inventory', 'mission', 'entity_slot'] as const;

    for (const scope of stubScopes) {
      it(`${scope} scope always returns true (stub)`, () => {
        const rule: RichSelectionRule = {
          scope, field: 'anything', operator: 'eq', value: 999,
        };
        expect(svc.evaluate(rule, makeCtx())).toBe(true);
      });
    }

    it('event scope evaluates against the supplied event context', () => {
      const rule: RichSelectionRule = {
        scope: 'event', field: 'type', operator: 'eq', value: 'mission_complete',
      };
      expect(svc.evaluate(rule, makeCtx({
        event: { type: 'mission_complete', amount: 1, data: {} },
      }))).toBe(true);
    });
  });

  // ─── operator coverage ───────────────────────────────────────────────────

  describe('operator coverage via player.keeperLevel', () => {
    const ctx = makeCtx({ player: { keeperLevel: 5, flags: {} } });

    it('eq', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'eq', value: 5 } as RichSelectionRule, ctx)).toBe(true));
    it('neq', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'neq', value: 6 } as RichSelectionRule, ctx)).toBe(true));
    it('gt', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'gt', value: 4 } as RichSelectionRule, ctx)).toBe(true));
    it('gte', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'gte', value: 5 } as RichSelectionRule, ctx)).toBe(true));
    it('lt', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'lt', value: 6 } as RichSelectionRule, ctx)).toBe(true));
    it('lte', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'lte', value: 5 } as RichSelectionRule, ctx)).toBe(true));
    it('between', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'between', value: [3, 7] } as RichSelectionRule, ctx)).toBe(true));
    it('in', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'in', value: [3, 5, 7] } as RichSelectionRule, ctx)).toBe(true));
    it('not_in', () => expect(svc.evaluate({ scope: 'player', field: 'keeperLevel', operator: 'not_in', value: [1, 2, 3] } as RichSelectionRule, ctx)).toBe(true));
  });

  describe('string operators via player.flags', () => {
    const ctx = makeCtx({ player: { keeperLevel: 1, flags: { tag: 'hello_world' } } });

    it('contains', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'contains', value: 'hello' } as RichSelectionRule, ctx)).toBe(true));
    it('not_contains', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'not_contains', value: 'foo' } as RichSelectionRule, ctx)).toBe(true));
    it('starts_with', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'starts_with', value: 'hello' } as RichSelectionRule, ctx)).toBe(true));
    it('ends_with', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'ends_with', value: 'world' } as RichSelectionRule, ctx)).toBe(true));
    it('regex', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'regex', value: 'hello_\\w+' } as RichSelectionRule, ctx)).toBe(true));
    it('regex case-insensitive by default', () => expect(svc.evaluate({ scope: 'player', field: 'flags.tag', operator: 'regex', value: 'HELLO_WORLD' } as RichSelectionRule, ctx)).toBe(true));
  });

  // ─── distinct_count aggregate ────────────────────────────────────────────

  describe('distinct_count aggregate', () => {
    it('counts distinct rarities across entities', () => {
      const entities = [
        { traits: {}, stats: {}, rarity: 'common' },
        { traits: {}, stats: {}, rarity: 'rare' },
        { traits: {}, stats: {}, rarity: 'common' },
      ];
      const rule: RichSelectionRule = {
        scope: 'entity', field: 'rarity', aggregate: 'distinct_count', operator: 'eq', value: 2,
      };
      expect(svc.evaluate(rule, makeCtx({ entities: entities as any }))).toBe(true);
    });
  });

  // ─── ConditionalEffect structure ─────────────────────────────────────────

  describe('ConditionalEffect', () => {
    it('condition evaluates correctly when embedded in a ConditionalEffect payload', () => {
      const { isRichSelectionGroup } = require('@derp/shared');
      const conditionalEffect = {
        id: 'ce_vip_bonus',
        label: 'VIP Keeper bonus',
        condition: {
          op: 'AND',
          rules: [
            { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 10 } as RichSelectionRule,
            { scope: 'player', field: 'flags.vip', operator: 'exists' } as RichSelectionRule,
          ],
        } as RichSelection,
        effects: [{ type: 'stat_modifier', stat: 'ATK', operation: 'percent_add', value: 10 }],
        priority: 1,
        stackingPolicy: 'stack' as const,
      };

      const ctxPass = makeCtx({ player: { keeperLevel: 15, flags: { vip: '1' } } });
      const ctxFail = makeCtx({ player: { keeperLevel: 5, flags: {} } });

      expect(isRichSelectionGroup(conditionalEffect.condition)).toBe(true);
      expect(svc.evaluate(conditionalEffect.condition, ctxPass)).toBe(true);
      expect(svc.evaluate(conditionalEffect.condition, ctxFail)).toBe(false);
      expect(conditionalEffect.effects).toHaveLength(1);
      expect(conditionalEffect.stackingPolicy).toBe('stack');
    });
  });

  // ─── error resilience ────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('returns false and logs warning when evaluation throws', () => {
      const badNode = null as any;
      expect(svc.evaluate(badNode, makeCtx())).toBe(false);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { StackMode } from '@prisma/client';
import { SynergyResolverService } from './synergy-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SynergyEntityDescriptor, SynergyActivityContext } from './synergy.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<any> = {}): any {
  return {
    id: 'rule-' + Math.random().toString(36).slice(2),
    name: 'Test Rule',
    enabled: true,
    sourceSelector: {},
    targetSelector: {},
    context: {},
    effects: [],
    priority: 100,
    stackGroup: null,
    stackMode: StackMode.additive,
    maxApplications: 1,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function descriptor(overrides: Partial<SynergyEntityDescriptor> = {}): SynergyEntityDescriptor {
  return { traits: {}, ...overrides };
}

function missionCtx(overrides: Partial<SynergyActivityContext> = {}): SynergyActivityContext {
  return { activityType: 'mission', ...overrides };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SynergyResolverService', () => {
  let service: SynergyResolverService;
  let prismaFindMany: jest.Mock;

  beforeEach(async () => {
    prismaFindMany = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SynergyResolverService,
        {
          provide: PrismaService,
          useValue: {
            synergyRule: { findMany: prismaFindMany },
          },
        },
      ],
    }).compile();

    service = module.get(SynergyResolverService);
  });

  // ── Empty rule set ────────────────────────────────────────────────────────

  it('returns zero totals when no rules exist', async () => {
    prismaFindMany.mockResolvedValue([]);
    const result = await service.resolveRules(missionCtx(), [descriptor()], [descriptor()]);
    expect(result.matchedRules).toHaveLength(0);
    expect(result.totals.synergyScore).toBe(0);
  });

  // ── Selector matching ─────────────────────────────────────────────────────

  it('matches entityTypes selector', async () => {
    const rule = makeRule({
      sourceSelector: { entityTypes: ['hero'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 10 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const match = descriptor({ entityType: 'hero' });
    const noMatch = descriptor({ entityType: 'villain' });

    const r1 = await service.resolveRules(missionCtx(), [match], [match]);
    expect(r1.totals.synergyScore).toBe(10);

    const r2 = await service.resolveRules(missionCtx(), [noMatch], [noMatch]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches speciesIds selector', async () => {
    const rule = makeRule({
      sourceSelector: { speciesIds: ['elf'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ speciesId: 'elf' })], [descriptor({ speciesId: 'elf' })]);
    expect(r1.totals.synergyScore).toBe(5);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ speciesId: 'dwarf' })], [descriptor({ speciesId: 'dwarf' })]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches collections selector', async () => {
    const rule = makeRule({
      sourceSelector: { collections: ['genesis'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 20 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ collectionId: 'genesis' })], [descriptor({ collectionId: 'genesis' })]);
    expect(r1.totals.synergyScore).toBe(20);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ collectionId: 'other' })], [descriptor()]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches traitsAny selector (case-insensitive)', async () => {
    const rule = makeRule({
      sourceSelector: { traitsAny: ['Ninja', 'Rogue'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 8 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ traits: { class: 'ninja' } })], [descriptor({ traits: { class: 'ninja' } })]);
    expect(r1.totals.synergyScore).toBe(8);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ traits: { class: 'ROGUE' } })], [descriptor({ traits: { class: 'ROGUE' } })]);
    expect(r2.totals.synergyScore).toBe(8);

    const r3 = await service.resolveRules(missionCtx(), [descriptor({ traits: { class: 'mage' } })], [descriptor({ traits: { class: 'mage' } })]);
    expect(r3.totals.synergyScore).toBe(0);
  });

  it('matches traitsAll selector — all required traits must be present', async () => {
    const rule = makeRule({
      sourceSelector: { traitsAll: ['fire', 'dragon'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 15 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const both = descriptor({ traits: { element: 'fire', species: 'dragon' } });
    const only1 = descriptor({ traits: { element: 'fire' } });

    const r1 = await service.resolveRules(missionCtx(), [both], [both]);
    expect(r1.totals.synergyScore).toBe(15);

    const r2 = await service.resolveRules(missionCtx(), [only1], [only1]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches minTraitCount selector', async () => {
    const rule = makeRule({
      sourceSelector: { minTraitCount: 3 },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const enough = descriptor({ traits: { a: '1', b: '2', c: '3' } });
    const tooFew = descriptor({ traits: { a: '1', b: '2' } });

    const r1 = await service.resolveRules(missionCtx(), [enough], [enough]);
    expect(r1.totals.synergyScore).toBe(5);

    const r2 = await service.resolveRules(missionCtx(), [tooFew], [tooFew]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches entityIds selector', async () => {
    const rule = makeRule({
      sourceSelector: { entityIds: ['entity-abc'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 7 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ entityId: 'entity-abc' })], [descriptor({ entityId: 'entity-abc' })]);
    expect(r1.totals.synergyScore).toBe(7);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ entityId: 'entity-xyz' })], [descriptor({ entityId: 'entity-xyz' })]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches rarities selector', async () => {
    const rule = makeRule({
      sourceSelector: { rarities: ['legendary'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 50 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ rarity: 'legendary' })], [descriptor({ rarity: 'legendary' })]);
    expect(r1.totals.synergyScore).toBe(50);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ rarity: 'common' })], [descriptor({ rarity: 'common' })]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches regions selector', async () => {
    const rule = makeRule({
      sourceSelector: { regions: ['arctic'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 3 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ regionId: 'arctic' })], [descriptor({ regionId: 'arctic' })]);
    expect(r1.totals.synergyScore).toBe(3);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ regionId: 'desert' })], [descriptor({ regionId: 'desert' })]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  it('matches factions selector (case-insensitive via traits.faction)', async () => {
    const rule = makeRule({
      sourceSelector: { factions: ['Syndicate'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 12 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const r1 = await service.resolveRules(missionCtx(), [descriptor({ traits: { faction: 'syndicate' } })], [descriptor({ traits: { faction: 'syndicate' } })]);
    expect(r1.totals.synergyScore).toBe(12);

    const r2 = await service.resolveRules(missionCtx(), [descriptor({ traits: { faction: 'empire' } })], [descriptor({ traits: { faction: 'empire' } })]);
    expect(r2.totals.synergyScore).toBe(0);
  });

  // ── Context matching ──────────────────────────────────────────────────────

  it('filters by activityTypes context', async () => {
    const rule = makeRule({
      context: { activityTypes: ['crafting'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 10 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const crafting = await service.resolveRules({ activityType: 'crafting' }, [d], [d]);
    expect(crafting.totals.synergyScore).toBe(10);

    const mission = await service.resolveRules({ activityType: 'mission' }, [d], [d]);
    expect(mission.totals.synergyScore).toBe(0);
  });

  it('filters by missionTagsAny context', async () => {
    const rule = makeRule({
      context: { missionTagsAny: ['dungeon', 'raid'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 6 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const withTag = await service.resolveRules(missionCtx({ missionTags: ['dungeon'] }), [d], [d]);
    expect(withTag.totals.synergyScore).toBe(6);

    const noTag = await service.resolveRules(missionCtx({ missionTags: ['patrol'] }), [d], [d]);
    expect(noTag.totals.synergyScore).toBe(0);
  });

  it('filters by requiresTeamSizeMin', async () => {
    const rule = makeRule({
      context: { requiresTeamSizeMin: 3 },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 4 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const big = await service.resolveRules(missionCtx({ teamSize: 4 }), [d], [d]);
    expect(big.totals.synergyScore).toBe(4);

    const small = await service.resolveRules(missionCtx({ teamSize: 2 }), [d], [d]);
    expect(small.totals.synergyScore).toBe(0);
  });

  it('filters by requiresTeamSizeMax', async () => {
    const rule = makeRule({
      context: { requiresTeamSizeMax: 2 },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 9 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const small = await service.resolveRules(missionCtx({ teamSize: 2 }), [d], [d]);
    expect(small.totals.synergyScore).toBe(9);

    const big = await service.resolveRules(missionCtx({ teamSize: 3 }), [d], [d]);
    expect(big.totals.synergyScore).toBe(0);
  });

  it('date-gated rule: filters by startsAt', async () => {
    const future = new Date(Date.now() + 1_000_000_000);
    const rule = makeRule({
      startsAt: future,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(0);
  });

  it('date-gated rule: filters by endsAt', async () => {
    const past = new Date(Date.now() - 1_000_000_000);
    const rule = makeRule({
      endsAt: past,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(0);
  });

  it('date-gated rule: fires when now is within [startsAt, endsAt]', async () => {
    const past = new Date(Date.now() - 1_000_000_000);
    const future = new Date(Date.now() + 1_000_000_000);
    const rule = makeRule({
      startsAt: past,
      endsAt: future,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 11 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(11);
  });

  // ── Positive synergy: Ninja + Magician ────────────────────────────────────

  it('positive synergy: Ninja + Magician pair fires when both are on the team', async () => {
    const rule = makeRule({
      id: 'ninja-magician',
      name: 'Ninja + Magician',
      sourceSelector: { traitsAny: ['ninja'] },
      targetSelector: { traitsAny: ['magician'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 30 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const ninja = descriptor({ traits: { class: 'ninja' } });
    const magician = descriptor({ traits: { class: 'magician' } });

    const withPair = await service.resolveRules(missionCtx(), [ninja, magician], [ninja, magician]);
    expect(withPair.totals.synergyScore).toBe(30);
    expect(withPair.matchedRules).toHaveLength(1);

    const noPair = await service.resolveRules(missionCtx(), [ninja], [ninja]);
    expect(noPair.totals.synergyScore).toBe(0);
  });

  // ── Negative synergy: Corpo + Viking ─────────────────────────────────────

  it('negative synergy/penalty: Corpo + Viking reduces synergy score', async () => {
    const rule = makeRule({
      id: 'corpo-viking-clash',
      name: 'Corpo + Viking Clash',
      sourceSelector: { traitsAny: ['corpo'] },
      targetSelector: { traitsAny: ['viking'] },
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: -20 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const corpo = descriptor({ traits: { faction: 'corpo' } });
    const viking = descriptor({ traits: { faction: 'viking' } });

    const result = await service.resolveRules(missionCtx(), [corpo, viking], [corpo, viking]);
    expect(result.totals.synergyScore).toBe(-20);
  });

  // ── stackGroup: additive ──────────────────────────────────────────────────

  it('stackGroup additive: all rules in the group accumulate', async () => {
    const ruleA = makeRule({
      id: 'grp-a1',
      stackGroup: 'team-bonus',
      stackMode: StackMode.additive,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 10 }],
    });
    const ruleB = makeRule({
      id: 'grp-a2',
      stackGroup: 'team-bonus',
      stackMode: StackMode.additive,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 15 }],
    });
    prismaFindMany.mockResolvedValue([ruleA, ruleB]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(25);
  });

  // ── stackGroup: best_only ─────────────────────────────────────────────────

  it('stackGroup best_only: only the rule with the highest positive value fires', async () => {
    const low = makeRule({
      id: 'best-low',
      stackGroup: 'elite-boost',
      stackMode: StackMode.best_only,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 5 }],
    });
    const high = makeRule({
      id: 'best-high',
      stackGroup: 'elite-boost',
      stackMode: StackMode.best_only,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 40 }],
    });
    prismaFindMany.mockResolvedValue([low, high]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(40);
    expect(result.matchedRules).toHaveLength(1);
    expect(result.matchedRules[0].ruleId).toBe('best-high');
  });

  it('stackGroup best_only: negative-only group fires no rule', async () => {
    const neg = makeRule({
      id: 'best-neg',
      stackGroup: 'penalty-grp',
      stackMode: StackMode.best_only,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: -10 }],
    });
    prismaFindMany.mockResolvedValue([neg]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(0);
    expect(result.matchedRules).toHaveLength(0);
  });

  // ── stackGroup: unique ────────────────────────────────────────────────────

  it('stackGroup unique: fires once regardless of pair count', async () => {
    // 2 sources × 2 targets = 4 pairs, but unique means applications = 1
    const rule = makeRule({
      id: 'unique-rule',
      stackGroup: 'unique-grp',
      stackMode: StackMode.unique,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 100 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const s1 = descriptor({ traits: { a: '1' } });
    const s2 = descriptor({ traits: { b: '2' } });
    const result = await service.resolveRules(missionCtx(), [s1, s2], [s1, s2]);
    expect(result.totals.synergyScore).toBe(100);
    expect(result.matchedRules[0].applications).toBe(1);
  });

  // ── maxApplications cap ───────────────────────────────────────────────────

  it('maxApplications caps how many pair applications fire', async () => {
    // 3 entities all match → 9 pairs, but maxApplications = 2
    const rule = makeRule({
      id: 'capped-rule',
      maxApplications: 2,
      stackMode: StackMode.additive,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 10 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = () => descriptor({ traits: { x: '1' } });
    const result = await service.resolveRules(missionCtx(), [d(), d(), d()], [d(), d(), d()]);
    // applications should be capped at 2, not 9
    expect(result.matchedRules[0].applications).toBe(2);
    expect(result.totals.synergyScore).toBe(20);
  });

  // ── Stat modifier: MISSION_POWER percent_add ──────────────────────────────

  it('aggregates MISSION_POWER stat_modifier percent_add correctly', async () => {
    const rule1 = makeRule({
      id: 'mp-10',
      effects: [{ type: 'stat_modifier', stat: 'MISSION_POWER', operation: 'percent_add', value: 10 }],
    });
    const rule2 = makeRule({
      id: 'mp-5',
      effects: [{ type: 'stat_modifier', stat: 'MISSION_POWER', operation: 'percent_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rule1, rule2]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.statModifiers['MISSION_POWER']).toBeDefined();
    expect(result.totals.statModifiers['MISSION_POWER'].percentAdd).toBe(15);
    expect(result.totals.statModifiers['MISSION_POWER'].flat).toBe(0);
    expect(result.totals.statModifiers['MISSION_POWER'].multiplier).toBe(1);
  });

  it('aggregates MISSION_POWER flat_add stat modifier', async () => {
    const rule = makeRule({
      effects: [{ type: 'stat_modifier', stat: 'MISSION_POWER', operation: 'flat_add', value: 50 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.statModifiers['MISSION_POWER'].flat).toBe(50);
  });

  // ── CRAFTING_LUCK stat modifier ───────────────────────────────────────────

  it('emits CRAFTING_LUCK percentAdd in statModifiers', async () => {
    const rule = makeRule({
      context: { activityTypes: ['crafting'] },
      effects: [{ type: 'stat_modifier', stat: 'CRAFTING_LUCK', operation: 'percent_add', value: 20 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules({ activityType: 'crafting' }, [d], [d]);
    expect(result.totals.statModifiers['CRAFTING_LUCK']).toBeDefined();
    expect(result.totals.statModifiers['CRAFTING_LUCK'].percentAdd).toBe(20);
  });

  // ── Duration modifier ─────────────────────────────────────────────────────

  it('aggregates duration modifier flat_seconds', async () => {
    const rule = makeRule({
      effects: [{ type: 'duration_modifier', activity: 'mission', operation: 'flat_seconds', value: -300 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.durationModifiers['mission']).toBeDefined();
    expect(result.totals.durationModifiers['mission'].flatSeconds).toBe(-300);
    expect(result.totals.durationModifiers['mission'].percentAdd).toBe(0);
  });

  it('aggregates duration modifier percent_add', async () => {
    const rule = makeRule({
      effects: [{ type: 'duration_modifier', activity: 'crafting', operation: 'percent_add', value: -10 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules({ activityType: 'crafting' }, [d], [d]);
    expect(result.totals.durationModifiers['crafting'].percentAdd).toBe(-10);
  });

  it('combines flat_seconds and percent_add duration modifiers from two rules', async () => {
    const flatRule = makeRule({
      effects: [{ type: 'duration_modifier', activity: 'mission', operation: 'flat_seconds', value: -60 }],
    });
    const pctRule = makeRule({
      effects: [{ type: 'duration_modifier', activity: 'mission', operation: 'percent_add', value: -15 }],
    });
    prismaFindMany.mockResolvedValue([flatRule, pctRule]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    const mod = result.totals.durationModifiers['mission'];
    expect(mod.flatSeconds).toBe(-60);
    expect(mod.percentAdd).toBe(-15);
  });

  // ── resource_yield_modifier ───────────────────────────────────────────────

  it('aggregates resourceYieldModifiers per resourceId', async () => {
    const rule = makeRule({
      context: { activityTypes: ['outpost'] },
      effects: [{ type: 'resource_yield_modifier', resourceId: 'gold', operation: 'percent_add', value: 25 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = descriptor();
    const result = await service.resolveRules({ activityType: 'outpost' }, [d], [d]);
    expect(result.totals.resourceYieldModifiers).toHaveLength(1);
    const goldMod = result.totals.resourceYieldModifiers.find(m => m.resourceId === 'gold');
    expect(goldMod?.percentAdd).toBe(25);
    expect(goldMod?.flat).toBe(0);
    expect(goldMod?.multiplier).toBe(1);
  });

  it('keeps different resourceIds separate in resourceYieldModifiers', async () => {
    const rGold = makeRule({
      effects: [{ type: 'resource_yield_modifier', resourceId: 'gold', operation: 'percent_add', value: 10 }],
    });
    const rWood = makeRule({
      effects: [{ type: 'resource_yield_modifier', resourceId: 'wood', operation: 'percent_add', value: 5 }],
    });
    prismaFindMany.mockResolvedValue([rGold, rWood]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.resourceYieldModifiers).toHaveLength(2);
    expect(result.totals.resourceYieldModifiers.find(m => m.resourceId === 'gold')?.percentAdd).toBe(10);
    expect(result.totals.resourceYieldModifiers.find(m => m.resourceId === 'wood')?.percentAdd).toBe(5);
  });

  // ── Multi-application effect scaling ─────────────────────────────────────

  it('scales effect value by applications count for additive ops', async () => {
    // 2 sources × 2 targets = 4 pairs, maxApplications = 3
    const rule = makeRule({
      maxApplications: 3,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 10 }],
    });
    prismaFindMany.mockResolvedValue([rule]);

    const d = () => descriptor();
    const result = await service.resolveRules(missionCtx(), [d(), d()], [d(), d()]);
    expect(result.matchedRules[0].applications).toBe(3);
    expect(result.totals.synergyScore).toBe(30);
  });

  // ── isSelectorEmpty helper ────────────────────────────────────────────────

  it('isSelectorEmpty returns true for empty object, null, or undefined', () => {
    expect(service.isSelectorEmpty({})).toBe(true);
    expect(service.isSelectorEmpty(null as any)).toBe(true);
    expect(service.isSelectorEmpty(undefined as any)).toBe(true);
    expect(service.isSelectorEmpty({ traitsAny: ['ninja'] })).toBe(false);
  });

  // ── matchesContext helper ─────────────────────────────────────────────────

  it('matchesContext returns true for empty rule context', () => {
    expect(service.matchesContext({ activityType: 'mission' }, {})).toBe(true);
  });

  it('matchesContext blocks when seasonId is required and not provided', () => {
    expect(service.matchesContext({ activityType: 'mission' }, { seasonIds: ['summer'] })).toBe(false);
    expect(service.matchesContext({ activityType: 'mission', seasonId: 'summer' }, { seasonIds: ['summer'] })).toBe(true);
  });

  // ── Disabled rule is skipped (via enabled filter in loadRules) ────────────

  it('disabled rules are excluded via prisma query (enabled:true filter)', async () => {
    // The service queries { where: { enabled: true } } — simulate by returning
    // only enabled rows from the mock.
    const disabledRule = makeRule({
      enabled: false,
      effects: [{ type: 'synergy_score_modifier', operation: 'flat_add', value: 100 }],
    });
    // Mock returns [] because prisma's where:{enabled:true} filters it out
    prismaFindMany.mockResolvedValue([]);

    const d = descriptor();
    const result = await service.resolveRules(missionCtx(), [d], [d]);
    expect(result.totals.synergyScore).toBe(0);
    expect(prismaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true },
    }));
    void disabledRule;
  });
});

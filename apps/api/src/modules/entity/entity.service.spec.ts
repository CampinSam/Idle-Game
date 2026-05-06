import { Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { applyWeightedLevelUp, levelUpEntityToLevel } from './entity-generator.util';
import { XP_PER_LEVEL, EffectCategory, EffectTargetType } from '@derp/shared';

const STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

function makeEntity(overrides: Partial<any> = {}) {
  return {
    id: 'ent-1',
    ownerUserId: 'user-1',
    speciesId: 'derp_bird',
    display: { name: 'Sparrow' },
    stats: { ATK: 5, DEF: 5, SPD: 5, FOC: 5, LCK: 5, VIT: 5, scaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 } },
    progression: { level: 1, xp: 0, levelHistory: [] },
    state: { status: 'idle' },
    ...overrides,
  };
}

function makeStore(initial: any[] = []) {
  const rows = new Map<string, any>(initial.map((e) => [e.id, e]));
  return {
    rows,
    api: {
      entity: {
        findFirst: jest.fn(async ({ where }: any) => {
          for (const e of rows.values()) {
            if (where.id && e.id !== where.id) continue;
            if (where.ownerUserId && e.ownerUserId !== where.ownerUserId) continue;
            return e;
          }
          return null;
        }),
        findMany: jest.fn(async () => Array.from(rows.values())),
        update: jest.fn(async ({ where, data }: any) => {
          const e = rows.get(where.id);
          const next = { ...e, ...data };
          rows.set(where.id, next);
          return next;
        }),
      },
    },
  };
}

function makeService(prismaApi: any, opts: { xpMultiplier?: number } = {}) {
  const effectService: any = {
    resolveForTarget: jest.fn(async (_userId, _tt, _id, category) => {
      if (category === EffectCategory.XP_MULTIPLIER && opts.xpMultiplier) {
        return { flatAdd: 0, percentAdd: 0, multiplier: opts.xpMultiplier };
      }
      return { flatAdd: 0, percentAdd: 0, multiplier: 1 };
    }),
  };
  const notificationCalls: any[] = [];
  const notificationService: any = {
    recordEntityLevelUp: jest.fn(async (data: any) => {
      notificationCalls.push(data);
      return { id: `notif-${notificationCalls.length}` };
    }),
  };
  const settlementService: any = {
    recalcLocationsForWorkerEntity: jest.fn(async () => undefined),
  };
  const svc = new EntityService(prismaApi as any, effectService, notificationService, settlementService);
  (svc as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() } as unknown as Logger;
  return { svc, effectService, notificationService, notificationCalls };
}

function totalGainsOfHistory(history: any[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const h of history) {
    for (const [k, v] of Object.entries(h.gains || {})) {
      totals[k] = (totals[k] || 0) + (v as number);
    }
  }
  return totals;
}

describe('EntityService.addEntityXp (canonical)', () => {
  it('grants weighted stat gains and appends a levelHistory entry per level transition', async () => {
    const store = makeStore([makeEntity()]);
    const { svc, notificationService, notificationCalls } = makeService(store.api);

    // Enough XP to cross from L1 to L3 (consume L1 + L2 thresholds)
    const xp = XP_PER_LEVEL(1) + XP_PER_LEVEL(2);
    const result = await svc.addEntityXp('ent-1', 'user-1', xp);

    expect(result.oldLevel).toBe(1);
    expect(result.newLevel).toBe(3);
    expect(result.leveledUp).toBe(true);
    expect(result.gainsPerLevel).toHaveLength(2);
    expect(result.gainsPerLevel.map((g) => g.level)).toEqual([2, 3]);

    const stored = store.rows.get('ent-1');
    expect(stored.progression.level).toBe(3);
    expect(stored.progression.xp).toBe(0);
    expect(stored.progression.levelHistory).toHaveLength(2);

    // Each weighted level-up contributes exactly 6 (+1 per stat) + 14 (random
    // rolls) = 20 points distributed across the six stats.
    const totalGained = STAT_KEYS.reduce((sum, k) => sum + (stored.stats[k] - 5), 0);
    expect(totalGained).toBe(40);

    expect(notificationService.recordEntityLevelUp).toHaveBeenCalledTimes(1);
    expect(notificationCalls[0].fromLevel).toBe(1);
    expect(notificationCalls[0].toLevel).toBe(3);
    expect(notificationCalls[0].gainsPerLevel).toHaveLength(2);
  });

  it('produces one history entry per level when crossing N levels in a single grant', async () => {
    const store = makeStore([makeEntity()]);
    const { svc } = makeService(store.api);

    // Grant a giant pile of XP — enough for ~5 level-ups.
    const xp = [1, 2, 3, 4, 5].reduce((sum, lvl) => sum + XP_PER_LEVEL(lvl), 0);
    const result = await svc.addEntityXp('ent-1', 'user-1', xp);
    expect(result.newLevel).toBe(6);
    expect(result.gainsPerLevel).toHaveLength(5);
    const stored = store.rows.get('ent-1');
    expect(stored.progression.levelHistory).toHaveLength(5);
    expect(stored.progression.levelHistory.map((h: any) => h.level)).toEqual([2, 3, 4, 5, 6]);
  });

  it('applies xp_multiplier exactly once when skipEffects is not set', async () => {
    const store = makeStore([makeEntity({ progression: { level: 1, xp: 0, levelHistory: [] } })]);
    const { svc, effectService } = makeService(store.api, { xpMultiplier: 2 });

    // Grant XP just under the L1→L2 threshold; doubled, it crosses.
    const baseXp = Math.ceil(XP_PER_LEVEL(1) / 2) + 1;
    const result = await svc.addEntityXp('ent-1', 'user-1', baseXp);
    expect(effectService.resolveForTarget).toHaveBeenCalledTimes(1);
    expect(result.xpGained).toBe(baseXp * 2);
    expect(result.newLevel).toBe(2);
  });

  it('does NOT re-apply xp_multiplier when skipEffects:true', async () => {
    const store = makeStore([makeEntity()]);
    const { svc, effectService } = makeService(store.api, { xpMultiplier: 2 });
    const result = await svc.addEntityXp('ent-1', 'user-1', 10, undefined, { skipEffects: true });
    expect(effectService.resolveForTarget).not.toHaveBeenCalled();
    expect(result.xpGained).toBe(10);
  });

  it('does not emit a notification when no level-up occurred', async () => {
    const store = makeStore([makeEntity()]);
    const { svc, notificationService } = makeService(store.api);
    const result = await svc.addEntityXp('ent-1', 'user-1', 1);
    expect(result.leveledUp).toBe(false);
    expect(notificationService.recordEntityLevelUp).not.toHaveBeenCalled();
  });

  it('respects skipNotification opt even on level-up', async () => {
    const store = makeStore([makeEntity()]);
    const { svc, notificationService } = makeService(store.api);
    await svc.addEntityXp('ent-1', 'user-1', XP_PER_LEVEL(1), undefined, {
      skipEffects: true,
      skipNotification: true,
    });
    expect(notificationService.recordEntityLevelUp).not.toHaveBeenCalled();
  });
});

describe('EntityService.backfillLevelHistory', () => {
  it('fills missing history entries for entities whose level outpaces their history', async () => {
    const stale = makeEntity({
      id: 'stale',
      progression: { level: 4, xp: 0, levelHistory: [] }, // missing all 3 entries
      stats: { ATK: 5, DEF: 5, SPD: 5, FOC: 5, LCK: 5, VIT: 5, scaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 } },
    });
    const fresh = makeEntity({ id: 'fresh' }); // level 1, nothing to do
    const correct = makeEntity({
      id: 'correct',
      progression: {
        level: 3, xp: 0,
        levelHistory: [
          { level: 2, gains: { ATK: 4, DEF: 3, SPD: 4, FOC: 3, LCK: 3, VIT: 3 } },
          { level: 3, gains: { ATK: 4, DEF: 3, SPD: 4, FOC: 3, LCK: 3, VIT: 3 } },
        ],
      },
    });
    const store = makeStore([stale, fresh, correct]);
    const { svc, notificationService } = makeService(store.api);

    const out1 = await svc.backfillLevelHistory();
    expect(out1.scanned).toBe(3);
    expect(out1.fixed).toBe(1);

    const updated = store.rows.get('stale');
    expect(updated.progression.levelHistory).toHaveLength(3);
    expect(updated.progression.levelHistory.map((h: any) => h.level)).toEqual([2, 3, 4]);
    const totals = totalGainsOfHistory(updated.progression.levelHistory);
    expect(STAT_KEYS.reduce((s, k) => s + (totals[k] || 0), 0)).toBe(60); // 3 levels × 20
    // Backfill must not fire notifications.
    expect(notificationService.recordEntityLevelUp).not.toHaveBeenCalled();

    // Idempotent: a second run is a no-op.
    const out2 = await svc.backfillLevelHistory();
    expect(out2.fixed).toBe(0);
  });
});

describe('levelUpEntityToLevel (entity-grant override helper)', () => {
  it('produces N-1 history entries for level N with stats matching N-1 weighted level-ups', () => {
    const base = { ATK: 5, DEF: 5, SPD: 5, FOC: 5, LCK: 5, VIT: 5, scaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 } };
    const { stats, levelHistory } = levelUpEntityToLevel(base, 4);
    expect(levelHistory).toHaveLength(3);
    expect(levelHistory.map((h) => h.level)).toEqual([2, 3, 4]);
    const totalGain = STAT_KEYS.reduce((s, k) => s + ((stats[k] as number) - 5), 0);
    expect(totalGain).toBe(60); // 3 levels × 20 points each
  });

  it('returns base stats unchanged for level=1', () => {
    const base = { ATK: 5, DEF: 5, SPD: 5, FOC: 5, LCK: 5, VIT: 5 };
    const { stats, levelHistory } = levelUpEntityToLevel(base, 1);
    expect(levelHistory).toHaveLength(0);
    expect(stats).toEqual(base);
  });
});

describe('NotificationService.recordEntityLevelUp (merge behavior)', () => {
  // Local require to avoid hoisting cycles with the entity-service tests above.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NotificationService } = require('../notification/notification.service');

  function makeNotifPrisma() {
    const rows = new Map<string, any>();
    let nextId = 1;
    return {
      rows,
      api: {
        notification: {
          findFirst: jest.fn(async ({ where, orderBy: _ }: any) => {
            const within = (n: any) =>
              (!where.userId || n.userId === where.userId) &&
              (!where.groupKey || n.groupKey === where.groupKey) &&
              (!where.readAt || n.readAt === null) &&
              (!where.archivedAt || n.archivedAt === null);
            const list = Array.from(rows.values()).filter(within);
            return list[list.length - 1] || null;
          }),
          create: jest.fn(async ({ data }: any) => {
            const id = `notif-${nextId++}`;
            const created = {
              id,
              ...data,
              readAt: null,
              archivedAt: null,
              createdAt: new Date(),
            };
            rows.set(id, created);
            return created;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const existing = rows.get(where.id);
            const updated = { ...existing, ...data };
            rows.set(where.id, updated);
            return updated;
          }),
        },
      },
    };
  }

  it('merges back-to-back level-ups for the same entity within 90s into one notification', async () => {
    const store = makeNotifPrisma();
    const svc = new NotificationService(store.api as any);

    await svc.recordEntityLevelUp({
      userId: 'user-1',
      entityId: 'ent-9',
      entityName: 'Sparrow',
      fromLevel: 1,
      toLevel: 2,
      gainsPerLevel: [{ level: 2, gains: { ATK: 4, DEF: 3, SPD: 4, FOC: 3, LCK: 3, VIT: 3 } }],
    });
    await svc.recordEntityLevelUp({
      userId: 'user-1',
      entityId: 'ent-9',
      entityName: 'Sparrow',
      fromLevel: 2,
      toLevel: 3,
      gainsPerLevel: [{ level: 3, gains: { ATK: 2, DEF: 5, SPD: 1, FOC: 4, LCK: 4, VIT: 4 } }],
    });

    expect(store.rows.size).toBe(1);
    const notif = Array.from(store.rows.values())[0];
    expect(notif.type).toBe('entity_level_up');
    expect(notif.priority).toBe('high');
    expect(notif.category).toBe('progression');
    expect(notif.groupKey).toBe('entity_level_up:ent-9');
    expect(notif.meta.fromLevel).toBe(1);
    expect(notif.meta.toLevel).toBe(3);
    expect(notif.meta.totalGains.ATK).toBe(6);
    expect(notif.meta.totalGains.DEF).toBe(8);
    expect(notif.meta.count).toBe(2);
    expect(notif.body).toContain('Level 3');
  });
});

describe('applyWeightedLevelUp invariants', () => {
  it('always grants exactly 20 stat points per call', () => {
    const stats: Record<string, any> = { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0, scaling: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 } };
    for (let i = 0; i < 25; i++) {
      const r = applyWeightedLevelUp(stats);
      const total = STAT_KEYS.reduce((s, k) => s + r.gains[k], 0);
      expect(total).toBe(20);
    }
  });
});

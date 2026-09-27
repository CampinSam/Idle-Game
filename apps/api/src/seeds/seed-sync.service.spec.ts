import { SeedSyncService, SEED_TABLE_ORDER } from './seed-sync.service';

const SNAPSHOT_DISPLAY_ID = '11111111-1111-4111-8111-111111111111';
const SNAPSHOT_CHILD_DISPLAY_ID = '12121212-1212-4121-8121-121212121212';
const SNAPSHOT_CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT_CHILD_CATEGORY_ID = '23232323-2323-4232-8232-232323232323';
const SNAPSHOT_LOCAL_CATEGORY_ID = '24242424-2424-4242-8242-242424242424';
const DATABASE_DISPLAY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DATABASE_CHILD_DISPLAY_ID = 'abababab-abab-4aba-8aba-abababababab';
const DATABASE_CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DATABASE_CHILD_CATEGORY_ID = 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc';
const DATABASE_LOCAL_CATEGORY_ID = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

function definitionModel(
  rowsByKey: Map<string, any>,
  databaseIdsByKey: Record<string, string>,
  validateCreate?: (create: any, rowsByKey: Map<string, any>) => void,
) {
  return {
    findMany: jest.fn(async () => [...rowsByKey.values()]),
    upsert: jest.fn(async ({ where, create }: any) => {
      validateCreate?.(create, rowsByKey);
      const key = where.key;
      if (!rowsByKey.has(key)) {
        const id = databaseIdsByKey[key];
        rowsByKey.set(key, { ...create, id, key });
      }
      return rowsByKey.get(key);
    }),
  };
}

describe('SeedSyncService seed FK resolution', () => {
  it('remaps snapshot UUID references in category and mission records to fresh database IDs', async () => {
    const liveDisplayIds = new Set([DATABASE_DISPLAY_ID, DATABASE_CHILD_DISPLAY_ID]);
    const liveCategoryIds = new Set([DATABASE_CATEGORY_ID, DATABASE_CHILD_CATEGORY_ID]);
    const displayDefs = definitionModel(new Map(), {
      'display-a': DATABASE_DISPLAY_ID,
      'display-child': DATABASE_CHILD_DISPLAY_ID,
    });
    const missionCategories = definitionModel(new Map(), {
      'category-a': DATABASE_CATEGORY_ID,
      'category-child': DATABASE_CHILD_CATEGORY_ID,
      'category-local-child': DATABASE_LOCAL_CATEGORY_ID,
    }, (create, rowsByKey) => {
      if (create.displayDefId && !liveDisplayIds.has(create.displayDefId)) {
        throw new Error(`displayDef FK violation: ${create.displayDefId}`);
      }
      if (create.parentId && ![...rowsByKey.values()].some((row) => row.id === create.parentId)) {
        throw new Error(`missionCategoryDef parent FK violation: ${create.parentId}`);
      }
    });
    const missionDef = {
      upsert: jest.fn(async ({ create }: any) => {
        if (create.displayDefId && !liveDisplayIds.has(create.displayDefId)) {
          throw new Error(`displayDef FK violation: ${create.displayDefId}`);
        }
        if (!liveCategoryIds.has(create.missionCategoryDefId)) {
          throw new Error(`missionCategoryDef FK violation: ${create.missionCategoryDefId}`);
        }
      }),
    };
    const prisma = { displayDef: displayDefs, missionCategoryDef: missionCategories, missionDef } as any;
    const service = new SeedSyncService(prisma);

    const result = await service.applySeedData({
      displayDef: [
        { id: SNAPSHOT_DISPLAY_ID, key: 'display-a', name: 'Display A' },
        { id: SNAPSHOT_CHILD_DISPLAY_ID, key: 'display-child', name: 'Display Child' },
      ],
      missionCategoryDef: [{
        id: SNAPSHOT_CATEGORY_ID,
        key: 'category-a',
        name: 'Category A',
        parentId: null,
        displayDefId: SNAPSHOT_DISPLAY_ID,
      }, {
        id: SNAPSHOT_CHILD_CATEGORY_ID,
        key: 'category-child',
        name: 'Category Child',
        parentId: SNAPSHOT_CATEGORY_ID,
        displayDefId: SNAPSHOT_CHILD_DISPLAY_ID,
      }, {
        id: SNAPSHOT_LOCAL_CATEGORY_ID,
        key: 'category-local-child',
        name: 'Category Local Child',
        parentId: DATABASE_CATEGORY_ID,
        displayDefId: DATABASE_DISPLAY_ID,
      }],
      missionDef: [{
        id: '33333333-3333-4333-8333-333333333333',
        key: 'mission-a',
        name: 'Mission A',
        missionCategoryDefId: SNAPSHOT_CHILD_CATEGORY_ID,
        displayDefId: SNAPSHOT_CHILD_DISPLAY_ID,
      }],
    });

    expect(result.missionDef).toBe('ok (1)');
    expect(missionCategories.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        key: 'category-child',
        parentId: DATABASE_CATEGORY_ID,
        displayDefId: DATABASE_CHILD_DISPLAY_ID,
      }),
    }));
    expect(missionCategories.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        key: 'category-local-child',
        parentId: DATABASE_CATEGORY_ID,
        displayDefId: DATABASE_DISPLAY_ID,
      }),
    }));
    expect(missionDef.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        missionCategoryDefId: DATABASE_CHILD_CATEGORY_ID,
        displayDefId: DATABASE_CHILD_DISPLAY_ID,
      }),
    }));
  });

  it.each(['parentId', 'displayDefId'])(
    'reports an unresolved missionCategoryDef %s instead of setting it to null',
    async (field) => {
      const missionCategoryDef = { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() };
      const service = new SeedSyncService({
        displayDef: { findMany: jest.fn().mockResolvedValue([]) },
        missionCategoryDef,
      } as any);
      const record: any = {
        id: SNAPSHOT_CHILD_CATEGORY_ID,
        key: 'category-child',
        name: 'Category Child',
        parentId: null,
        displayDefId: null,
      };
      record[field] = '44444444-4444-4444-8444-444444444444';

      const result = await service.applySeedData({ missionCategoryDef: [record] }, ['missionCategoryDef']);

      expect(result.missionCategoryDef).toContain(`error: upsertTable(missionCategoryDef): cannot resolve ${field}`);
      expect(missionCategoryDef.upsert).not.toHaveBeenCalled();
    },
  );

  it('reports an unresolved non-null FK instead of setting it to null', async () => {
    const missionDef = { upsert: jest.fn() };
    const service = new SeedSyncService({
      displayDef: { findMany: jest.fn().mockResolvedValue([]) },
      missionCategoryDef: { findMany: jest.fn().mockResolvedValue([]) },
      missionDef,
    } as any);

    const result = await service.applySeedData({
      missionDef: [{
        id: '33333333-3333-4333-8333-333333333333',
        key: 'mission-a',
        name: 'Mission A',
        missionCategoryDefId: SNAPSHOT_CATEGORY_ID,
      }],
    }, ['missionDef']);

    expect(result.missionDef).toContain('error: upsertTable(missionDef): cannot resolve missionCategoryDefId');
    expect(missionDef.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      ownerTable: 'locationDefinition',
      ownerField: 'regionId',
      referencedTable: 'regionDefinition',
      referencedKey: 'region-a',
    },
    {
      ownerTable: 'buildingDef',
      ownerField: 'displayDefId',
      referencedTable: 'displayDef',
      referencedKey: 'display-a',
    },
    {
      ownerTable: 'recipeDef',
      ownerField: 'displayDefId',
      referencedTable: 'displayDef',
      referencedKey: 'display-a',
    },
    {
      ownerTable: 'powerDef',
      ownerField: 'effectDefId',
      referencedTable: 'effectDef',
      referencedKey: 'effect-a',
    },
  ])('remaps snapshot UUID $ownerField for $ownerTable', async ({
    ownerTable,
    ownerField,
    referencedTable,
    referencedKey,
  }) => {
    const snapshotReferenceId = '55555555-5555-4555-8555-555555555555';
    const databaseReferenceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const referenceModel = {
      findMany: jest.fn().mockResolvedValue([{ id: databaseReferenceId, key: referencedKey }]),
    };
    const ownerModel = { upsert: jest.fn(async ({ create }: any) => {
      if (ownerField === 'effectDefId') return;
      if (create[ownerField] !== databaseReferenceId) throw new Error(`FK violation: ${create[ownerField]}`);
    }) };
    const prisma: any = { [referencedTable]: referenceModel, [ownerTable]: ownerModel };
    if (ownerTable === 'powerDef') {
      prisma.$executeRaw = jest.fn((...args: any[]) => {
        if (!args.includes(databaseReferenceId)) throw new Error('effectDef FK violation');
        return Promise.resolve();
      });
    }
    const service = new SeedSyncService(prisma);
    const sourceRecord = { id: snapshotReferenceId, key: referencedKey };
    const ownerRecord: any = {
      id: '66666666-6666-4666-8666-666666666666',
      key: 'owner-a',
      name: 'Owner A',
      [ownerField]: snapshotReferenceId,
    };
    if (ownerTable === 'powerDef') ownerRecord.powerType = 'effect_backed';

    const result = await service.applySeedData({
      [referencedTable]: [sourceRecord],
      [ownerTable]: [ownerRecord],
    }, [ownerTable]);

    expect(result[ownerTable]).toBe('ok (1)');
    if (ownerTable === 'powerDef') {
      expect(prisma.$executeRaw.mock.calls[0]).toContain(databaseReferenceId);
    } else {
      expect(ownerModel.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ [ownerField]: databaseReferenceId }),
      }));
    }
  });

  it.each([
    ['locationDefinition', 'regionId', 'regionDefinition'],
    ['buildingDef', 'displayDefId', 'displayDef'],
    ['recipeDef', 'displayDefId', 'displayDef'],
    ['powerDef', 'effectDefId', 'effectDef'],
  ])('fails explicitly when %s.%s cannot resolve its reference', async (
    ownerTable,
    ownerField,
    referencedTable,
  ) => {
    const snapshotReferenceId = '55555555-5555-4555-8555-555555555555';
    const referenceModel = { findMany: jest.fn().mockResolvedValue([]) };
    const ownerModel = { upsert: jest.fn() };
    const prisma: any = { [referencedTable]: referenceModel, [ownerTable]: ownerModel };
    if (ownerTable === 'powerDef') prisma.$executeRaw = jest.fn();
    const service = new SeedSyncService(prisma);
    const ownerRecord: any = {
      id: '66666666-6666-4666-8666-666666666666',
      key: 'owner-a',
      name: 'Owner A',
      [ownerField]: snapshotReferenceId,
    };
    if (ownerTable === 'powerDef') ownerRecord.powerType = 'effect_backed';

    const result = await service.applySeedData({
      [referencedTable]: [{ id: snapshotReferenceId, key: 'reference-a' }],
      [ownerTable]: [ownerRecord],
    }, [ownerTable]);

    expect(result[ownerTable]).toContain(`error: upsertTable(${ownerTable}): cannot resolve ${ownerField}`);
    expect(ownerModel.upsert).not.toHaveBeenCalled();
    if (ownerTable === 'powerDef') expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('seeds visual effects before tags and accepts tag effectKey slugs', async () => {
    const visualEffects: any[] = [];
    const visualEffectDef = {
      findMany: jest.fn(async () => visualEffects),
      upsert: jest.fn(async ({ where, create }: any) => {
        const row = { ...create, key: where.key };
        visualEffects.push(row);
        return row;
      }),
    };
    const tagDef = { upsert: jest.fn() };
    const service = new SeedSyncService({ visualEffectDef, tagDef } as any);

    const result = await service.applySeedData({
      visualEffectDef: [{
        id: '77777777-7777-4777-8777-777777777777',
        key: 'pulse-soft',
        name: 'Pulse Soft',
      }],
      tagDef: [{
        id: '88888888-8888-4888-8888-888888888888',
        key: 'rarity-unique',
        label: 'Unique',
        effectKey: 'pulse-soft',
      }],
    });

    expect(SEED_TABLE_ORDER.indexOf('visualEffectDef')).toBeLessThan(SEED_TABLE_ORDER.indexOf('tagDef'));
    expect(result.tagDef).toBe('ok (1)');
    expect(tagDef.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ effectKey: 'pulse-soft' }),
    }));
  });

  it('reports unresolved tag effectKey slugs without nulling or upserting them', async () => {
    const tagDef = { upsert: jest.fn() };
    const service = new SeedSyncService({
      visualEffectDef: { findMany: jest.fn().mockResolvedValue([]) },
      tagDef,
    } as any);

    const result = await service.applySeedData({
      tagDef: [{ id: '88888888-8888-4888-8888-888888888888', key: 'rarity-unique', effectKey: 'missing-effect' }],
    }, ['tagDef']);

    expect(result.tagDef).toContain('error: upsertTable(tagDef): cannot resolve effectKey');
    expect(tagDef.upsert).not.toHaveBeenCalled();
  });
});
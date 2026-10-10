import { diffLocationLevelUnlocks, LevelRules } from './level-config.util';

describe('diffLocationLevelUnlocks', () => {
  it('applies linear growth to storage and production deltas', () => {
    const rules: LevelRules = {
      level: {
        '1': {
          storage: [
            {
              type: 'currency',
              id: 'wood',
              baseCapacity: 100,
              growthRate: 'linear',
              growthScalar: 50,
            },
          ],
          production: [
            {
              type: 'currency',
              id: 'wood',
              ratePerHour: 10,
              growthRate: 'linear',
              growthScalar: 5,
            },
          ],
        },
      },
    };

    const diff = diffLocationLevelUnlocks(rules, 1, 3);

    // storage: floor(100 + 50*(3-1)) - floor(100 + 50*(1-1)) = 200 - 100 = 100
    expect(diff.storageAdded).toEqual([
      { type: 'currency', id: 'wood', addedCapacity: 100 },
    ]);
    // production: floor(10 + 5*(3-1)) - floor(10 + 5*0) = 20 - 10 = 10
    expect(diff.productionAdded).toEqual([
      { type: 'currency', id: 'wood', addedRate: 10 },
    ]);
  });

  it('captures unlocks from intermediate levels on a multi-level jump', () => {
    const rules: LevelRules = {
      level: {
        '1': {
          buildings: {
            slots: 1,
            allowed: [{ buildingDefId: 'tent' }],
          },
          rooms: {
            allowed: [{ roomDefId: 'hearth' }],
          },
          workers: { slots: 1 },
        },
        '2': {
          buildings: {
            slots: 2,
            allowed: [{ buildingDefId: 'workshop' }],
          },
          rooms: {
            allowed: [{ roomDefId: 'forge' }],
          },
          workers: { slots: 2 },
        },
        '3': {
          buildings: {
            slots: 3,
            allowed: [{ buildingDefId: 'warehouse' }],
          },
          rooms: {
            allowed: [{ roomDefId: 'vault' }],
          },
          workers: { slots: 3 },
        },
      },
    };

    const diff = diffLocationLevelUnlocks(rules, 1, 3);

    expect(diff.workerSlotsAdded).toBe(2);
    expect(diff.buildingSlotsAdded).toBe(2);
    // Both intermediate (level 2) and target (level 3) unlocks must appear.
    expect(diff.newAllowedBuildings.sort()).toEqual(
      ['warehouse', 'workshop'].sort(),
    );
    expect(diff.newAllowedRooms.sort()).toEqual(['forge', 'vault'].sort());
  });

  it('treats resources first introduced at toLevel as full unlocks (flat and linear)', () => {
    const rules: LevelRules = {
      level: {
        '1': {
          storage: [
            { type: 'currency', id: 'wood', baseCapacity: 100 },
          ],
          production: [
            { type: 'currency', id: 'wood', ratePerHour: 5 },
          ],
        },
        '2': {
          storage: [
            { type: 'currency', id: 'wood', baseCapacity: 100 },
            // New resource introduced at level 2 — flat.
            { type: 'currency', id: 'stone', baseCapacity: 50 },
            // New resource introduced at level 2 — linear growth.
            {
              type: 'currency',
              id: 'iron',
              baseCapacity: 20,
              growthRate: 'linear',
              growthScalar: 10,
            },
          ],
          production: [
            { type: 'currency', id: 'wood', ratePerHour: 5 },
            { type: 'currency', id: 'stone', ratePerHour: 3 },
          ],
        },
      },
    };

    const diff = diffLocationLevelUnlocks(rules, 1, 2);

    const storageById = Object.fromEntries(
      diff.storageAdded.map((s) => [s.id, s.addedCapacity]),
    );
    expect(storageById.stone).toBe(50);
    // iron at level 2: floor(20 + 10*(2-1)) = 30; before is 0 (didn't exist).
    expect(storageById.iron).toBe(30);
    // wood unchanged.
    expect(storageById.wood).toBeUndefined();

    const prodById = Object.fromEntries(
      diff.productionAdded.map((p) => [p.id, p.addedRate]),
    );
    expect(prodById.stone).toBe(3);
    expect(prodById.wood).toBeUndefined();
  });

  it('handles resource config changing between levels using each levels basis', () => {
    const rules: LevelRules = {
      level: {
        '1': {
          storage: [{ type: 'currency', id: 'wood', baseCapacity: 100 }],
        },
        '2': {
          storage: [
            // baseCapacity bumped at level 2.
            { type: 'currency', id: 'wood', baseCapacity: 250 },
          ],
        },
      },
    };

    const diff = diffLocationLevelUnlocks(rules, 1, 2);

    expect(diff.storageAdded).toEqual([
      { type: 'currency', id: 'wood', addedCapacity: 150 },
    ]);
  });

  it('returns no deltas when from and to levels are equal', () => {
    const rules: LevelRules = {
      level: {
        '1': {
          workers: { slots: 1 },
          buildings: { slots: 1, allowed: [{ buildingDefId: 'tent' }] },
          storage: [
            {
              type: 'currency',
              id: 'wood',
              baseCapacity: 100,
              growthRate: 'linear',
              growthScalar: 50,
            },
          ],
        },
      },
    };

    const diff = diffLocationLevelUnlocks(rules, 2, 2);

    expect(diff.workerSlotsAdded).toBe(0);
    expect(diff.buildingSlotsAdded).toBe(0);
    expect(diff.newAllowedBuildings).toEqual([]);
    expect(diff.storageAdded).toEqual([]);
    expect(diff.productionAdded).toEqual([]);
  });
});

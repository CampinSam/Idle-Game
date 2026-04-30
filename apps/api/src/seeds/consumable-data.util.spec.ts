import {
  ConsumableData,
  buildSeedConsumableMap,
  canonicalConsumableData,
  consumableDataEqual,
} from './consumable-data.util';

const HEAL_SMALL_SEED: ConsumableData = {
  effects: [{ effectDefId: 'eff_heal_minor', targetType: 'entity' }],
};
const HEAL_MEDIUM_SEED: ConsumableData = {
  effects: [{ effectDefId: 'eff_heal', targetType: 'entity' }],
};

describe('canonicalConsumableData', () => {
  it('uses the seed value to disambiguate heal sizes that share a legacy effect key', () => {
    const dbValue = { amount: 20, effect: 'heal' };
    expect(canonicalConsumableData(dbValue, HEAL_SMALL_SEED)).toEqual(HEAL_SMALL_SEED);
    expect(canonicalConsumableData({ amount: 50, effect: 'heal' }, HEAL_MEDIUM_SEED)).toEqual(
      HEAL_MEDIUM_SEED,
    );
  });

  it('reconciles a stale canonical-but-wrong row back to the seed value for known item ids', () => {
    // Seed says small heal → eff_heal_minor, but DB row drifted to eff_heal.
    const drifted = { effects: [{ effectDefId: 'eff_heal', targetType: 'entity' }] };
    expect(canonicalConsumableData(drifted, HEAL_SMALL_SEED)).toEqual(HEAL_SMALL_SEED);
  });

  it('lowercases per-effect targetType and drops top-level targetType when no seed exists', () => {
    const dbValue = {
      targetType: 'PLAYER',
      effects: [
        { effectDefId: 'eff_xp_boost_timed', targetType: 'PLAYER' },
        { effectDefId: 'eff_production_boost', targetType: 'Location' },
      ],
    };
    expect(canonicalConsumableData(dbValue, null)).toEqual({
      effects: [
        { effectDefId: 'eff_xp_boost_timed', targetType: 'player' },
        { effectDefId: 'eff_production_boost', targetType: 'location' },
      ],
    });
  });

  it('drops invalid per-effect entries while keeping valid ones', () => {
    const dbValue = {
      effects: [
        { effectDefId: 'eff_keep', targetType: 'player' },
        { targetType: 'player' },
        { effectDefId: 'eff_no_target' },
        null,
      ],
    };
    expect(canonicalConsumableData(dbValue, null)).toEqual({
      effects: [{ effectDefId: 'eff_keep', targetType: 'player' }],
    });
  });

  it('falls back to the legacy effect map only when no seed entry exists', () => {
    expect(canonicalConsumableData({ effect: 'speed_boost', duration: 60 }, null)).toEqual({
      effects: [{ effectDefId: 'eff_speed_boost', targetType: 'player' }],
    });
  });

  it('returns null for unknown legacy shapes with no seed', () => {
    expect(canonicalConsumableData({ effect: 'mystery_potion' }, null)).toBeNull();
  });

  it('adopts the seed value when the DB row is null', () => {
    expect(canonicalConsumableData(null, HEAL_SMALL_SEED)).toEqual(HEAL_SMALL_SEED);
  });

  it('returns null when both DB and seed are null', () => {
    expect(canonicalConsumableData(null, null)).toBeNull();
  });
});

describe('consumableDataEqual', () => {
  it('treats two canonical-equivalent rows as equal regardless of key order', () => {
    const a: ConsumableData = {
      effects: [{ effectDefId: 'eff_x', targetType: 'player' }],
    };
    const b = { effects: [{ targetType: 'player', effectDefId: 'eff_x' }] } as ConsumableData;
    expect(consumableDataEqual(a, b)).toBe(true);
  });

  it('flags a row carrying an extra top-level key as not canonical', () => {
    const dirty = {
      targetType: 'player',
      effects: [{ effectDefId: 'eff_x', targetType: 'player' }],
    } as unknown as ConsumableData;
    const clean: ConsumableData = {
      effects: [{ effectDefId: 'eff_x', targetType: 'player' }],
    };
    expect(consumableDataEqual(dirty, clean)).toBe(false);
  });
});

describe('buildSeedConsumableMap', () => {
  it('indexes only CONSUMABLE entries and preserves null entries', () => {
    const map = buildSeedConsumableMap([
      { id: 'a', type: 'CONSUMABLE', consumableData: HEAL_SMALL_SEED },
      { id: 'b', type: 'GEAR', consumableData: null },
      { id: 'c', type: 'CONSUMABLE', consumableData: null },
    ]);
    expect(map.size).toBe(2);
    expect(map.get('a')).toEqual(HEAL_SMALL_SEED);
    expect(map.get('c')).toBeNull();
    expect(map.has('b')).toBe(false);
  });
});

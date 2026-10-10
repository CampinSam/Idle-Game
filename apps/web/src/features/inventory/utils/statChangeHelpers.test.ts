import { describe, it, expect } from 'vitest';
import {
  isEntityBusy,
  gearWouldChangeStats,
  effectDefWouldChangeStats,
  consumableWouldChangeEntityStats,
} from './statChangeHelpers';

describe('isEntityBusy', () => {
  it('treats idle / empty status as not busy', () => {
    expect(isEntityBusy({ status: 'idle' })).toBe(false);
    expect(isEntityBusy({})).toBe(false);
    expect(isEntityBusy(null)).toBe(false);
  });
  it('treats working/mission/injured as busy (case-insensitive)', () => {
    expect(isEntityBusy({ status: 'working' })).toBe(true);
    expect(isEntityBusy({ status: 'MISSION' })).toBe(true);
    expect(isEntityBusy({ state: { status: 'injured' } })).toBe(true);
  });
});

describe('gearWouldChangeStats', () => {
  it('returns false for cosmetic gear with no stats', () => {
    expect(gearWouldChangeStats({ equipData: { slot: 'weapon' } })).toBe(false);
    expect(gearWouldChangeStats({ definition: { equipData: { slot: 'weapon', stats: {} } } })).toBe(false);
  });
  it('returns true when any of the six core stats has a non-zero value', () => {
    expect(gearWouldChangeStats({ equipData: { stats: { ATK: 5 } } })).toBe(true);
    expect(gearWouldChangeStats({ definition: { equipData: { stats: { VIT: -2 } } } })).toBe(true);
  });
  it('ignores all-zero stat payloads', () => {
    expect(gearWouldChangeStats({ equipData: { stats: { ATK: 0, DEF: 0 } } })).toBe(false);
  });
});

describe('effectDefWouldChangeStats', () => {
  // Wire values from packages/shared/src/types/effects.ts are lowercase
  // (`stat_boost`, `instant`). The predicate must match the wire form, not
  // the SCREAMING_CASE TS enum names.
  it('matches the canonical lowercase STAT_BOOST category', () => {
    expect(effectDefWouldChangeStats({ category: 'stat_boost' })).toBe(true);
  });
  it('is case-insensitive on category for safety', () => {
    expect(effectDefWouldChangeStats({ category: 'STAT_BOOST' })).toBe(true);
  });
  it('matches instant effects that write to a core stat key', () => {
    expect(
      effectDefWouldChangeStats({ category: 'heal', durationModel: 'instant', stats: { ATK: 3 } }),
    ).toBe(true);
  });
  it('does not match instant heals with no stat payload', () => {
    expect(
      effectDefWouldChangeStats({ category: 'heal', durationModel: 'instant', value: 50 }),
    ).toBe(false);
  });
  it('does not match timed non-stat effects', () => {
    expect(
      effectDefWouldChangeStats({ category: 'xp_multiplier', durationModel: 'timed' }),
    ).toBe(false);
  });
});

describe('consumableWouldChangeEntityStats', () => {
  const effectDefs = {
    'stat-pot': { id: 'stat-pot', category: 'stat_boost', targetType: 'entity' },
    'heal-pot': { id: 'heal-pot', category: 'heal', durationModel: 'instant', value: 50, targetType: 'entity' },
    'instant-stat-pot': { id: 'instant-stat-pot', category: 'heal', durationModel: 'instant', stats: { DEF: 4 }, targetType: 'entity' },
    'player-stat-pot': { id: 'player-stat-pot', category: 'stat_boost', targetType: 'player' },
  };

  it('returns true for stat_boost potions targeting an entity', () => {
    const item = { consumableData: { effects: [{ effectDefId: 'stat-pot', targetType: 'entity' }] } };
    expect(consumableWouldChangeEntityStats(item, effectDefs)).toBe(true);
  });
  it('returns true for instant effects writing to a stat key on an entity', () => {
    const item = { consumableData: { effects: [{ effectDefId: 'instant-stat-pot', targetType: 'entity' }] } };
    expect(consumableWouldChangeEntityStats(item, effectDefs)).toBe(true);
  });
  it('returns false for plain heals on an entity', () => {
    const item = { consumableData: { effects: [{ effectDefId: 'heal-pot', targetType: 'entity' }] } };
    expect(consumableWouldChangeEntityStats(item, effectDefs)).toBe(false);
  });
  it('returns false for stat_boost potions targeting the player (not an entity)', () => {
    const item = { consumableData: { effects: [{ effectDefId: 'player-stat-pot', targetType: 'player' }] } };
    expect(consumableWouldChangeEntityStats(item, effectDefs)).toBe(false);
  });
  it('returns false when the def is not in the lookup map', () => {
    const item = { consumableData: { effects: [{ effectDefId: 'missing', targetType: 'entity' }] } };
    expect(consumableWouldChangeEntityStats(item, effectDefs)).toBe(false);
  });
});

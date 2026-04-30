import itemDefs from './data/item-defs.json';

const VALID_TARGET_TYPES = new Set(['player', 'entity', 'location']);

describe('item-defs.json — consumable seed shape', () => {
  const consumables = (itemDefs as any[]).filter((d) => d.type === 'CONSUMABLE');

  it('has at least one consumable to validate', () => {
    expect(consumables.length).toBeGreaterThan(0);
  });

  for (const def of consumables) {
    describe(def.id, () => {
      const cd = def.consumableData;

      it('has no top-level targetType (canonical shape lives on per-effect entries)', () => {
        if (cd && typeof cd === 'object') {
          expect(Object.prototype.hasOwnProperty.call(cd, 'targetType')).toBe(false);
        }
      });

      it('uses no legacy { effect, duration, multiplier } keys', () => {
        if (cd && typeof cd === 'object') {
          expect(Object.prototype.hasOwnProperty.call(cd, 'effect')).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(cd, 'duration')).toBe(false);
          expect(Object.prototype.hasOwnProperty.call(cd, 'multiplier')).toBe(false);
        }
      });

      it('is either intentionally null or canonical { effects: [...] }', () => {
        if (cd === null) return;
        expect(cd).toEqual(expect.objectContaining({ effects: expect.any(Array) }));
        expect(cd.effects.length).toBeGreaterThan(0);
        for (const eff of cd.effects) {
          expect(typeof eff.effectDefId).toBe('string');
          expect(eff.effectDefId.length).toBeGreaterThan(0);
          expect(typeof eff.targetType).toBe('string');
          // targetType must be lowercase canonical enum.
          expect(eff.targetType).toBe(eff.targetType.toLowerCase());
          expect(VALID_TARGET_TYPES.has(eff.targetType)).toBe(true);
        }
      });
    });
  }
});

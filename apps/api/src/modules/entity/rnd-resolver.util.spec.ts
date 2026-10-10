import { resolveRnd } from './rnd-resolver.util';

describe('resolveRnd', () => {
  const orderedPicker = (stats: readonly string[]) => stats[0];
  const secondPicker = (stats: readonly string[]) => stats[1];

  describe('single-number RND (backwards compat)', () => {
    it('picks one stat and adds the value', () => {
      const result = resolveRnd({ ATK: 5, RND: 3 }, () => 'DEF');
      expect(result).toEqual({ ATK: 5, DEF: 3 });
    });

    it('adds RND value to a stat that already has an explicit value', () => {
      const result = resolveRnd({ ATK: 5, RND: 3 }, () => 'ATK');
      expect(result).toEqual({ ATK: 8 });
    });

    it('picks a stat that has no explicit entry', () => {
      const result = resolveRnd({ ATK: 5, RND: 3 }, () => 'DEF');
      expect(result).toEqual({ ATK: 5, DEF: 3 });
    });

    it('skips RND when value is 0', () => {
      const result = resolveRnd({ ATK: 5, RND: 0 }, orderedPicker);
      expect(result).toEqual({ ATK: 5 });
    });

    it('strips the RND key even when it is 0', () => {
      const result = resolveRnd({ RND: 0 });
      expect(Object.keys(result)).not.toContain('RND');
    });
  });

  describe('array RND', () => {
    it('handles two entries with independent picks', () => {
      let callCount = 0;
      const alternatePicker = (stats: readonly string[]) => {
        const stat = callCount % 2 === 0 ? 'ATK' : 'DEF';
        callCount++;
        return stat;
      };
      const result = resolveRnd({ RND: [3, 5] }, alternatePicker);
      expect(result).toEqual({ ATK: 3, DEF: 5 });
    });

    it('accumulates values when both picks land on the same stat', () => {
      const result = resolveRnd({ RND: [3, 5] }, () => 'SPD');
      expect(result).toEqual({ SPD: 8 });
    });

    it('skips zero entries in the array', () => {
      const result = resolveRnd({ RND: [0, 4] }, () => 'ATK');
      expect(result).toEqual({ ATK: 4 });
    });

    it('skips all entries if all are zero', () => {
      const result = resolveRnd({ RND: [0, 0] });
      expect(Object.keys(result)).not.toContain('RND');
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('handles a single-element array the same as a plain number', () => {
      const result = resolveRnd({ RND: [7] }, () => 'FOC');
      expect(result).toEqual({ FOC: 7 });
    });

    it('combines array RND with explicit stat keys', () => {
      let callCount = 0;
      const alternatePicker = (stats: readonly string[]) => {
        const stat = callCount % 2 === 0 ? 'ATK' : 'LCK';
        callCount++;
        return stat;
      };
      const result = resolveRnd({ DEF: 10, VIT: 2, RND: [3, 5] }, alternatePicker);
      expect(result).toEqual({ DEF: 10, VIT: 2, ATK: 3, LCK: 5 });
    });

    it('handles an empty array without adding any stats', () => {
      const result = resolveRnd({ ATK: 5, RND: [] });
      expect(result).toEqual({ ATK: 5 });
    });
  });

  describe('edge cases', () => {
    it('returns an empty map when stat map is empty', () => {
      expect(resolveRnd({})).toEqual({});
    });

    it('strips RND when absent', () => {
      const result = resolveRnd({ ATK: 1, DEF: 2 });
      expect(result).toEqual({ ATK: 1, DEF: 2 });
      expect(Object.keys(result)).not.toContain('RND');
    });

    it('does not mutate the input stat map', () => {
      const input: Record<string, number | number[]> = { ATK: 5, RND: [3, 4] };
      resolveRnd(input, () => 'DEF');
      expect(input).toEqual({ ATK: 5, RND: [3, 4] });
    });
  });
});

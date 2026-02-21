import { SeededRng } from '../src/rng';

describe('SeededRng', () => {
  it('produces deterministic results from same seed', () => {
    const rng1 = new SeededRng('test-seed-123');
    const rng2 = new SeededRng('test-seed-123');

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('produces different results from different seeds', () => {
    const rng1 = new SeededRng('seed-a');
    const rng2 = new SeededRng('seed-b');

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).not.toEqual(results2);
  });

  it('nextInt returns values in range', () => {
    const rng = new SeededRng('range-test');
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(5, 15);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(15);
    }
  });

  it('chance returns booleans', () => {
    const rng = new SeededRng('chance-test');
    const results = Array.from({ length: 100 }, () => rng.chance(0.5));
    expect(results.some((r) => r === true)).toBe(true);
    expect(results.some((r) => r === false)).toBe(true);
  });
});

import { calculateSuccessChance } from '../src/success-probability';

describe('SuccessProbability', () => {
  it('returns 50% when MP equals difficulty', () => {
    expect(calculateSuccessChance(100, 100)).toBeCloseTo(0.5, 5);
  });

  it('never drops below minChance', () => {
    expect(calculateSuccessChance(1, 10000, 5, 100)).toBeCloseTo(0.05, 5);
  });

  it('never exceeds maxChance', () => {
    expect(calculateSuccessChance(10000, 1, 0, 95)).toBeCloseTo(0.95, 5);
  });

  it('uses full 0-100 range by default', () => {
    const veryLow = calculateSuccessChance(1, 100000);
    const veryHigh = calculateSuccessChance(100000, 1);
    expect(veryLow).toBeCloseTo(0.00001, 4);
    expect(veryHigh).toBeCloseTo(1.0, 2);
  });

  it('increases with higher MP', () => {
    const low = calculateSuccessChance(50, 100);
    const high = calculateSuccessChance(200, 100);
    expect(high).toBeGreaterThan(low);
  });
});

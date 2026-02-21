export interface SkipCostEntry {
  type: 'currency' | 'item';
  id: string;
  amount: number;
}

export interface Timer {
  duration: number;
  boostable: boolean;
  skipable: boolean;
  skip_cost: SkipCostEntry[];
  skip_type: 'scaling' | 'absolute';
}

export const DEFAULT_TIMER: Timer = {
  duration: 0,
  boostable: true,
  skipable: false,
  skip_cost: [],
  skip_type: 'absolute',
};

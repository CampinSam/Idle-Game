export type CurrencyTypeEnum = 'SOFT' | 'HARD' | 'PREMIUM' | 'SEASONAL' | 'EVENT' | 'GUILD';

export interface CurrencyDef {
  id: string;
  name: string;
  symbol: string | null;
  iconKey: string | null;
  type: CurrencyTypeEnum;
  seasonId: string | null;
  isTradeable: boolean;
  isSpendable: boolean;
  decimals: number;
}

export interface CurrencyBalances {
  [currencyId: string]: number;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  currencyId: string;
  delta: number;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

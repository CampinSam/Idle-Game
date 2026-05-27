export type CurrencyTypeEnum = 'SOFT' | 'HARD' | 'PREMIUM' | 'SEASONAL' | 'EVENT' | 'GUILD' | 'CRYPTO';

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

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'REJECTED' | 'SENT' | 'FAILED';
export type WithdrawalMinType = 'QUANTITY' | 'ADA_VALUE' | 'USD_VALUE';

export interface CryptoWalletConfig {
  id: string;
  hotWalletAddress: string;
  cntPolicyId: string;
  cntAssetName: string;
  minWithdrawalType: WithdrawalMinType;
  minWithdrawalAmount: number;
  withdrawalFee: string;
  autoApprovalThreshold: string;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoWithdrawal {
  id: string;
  userId: string;
  currencyId: string;
  amount: string;
  fee: string;
  destinationAddress: string;
  status: WithdrawalStatus;
  autoApproved: boolean;
  txHash: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

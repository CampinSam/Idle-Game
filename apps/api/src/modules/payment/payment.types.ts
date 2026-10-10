export interface GemPack {
  id: string;
  name: string;
  description: string;
  gemAmount: number;
  priceId: string;
  unitAmount: number;
  currency: string;
  displayOrder: number;
  displayName: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  badgeType: 'best_value' | 'extra' | null;
  badgeLabel: string | null;
  iconSize: number;
}

export interface GemPackDisplayUpdate {
  displayName?: string;
  accentColor?: string;
  borderColor?: string;
  glowColor?: string;
  badgeType?: 'best_value' | 'extra' | null;
  badgeLabel?: string | null;
  iconSize?: number;
}

export interface AdaRateSnapshotMeta {
  usdPrice: number;
  lovelacePerUsd: number;
  usingFallback: boolean;
  computedAt: string;
}

export type PurchaseAction =
  | { type: 'redirect'; url: string }
  | { type: 'coming_soon' }
  | {
      type: 'payment_address';
      address: string;
      amountExpected: string;
      amountDisplay: string;
      chain: string;
      expiresAt: string;
      adaRateSnapshot?: AdaRateSnapshotMeta;
    };

export interface CreatePurchaseResult {
  purchaseId: string;
  action: PurchaseAction;
  comingSoon?: boolean;
}

export interface PurchaseStatusResult {
  id: string;
  packId: string;
  gemAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionResult {
  action: { type: 'redirect'; url: string } | { type: 'coming_soon' };
  comingSoon?: boolean;
}

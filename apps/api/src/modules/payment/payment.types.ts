export interface GemPack {
  id: string;
  name: string;
  description: string;
  gemAmount: number;
  priceId: string;
  unitAmount: number;
  currency: string;
  displayOrder: number;
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

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('derp_token') || ''}`,
  };
}

/**
 * Commerce endpoints intentionally return their raw Responses. Store UI owns
 * the existing response parsing and error handling for these flows.
 */
export const commerceApi = {
  getShopItems() {
    return fetch('/api/shop/items', { headers: authHeaders() });
  },

  getPlayerWallets() {
    return fetch('/api/player/wallets', { headers: authHeaders() });
  },

  getPaymentPacks() {
    return fetch('/api/v1/payments/packs');
  },

  getAdaRate() {
    return fetch('/api/v1/payments/ada-rate');
  },

  getPurchase(purchaseId: string) {
    return fetch(`/api/v1/purchases/${purchaseId}`, {
      headers: authHeaders(),
    });
  },

  createPurchase(packId: string, paymentMethod: 'stripe' | 'crypto_evm' | 'crypto_cardano') {
    return fetch('/api/v1/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ packId, paymentMethod }),
    });
  },

  buildPurchaseTransaction(purchaseId: string, utxosCborHex: string[]) {
    return fetch('/api/v1/crypto/build-purchase-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ purchaseId, utxosCborHex }),
    });
  },

  submitPurchaseTransaction(purchaseId: string, signedTxCborHex: string) {
    return fetch('/api/v1/crypto/submit-purchase-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ purchaseId, signedTxCborHex }),
    });
  },

  createDerpPassSubscription() {
    return fetch('/api/v1/subscriptions/derp-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
  },
};
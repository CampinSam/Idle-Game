import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceApi } from './commerceApi';

describe('commerceApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('preserves shop catalog endpoint requests', async () => {
    const response = new Response('catalog');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    expect(await commerceApi.getShopItems()).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/shop/items', {
      headers: { Authorization: 'Bearer ' },
    });

    await commerceApi.getPaymentPacks();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/payments/packs');

    await commerceApi.getAdaRate();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/payments/ada-rate');
  });

  it('preserves player authorization and purchase request payloads', async () => {
    localStorage.setItem('derp_token', 'player-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await commerceApi.getPlayerWallets();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/player/wallets', {
      headers: { Authorization: 'Bearer player-token' },
    });

    await commerceApi.getPurchase('purchase-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/purchases/purchase-1', {
      headers: { Authorization: 'Bearer player-token' },
    });

    await commerceApi.createPurchase('pack-1', 'crypto_cardano');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-token' },
      body: JSON.stringify({ packId: 'pack-1', paymentMethod: 'crypto_cardano' }),
    });

    await commerceApi.createDerpPassSubscription();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/subscriptions/derp-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-token' },
    });
  });

  it('preserves guided crypto request methods, headers, and payloads', async () => {
    localStorage.setItem('derp_token', 'player-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await commerceApi.buildPurchaseTransaction('purchase-2', ['utxo']);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/crypto/build-purchase-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-token' },
      body: JSON.stringify({ purchaseId: 'purchase-2', utxosCborHex: ['utxo'] }),
    });

    await commerceApi.submitPurchaseTransaction('purchase-2', 'signed-tx');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/crypto/submit-purchase-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-token' },
      body: JSON.stringify({ purchaseId: 'purchase-2', signedTxCborHex: 'signed-tx' }),
    });
  });
});
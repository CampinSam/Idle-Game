import { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  detectCardanoWallets,
  detectEvmWallet,
  enableCardanoWallet,
  getCardanoChangeAddressSafe,
  signCardanoDataSafe,
  CardanoWalletInfo,
} from '../utils/walletAuth';
import { reportClientError } from '../services/clientErrorReporter';

// Centralised so any unexpected wallet failure ends up in our server logs
// — without this we have zero visibility when a user reports "stuck on
// connecting" because no network request is ever sent.
function reportWalletError(scope: string, err: any) {
  try {
    const msg = err?.message || String(err);
    reportClientError({
      message: `[wallet:${scope}] ${msg}`,
      stack: err?.stack,
      fallbackTitle: 'wallet-flow',
    });
  } catch {
    /* reporter is best-effort */
  }
}

export interface WalletConnectState {
  connecting: boolean;
  error: string | null;
  detectedCardanoWallets: CardanoWalletInfo[];
  hasEvm: boolean;
}

export type WalletConnectResult =
  | { kind: 'session'; accessToken: string; player: any }
  | { kind: 'onboarding'; walletToken: string; chain: string; address: string };

export interface WalletConnectActions {
  connectEvm: () => Promise<WalletConnectResult | null>;
  connectCardano: (walletKey: string) => Promise<WalletConnectResult | null>;
  linkEvm: (token: string) => Promise<boolean>;
  linkCardano: (walletKey: string, token: string) => Promise<boolean>;
  clearError: () => void;
}

export function useWalletConnect(): WalletConnectState & WalletConnectActions {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedCardanoWallets, setDetectedCardanoWallets] = useState<CardanoWalletInfo[]>([]);
  const [hasEvm, setHasEvm] = useState(false);

  useEffect(() => {
    setDetectedCardanoWallets(detectCardanoWallets());
    setHasEvm(detectEvmWallet());
  }, []);

  const connectEvm = async (): Promise<WalletConnectResult | null> => {
    setConnecting(true);
    setError(null);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('No EVM wallet detected');
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) throw new Error('No accounts returned');
      const address = accounts[0].toLowerCase();
      const { message } = await api.walletNonce('ETH', address);
      const signature = await ethereum.request({ method: 'personal_sign', params: [message, address] });
      const result = await api.walletVerify('ETH', address, signature);
      if ('linked' in result) return null;
      if ('needsOnboarding' in result) {
        return { kind: 'onboarding', walletToken: result.walletToken, chain: result.chain, address: result.address };
      }
      return { kind: 'session', accessToken: result.accessToken, player: result.player };
    } catch (err: any) {
      reportWalletError('connectEvm', err);
      setError(err?.message || 'EVM wallet connection failed');
      return null;
    } finally {
      setConnecting(false);
    }
  };

  const connectCardano = async (walletKey: string): Promise<WalletConnectResult | null> => {
    setConnecting(true);
    setError(null);
    try {
      const walletApi = await enableCardanoWallet(walletKey);
      const address = await getCardanoChangeAddressSafe(walletApi);
      const { message } = await api.walletNonce('CARDANO', address);
      const msgHex = Array.from(new TextEncoder().encode(message))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
      const signResult = await signCardanoDataSafe(walletApi, address, msgHex);
      // CIP-30 signData returns { signature, key } — both hex CBOR (COSE_Sign1, COSE_Key).
      // Older code stringified the whole object as `signature`; the API now requires both
      // fields separately so the server can run real CIP-8 verification.
      const signature = typeof signResult === 'string' ? signResult : signResult?.signature ?? '';
      const cosekey = typeof signResult === 'string' ? undefined : signResult?.key;
      const result = await api.walletVerify('CARDANO', address, signature, cosekey);
      if ('linked' in result) return null;
      if ('needsOnboarding' in result) {
        return { kind: 'onboarding', walletToken: result.walletToken, chain: result.chain, address: result.address };
      }
      return { kind: 'session', accessToken: result.accessToken, player: result.player };
    } catch (err: any) {
      reportWalletError(`connectCardano:${walletKey}`, err);
      setError(err?.message || 'Cardano wallet connection failed');
      return null;
    } finally {
      setConnecting(false);
    }
  };

  const linkEvm = async (token: string): Promise<boolean> => {
    setConnecting(true);
    setError(null);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('No EVM wallet detected');
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) throw new Error('No accounts returned');
      const address = accounts[0].toLowerCase();
      const { message } = await api.walletNonceAuthed('ETH', address, token);
      const signature = await ethereum.request({ method: 'personal_sign', params: [message, address] });
      await api.walletVerifyAuthed('ETH', address, signature, token);
      return true;
    } catch (err: any) {
      reportWalletError('linkEvm', err);
      setError(err?.message || 'Failed to link EVM wallet');
      return false;
    } finally {
      setConnecting(false);
    }
  };

  const linkCardano = async (walletKey: string, token: string): Promise<boolean> => {
    setConnecting(true);
    setError(null);
    try {
      const walletApi = await enableCardanoWallet(walletKey);
      const address = await getCardanoChangeAddressSafe(walletApi);
      const { message } = await api.walletNonceAuthed('CARDANO', address, token);
      const msgHex = Array.from(new TextEncoder().encode(message))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
      const signResult = await signCardanoDataSafe(walletApi, address, msgHex);
      const signature = typeof signResult === 'string' ? signResult : signResult?.signature ?? '';
      const cosekey = typeof signResult === 'string' ? undefined : signResult?.key;
      await api.walletVerifyAuthed('CARDANO', address, signature, token, cosekey);
      return true;
    } catch (err: any) {
      reportWalletError(`linkCardano:${walletKey}`, err);
      setError(err?.message || 'Failed to link Cardano wallet');
      return false;
    } finally {
      setConnecting(false);
    }
  };

  return {
    connecting,
    error,
    detectedCardanoWallets,
    hasEvm,
    connectEvm,
    connectCardano,
    linkEvm,
    linkCardano,
    clearError: () => setError(null),
  };
}

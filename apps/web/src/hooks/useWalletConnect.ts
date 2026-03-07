import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { detectCardanoWallets, detectEvmWallet, enableCardanoWallet, CardanoWalletInfo } from '../utils/walletAuth';

export interface WalletConnectState {
  connecting: boolean;
  error: string | null;
  detectedCardanoWallets: CardanoWalletInfo[];
  hasEvm: boolean;
}

export interface WalletConnectActions {
  connectEvm: () => Promise<{ accessToken: string; player: any } | null>;
  connectCardano: (walletKey: string) => Promise<{ accessToken: string; player: any } | null>;
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

  const connectEvm = async (): Promise<{ accessToken: string; player: any } | null> => {
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
      return result;
    } catch (err: any) {
      setError(err?.message || 'EVM wallet connection failed');
      return null;
    } finally {
      setConnecting(false);
    }
  };

  const connectCardano = async (walletKey: string): Promise<{ accessToken: string; player: any } | null> => {
    setConnecting(true);
    setError(null);
    try {
      const walletApi = await enableCardanoWallet(walletKey);
      const address = await walletApi.getChangeAddress();
      const { message } = await api.walletNonce('CARDANO', address);
      const msgHex = Array.from(new TextEncoder().encode(message))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
      const signResult = await walletApi.signData(address, msgHex);
      const signature = typeof signResult === 'string' ? signResult : JSON.stringify(signResult);
      const result = await api.walletVerify('CARDANO', address, signature);
      if ('linked' in result) return null;
      return result;
    } catch (err: any) {
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
      const address = await walletApi.getChangeAddress();
      const { message } = await api.walletNonceAuthed('CARDANO', address, token);
      const msgHex = Array.from(new TextEncoder().encode(message))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
      const signResult = await walletApi.signData(address, msgHex);
      const signature = typeof signResult === 'string' ? signResult : JSON.stringify(signResult);
      await api.walletVerifyAuthed('CARDANO', address, signature, token);
      return true;
    } catch (err: any) {
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

export type EvmChain = 'ETH' | 'BASE' | 'MATIC';

export interface CardanoWalletInfo {
  key: string;
  name: string;
  icon?: string;
}

const KNOWN_CARDANO_WALLETS: CardanoWalletInfo[] = [
  { key: 'nami', name: 'Nami' },
  { key: 'eternl', name: 'Eternl' },
  { key: 'vespr', name: 'Vespr' },
  { key: 'begin', name: 'Begin' },
  { key: 'flint', name: 'Flint' },
  { key: 'nufi', name: 'NuFi' },
  { key: 'lace', name: 'Lace' },
  { key: 'yoroi', name: 'Yoroi' },
];

export function detectCardanoWallets(): CardanoWalletInfo[] {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  if (!w.cardano) return [];
  return KNOWN_CARDANO_WALLETS.filter((wallet) => {
    const cw = w.cardano[wallet.key];
    return !!cw && typeof cw.enable === 'function';
  }).map((wallet) => {
    const cw = (window as any).cardano[wallet.key];
    return { ...wallet, icon: cw?.icon || cw?.experimental?.icon };
  });
}

export function detectEvmWallet(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum;
}

export async function getEvmAddress(): Promise<string> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No EVM wallet detected');
  const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts.length) throw new Error('No accounts returned from EVM wallet');
  return accounts[0].toLowerCase();
}

export async function signEvmMessage(message: string): Promise<{ address: string; signature: string }> {
  const address = await getEvmAddress();
  const ethereum = (window as any).ethereum;
  const signature = await ethereum.request({
    method: 'personal_sign',
    params: [message, address],
  });
  return { address, signature };
}

export async function getCardanoAddress(api: any): Promise<string> {
  const addressHex = await api.getChangeAddress();
  return addressHex;
}

export async function enableCardanoWallet(walletKey: string): Promise<any> {
  const w = (window as any).cardano?.[walletKey];
  if (!w) throw new Error(`Cardano wallet "${walletKey}" not found`);
  return w.enable();
}

export async function signCardanoMessage(
  api: any,
  message: string,
): Promise<{ address: string; signature: string; key?: string }> {
  const address = await getCardanoAddress(api);
  const msgHex = Buffer.from(message).toString('hex');
  const signResult = await api.signData(address, msgHex);
  // CIP-30 returns { signature, key }; both hex CBOR. Fall back gracefully for stub wallets.
  const signature = typeof signResult === 'string' ? signResult : signResult?.signature ?? '';
  const key = typeof signResult === 'string' ? undefined : signResult?.key;
  return { address, signature, key };
}

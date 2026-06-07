import { bech32 } from 'bech32';

/**
 * Converts a raw hex-encoded Cardano address to its bech32 representation.
 *
 * CIP-30 `api.getChangeAddress()` returns addresses as raw hex bytes, not
 * bech32. This function detects that case and converts it so the stored value
 * is always a human-readable `addr1…` / `addr_test1…` / `stake1…` string.
 *
 * If the input is already bech32 (starts with addr/stake prefix) it is
 * returned unchanged. On any parse/encode failure the original string is
 * returned so callers are never worse off.
 */
export function normalizeCardanoAddress(address: string): string {
  if (!address) return address;
  const lower = address.toLowerCase();

  if (lower.startsWith('addr') || lower.startsWith('stake')) return address;

  if (lower.length % 2 !== 0 || !/^[0-9a-f]+$/.test(lower)) return address;

  try {
    const bytes = Buffer.from(lower, 'hex');
    if (bytes.length === 0) return address;

    const headerByte = bytes[0];
    const netId = headerByte & 0x0f;
    const addrType = (headerByte & 0xf0) >> 4;

    let prefix: string;
    if (addrType === 0xe) {
      prefix = netId === 1 ? 'stake' : 'stake_test';
    } else {
      prefix = netId === 1 ? 'addr' : 'addr_test';
    }

    const words = bech32.toWords(bytes);
    return bech32.encode(prefix, words, 200);
  } catch {
    return address;
  }
}

/**
 * Returns true when a CARDANO wallet address is stored as raw hex bytes
 * rather than a proper bech32 string.
 */
export function isCardanoHexAddress(chain: string, address: string): boolean {
  if (chain !== 'CARDANO' || !address) return false;
  const lower = address.toLowerCase();
  if (lower.startsWith('addr') || lower.startsWith('stake')) return false;
  return /^[0-9a-f]+$/.test(lower);
}

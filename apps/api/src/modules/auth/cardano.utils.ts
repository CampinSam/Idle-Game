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

/**
 * Extracts the stake key (bech32 `stake1…`) from a Cardano Shelley base
 * address (`addr1…`).  Returns null when the input is an enterprise / script
 * address (no embedded stake key) or when parsing fails.
 *
 * A Shelley base address has exactly 57 bytes:
 *   byte 0   — header (type nibble | network nibble)
 *   bytes 1–28  — payment key hash
 *   bytes 29–56 — stake key hash
 * Network id: 0x1 = mainnet, 0x0 = testnet.
 * Stake address header: 0xe1 (mainnet) / 0xe0 (testnet).
 */
export function extractStakeKeyFromAddress(address: string): string | null {
  if (!address) return null;
  if (address.startsWith('stake1') || address.startsWith('stake_test1')) return address;
  if (!address.startsWith('addr1') && !address.startsWith('addr_test1')) return null;
  try {
    const { words } = bech32.decode(address, 200);
    const bytes = Buffer.from(bech32.fromWords(words));
    if (bytes.length !== 57) return null;
    const netId = bytes[0] & 0x0f;
    const stakeHeader = netId === 1 ? 0xe1 : 0xe0;
    const stakePrefix = netId === 1 ? 'stake' : 'stake_test';
    const stakeKeyHash = bytes.slice(29, 57);
    const stakeBytes = Buffer.concat([Buffer.from([stakeHeader]), stakeKeyHash]);
    return bech32.encode(stakePrefix, bech32.toWords(stakeBytes), 200);
  } catch {
    return null;
  }
}

/**
 * Returns the stake-key form of a Cardano address (`stake1…`), or the
 * original address unchanged when extraction is not possible (enterprise /
 * script addresses, or addresses already in stake-key form).
 *
 * This is the canonical identity for a Cardano wallet — one stake key maps
 * to many payment addresses.  All ownership storage must use this form.
 */
export function normalizeToStakeKey(address: string): string {
  const stake = extractStakeKeyFromAddress(address);
  return stake ?? address;
}

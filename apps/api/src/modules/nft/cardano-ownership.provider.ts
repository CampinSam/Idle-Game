import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NftOwnershipProvider, OwnedAsset, NftMetadata } from './nft-ownership.interface';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= BECH32_GENERATOR[i];
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Decode(str: string): { hrp: string; words: number[] } | null {
  const lower = str.toLowerCase();
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) return null;
  const hrp = lower.slice(0, pos);
  const words: number[] = [];
  for (let i = pos + 1; i < lower.length; i++) {
    const d = BECH32_CHARSET.indexOf(lower[i]);
    if (d === -1) return null;
    words.push(d);
  }
  return { hrp, words: words.slice(0, -6) };
}

function bech32FromWords(words: number[]): Buffer {
  let value = 0;
  let bits = 0;
  const result: number[] = [];
  for (const word of words) {
    value = (value << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(result);
}

function bech32ToWords(bytes: Buffer): number[] {
  let value = 0;
  let bits = 0;
  const result: number[] = [];
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.push((value >> bits) & 0x1f);
    }
  }
  if (bits > 0) result.push((value << (5 - bits)) & 0x1f);
  return result;
}

function bech32Encode(hrp: string, words: number[]): string {
  const combined = [...words, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...combined]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...words, ...checksum].map((d) => BECH32_CHARSET[d]).join('');
}

function decodeCborAttributes(value: unknown): Record<string, string> | null {
  if (typeof value !== 'string') return null;
  try {
    const buf = Buffer.from(value, 'hex');
    if (buf.length === 0) return null;

    function readLength(offset: number, addInfo: number): { len: number; skip: number } {
      if (addInfo < 24) return { len: addInfo, skip: 1 };
      if (addInfo === 24) return { len: buf[offset + 1], skip: 2 };
      if (addInfo === 25) return { len: buf.readUInt16BE(offset + 1), skip: 3 };
      throw new Error(`Unsupported CBOR addInfo ${addInfo}`);
    }

    function decodeValue(offset: number): { value: string; next: number } {
      const b = buf[offset];
      const majorType = b >> 5;
      const addInfo = b & 0x1f;
      const { len, skip } = readLength(offset, addInfo);
      if (majorType === 2 || majorType === 3) {
        return { value: buf.slice(offset + skip, offset + skip + len).toString('utf8'), next: offset + skip + len };
      }
      throw new Error(`Unsupported CBOR major type ${majorType}`);
    }

    const b0 = buf[0];
    if ((b0 >> 5) !== 5) return null;
    const addInfo0 = b0 & 0x1f;
    const { len: count, skip } = readLength(0, addInfo0);
    let cur = skip;
    const result: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const k = decodeValue(cur); cur = k.next;
      const v = decodeValue(cur); cur = v.next;
      result[k.value] = v.value;
    }
    return result;
  } catch {
    return null;
  }
}

@Injectable()
export class CardanoOwnershipProvider implements NftOwnershipProvider {
  private readonly logger = new Logger(CardanoOwnershipProvider.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://cardano-mainnet.blockfrost.io/api/v0';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('BLOCKFROST_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('BLOCKFROST_API_KEY not set — Cardano NFT ownership checks will always return false');
    }
  }

  private extractStakeAddress(baseAddress: string): string | null {
    try {
      const decoded = bech32Decode(baseAddress);
      if (!decoded) return null;
      const bytes = bech32FromWords(decoded.words);
      if (bytes.length !== 57) return null;
      const stakeKeyHash = bytes.slice(29, 57);
      const stakeBytes = Buffer.concat([Buffer.from([0xe1]), stakeKeyHash]);
      return bech32Encode('stake', bech32ToWords(stakeBytes));
    } catch {
      return null;
    }
  }

  async getOwnedAssets(address: string, policyId: string): Promise<OwnedAsset[]> {
    if (!this.apiKey) return [];

    const stakeAddress = this.extractStakeAddress(address);
    if (stakeAddress) {
      try {
        const assets = await this.getAssetsByStakeAddress(stakeAddress, policyId);
        if (assets !== null) return assets;
      } catch (err) {
        this.logger.warn(`Stake-based lookup failed for ${stakeAddress}, falling back to address lookup: ${err}`);
      }
    }

    return this.getAssetsByAddress(address, policyId);
  }

  private async getAssetsByStakeAddress(stakeAddress: string, policyId: string): Promise<OwnedAsset[] | null> {
    const results: OwnedAsset[] = [];
    let page = 1;
    while (true) {
      const url = `${this.baseUrl}/accounts/${stakeAddress}/utxos?count=100&page=${page}`;
      const res = await fetch(url, { headers: { project_id: this.apiKey! } });
      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(`Blockfrost stake UTXOs failed: ${res.status} for ${stakeAddress}`);
        return null;
      }
      const data = (await res.json()) as Array<{ amount: Array<{ unit: string; quantity: string }> }>;
      for (const utxo of data) {
        for (const a of utxo.amount ?? []) {
          if (a.unit.startsWith(policyId)) {
            const assetId = a.unit.slice(policyId.length);
            if (assetId) results.push({ assetId, quantity: parseInt(a.quantity, 10) });
          }
        }
      }
      if (data.length < 100) break;
      page++;
    }
    return results;
  }

  private async getAssetsByAddress(address: string, policyId: string): Promise<OwnedAsset[]> {
    try {
      const results: OwnedAsset[] = [];
      let page = 1;
      while (true) {
        const url = `${this.baseUrl}/addresses/${address}/utxos?count=100&page=${page}`;
        const res = await fetch(url, { headers: { project_id: this.apiKey! } });
        if (!res.ok) {
          this.logger.warn(`Blockfrost address UTXOs failed: ${res.status} for ${address}`);
          return results;
        }
        const data = (await res.json()) as Array<{ amount: Array<{ unit: string; quantity: string }> }>;
        for (const utxo of data) {
          for (const a of utxo.amount ?? []) {
            if (a.unit.startsWith(policyId)) {
              const assetId = a.unit.slice(policyId.length);
              if (assetId) results.push({ assetId, quantity: parseInt(a.quantity, 10) });
            }
          }
        }
        if (data.length < 100) break;
        page++;
      }
      return results;
    } catch (err) {
      this.logger.error(`Blockfrost address UTXOs error: ${err}`);
      return [];
    }
  }

  async ownsAsset(address: string, policyId: string, assetId: string): Promise<boolean> {
    const owned = await this.getOwnedAssets(address, policyId);
    return owned.some((a) => a.assetId === assetId && a.quantity > 0);
  }

  async getAllPolicyAssets(policyId: string): Promise<string[]> {
    if (!this.apiKey) return [];
    const allAssets: string[] = [];
    let page = 1;
    while (true) {
      try {
        const url = `${this.baseUrl}/assets/policy/${policyId}?count=100&page=${page}`;
        const res = await fetch(url, { headers: { project_id: this.apiKey } });
        if (!res.ok) {
          this.logger.warn(`Blockfrost getAllPolicyAssets failed on page ${page}: ${res.status}`);
          break;
        }
        const data = (await res.json()) as Array<{ asset: string; quantity: string }>;
        for (const item of data) {
          const assetId = item.asset.slice(policyId.length);
          if (assetId) allAssets.push(assetId);
        }
        if (data.length < 100) break;
        page++;
      } catch (err) {
        this.logger.error(`Blockfrost getAllPolicyAssets error on page ${page}: ${err}`);
        break;
      }
    }
    return allAssets;
  }

  async getAssetMetadata(policyId: string, assetId: string): Promise<NftMetadata | null> {
    if (!this.apiKey) return null;
    const unit = `${policyId}${assetId}`;
    const url = `${this.baseUrl}/assets/${unit}`;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, { headers: { project_id: this.apiKey } });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
          const waitMs = retryAfter * 1000 || Math.min(1000 * 2 ** attempt, 30000);
          this.logger.warn(`Blockfrost rate limited on ${unit}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!res.ok) {
          this.logger.warn(`Blockfrost getAssetMetadata failed for ${unit}: ${res.status}`);
          return null;
        }

        const data = (await res.json()) as any;
        const meta = data.onchain_metadata ?? {};
        const rawAttributes = meta.attributes;
        const decoded = decodeCborAttributes(rawAttributes);
        if (rawAttributes !== undefined && decoded === null) {
          this.logger.warn(`CBOR decode failed for attributes on ${unit} — storing raw value`);
        }
        const attributes: Record<string, string> = decoded ?? (rawAttributes && typeof rawAttributes === 'object' ? rawAttributes : {});
        return {
          assetId,
          name: meta.name ?? assetId,
          imageUrl: meta.image ?? '',
          attributes,
          rawMeta: meta,
        };
      } catch (err) {
        this.logger.error(`Blockfrost getAssetMetadata error for ${assetId} (attempt ${attempt + 1}): ${err}`);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }

    return null;
  }
}

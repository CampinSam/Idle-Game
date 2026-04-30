/**
 * One-off diagnostic: compare NFT entity CIDs in the DB against what is
 * actually present in object storage. Reports:
 *   - CIDs that have a `/media/...` URL but no original file in storage
 *     (these will trigger lazy IPFS hydration on every request)
 *   - CIDs that have an original but no `.thumb.webp` sibling
 *     (list/grid/detail thumb requests will lazily hydrate, then fall back
 *      to the archetype default if the lazy hydrate fails)
 *
 * Usage:  pnpm --filter @derp/api exec tsx ../../scripts/diagnose-nft-images.ts
 *   (or)  pnpm exec tsx scripts/diagnose-nft-images.ts
 */
import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const THUMB_SUFFIX = '.thumb.webp';
const NFT_PREFIX = 'nft/cardano/';

const storage = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

function resolveObjectPath(path: string): { bucketName: string; objectName: string } {
  const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
  const firstPath = publicSearchPaths.split(',').map((p) => p.trim()).filter(Boolean)[0];
  if (!firstPath) throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not configured');
  const pathParts = firstPath.slice(1).split('/');
  const bucketName = pathParts[0];
  const prefix = pathParts.slice(1).join('/');
  const objectName = prefix ? `${prefix}/${path}` : path;
  return { bucketName, objectName };
}

async function listObjectNames(subPath: string): Promise<string[]> {
  const { bucketName, objectName: prefix } = resolveObjectPath(subPath);
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  const names: string[] = [];
  for (const file of files) {
    const name: string = file.name;
    if (!name.startsWith(prefix)) continue;
    const tail = name.slice(prefix.length);
    if (tail) names.push(tail);
  }
  return names;
}

function extractCid(imageUrl: string): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('ipfs://')) return imageUrl.replace('ipfs://', '') || null;
  const mediaPrefix = '/media/nft/cardano/';
  if (imageUrl.startsWith(mediaPrefix)) {
    const cid = imageUrl.slice(mediaPrefix.length);
    return cid.endsWith(THUMB_SUFFIX) ? cid.slice(0, -THUMB_SUFFIX.length) : cid || null;
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Loading NFT entity CIDs from DB...');
    const entities = await prisma.entity.findMany({
      where: { nftAssetId: { not: null } },
      select: { id: true, display: true },
    });
    console.log(`Found ${entities.length} NFT entities`);

    const dbCids = new Set<string>();
    let nullUrl = 0;
    let badUrl = 0;
    for (const e of entities) {
      const url: string = ((e.display as any) || {}).imageUrl || '';
      if (!url) { nullUrl++; continue; }
      const cid = extractCid(url);
      if (!cid) { badUrl++; continue; }
      dbCids.add(cid);
    }
    console.log(`Distinct CIDs referenced by entities: ${dbCids.size}`);
    console.log(`Entities with null/empty imageUrl: ${nullUrl}`);
    console.log(`Entities with unrecognized imageUrl: ${badUrl}`);

    console.log('\nListing object storage under nft/cardano/...');
    const names = await listObjectNames(NFT_PREFIX);
    const storageOriginals = new Set<string>();
    const storageThumbs = new Set<string>();
    for (const name of names) {
      if (name.endsWith(THUMB_SUFFIX)) storageThumbs.add(name.slice(0, -THUMB_SUFFIX.length));
      else storageOriginals.add(name);
    }
    console.log(`Storage: ${storageOriginals.size} originals, ${storageThumbs.size} thumbs`);

    const missingOriginals: string[] = [];
    const missingThumbs: string[] = [];
    for (const cid of dbCids) {
      if (!storageOriginals.has(cid)) missingOriginals.push(cid);
      if (!storageThumbs.has(cid)) missingThumbs.push(cid);
    }
    console.log(`\nCIDs in DB but missing original in storage: ${missingOriginals.length}`);
    console.log(`CIDs in DB but missing thumb in storage:    ${missingThumbs.length}`);

    if (missingOriginals.length > 0) {
      console.log('\nSample of missing originals (first 10):');
      for (const cid of missingOriginals.slice(0, 10)) console.log(`  - ${cid}`);
    }
    if (missingThumbs.length > 0 && missingThumbs.length !== missingOriginals.length) {
      const onlyThumbMissing = missingThumbs.filter((c) => storageOriginals.has(c));
      console.log(`\nCIDs with original present but thumb missing: ${onlyThumbMissing.length}`);
      console.log('Sample (first 10):');
      for (const cid of onlyThumbMissing.slice(0, 10)) console.log(`  - ${cid}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

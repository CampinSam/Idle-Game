import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

const logger = new Logger('NftEntitiesSeed');

const BATCH_SIZE = 500;

function loadNftEntities(): any[] {
  const raw = readFileSync(join(__dirname, 'data', 'nft-entities.json'), 'utf-8');
  return JSON.parse(raw);
}

export async function seedNftEntities(prisma: any): Promise<{ skipped: boolean; inserted: number }> {
  const existing = await prisma.entity.count({
    where: { nftCollectionDefId: { not: null } },
  });

  if (existing > 0) {
    logger.log(`NFT entities already exist (${existing} found) — skipping seed`);
    return { skipped: true, inserted: 0 };
  }

  let entities: any[];
  try {
    entities = loadNftEntities();
  } catch (e: any) {
    logger.error(`Failed to load NFT entities seed file: ${e.message}`);
    return { skipped: true, inserted: 0 };
  }

  logger.log(`Loading ${entities.length} NFT entities from seed data...`);

  let totalInserted = 0;

  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE).map((e: any) => ({
      id: e.id,
      definitionId: e.definitionId,
      speciesId: e.speciesId,
      role: e.role,
      display: e.display,
      progression: e.progression,
      stats: e.stats,
      traits: e.traits,
      archetypeVector: e.archetypeVector,
      affinities: e.affinities,
      state: e.state,
      nftAssetId: e.nftAssetId,
      nftCollectionDefId: e.nftCollectionDefId,
      version: e.version,
      ecosystemId: e.ecosystemId ?? null,
      ownerUserId: null,
    }));

    const result = await prisma.entity.createMany({
      data: batch,
      skipDuplicates: true,
    });

    totalInserted += result.count;

    const processed = Math.min(i + BATCH_SIZE, entities.length);
    if (processed % 1000 === 0 || processed === entities.length) {
      logger.log(`NFT seed progress: ${processed}/${entities.length} processed, ${totalInserted} inserted`);
    }
  }

  logger.log(`NFT entity seeding complete: ${totalInserted} inserted`);
  return { skipped: false, inserted: totalInserted };
}

if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  seedNftEntities(prisma)
    .then((result) => {
      console.log('Result:', JSON.stringify(result));
      return prisma.$disconnect();
    })
    .catch((err: any) => {
      console.error('Seed failed:', err);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}

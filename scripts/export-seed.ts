#!/usr/bin/env tsx
/**
 * Export all definition tables from the database to Object Storage.
 *
 * Usage:
 *   pnpm export-seed               -- uploads to Object Storage + writes local copy
 *   pnpm export-seed --local-only  -- writes local copy only (no upload)
 *
 * This script connects directly to Postgres via Prisma (no NestJS runtime).
 * It reads the 30 definition tables in FK-safe order and:
 *   1. Uploads the result to `seed/seed-data.json` in Object Storage.
 *   2. Writes a local copy to `prisma/seed-data.json` for git (cold-start fallback).
 *
 * Running this against production generates the initial canonical dataset.
 */

import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

const SEED_KEY = 'seed/seed-data.json';
const LOCAL_PATH = path.resolve(__dirname, '..', 'prisma', 'seed-data.json');
const LOCAL_ONLY = process.argv.includes('--local-only');

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

const SEED_TABLE_ORDER = [
  'currency',
  'regionDefinition',
  'displayDef',
  'entityDefinition',
  'locationDefinition',
  'buildingDef',
  'roomDef',
  'missionCategoryDef',
  'missionDef',
  'recipeDef',
  'itemDefinition',
  'giftDef',
  'shopItemDef',
  'eventDefinition',
  'lootboxDef',
  'bundleDef',
  'checkInDef',
  'questDef',
  'modalDef',
  'defaultModalDef',
  'homeBannerDef',
  'systemIconDef',
  'synergyRule',
  'selectionRuleDef',
  'powerDef',
  'soundDef',
  'tagDef',
  'visualEffectDef',
  'effectDef',
  'nftCollectionDef',
  'gameDefinition',
] as const;

function getBucketName(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '').split(',')[0];
  const p = (dir || '').trim();
  if (!p) throw new Error('PRIVATE_OBJECT_DIR or PUBLIC_OBJECT_SEARCH_PATHS not set');
  const parts = (p.startsWith('/') ? p.slice(1) : p).split('/');
  if (!parts[0]) throw new Error('Could not parse bucket name from object storage path');
  return parts[0];
}

function serializeForStorage(data: any): string {
  return JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('Exporting seed data…');

    const data: any = {
      _meta: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tables: [...SEED_TABLE_ORDER],
      },
    };

    for (const modelName of SEED_TABLE_ORDER) {
      const model = (prisma as any)[modelName];
      if (!model) {
        console.warn(`  ⚠ Prisma model "${modelName}" not found, skipping`);
        data[modelName] = [];
        continue;
      }
      const rows = await model.findMany();
      data[modelName] = rows;
      console.log(`  ✓ ${modelName}: ${rows.length} rows`);
    }

    const json = serializeForStorage(data);

    // Always write local copy
    fs.writeFileSync(LOCAL_PATH, json, 'utf-8');
    console.log(`\nLocal copy written to ${LOCAL_PATH}`);

    if (LOCAL_ONLY) {
      console.log('--local-only: skipping Object Storage upload');
    } else {
      // Upload to Object Storage
      const storageClient = new Storage({
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
        } as any,
        projectId: '',
      });

      const bucketName = getBucketName();
      const bucket = storageClient.bucket(bucketName);
      const file = bucket.file(SEED_KEY);
      await file.save(Buffer.from(json, 'utf-8'), { contentType: 'application/json', resumable: false });
      console.log(`Uploaded to Object Storage: ${bucketName}/${SEED_KEY}`);
    }

    const totalRows = SEED_TABLE_ORDER.reduce((sum, t) => sum + (data[t]?.length ?? 0), 0);
    console.log(`\nExport complete. ${totalRows} total rows across ${SEED_TABLE_ORDER.length} tables.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('export-seed failed:', err);
  process.exit(1);
});

/**
 * One-shot migration: copy apps/web/public/images/* into the storage bucket
 * at images/<rel>, and copy any pre-existing images/icons/* in the bucket to
 * the canonical icons/* location. Idempotent.
 *
 * Usage:  pnpm tsx scripts/migrate-public-to-bucket.ts
 */
import { Storage } from '@google-cloud/storage';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

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

function publicSearchPath(): { bucketName: string; prefix: string } {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
  const first = pathsStr.split(',').map(p => p.trim()).find(Boolean);
  if (!first) throw new Error('PUBLIC_OBJECT_SEARCH_PATHS not set');
  const parts = first.slice(1).split('/');
  return { bucketName: parts[0], prefix: parts.slice(1).join('/') };
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

async function walk(dir: string, base: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
}

async function main() {
  const { bucketName, prefix } = publicSearchPath();
  const bucket = storage.bucket(bucketName);
  const join = (k: string) => (prefix ? `${prefix}/${k}` : k);

  // 1) Walk public/images and upload missing files at images/<rel>.
  const publicImagesDir = path.resolve(__dirname, '..', 'apps', 'web', 'public', 'images');
  if (fs.existsSync(publicImagesDir)) {
    const rels: string[] = [];
    await walk(publicImagesDir, publicImagesDir, rels);
    console.log(`Found ${rels.length} files under apps/web/public/images/`);
    let uploaded = 0, skipped = 0;
    for (const rel of rels) {
      const objectName = join(`images/${rel.split(path.sep).join('/')}`);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) { skipped++; continue; }
      const ext = path.extname(rel).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      const buf = fs.readFileSync(path.join(publicImagesDir, rel));
      await file.save(buf, { contentType: mime, resumable: false });
      uploaded++;
      console.log(`  uploaded ${objectName}`);
    }
    console.log(`Public-images migration: ${uploaded} uploaded, ${skipped} already present.`);
  } else {
    console.log('No apps/web/public/images/ folder; nothing to upload.');
  }

  // 2) Bucket-to-bucket: images/icons/* → icons/* (canonical icon location).
  const oldIconPrefix = join('images/icons/');
  const [oldIconFiles] = await bucket.getFiles({ prefix: oldIconPrefix });
  let copied = 0, iconSkipped = 0;
  for (const f of oldIconFiles) {
    if (f.name.endsWith('/')) continue;
    const rel = f.name.slice(oldIconPrefix.length);
    const target = join(`icons/${rel}`);
    const [exists] = await bucket.file(target).exists();
    if (exists) { iconSkipped++; continue; }
    await f.copy(bucket.file(target));
    copied++;
    console.log(`  copied ${f.name} → ${target}`);
  }
  console.log(`Icon relocation: ${copied} copied, ${iconSkipped} already present.`);

  // 3) Backfill SoundDef.fileKey to start with '/'.
  const prisma = new PrismaClient();
  try {
    const sounds = await prisma.soundDef.findMany({ where: { fileKey: { not: null } } });
    let normalized = 0;
    for (const s of sounds) {
      if (s.fileKey && !s.fileKey.startsWith('/')) {
        await prisma.soundDef.update({ where: { id: s.id }, data: { fileKey: `/${s.fileKey}` } });
        normalized++;
      }
    }
    console.log(`SoundDef.fileKey backfill: normalized ${normalized} of ${sounds.length} entries.`);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Migration complete.');
}

main().catch(err => { console.error(err); process.exit(1); });

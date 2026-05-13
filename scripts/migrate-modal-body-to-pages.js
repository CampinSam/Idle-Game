/**
 * One-time migration: convert legacy ModalDef records that have a root-level
 * `body` array (pre-pages schema) into the new `pages: [{ body }]` format.
 *
 * Safe to re-run: records that already have `pages` are skipped.
 *
 * Usage:
 *   node scripts/migrate-modal-body-to-pages.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.modalDef.findMany({ select: { id: true, spec: true } });
  let migrated = 0;

  for (const record of records) {
    const spec = record.spec;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;

    if (Array.isArray(spec.pages) && spec.pages.length > 0) continue;

    if (Array.isArray(spec.body)) {
      const { body, ...rest } = spec;
      await prisma.modalDef.update({
        where: { id: record.id },
        data: { spec: { ...rest, pages: [{ body }] } },
      });
      console.log(`Migrated: ${record.id}`);
      migrated++;
    }
  }

  console.log(`Done: ${migrated} / ${records.length} records migrated.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

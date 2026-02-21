const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"
    );

    if (rows.length > 0) {
      console.log('Found failed/incomplete migrations, dropping all tables...');
      await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
      await prisma.$executeRawUnsafe('CREATE SCHEMA public');
      console.log('Schema reset complete.');
    } else {
      console.log('No failed migrations found, skipping reset.');
    }
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      console.log('No migration table found, fresh database ready.');
    } else {
      throw err;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Reset check error:', err.message);
  process.exit(1);
});

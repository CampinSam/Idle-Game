import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

const logger = new Logger('SoundsSeed');

function loadSoundDefs(): Array<{ key: string; name: string; bus: string; description: string }> {
  const raw = readFileSync(join(__dirname, 'data', 'sounds.json'), 'utf-8');
  return JSON.parse(raw);
}

export async function seedSounds(prisma: PrismaService) {
  const count = await (prisma as any).soundDef.count();
  if (count > 0) return;

  const soundDefs = loadSoundDefs();
  logger.log('Seeding placeholder sound definitions...');
  for (const def of soundDefs) {
    await (prisma as any).soundDef.upsert({
      where: { key: def.key },
      update: {},
      create: def,
    });
  }
  logger.log(`Seeded ${soundDefs.length} placeholder sound defs`);
}

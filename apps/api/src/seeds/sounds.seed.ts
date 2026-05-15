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
  const soundDefs = loadSoundDefs();
  let created = 0;
  for (const def of soundDefs) {
    const existing = await (prisma as any).soundDef.findUnique({ where: { key: def.key } });
    await (prisma as any).soundDef.upsert({
      where: { key: def.key },
      update: {},
      create: def,
    });
    if (!existing) created++;
  }
  if (created > 0) {
    logger.log(`Seeded ${created} new sound defs`);
  }
}

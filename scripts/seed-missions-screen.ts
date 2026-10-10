import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const missionsScreenData = {
  id: 'missions',
  type: 'screen_composition',
  screenKey: 'missions',
  version: 1,
  status: 'active',
  layout: { layoutType: 'pass_through' },
  sections: [
    {
      id: 'missions-browser-main',
      component: 'MissionBrowser',
      priority: 10,
      props: {},
    },
  ],
  dataSources: [],
};

async function upsertScreen(key: string, data: object) {
  const existing = await (prisma as any).gameDefinition.findFirst({
    where: { type: 'screen_composition', key },
    orderBy: { version: 'desc' },
  });

  if (existing) {
    await (prisma as any).gameDefinition.update({
      where: { id: existing.id },
      data: { data, isActive: true },
    });
    console.log(`Updated screen composition: ${key}`);
  } else {
    await (prisma as any).gameDefinition.create({
      data: {
        type: 'screen_composition',
        key,
        version: 1,
        isActive: true,
        data,
      },
    });
    console.log(`Created screen composition: ${key}`);
  }
}

async function main() {
  await upsertScreen('missions', missionsScreenData);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

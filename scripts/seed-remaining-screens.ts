import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const screens = [
  {
    key: 'achievements',
    component: 'AchievementsBrowser',
  },
  {
    key: 'profile',
    component: 'ProfileBrowser',
  },
  {
    key: 'rewards',
    component: 'RewardsBrowser',
  },
  {
    key: 'settings',
    component: 'SettingsBrowser',
  },
];

async function upsertScreen(key: string, component: string) {
  const data = {
    id: key,
    type: 'screen_composition',
    screenKey: key,
    version: 1,
    status: 'active',
    layout: { layoutType: 'pass_through' },
    sections: [{ id: `${key}-main`, component, priority: 10, props: {} }],
    dataSources: [],
  };

  const existing = await (prisma as any).gameDefinition.findFirst({
    where: { type: 'screen_composition', key },
    orderBy: { version: 'desc' },
  });

  if (existing) {
    await (prisma as any).gameDefinition.update({
      where: { id: existing.id },
      data: { data, isActive: true },
    });
    console.log(`Updated: ${key}`);
  } else {
    await (prisma as any).gameDefinition.create({
      data: { type: 'screen_composition', key, version: 1, isActive: true, data },
    });
    console.log(`Created: ${key}`);
  }
}

async function main() {
  for (const { key, component } of screens) {
    await upsertScreen(key, component);
  }
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

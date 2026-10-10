import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const homeScreenData = {
  id: 'home',
  type: 'screen_composition',
  screenKey: 'home',
  version: 1,
  status: 'active',
  layout: { layoutType: 'vertical_feed' },
  sections: [
    { id: 'home-banner', component: 'BannerCarousel', priority: 10, props: {} },
    { id: 'home-season', component: 'SeasonBanner', priority: 20, props: {} },
    { id: 'home-buffs', component: 'GlobalBuffsSection', priority: 30, props: {} },
    { id: 'home-status', component: 'QuickStatusCards', priority: 40, props: {} },
    { id: 'home-workshops', component: 'CraftingWorkshopsCard', priority: 50, props: {} },
    { id: 'home-daily', component: 'DailyQuestPanel', priority: 60, props: {} },
    { id: 'home-mission', component: 'MissionFeaturedCard', priority: 70, props: {} },
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
    console.log(`Updated: ${key}`);
  } else {
    await (prisma as any).gameDefinition.create({
      data: { type: 'screen_composition', key, version: 1, isActive: true, data },
    });
    console.log(`Created: ${key}`);
  }
}

async function main() {
  await upsertScreen('home', homeScreenData);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

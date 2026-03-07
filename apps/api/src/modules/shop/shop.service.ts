import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShopService implements OnApplicationBootstrap {
  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const count = await this.prisma.shopItemDef.count();
    if (count > 0) return;

    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.shopItemDef.createMany({
      data: [
        {
          name: "Adventurer's Bundle",
          description: 'Everything a new adventurer needs to get started on their journey.',
          tab: 'featured',
          cost: [{ type: 'currency', id: 'soft_arcanium', amount: 500 }],
          contents: [
            { type: 'currency', id: 'hard_essence', amount: 50 },
            { type: 'currency', id: 'soft_arcanium', amount: 1000 },
          ],
          badge: 'HOT DEAL',
          badgeColor: '#ef4444',
          displayOrder: 0,
        },
        {
          name: 'Weekly Special',
          description: 'A curated selection of rare resources. This offer expires soon!',
          tab: 'featured',
          cost: [{ type: 'currency', id: 'hard_essence', amount: 50 }],
          contents: [
            { type: 'currency', id: 'premium_gems', amount: 5 },
            { type: 'currency', id: 'soft_arcanium', amount: 2000 },
          ],
          badge: 'LIMITED',
          badgeColor: '#f59e0b',
          limitedUntil: weekFromNow,
          displayOrder: 1,
        },
        {
          name: 'Small Arcanium Pack',
          description: 'A modest supply of Arcanium to keep your operations running.',
          tab: 'currency',
          cost: [{ type: 'currency', id: 'hard_essence', amount: 20 }],
          contents: [{ type: 'currency', id: 'soft_arcanium', amount: 200 }],
          displayOrder: 0,
        },
        {
          name: 'Medium Arcanium Pack',
          description: 'Great value for the committed keeper.',
          tab: 'currency',
          cost: [{ type: 'currency', id: 'hard_essence', amount: 50 }],
          originalCost: [{ type: 'currency', id: 'hard_essence', amount: 70 }],
          contents: [{ type: 'currency', id: 'soft_arcanium', amount: 600 }],
          badge: 'BEST VALUE',
          badgeColor: '#8b5cf6',
          displayOrder: 1,
        },
        {
          name: 'Large Arcanium Pack',
          description: 'A substantial reserve for ambitious keepers.',
          tab: 'currency',
          cost: [{ type: 'currency', id: 'hard_essence', amount: 100 }],
          contents: [{ type: 'currency', id: 'soft_arcanium', amount: 1500 }],
          displayOrder: 2,
        },
        {
          name: 'Explorer Kit',
          description: 'A curated kit for those seeking new territories. Includes supplies for extended expeditions.',
          tab: 'bundle',
          cost: [{ type: 'currency', id: 'soft_arcanium', amount: 300 }],
          contents: [
            { type: 'currency', id: 'soft_arcanium', amount: 500 },
            { type: 'currency', id: 'hard_essence', amount: 10 },
          ],
          badge: 'NEW',
          badgeColor: '#10b981',
          displayOrder: 0,
        },
        {
          name: 'Power Bundle',
          description: 'For those who need raw power. Requires rare materials as part of the exchange.',
          tab: 'bundle',
          cost: [
            { type: 'currency', id: 'soft_arcanium', amount: 100 },
          ],
          contents: [
            { type: 'currency', id: 'hard_essence', amount: 30 },
            { type: 'currency', id: 'premium_gems', amount: 2 },
          ],
          displayOrder: 1,
        },
        {
          name: 'Mystery Shard',
          description: 'A fragment of unknown origin. Trade it for rare essences.',
          tab: 'items',
          cost: [{ type: 'currency', id: 'premium_gems', amount: 10 }],
          contents: [{ type: 'currency', id: 'hard_essence', amount: 100 }],
          badge: 'RARE',
          badgeColor: '#3b82f6',
          displayOrder: 0,
        },
        {
          name: 'Essence Catalyst',
          description: 'Accelerates the refinement of raw essences. A staple of any keeper\'s workshop.',
          tab: 'items',
          cost: [{ type: 'currency', id: 'soft_arcanium', amount: 800 }],
          contents: [{ type: 'currency', id: 'hard_essence', amount: 20 }],
          displayOrder: 1,
        },
      ],
    });
  }

  async findAll() {
    return this.prisma.shopItemDef.findMany({
      where: { enabled: true },
      orderBy: [{ tab: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async findOne(id: string) {
    return this.prisma.shopItemDef.findUnique({ where: { id } });
  }

  async create(data: any) {
    return this.prisma.shopItemDef.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.shopItemDef.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.shopItemDef.delete({ where: { id } });
  }
}

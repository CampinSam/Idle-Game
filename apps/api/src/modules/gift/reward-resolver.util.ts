import { generateEntityData } from '../entity/entity-generator.util';

export async function resolveRewardSpec(
  prisma: any,
  currencyService: any,
  inventoryService: any,
  userId: string,
  spec: any,
  sourceId: string,
): Promise<any[]> {
  if (!spec || !spec.type) return [];

  const grants: any[] = [];

  switch (spec.type) {
    case 'currency': {
      await currencyService.creditTx(prisma, {
        userId,
        currencyId: spec.currencyId,
        amount: spec.amount,
        reason: 'Reward',
        sourceType: 'reward',
        sourceId,
      });
      grants.push({ type: 'currency', currencyId: spec.currencyId, amount: spec.amount });
      break;
    }

    case 'item': {
      await inventoryService.addItemTx(prisma, {
        userId,
        itemId: spec.itemDefId,
        quantity: spec.qty,
        reason: 'Reward',
        sourceType: 'reward',
        sourceId,
      });
      grants.push({ type: 'item', itemDefId: spec.itemDefId, qty: spec.qty });
      break;
    }

    case 'entity': {
      const name = spec.overrides?.name ?? 'New Entity';
      const entityData = await generateEntityData(prisma, userId, spec.definitionId, name);

      if (spec.overrides) {
        const overrides = spec.overrides;
        if (overrides.level != null) {
          entityData.progression = {
            ...(entityData.progression as any ?? {}),
            level: overrides.level,
            xp: 0,
          };
        }
        if (overrides.stats) {
          entityData.stats = { ...(entityData.stats as any ?? {}), ...overrides.stats };
        }
        if (overrides.traits && typeof overrides.traits === 'object') {
          entityData.traits = { ...(entityData.traits as any ?? {}), ...overrides.traits };
        }
      }

      const entity = await prisma.entity.create({ data: entityData });
      grants.push({ type: 'entity', entityId: entity.id, definitionId: spec.definitionId });
      break;
    }

    case 'bundle': {
      if (Array.isArray(spec.entries)) {
        for (const entry of spec.entries) {
          const subGrants = await resolveRewardSpec(
            prisma,
            currencyService,
            inventoryService,
            userId,
            entry,
            sourceId,
          );
          grants.push(...subGrants);
        }
      }
      break;
    }

    case 'lootTable': {
      if (spec.lootboxDefId && spec.qty) {
        await inventoryService.addItemTx(prisma, {
          userId,
          itemId: spec.lootboxDefId,
          quantity: spec.qty ?? 1,
          reason: 'Reward (lootbox)',
          sourceType: 'reward',
          sourceId,
        });
        grants.push({ type: 'lootTable', lootboxDefId: spec.lootboxDefId, qty: spec.qty ?? 1 });
      }
      break;
    }

    case 'cosmetic':
    default:
      grants.push({ type: spec.type, status: 'not_implemented' });
      break;
  }

  return grants;
}

import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { TelemetryService, TelemetrySubscriber, TelemetryEvent } from '../telemetry/telemetry.service';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';

function shallowMatch(filter: Record<string, unknown>, data: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (data[k] !== v) return false;
  }
  return true;
}

@Injectable()
export class QuestService implements TelemetrySubscriber, OnModuleInit {
  private readonly logger = new Logger(QuestService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private telemetryService: TelemetryService,
    private currencyService: CurrencyService,
    private inventoryService: InventoryService,
  ) {}

  onModuleInit() {
    this.telemetryService.registerSubscriber(this);
  }

  async processEvent(userId: string, event: TelemetryEvent, tx?: any): Promise<void> {
    const db = tx || this.prisma;

    const instances = await (db as any).questInstance.findMany({
      where: { userId, status: 'active' },
      include: { questDef: true },
    });

    for (const instance of instances) {
      const def = instance.questDef;
      if (!def || !def.enabled) continue;

      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const progress: any[] = Array.isArray(instance.progress)
        ? [...instance.progress]
        : objectives.map((_, i) => ({ objectiveIndex: i, current: 0, target: objectives[i]?.target ?? 1, completed: false }));

      while (progress.length < objectives.length) {
        const i = progress.length;
        progress.push({ objectiveIndex: i, current: 0, target: objectives[i]?.target ?? 1, completed: false });
      }

      let changed = false;
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        if (!obj || progress[i]?.completed) continue;

        if (obj.eventType !== event.eventType) continue;
        if (obj.key != null && obj.key !== event.key) continue;
        if (obj.dataFilter && !shallowMatch(obj.dataFilter, event.data)) continue;

        const prog = progress[i];
        const before = prog.current;
        prog.current = Math.min(prog.current + event.amount, prog.target ?? 1);
        if (prog.current >= prog.target) prog.completed = true;
        if (prog.current !== before) changed = true;
      }

      if (!changed) continue;

      const allDone = progress.every((p) => p.completed);
      const updateData: any = { progress };
      if (allDone) {
        updateData.status = 'completed';
        updateData.completedAt = new Date();
      }

      await (db as any).questInstance.update({
        where: { id: instance.id },
        data: updateData,
      });

      if (allDone) {
        try {
          await this.notificationService.createNotification({
            userId,
            type: 'quest_complete',
            category: 'quest',
            priority: 'high',
            title: 'Quest Complete!',
            body: def.name,
            meta: { type: 'quest', questInstanceId: instance.id, questDefId: def.id },
            sourceType: 'quest',
            sourceId: instance.id,
          });
        } catch (err) {
          this.logger.warn(`Failed to send quest complete notification: ${err}`);
        }
      }
    }
  }

  async getOrInitInstance(userId: string, questDefId: string, tx?: any): Promise<any> {
    const db = tx || this.prisma;

    const existing = await (db as any).questInstance.findUnique({
      where: { userId_questDefId: { userId, questDefId } },
      include: { questDef: true },
    });

    if (existing) {
      if (existing.status === 'claimed' && !existing.questDef?.repeatable) return null;
      return existing;
    }

    const def = await (db as any).questDef.findUnique({ where: { id: questDefId } });
    if (!def || !def.enabled) return null;

    const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
    const initialProgress = objectives.map((obj: any, i: number) => ({
      objectiveIndex: i,
      current: 0,
      target: obj.target ?? 1,
      completed: false,
    }));

    return (db as any).questInstance.create({
      data: { userId, questDefId, progress: initialProgress },
      include: { questDef: true },
    });
  }

  async claimReward(userId: string, questInstanceId: string, tx?: any): Promise<{ grants: any[] }> {
    const db = tx || this.prisma;

    const instance = await (db as any).questInstance.findUnique({
      where: { id: questInstanceId },
      include: { questDef: true },
    });

    if (!instance) throw new NotFoundException('Quest instance not found');
    if (instance.userId !== userId) throw new ForbiddenException('This quest does not belong to you');
    if (instance.status !== 'completed') throw new BadRequestException(`Quest cannot be claimed (status: ${instance.status})`);

    const def = instance.questDef;
    const rewardSpec = (def.rewardSpec as any) || {};
    const grants: any[] = [];

    if (rewardSpec.type === 'currency' && rewardSpec.currencyId && rewardSpec.amount) {
      await this.currencyService.creditTx(db, {
        userId,
        currencyId: rewardSpec.currencyId,
        amount: rewardSpec.amount,
        reason: `Quest reward: ${def.name}`,
        sourceType: 'quest',
        sourceId: instance.id,
      });
      grants.push({ type: 'currency', currencyId: rewardSpec.currencyId, amount: rewardSpec.amount });
    } else if (rewardSpec.type === 'item' && rewardSpec.itemDefId && rewardSpec.qty) {
      await this.inventoryService.addItemTx(db, {
        userId,
        itemId: rewardSpec.itemDefId,
        quantity: rewardSpec.qty,
        reason: `Quest reward: ${def.name}`,
        sourceType: 'quest',
        sourceId: instance.id,
      });
      grants.push({ type: 'item', itemDefId: rewardSpec.itemDefId, qty: rewardSpec.qty });
    } else if (rewardSpec.type === 'bundle' && Array.isArray(rewardSpec.entries)) {
      for (const entry of rewardSpec.entries) {
        if (entry.type === 'currency' && entry.currencyId && entry.amount) {
          await this.currencyService.creditTx(db, {
            userId,
            currencyId: entry.currencyId,
            amount: entry.amount,
            reason: `Quest reward: ${def.name}`,
            sourceType: 'quest',
            sourceId: instance.id,
          });
          grants.push({ type: 'currency', currencyId: entry.currencyId, amount: entry.amount });
        } else if (entry.type === 'item' && entry.itemDefId && entry.qty) {
          await this.inventoryService.addItemTx(db, {
            userId,
            itemId: entry.itemDefId,
            quantity: entry.qty,
            reason: `Quest reward: ${def.name}`,
            sourceType: 'quest',
            sourceId: instance.id,
          });
          grants.push({ type: 'item', itemDefId: entry.itemDefId, qty: entry.qty });
        }
      }
    }

    if (def.repeatable) {
      const objectives: any[] = Array.isArray(def.objectives) ? def.objectives : [];
      const freshProgress = objectives.map((obj: any, i: number) => ({
        objectiveIndex: i,
        current: 0,
        target: obj.target ?? 1,
        completed: false,
      }));
      await (db as any).questInstance.update({
        where: { id: questInstanceId },
        data: { status: 'active', claimedAt: new Date(), completedAt: null, progress: freshProgress },
      });
    } else {
      await (db as any).questInstance.update({
        where: { id: questInstanceId },
        data: { status: 'claimed', claimedAt: new Date() },
      });
    }

    return { grants };
  }

  async listInstances(userId: string): Promise<any[]> {
    return (this.prisma as any).questInstance.findMany({
      where: { userId },
      include: { questDef: true },
      orderBy: { startedAt: 'desc' },
    });
  }
}

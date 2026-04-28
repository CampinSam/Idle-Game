import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { TelemetryService, TelemetrySubscriber, TelemetryEvent } from '../telemetry/telemetry.service';
import { CurrencyService } from '../currency/currency.service';
import { InventoryService } from '../inventory/inventory.service';
import { GameRulesService, RequirementContext } from '../game-rules/game-rules.service';

function shallowMatch(filter: Record<string, unknown>, data: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (data[k] !== v) return false;
  }
  return true;
}

function makeRng() {
  return {
    chance: (p: number) => Math.random() < p,
    nextInt: (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min,
  };
}

// Normalizes the editor's two top-level shapes into a flat array of outcome
// entries. The OutcomeListEditor saves either `[ ...entries ]` directly or
// `{ rewards: [ ...entries ] }`; everything else (a single entry object) is
// wrapped as a one-item array so the canonical resolver can iterate uniformly.
function normalizeRewardSpec(spec: unknown): any[] {
  if (Array.isArray(spec)) return spec;
  if (spec && typeof spec === 'object') {
    const obj = spec as Record<string, unknown>;
    if (Array.isArray(obj.rewards)) return obj.rewards as any[];
    if (Object.keys(obj).length === 0) return [];
    return [obj];
  }
  return [];
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
    private gameRules: GameRulesService,
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
          }, tx);
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
    const items = normalizeRewardSpec(def.rewardSpec);

    // Route reward resolution through the canonical resolver so quest claims
    // share field names, bundle semantics, requirement gating, and bundle_ref
    // expansion with every other reward path (mission, crafting, lootbox, gift
    // bundle_ref). All entries use canonical { type, key, min, max } shape.
    const user = await (db as any).user.findUnique({ where: { id: userId } });
    const reqContext: RequirementContext = user
      ? this.gameRules.buildRequirementContext(user as any)
      : { user: {}, userFlags: {} };
    const { resolved } = await this.gameRules.resolveOutcomesAsync(items, reqContext, makeRng());

    const grants: any[] = [];
    for (const r of resolved) {
      const entry = r.entry;
      const amount = r.amount ?? 0;
      if (!entry?.type || !entry.key || amount <= 0) continue;

      if (entry.type === 'currency') {
        await this.currencyService.creditTx(db, {
          userId, currencyId: entry.key, amount,
          reason: `Quest reward: ${def.name}`,
          sourceType: 'quest', sourceId: instance.id,
        });
        grants.push({ type: 'currency', key: entry.key, amount });
      } else if (entry.type === 'item') {
        await this.inventoryService.addItemTx(db, {
          userId, itemId: entry.key, quantity: amount,
          reason: `Quest reward: ${def.name}`,
          sourceType: 'quest', sourceId: instance.id,
        });
        grants.push({ type: 'item', key: entry.key, amount });
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

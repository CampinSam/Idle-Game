import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EntityTraits } from '@derp/shared';

export interface GameUser {
  keeperLevel?: number;
  flags?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LocationContext {
  buildings?: { buildingDefId: string; rooms?: { roomDefId: string }[] }[];
  rooms?: { roomDefId: string }[];
  regionId?: string | null;
  parentBuildingRooms?: { roomDefId: string }[];
}

export interface RequirementContext {
  user: GameUser;
  userFlags: Record<string, unknown>;
  allPlayerLocations?: LocationContext[];
  currentLocation?: LocationContext;
  parentBuilding?: { buildingDefId: string; rooms?: { roomDefId: string }[] };
}

@Injectable()
export class GameRulesService {
  constructor(private prisma: PrismaService) {}

  compareValues(actual: number, target: number, operator: string): boolean {
    switch (operator) {
      case 'exists':
        return actual !== undefined && actual !== null;
      case 'eq':
        return actual === target;
      case 'neq':
        return actual !== target;
      case 'gt':
        return actual > target;
      case 'gte':
        return actual >= target;
      case 'lt':
        return actual < target;
      case 'lte':
        return actual <= target;
      default:
        return actual >= target;
    }
  }

  checkRequirement(req: Record<string, unknown>, context: RequirementContext): boolean {
    const op = (req.operator as string) ?? (req.type === 'flag' ? 'eq' : 'gte');

    switch (req.type) {
      case 'keeper_level':
        return this.compareValues(Number(context.user.keeperLevel ?? 0), Number(req.value ?? 0), op);
      case 'team_size':
        return true;
      case 'trait':
        return true;
      case 'flag': {
        const flagVal = context.userFlags[req.key as string];
        if (op === 'exists') return flagVal !== undefined && flagVal !== null;
        if (op === 'dne') return flagVal === undefined || flagVal === null;
        if (flagVal === undefined || flagVal === null) return false;
        const numFlag = Number(flagVal);
        const numTarget = Number(req.value);
        const bothNumeric = !isNaN(numFlag) && !isNaN(numTarget);
        if (bothNumeric) return this.compareValues(numFlag, numTarget, op);
        if (op === 'eq') return String(flagVal) === String(req.value);
        if (op === 'neq') return String(flagVal) !== String(req.value);
        return false;
      }
      case 'has_building': {
        const ids = req.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return true;
        const allLocs = context.allPlayerLocations ?? [];
        return ids.some(id =>
          allLocs.some(loc => loc.buildings?.some(b => b.buildingDefId === id)),
        );
      }
      case 'has_room': {
        const ids = req.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return true;
        const allLocs = context.allPlayerLocations ?? [];
        return ids.some(id =>
          allLocs.some(loc =>
            loc.buildings?.some(b => b.rooms?.some(r => r.roomDefId === id)) ||
            loc.rooms?.some(r => r.roomDefId === id),
          ),
        );
      }
      case 'parent_has_building': {
        const ids = req.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return true;
        const loc = context.currentLocation;
        if (!loc) return false;
        return ids.some(id => loc.buildings?.some(b => b.buildingDefId === id));
      }
      case 'parent_has_room': {
        const ids = req.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return true;
        const bld = context.parentBuilding;
        if (!bld) return false;
        return ids.some(id => bld.rooms?.some(r => r.roomDefId === id));
      }
      case 'in_region': {
        const ids = req.ids as string[];
        if (!ids || !Array.isArray(ids) || ids.length === 0) return true;
        const loc = context.currentLocation;
        if (!loc || !loc.regionId) return false;
        return ids.includes(loc.regionId);
      }
      case 'building':
      case 'currency':
      case 'item':
        return true;
      default:
        return true;
    }
  }

  checkRequirements(reqs: unknown, context: RequirementContext): boolean {
    if (!reqs || !Array.isArray(reqs) || reqs.length === 0) return true;
    return reqs.every((req: Record<string, unknown>) => this.checkRequirement(req, context));
  }

  checkVisibility(visReqs: unknown, user: GameUser, userFlags?: Record<string, unknown>, extra?: Partial<RequirementContext>): boolean {
    if (!visReqs || !Array.isArray(visReqs) || visReqs.length === 0) return true;
    const flags: Record<string, unknown> = userFlags ?? ((user.flags && typeof user.flags === 'object') ? user.flags : {});
    return visReqs.every((req: Record<string, unknown>) => this.checkRequirement(req, { user, userFlags: flags, ...extra }));
  }

  buildRequirementContext(user: GameUser, extra?: Partial<RequirementContext>): RequirementContext {
    const userFlags: Record<string, unknown> = (user.flags && typeof user.flags === 'object') ? user.flags : {};
    return { user, userFlags, ...extra };
  }

  async applyFlagEffect(userId: string, effect: Record<string, unknown>): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const flags: Record<string, unknown> = (user.flags && typeof user.flags === 'object') ? { ...(user.flags as Record<string, unknown>) } : {};
    const op = effect.operation ?? 'set';

    const key = effect.key as string;
    switch (op) {
      case 'set':
        flags[key] = effect.value;
        break;
      case 'increment':
        flags[key] = (typeof flags[key] === 'number' ? flags[key] : 0) + Number(effect.value ?? 1);
        break;
      case 'decrement':
        flags[key] = (typeof flags[key] === 'number' ? flags[key] : 0) - Number(effect.value ?? 1);
        break;
      case 'invert':
        flags[key] = !flags[key];
        break;
      case 'remove':
        delete flags[key];
        break;
    }
    await this.prisma.user.update({ where: { id: userId }, data: { flags: flags as any } });
  }

  rollOdds(odds: number | undefined, rng?: { chance: (p: number) => boolean }): boolean {
    const o = odds ?? 100;
    if (o >= 100) return true;
    if (o <= 0) return false;
    if (rng) return rng.chance(o / 100);
    return Math.random() * 100 < o;
  }

  async processEffectsWithBundles(
    userId: string,
    effects: any[],
    rng?: { chance: (p: number) => boolean },
  ): Promise<void> {
    if (!effects || !Array.isArray(effects)) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const reqContext = this.buildRequirementContext(user as any);

    const applyEntry = async (effect: any) => {
      if (effect.requirements && !this.checkRequirements(effect.requirements, reqContext)) return;
      if (!this.rollOdds(effect.odds, rng)) return;
      if (effect.type === 'flag') {
        await this.applyFlagEffect(userId, effect);
      }
    };

    const rollAmount = (min: number, max: number): number => {
      if (min === max) return min;
      return rng.nextInt(min, max);
    };

    const pickWeighted = (pool: any[], count: number): any[] => {
      const remaining = [...pool];
      const picks: any[] = [];
      for (let i = 0; i < count && remaining.length > 0; i++) {
        const totalOdds = remaining.reduce((sum: number, e: any) => sum + (e.odds ?? 100), 0);
        let roll = rng.nextInt(0, totalOdds - 1);
        let pickedIdx = remaining.length - 1;
        for (let j = 0; j < remaining.length; j++) {
          roll -= (remaining[j].odds ?? 100);
          if (roll < 0) { pickedIdx = j; break; }
        }
        picks.push(remaining[pickedIdx]);
        remaining.splice(pickedIdx, 1);
      }
      return picks;
    };

    const processItems = async (items: any[]) => {
      for (const item of items) {
        if (item.requirements && !this.checkRequirements(item.requirements, reqContext)) continue;
        if (item.bundle && Array.isArray(item.bundle)) {
          if (!this.rollOdds(item.odds, rng)) continue;
          const pickMin = item.pickMin ?? item.minChoices;
          const pickMax = item.pickMax ?? item.maxChoices;
          if (pickMin !== undefined || pickMax !== undefined) {
            const pool = item.bundle.filter((e: any) =>
              !e.requirements || this.checkRequirements(e.requirements, reqContext),
            );
            const count = Math.min(
              pool.length,
              rollAmount(pickMin ?? 1, pickMax ?? pickMin ?? 1),
            );
            const picks = pickWeighted(pool, count);
            await processItems(picks.map((p: any) => ({ ...p, odds: undefined })));
          } else {
            await processItems(item.bundle);
          }
        } else {
          await applyEntry(item);
        }
      }
    };

    await processItems(effects);
  }

  resolveOutcomes(
    items: any[],
    reqContext: RequirementContext,
    rng: { chance: (p: number) => boolean; nextInt: (min: number, max: number) => number },
  ): { resolved: { entry: any; amount?: number }[]; texts: string[]; flags: { entry: any }[] } {
    const texts: string[] = [];
    const flags: { entry: any }[] = [];

    const pickWeightedText = (pool: any[]): { message: string } | undefined => {
      if (pool.length === 0) return undefined;
      const totalOdds = pool.reduce((sum: number, t: any) => sum + (t.odds ?? 100), 0);
      let roll = rng.nextInt(0, totalOdds - 1);
      for (const t of pool) {
        roll -= (t.odds ?? 100);
        if (roll < 0) return t;
      }
      return pool[pool.length - 1];
    };

    const collectTexts = (entries: any[]): any[] => {
      const out: any[] = [];
      for (const e of entries) {
        if (e.bundle && Array.isArray(e.bundle)) continue;
        if (e.type === 'text') out.push(e);
      }
      return out;
    };

    const applyText = (picked: { message: string } | undefined) => {
      if (picked) texts.push(picked.message);
    };

    const rollAmount = (min: number, max: number): number => {
      if (min === max) return min;
      return rng.nextInt(min, max);
    };

    const pickWeighted = (pool: any[], count: number): any[] => {
      const remaining = [...pool];
      const picks: any[] = [];
      for (let i = 0; i < count && remaining.length > 0; i++) {
        const totalOdds = remaining.reduce((sum: number, e: any) => sum + (e.odds ?? 100), 0);
        let roll = rng.nextInt(0, totalOdds - 1);
        let pickedIdx = remaining.length - 1;
        for (let j = 0; j < remaining.length; j++) {
          roll -= (remaining[j].odds ?? 100);
          if (roll < 0) { pickedIdx = j; break; }
        }
        picks.push(remaining[pickedIdx]);
        remaining.splice(pickedIdx, 1);
      }
      return picks;
    };

    const resolved: { entry: any; amount?: number }[] = [];

    const resolveItems = (entries: any[]) => {
      for (const item of entries) {
        if (item.requirements && !this.checkRequirements(item.requirements, reqContext)) continue;
        if (item.bundle && Array.isArray(item.bundle)) {
          if (!this.rollOdds(item.odds, rng)) continue;
          const pickMin = item.pickMin ?? item.minChoices;
          const pickMax = item.pickMax ?? item.maxChoices;
          if (pickMin !== undefined || pickMax !== undefined) {
            const pool = item.bundle.filter((e: any) =>
              !e.requirements || this.checkRequirements(e.requirements, reqContext),
            );
            const count = Math.min(
              pool.length,
              rollAmount(pickMin ?? 1, pickMax ?? pickMin ?? 1),
            );
            const picks = pickWeighted(pool, count);
            resolveItems(picks.map((p: any) => ({ ...p, odds: undefined })));
            applyText(pickWeightedText(collectTexts(picks)));
          } else {
            resolveItems(item.bundle);
            applyText(pickWeightedText(collectTexts(item.bundle)));
          }
        } else {
          if (item.type === 'text') continue;
          if (item.type === 'flag') {
            if (!this.rollOdds(item.odds, rng)) continue;
            switch (item.operation) {
              case 'set':       reqContext.userFlags[item.key] = item.value; break;
              case 'increment': reqContext.userFlags[item.key] = (typeof reqContext.userFlags[item.key] === 'number' ? reqContext.userFlags[item.key] as number : 0) + Number(item.value ?? 1); break;
              case 'decrement': reqContext.userFlags[item.key] = (typeof reqContext.userFlags[item.key] === 'number' ? reqContext.userFlags[item.key] as number : 0) - Number(item.value ?? 1); break;
              case 'invert':    reqContext.userFlags[item.key] = !reqContext.userFlags[item.key]; break;
              case 'remove':    delete reqContext.userFlags[item.key]; break;
            }
            flags.push({ entry: item });
          } else if (item.type === 'emitEvent') {
            if (!this.rollOdds(item.odds, rng)) continue;
            resolved.push({ entry: item });
          } else {
            const amount = item.amount !== undefined
              ? Number(item.amount)
              : rollAmount(item.min ?? 1, item.max ?? item.min ?? 1);
            if (amount <= 0) continue;
            if (!this.rollOdds(item.odds, rng)) continue;
            resolved.push({ entry: item, amount });
          }
        }
      }
    };

    resolveItems(items);
    applyText(pickWeightedText(collectTexts(items)));

    return { resolved, texts, flags };
  }

  async resolveName(type: string, key: string): Promise<string> {
    if (type === 'currency') {
      const cur = await (this.prisma as any).currency.findUnique({ where: { id: key }, select: { name: true } }) as { name?: string } | null;
      if (cur?.name) return cur.name;
    } else if (type === 'item') {
      const item = await (this.prisma as any).itemDefinition.findUnique({ where: { id: key }, select: { name: true } }) as { name?: string } | null;
      if (item?.name) return item.name;
    }
    return key;
  }

  countTeamTraits(entities: Array<{ traits?: unknown }>, traitKey: string): number {
    let count = 0;
    for (const entity of entities) {
      const traits = entity.traits as Partial<EntityTraits> | null;
      if (traits && typeof traits === 'object') {
        for (const slot of Object.values(traits)) {
          if (slot === traitKey) count++;
        }
      }
    }
    return count;
  }
}

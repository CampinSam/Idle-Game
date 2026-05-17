import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EntityTraits, RichSelection } from '@derp/shared';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import type { SelectionContext } from '../selection/selection.types';

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

export interface TeamEntitySnap {
  id: string;
  entityType?: string;
  traits?: Record<string, string>;
  speciesId?: string;
  collectionId?: string;
  rarity?: string;
}

export interface RequirementContext {
  user: GameUser;
  userFlags: Record<string, unknown>;
  allPlayerLocations?: LocationContext[];
  currentLocation?: LocationContext;
  parentBuilding?: { buildingDefId: string; rooms?: { roomDefId: string }[] };
  teamSize?: number;
  team?: TeamEntitySnap[];
}

@Injectable()
export class GameRulesService {
  private readonly logger = new Logger(GameRulesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly selectionResolver: SelectionResolverService,
  ) {}

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

  checkRequirements(requirements: unknown, context: RequirementContext): boolean {
    if (!requirements || (Array.isArray(requirements) && requirements.length === 0)) return true;
    if (
      typeof requirements === 'object' &&
      !Array.isArray(requirements) &&
      'op' in (requirements as object)
    ) {
      return this.selectionResolver.evaluate(requirements as RichSelection, this.reqCtxToSelCtx(context));
    }
    if (Array.isArray(requirements)) {
      this.logger.error('checkRequirements: legacy Requirement[] format detected — failing closed; run migration script to convert to RichSelection');
      return false;
    }
    return true;
  }

  checkVisibility(
    visReqs: unknown,
    user: GameUser,
    userFlags?: Record<string, unknown>,
    extra?: Partial<RequirementContext>,
  ): boolean {
    if (!visReqs) return true;
    const flags: Record<string, unknown> =
      userFlags ?? ((user.flags && typeof user.flags === 'object') ? user.flags as Record<string, unknown> : {});
    return this.checkRequirements(visReqs, { user, userFlags: flags, ...extra });
  }

  buildRequirementContext(user: GameUser, extra?: Partial<RequirementContext>): RequirementContext {
    const userFlags: Record<string, unknown> =
      (user.flags && typeof user.flags === 'object') ? user.flags as Record<string, unknown> : {};
    return { user, userFlags, ...extra };
  }

  private reqCtxToSelCtx(context: RequirementContext): SelectionContext {
    return {
      player: {
        keeperLevel: Number(context.user.keeperLevel ?? 0),
        flags: context.userFlags,
      },
      entities: (context.team ?? []).map(e => ({
        id: e.id,
        entityType: e.entityType,
        speciesId: e.speciesId,
        collectionId: e.collectionId,
        traits: (e.traits ?? {}) as Record<string, string>,
        stats: {},
        rarity: e.rarity,
      })),
      inventory: { currencies: {}, items: {} },
      locations: (context.allPlayerLocations ?? []).map(loc => ({
        regionId: loc.regionId,
        buildings: loc.buildings ?? [],
        rooms: loc.rooms ?? [],
      })),
      currentLocation: context.currentLocation
        ? {
            regionId: context.currentLocation.regionId,
            buildings: context.currentLocation.buildings ?? [],
            rooms: context.currentLocation.rooms ?? [],
          }
        : undefined,
      parentBuilding: context.parentBuilding
        ? {
            buildingDefId: context.parentBuilding.buildingDefId,
            rooms: context.parentBuilding.rooms ?? [],
          }
        : undefined,
      missionContext: context.teamSize !== undefined
        ? {
            activityType: '',
            missionType: undefined,
            missionTags: [],
            regionId: undefined,
            seasonId: undefined,
            teamSize: context.teamSize,
          }
        : undefined,
    };
  }

  private reqCtxToParentBuildingSelCtx(context: RequirementContext): SelectionContext {
    const base = this.reqCtxToSelCtx(context);
    if (!context.currentLocation) return { ...base, locations: [] };
    return {
      ...base,
      locations: [
        {
          regionId: context.currentLocation.regionId,
          buildings: context.currentLocation.buildings ?? [],
          rooms: context.currentLocation.rooms ?? [],
        },
      ],
    };
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

  // Loads every BundleDef transitively referenced from `items`.
  async loadBundleDefs(items: any[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    if (!Array.isArray(items)) return out;

    const collectIds = (entries: any[], into: Set<string>) => {
      for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        if (e.type === 'bundle_ref' && typeof e.bundleDefId === 'string') {
          into.add(e.bundleDefId);
        } else if (Array.isArray(e.bundle)) {
          collectIds(e.bundle, into);
        }
      }
    };

    const pending = new Set<string>();
    collectIds(items, pending);

    while (pending.size > 0) {
      const ids = Array.from(pending);
      pending.clear();
      const rows = await (this.prisma as any).bundleDef.findMany({ where: { id: { in: ids } } });
      const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));
      for (const id of ids) {
        if (out.has(id)) continue;
        const row = byId.get(id) ?? null;
        out.set(id, row);
        if (row && Array.isArray(row.bundle)) {
          const next = new Set<string>();
          collectIds(row.bundle, next);
          for (const nid of next) {
            if (!out.has(nid)) pending.add(nid);
          }
        }
      }
    }

    return out;
  }

  // Rewrites bundle_ref entries to inline bundles using `defs`; overrides win.
  // Missing/disabled defs and cycles collapse to empty bundles.
  // `warned` dedupes missing/disabled warnings within a single call tree.
  expandBundleRefs(
    items: any[],
    defs: Map<string, any>,
    stack: Set<string> = new Set(),
    warned: Set<string> = new Set(),
  ): any[] {
    if (!Array.isArray(items)) return items;
    return items.map((item) => this.expandEntry(item, defs, stack, warned));
  }

  private expandEntry(item: any, defs: Map<string, any>, stack: Set<string>, warned: Set<string>): any {
    if (!item || typeof item !== 'object') return item;

    if (item.type === 'bundle_ref') {
      const id = item.bundleDefId;
      const def = id ? defs.get(id) : null;
      if (!def || !def.enabled) {
        if (id && !warned.has(id)) {
          warned.add(id);
          this.logger.warn(`bundle_ref to missing or disabled BundleDef "${id}" — resolved as empty bundle`);
        }
        return { bundle: [], requirements: item.requirements };
      }
      if (stack.has(id)) {
        this.logger.warn(`bundle_ref cycle detected at BundleDef "${id}" — collapsing to empty bundle`);
        return { bundle: [], requirements: item.requirements };
      }
      const nextStack = new Set(stack);
      nextStack.add(id);
      const expandedInner = this.expandBundleRefs(def.bundle ?? [], defs, nextStack, warned);
      const result: any = { bundle: expandedInner };
      const odds = item.odds ?? def.odds;
      if (odds !== undefined && odds !== null) result.odds = Number(odds);
      const pickMin = item.pickMin ?? def.pickMin;
      if (pickMin !== undefined && pickMin !== null) result.pickMin = Number(pickMin);
      const pickMax = item.pickMax ?? def.pickMax;
      if (pickMax !== undefined && pickMax !== null) result.pickMax = Number(pickMax);
      if (item.requirements !== undefined) result.requirements = item.requirements;
      return result;
    }

    if (Array.isArray(item.bundle)) {
      return { ...item, bundle: this.expandBundleRefs(item.bundle, defs, stack, warned) };
    }

    return item;
  }

  /**
   * Convenience wrapper that pre-loads all referenced BundleDefs, expands the
   * outcome tree, and then resolves it. Use this instead of the bare
   * `resolveOutcomes` whenever a caller wants `bundle_ref` support.
   */
  async resolveOutcomesAsync(
    items: any[],
    reqContext: RequirementContext,
    rng: { chance: (p: number) => boolean; nextInt: (min: number, max: number) => number },
  ): Promise<{ resolved: { entry: any; amount?: number }[]; texts: string[]; flags: { entry: any }[] }> {
    const defs = await this.loadBundleDefs(items);
    const expanded = this.expandBundleRefs(items, defs);
    return this.resolveOutcomes(expanded, reqContext, rng);
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

    // Expand any bundle_ref entries up-front so the rest of this method
    // sees only inline bundles & raw entries (transparent bundle_ref support).
    const bundleDefs = await this.loadBundleDefs(effects);
    effects = this.expandBundleRefs(effects, bundleDefs);

    const applyEntry = async (effect: any) => {
      if (effect.requirements && !this.checkRequirements(effect.requirements, reqContext)) return;
      if (!this.rollOdds(effect.odds, rng)) return;
      if (effect.type === 'flag') {
        await this.applyFlagEffect(userId, effect);
      }
    };

    // Note: the rng param here only provides `chance(p)` (no nextInt/float roll),
    // so pick-mode sampling uses Math.random() directly. Full seeded determinism
    // is available in resolveOutcomes where rng includes nextInt.
    const rollPickCount = (min: number, max: number): number => {
      const lo = Math.max(0, min);
      const hi = Math.max(lo, max);
      if (lo >= hi) return lo;
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    };

    // Picks N entries from `pool` with replacement using each entry's `odds`
    // as a relative weight. Duplicates are allowed and the count may exceed
    // `pool.length` — that is precisely how authors express "roll the whole
    // bundle N times" by wrapping their recipe in a single inner bundle and
    // setting pickMax = N on the consumer.
    const pickWeightedRandom = (pool: any[], count: number): any[] => {
      const picks: any[] = [];
      if (pool.length === 0 || count <= 0) return picks;
      const totalWeight = pool.reduce((sum: number, e: any) => sum + (e.odds ?? 100), 0);
      for (let i = 0; i < count; i++) {
        if (totalWeight <= 0) {
          const idx = Math.floor(Math.random() * pool.length);
          picks.push(pool[idx]);
          continue;
        }
        let r = Math.random() * totalWeight;
        let pickedIdx = pool.length - 1;
        for (let j = 0; j < pool.length; j++) {
          r -= (pool[j].odds ?? 100);
          if (r <= 0) { pickedIdx = j; break; }
        }
        picks.push(pool[pickedIdx]);
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
            const count = rollPickCount(
              Number(pickMin ?? 1),
              Number(pickMax ?? pickMin ?? 1),
            );
            const picks = pickWeightedRandom(pool, count);
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
      const weights = pool.map((t: any) => Math.max(0, Math.round((t.odds ?? 100) * 100)));
      const totalWeight = weights.reduce((sum: number, w: number) => sum + w, 0);
      if (totalWeight <= 0) return pool[rng.nextInt(0, pool.length - 1)];
      let roll = rng.nextInt(0, totalWeight - 1);
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll < 0) return pool[i];
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

    // Picks N entries from `pool` with replacement using each entry's `odds`
    // as a relative weight. Duplicates are allowed and the count may exceed
    // `pool.length` — that is precisely how authors express "roll the whole
    // bundle N times" by wrapping their recipe in a single inner bundle and
    // setting pickMax = N on the consumer.
    const pickWeighted = (pool: any[], count: number): any[] => {
      const picks: any[] = [];
      if (pool.length === 0 || count <= 0) return picks;
      const weights = pool.map((e: any) => Math.max(0, Math.round((e.odds ?? 100) * 100)));
      const totalWeight = weights.reduce((sum: number, w: number) => sum + w, 0);
      for (let i = 0; i < count; i++) {
        let pickedIdx: number;
        if (totalWeight <= 0) {
          pickedIdx = rng.nextInt(0, pool.length - 1);
        } else {
          let roll = rng.nextInt(0, totalWeight - 1);
          pickedIdx = pool.length - 1;
          for (let j = 0; j < pool.length; j++) {
            roll -= weights[j];
            if (roll < 0) { pickedIdx = j; break; }
          }
        }
        picks.push(pool[pickedIdx]);
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
            const count = rollAmount(
              Number(pickMin ?? 1),
              Number(pickMax ?? pickMin ?? 1),
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
          if (item.type === 'nothing') continue;
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
            const amount = rollAmount(item.min ?? 1, item.max ?? item.min ?? 1);
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

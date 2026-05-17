import { Injectable, Logger } from '@nestjs/common';
import { StackMode, SynergyRule as PrismaSynergyRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SynergyEntityDescriptor,
  SynergyActivityContext,
  SynergySelector,
  SynergyRuleContext,
  SynergyEffect,
  MatchedRule,
  SynergyResult,
  SynergyTotals,
  ResourceYieldModifier,
} from './synergy.types';

interface DbSynergyRule {
  id: string;
  name: string;
  enabled: boolean;
  sourceSelector: SynergySelector;
  targetSelector: SynergySelector;
  context: SynergyRuleContext;
  effects: SynergyEffect[];
  priority: number;
  stackGroup: string | null;
  stackMode: StackMode;
  maxApplications: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

@Injectable()
export class SynergyResolverService {
  private readonly logger = new Logger(SynergyResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate all enabled SynergyRules against a set of source and target
   * entity descriptors under a given activity context.
   *
   * A rule fires for each unique (source, target) pair where the source
   * matches the rule's sourceSelector AND the target matches targetSelector.
   * When sourceSelector is empty {}, the source side is unconstrained (any
   * entity). When targetSelector is empty {}, the target side is also
   * unconstrained — the rule treats the whole team as both source and target.
   */
  async resolveRules(
    activityContext: SynergyActivityContext,
    sourceDescriptors: SynergyEntityDescriptor[],
    targetDescriptors: SynergyEntityDescriptor[],
  ): Promise<SynergyResult> {
    const rules = await this.loadRules();
    const now = new Date();

    const candidates: Array<{ rule: DbSynergyRule; applications: number }> = [];

    for (const rule of rules) {
      if (rule.startsAt && now < rule.startsAt) continue;
      if (rule.endsAt && now > rule.endsAt) continue;

      if (!this.matchesContext(activityContext, rule.context)) {
        continue;
      }

      const srcEmpty = this.isSelectorEmpty(rule.sourceSelector);
      const tgtEmpty = this.isSelectorEmpty(rule.targetSelector);

      let pairCount = 0;

      if (srcEmpty && tgtEmpty) {
        pairCount = 1;
      } else if (srcEmpty) {
        pairCount = targetDescriptors.filter(t => this.matchesSelector(t, rule.targetSelector)).length;
      } else if (tgtEmpty) {
        pairCount = sourceDescriptors.filter(s => this.matchesSelector(s, rule.sourceSelector)).length;
      } else {
        const matchingSources = sourceDescriptors.filter(s => this.matchesSelector(s, rule.sourceSelector));
        const matchingTargets = targetDescriptors.filter(t => this.matchesSelector(t, rule.targetSelector));
        pairCount = matchingSources.length * matchingTargets.length;
      }

      if (pairCount === 0) continue;

      const applications =
        rule.stackMode === StackMode.unique
          ? 1
          : Math.min(pairCount, rule.maxApplications);

      candidates.push({ rule, applications });
    }

    const winning = this.applyStackGroupLogic(candidates);
    const matchedRules = this.buildMatchedRules(winning);
    const totals = this.aggregateTotals(matchedRules);

    return { matchedRules, totals };
  }

  private async loadRules(): Promise<DbSynergyRule[]> {
    const rows: PrismaSynergyRule[] = await this.prisma.synergyRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });
    // Normalize Prisma's JsonValue fields into typed domain interfaces.
    // Each JSON column is stored as authored (selector/context objects or effects array),
    // so explicit coercion here is justified by the schema contract enforced at write time.
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      sourceSelector: ((row.sourceSelector as SynergySelector) ?? {}),
      targetSelector: ((row.targetSelector as SynergySelector) ?? {}),
      context: ((row.context as SynergyRuleContext) ?? {}),
      effects: (Array.isArray(row.effects) ? (row.effects as unknown as SynergyEffect[]) : []),
      priority: row.priority,
      stackGroup: row.stackGroup,
      stackMode: row.stackMode,
      maxApplications: row.maxApplications,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }));
  }

  isSelectorEmpty(selector: SynergySelector | null | undefined): boolean {
    if (!selector || typeof selector !== 'object') return true;
    return Object.keys(selector).length === 0;
  }

  matchesSelector(entity: SynergyEntityDescriptor, selector: SynergySelector): boolean {
    if (this.isSelectorEmpty(selector)) return true;

    const traitValues = Object.values(entity.traits ?? {}).map(v => v.toLowerCase());

    if (selector.entityTypes?.length) {
      if (!entity.entityType || !selector.entityTypes.includes(entity.entityType)) return false;
    }

    if (selector.speciesIds?.length) {
      if (!entity.speciesId || !selector.speciesIds.includes(entity.speciesId)) return false;
    }

    if (selector.collections?.length) {
      if (!entity.collectionId || !selector.collections.includes(entity.collectionId)) return false;
    }

    if (selector.entityIds?.length) {
      if (!entity.entityId || !selector.entityIds.includes(entity.entityId)) return false;
    }

    if (selector.rarities?.length) {
      if (!entity.rarity || !selector.rarities.includes(entity.rarity)) return false;
    }

    if (selector.regions?.length) {
      if (!entity.regionId || !selector.regions.includes(entity.regionId)) return false;
    }

    if (selector.factions?.length) {
      const faction = entity.traits?.faction?.toLowerCase();
      if (!faction || !selector.factions.map(f => f.toLowerCase()).includes(faction)) return false;
    }

    if (selector.traitsAny?.length) {
      const needLow = selector.traitsAny.map(t => t.toLowerCase());
      if (!needLow.some(t => traitValues.includes(t))) return false;
    }

    if (selector.traitsAll?.length) {
      const needLow = selector.traitsAll.map(t => t.toLowerCase());
      if (!needLow.every(t => traitValues.includes(t))) return false;
    }

    if (selector.minTraitCount !== undefined) {
      if (traitValues.length < selector.minTraitCount) return false;
    }

    if (selector.locationTypes?.length) {
      const entityTypes = entity.locationTypes ?? [];
      if (!selector.locationTypes.some(lt => entityTypes.includes(lt))) return false;
    }

    if (selector.buildingTagsAny?.length) {
      const bTags = entity.buildingTags ?? [];
      if (!selector.buildingTagsAny.some(bt => bTags.includes(bt))) return false;
    }

    if (selector.missionTagsAny?.length) {
      const mTags = entity.missionTags ?? [];
      if (!selector.missionTagsAny.some(mt => mTags.includes(mt))) return false;
    }

    return true;
  }

  matchesContext(activityCtx: SynergyActivityContext, ruleCtx: SynergyRuleContext): boolean {
    if (!ruleCtx || Object.keys(ruleCtx).length === 0) return true;

    if (ruleCtx.activityTypes?.length) {
      if (!ruleCtx.activityTypes.includes(activityCtx.activityType)) return false;
    }

    if (ruleCtx.missionTypes?.length) {
      if (!activityCtx.missionType || !ruleCtx.missionTypes.includes(activityCtx.missionType)) return false;
    }

    if (ruleCtx.missionTagsAny?.length) {
      const mTags = activityCtx.missionTags ?? [];
      if (!ruleCtx.missionTagsAny.some(t => mTags.includes(t))) return false;
    }

    if (ruleCtx.regionIds?.length) {
      if (!activityCtx.regionId || !ruleCtx.regionIds.includes(activityCtx.regionId)) return false;
    }

    if (ruleCtx.seasonIds?.length) {
      if (!activityCtx.seasonId || !ruleCtx.seasonIds.includes(activityCtx.seasonId)) return false;
    }

    if (ruleCtx.requiresTeamSizeMin !== undefined) {
      if ((activityCtx.teamSize ?? 0) < ruleCtx.requiresTeamSizeMin) return false;
    }

    if (ruleCtx.requiresTeamSizeMax !== undefined) {
      if ((activityCtx.teamSize ?? 0) > ruleCtx.requiresTeamSizeMax) return false;
    }

    return true;
  }

  private applyStackGroupLogic(
    candidates: Array<{ rule: DbSynergyRule; applications: number }>,
  ): Array<{ rule: DbSynergyRule; applications: number }> {
    const ungrouped = candidates.filter(c => !c.rule.stackGroup);
    const grouped = candidates.filter(c => c.rule.stackGroup);

    const groups = new Map<string, Array<{ rule: DbSynergyRule; applications: number }>>();
    for (const c of grouped) {
      const key = c.rule.stackGroup!;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }

    const winners: Array<{ rule: DbSynergyRule; applications: number }> = [...ungrouped];

    for (const [, members] of groups) {
      const mode = members[0]?.rule.stackMode ?? StackMode.additive;

      if (mode === StackMode.additive || mode === StackMode.unique) {
        winners.push(...members);
      } else if (mode === StackMode.best_only) {
        // Only keep the rule with the highest *positive* leading effect value.
        // If no rule has a positive value, no rule from this group fires.
        let best: { rule: DbSynergyRule; applications: number } | null = null;
        let bestVal = 0; // threshold: must beat 0 to qualify
        for (const c of members) {
          const val = this.leadingEffectValue(c.rule.effects);
          if (val > bestVal) {
            bestVal = val;
            best = c;
          }
        }
        if (best) winners.push(best);
      } else if (mode === StackMode.highest_abs_only) {
        // Keep the rule with the highest absolute value (positive or negative).
        const best = members.reduce((prev, curr) => {
          const pVal = Math.abs(this.leadingEffectValue(prev.rule.effects));
          const cVal = Math.abs(this.leadingEffectValue(curr.rule.effects));
          return cVal > pVal ? curr : prev;
        });
        winners.push(best);
      } else {
        winners.push(...members);
      }
    }

    return winners;
  }

  private leadingEffectValue(effects: SynergyEffect[]): number {
    for (const e of effects ?? []) {
      if (typeof e.value === 'number') return e.value;
    }
    return 0;
  }

  private buildMatchedRules(
    winning: Array<{ rule: DbSynergyRule; applications: number }>,
  ): MatchedRule[] {
    return winning.map(({ rule, applications }) => ({
      ruleId: rule.id,
      name: rule.name,
      applications,
      effects: rule.effects,
    }));
  }

  private aggregateTotals(matchedRules: MatchedRule[]): SynergyTotals {
    let synergyScore = 0;
    const statModifiers: Record<string, { flat: number; percentAdd: number; multiplier: number }> = {};
    const durationModifiers: Record<string, { flatSeconds: number; percentAdd: number; multiplier: number }> = {};
    const resourceMap: Record<string, ResourceYieldModifier> = {};
    const immunities: string[] = [];

    for (const rule of matchedRules) {
      const n = rule.applications;
      for (const effect of rule.effects) {
        const val = (effect.value ?? 0) * n;

        if (effect.type === 'synergy_score_modifier') {
          if (effect.operation === 'flat_add') synergyScore += val;
        } else if (effect.type === 'stat_modifier' && effect.stat) {
          const stat = effect.stat;
          if (!statModifiers[stat]) statModifiers[stat] = { flat: 0, percentAdd: 0, multiplier: 1 };
          if (effect.operation === 'flat_add') statModifiers[stat].flat += val;
          else if (effect.operation === 'percent_add') statModifiers[stat].percentAdd += val;
          else if (effect.operation === 'multiplier') statModifiers[stat].multiplier *= (effect.value ?? 1) ** n;
        } else if (effect.type === 'duration_modifier' && effect.activity) {
          const act = effect.activity;
          if (!durationModifiers[act]) durationModifiers[act] = { flatSeconds: 0, percentAdd: 0, multiplier: 1 };
          if (effect.operation === 'flat_seconds') durationModifiers[act].flatSeconds += val;
          else if (effect.operation === 'percent_add') durationModifiers[act].percentAdd += val;
          else if (effect.operation === 'multiplier') durationModifiers[act].multiplier *= (effect.value ?? 1) ** n;
        } else if (effect.type === 'resource_yield_modifier' && effect.resourceId) {
          const rid = effect.resourceId;
          if (!resourceMap[rid]) resourceMap[rid] = { resourceId: rid, flat: 0, percentAdd: 0, multiplier: 1 };
          if (effect.operation === 'flat_add') resourceMap[rid].flat += val;
          else if (effect.operation === 'percent_add') resourceMap[rid].percentAdd += val;
          else if (effect.operation === 'multiplier') resourceMap[rid].multiplier *= (effect.value ?? 1) ** n;
        } else if (effect.type === 'immunity' && effect.immuneTo) {
          if (!immunities.includes(effect.immuneTo)) immunities.push(effect.immuneTo);
        }
      }
    }

    return {
      synergyScore,
      statModifiers,
      durationModifiers,
      resourceYieldModifiers: Object.values(resourceMap),
      immunities,
    };
  }
}

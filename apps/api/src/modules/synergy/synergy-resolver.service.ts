import { Injectable, Logger } from '@nestjs/common';
import { StackMode, SynergyRule as PrismaSynergyRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RichSelection, RichSelectionRule, ScopeType, AggregateType, OperatorType } from '@derp/shared';
import { SelectionResolverService } from '../selection/selection-resolver.service';
import type { SelectionContext, SelectionEntityContext } from '../selection/selection.types';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly selectionResolver: SelectionResolverService,
  ) {}

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

      // An empty selector is unconstrained — it matches every descriptor on that side.
      // Always compute the full Cartesian product: matchedSources × matchedTargets.
      const matchedSources = this.isSelectorEmpty(rule.sourceSelector)
        ? sourceDescriptors
        : sourceDescriptors.filter(s => this.matchesSelector(s, rule.sourceSelector));

      const matchedTargets = this.isSelectorEmpty(rule.targetSelector)
        ? targetDescriptors
        : targetDescriptors.filter(t => this.matchesSelector(t, rule.targetSelector));

      const pairCount = matchedSources.length * matchedTargets.length;

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

    const richSel = this.selectorToRichSelection(selector);
    if (!richSel) return true;

    const selCtx: SelectionContext = {
      player: { keeperLevel: 0, flags: {} },
      entities: [this.descriptorToEntityCtx(entity)],
      inventory: { currencies: {}, items: {} },
      locations: [],
    };

    return this.selectionResolver.evaluate(richSel, selCtx);
  }

  matchesContext(activityCtx: SynergyActivityContext, ruleCtx: SynergyRuleContext): boolean {
    if (!ruleCtx || Object.keys(ruleCtx).length === 0) return true;

    const richSel = this.contextToRichSelection(ruleCtx);
    if (!richSel) return true;

    const selCtx: SelectionContext = {
      player: { keeperLevel: 0, flags: {} },
      entities: [],
      inventory: { currencies: {}, items: {} },
      locations: [],
      missionContext: {
        activityType: activityCtx.activityType,
        missionType: activityCtx.missionType,
        missionTags: activityCtx.missionTags,
        regionId: activityCtx.regionId,
        seasonId: activityCtx.seasonId,
        teamSize: activityCtx.teamSize,
      },
    };

    return this.selectionResolver.evaluate(richSel, selCtx);
  }

  private descriptorToEntityCtx(entity: SynergyEntityDescriptor): SelectionEntityContext {
    return {
      id: entity.entityId,
      entityType: entity.entityType,
      speciesId: entity.speciesId,
      collectionId: entity.collectionId,
      traits: entity.traits ?? {},
      stats: {},
      rarity: entity.rarity,
      regionId: entity.regionId,
      locationTypes: entity.locationTypes,
      buildingTags: entity.buildingTags,
      missionTags: entity.missionTags,
    };
  }

  private selectorToRichSelection(selector: SynergySelector): RichSelection | null {
    type R = RichSelection | RichSelectionRule;
    const rules: R[] = [];

    if (selector.entityTypes?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'entityType', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.entityTypes });
    }
    if (selector.speciesIds?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'speciesId', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.speciesIds });
    }
    if (selector.collections?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'collectionId', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.collections });
    }
    if (selector.entityIds?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'id', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.entityIds });
    }
    if (selector.rarities?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'rarity', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.rarities });
    }
    if (selector.regions?.length) {
      rules.push({ scope: 'entity' as ScopeType, field: 'regionId', aggregate: 'any' as AggregateType, operator: 'in' as OperatorType, value: selector.regions });
    }
    if (selector.factions?.length) {
      rules.push({
        op: 'OR',
        rules: selector.factions.map(f => ({ scope: 'entity' as ScopeType, field: 'traitValues', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: f } satisfies RichSelectionRule)),
      });
    }
    if (selector.traitsAny?.length) {
      if (selector.traitsAny.length === 1) {
        rules.push({ scope: 'entity' as ScopeType, field: 'traitValues', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: selector.traitsAny[0] });
      } else {
        rules.push({ op: 'OR', rules: selector.traitsAny.map(t => ({ scope: 'entity' as ScopeType, field: 'traitValues', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: t } satisfies RichSelectionRule)) });
      }
    }
    if (selector.traitsAll?.length) {
      for (const t of selector.traitsAll) {
        rules.push({ scope: 'entity' as ScopeType, field: 'traitValues', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: t });
      }
    }
    if (selector.minTraitCount !== undefined) {
      rules.push({ scope: 'entity' as ScopeType, field: 'traitCount', aggregate: 'any' as AggregateType, operator: 'gte' as OperatorType, value: selector.minTraitCount });
    }
    if (selector.locationTypes?.length) {
      if (selector.locationTypes.length === 1) {
        rules.push({ scope: 'entity' as ScopeType, field: 'locationTypes', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: selector.locationTypes[0] });
      } else {
        rules.push({ op: 'OR', rules: selector.locationTypes.map(lt => ({ scope: 'entity' as ScopeType, field: 'locationTypes', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: lt } satisfies RichSelectionRule)) });
      }
    }
    if (selector.buildingTagsAny?.length) {
      if (selector.buildingTagsAny.length === 1) {
        rules.push({ scope: 'entity' as ScopeType, field: 'buildingTags', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: selector.buildingTagsAny[0] });
      } else {
        rules.push({ op: 'OR', rules: selector.buildingTagsAny.map(bt => ({ scope: 'entity' as ScopeType, field: 'buildingTags', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: bt } satisfies RichSelectionRule)) });
      }
    }
    if (selector.missionTagsAny?.length) {
      if (selector.missionTagsAny.length === 1) {
        rules.push({ scope: 'entity' as ScopeType, field: 'missionTags', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: selector.missionTagsAny[0] });
      } else {
        rules.push({ op: 'OR', rules: selector.missionTagsAny.map(mt => ({ scope: 'entity' as ScopeType, field: 'missionTags', aggregate: 'any' as AggregateType, operator: 'contains' as OperatorType, value: mt } satisfies RichSelectionRule)) });
      }
    }

    if (rules.length === 0) return null;
    return { op: 'AND', rules };
  }

  private contextToRichSelection(ruleCtx: SynergyRuleContext): RichSelection | null {
    type R = RichSelection | RichSelectionRule;
    const rules: R[] = [];

    if (ruleCtx.activityTypes?.length) {
      rules.push({ scope: 'context' as ScopeType, field: 'activityType', operator: 'in' as OperatorType, value: ruleCtx.activityTypes });
    }
    if (ruleCtx.missionTypes?.length) {
      rules.push({ scope: 'context' as ScopeType, field: 'missionType', operator: 'in' as OperatorType, value: ruleCtx.missionTypes });
    }
    if (ruleCtx.missionTagsAny?.length) {
      if (ruleCtx.missionTagsAny.length === 1) {
        rules.push({ scope: 'context' as ScopeType, field: 'missionTags', operator: 'contains' as OperatorType, value: ruleCtx.missionTagsAny[0] });
      } else {
        rules.push({ op: 'OR', rules: ruleCtx.missionTagsAny.map(mt => ({ scope: 'context' as ScopeType, field: 'missionTags', operator: 'contains' as OperatorType, value: mt } satisfies RichSelectionRule)) });
      }
    }
    if (ruleCtx.regionIds?.length) {
      rules.push({ scope: 'context' as ScopeType, field: 'regionId', operator: 'in' as OperatorType, value: ruleCtx.regionIds });
    }
    if (ruleCtx.seasonIds?.length) {
      rules.push({ scope: 'context' as ScopeType, field: 'seasonId', operator: 'in' as OperatorType, value: ruleCtx.seasonIds });
    }
    if (ruleCtx.requiresTeamSizeMin !== undefined) {
      rules.push({ scope: 'context' as ScopeType, field: 'teamSize', operator: 'gte' as OperatorType, value: ruleCtx.requiresTeamSizeMin });
    }
    if (ruleCtx.requiresTeamSizeMax !== undefined) {
      rules.push({ scope: 'context' as ScopeType, field: 'teamSize', operator: 'lte' as OperatorType, value: ruleCtx.requiresTeamSizeMax });
    }

    if (rules.length === 0) return null;
    return { op: 'AND', rules };
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

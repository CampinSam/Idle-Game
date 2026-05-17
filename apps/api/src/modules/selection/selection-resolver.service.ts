import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  RichSelection,
  RichSelectionRule,
  RuleRefNode,
  RichSelectionChild,
  isRichSelectionGroup,
  isRuleRefNode,
} from '@derp/shared';
import { applyAggregate } from './aggregate.util';
import { resolveScope, isStubbedScope } from './scope.util';
import type { SelectionContext } from './selection.types';
import { PrismaService } from '../../prisma/prisma.service';

type AnyNode = RichSelection | RichSelectionRule | RuleRefNode;

@Injectable()
export class SelectionResolverService implements OnModuleInit {
  private readonly logger = new Logger(SelectionResolverService.name);

  private readonly _ruleDefCache = new Map<string, any | null>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reloadRuleCache();
  }

  /**
   * Reload the in-memory SelectionRuleDef cache from the database.
   * Loads ALL rows (enabled and disabled) so that disabled-rule evaluation
   * is handled at resolve time, not load time.
   * Transitively loads any rule_ref IDs referenced inside loaded selections
   * until no new IDs are discovered.
   */
  async reloadRuleCache(): Promise<void> {
    try {
      const rows: any[] = await (this.prisma as any).selectionRuleDef.findMany({});
      this._ruleDefCache.clear();
      for (const row of rows) {
        this._ruleDefCache.set(row.id, row);
      }
      await this._loadTransitiveRefs();
      this.logger.log(`SelectionRuleDef cache loaded: ${this._ruleDefCache.size} rule(s)`);
    } catch (err) {
      this.logger.warn(`Failed to load SelectionRuleDef cache: ${err}`);
    }
  }

  /**
   * After loading the initial set of rule defs, find any rule_ref IDs
   * referenced inside their selections that are NOT yet in the cache,
   * and load those too. Repeat until stable (handles arbitrary depth).
   */
  private async _loadTransitiveRefs(): Promise<void> {
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations++ < MAX_ITERATIONS) {
      const unknownIds = new Set<string>();
      for (const def of this._ruleDefCache.values()) {
        if (!def) continue;
        this._collectRuleRefIds(def.selection as AnyNode, unknownIds);
      }
      const toFetch = [...unknownIds].filter(id => !this._ruleDefCache.has(id));
      if (toFetch.length === 0) break;

      const rows: any[] = await (this.prisma as any).selectionRuleDef.findMany({
        where: { id: { in: toFetch } },
      });
      for (const row of rows) {
        this._ruleDefCache.set(row.id, row);
      }
      for (const id of toFetch) {
        if (!this._ruleDefCache.has(id)) this._ruleDefCache.set(id, null);
      }
    }
  }

  /** Collect all rule_ref IDs present anywhere in a selection tree. */
  private _collectRuleRefIds(node: AnyNode | null | undefined, out: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (isRuleRefNode(node)) {
      out.add(node.id);
      return;
    }
    if (isRichSelectionGroup(node)) {
      for (const child of (node as RichSelection).rules) {
        this._collectRuleRefIds(child, out);
      }
    }
  }

  // ─── Public sync evaluation ───────────────────────────────────────────────

  evaluate(node: AnyNode, ctx: SelectionContext): boolean {
    try {
      return this._evaluate(node, ctx, new Set<string>());
    } catch (err) {
      this.logger.warn(`SelectionResolver error: ${err}`);
      return false;
    }
  }

  evaluateAll(condition: RichSelection | null | undefined, ctx: SelectionContext): boolean {
    if (!condition) return true;
    if (!isRichSelectionGroup(condition) && !isRuleRefNode(condition) && !('scope' in condition)) {
      return true;
    }
    return this.evaluate(condition, ctx);
  }

  // ─── Internal evaluation ──────────────────────────────────────────────────

  private _evaluate(node: AnyNode, ctx: SelectionContext, visited: Set<string>): boolean {
    if (isRuleRefNode(node)) {
      return this._evaluateRuleRef(node, ctx, visited);
    }
    if (isRichSelectionGroup(node)) {
      return this._evaluateGroup(node as RichSelection, ctx, visited);
    }
    return this._evaluateRule(node as RichSelectionRule, ctx, visited);
  }

  private _evaluateRuleRef(ref: RuleRefNode, ctx: SelectionContext, visited: Set<string>): boolean {
    if (visited.has(ref.id)) {
      this.logger.warn(
        `SelectionResolver: circular rule_ref detected for id="${ref.id}" — returning false`,
      );
      return false;
    }

    const def = this._ruleDefCache.get(ref.id);
    if (def === undefined) {
      this.logger.warn(
        `SelectionResolver: rule_ref id="${ref.id}" not in cache — returning false (cache may need reload)`,
      );
      return false;
    }
    if (def === null) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" not found in DB — returning false`);
      return false;
    }
    if (!def.enabled) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" is disabled — returning false`);
      return false;
    }

    const childVisited = new Set(visited);
    childVisited.add(ref.id);

    return this._evaluate(def.selection as AnyNode, ctx, childVisited);
  }

  private _evaluateGroup(group: RichSelection, ctx: SelectionContext, visited: Set<string>): boolean {
    const { op, rules } = group;
    if (!rules || rules.length === 0) return true;

    switch (op) {
      case 'AND':
        return (rules as RichSelectionChild[]).every(r => this._evaluate(r as AnyNode, ctx, visited));
      case 'OR':
        return (rules as RichSelectionChild[]).some(r => this._evaluate(r as AnyNode, ctx, visited));
      case 'NOT':
        return !(rules as RichSelectionChild[]).every(r => this._evaluate(r as AnyNode, ctx, visited));
      default:
        return (rules as RichSelectionChild[]).every(r => this._evaluate(r as AnyNode, ctx, visited));
    }
  }

  private _evaluateRule(rule: RichSelectionRule, ctx: SelectionContext, visited: Set<string>): boolean {
    if (isStubbedScope(rule.scope)) {
      return true;
    }

    let resolvedCtx = ctx;

    if (rule.where && (rule.scope === 'team' || rule.scope === 'entity' || rule.scope === 'team_member')) {
      const filteredEntities = ctx.entities.filter(entity =>
        this._evaluate(rule.where!, { ...ctx, entities: [entity] }, visited),
      );
      resolvedCtx = { ...ctx, entities: filteredEntities };
    }

    const values = resolveScope(rule, resolvedCtx);
    const aggregate = rule.aggregate ?? 'self';

    return applyAggregate(aggregate, values, rule.operator, rule.value, rule.caseSensitive);
  }
}

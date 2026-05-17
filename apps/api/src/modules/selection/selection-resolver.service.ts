import { Injectable, Logger } from '@nestjs/common';
import {
  RichSelection,
  RichSelectionRule,
  RuleRefNode,
  isRichSelectionGroup,
  isRuleRefNode,
} from '@derp/shared';
import { applyAggregate } from './aggregate.util';
import { resolveScope, isStubbedScope } from './scope.util';
import type { SelectionContext } from './selection.types';
import { PrismaService } from '../../prisma/prisma.service';

type AnyNode = RichSelection | RichSelectionRule | RuleRefNode;

@Injectable()
export class SelectionResolverService {
  private readonly logger = new Logger(SelectionResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  evaluate(node: AnyNode, ctx: SelectionContext): boolean {
    try {
      return this._evaluate(node, ctx, new Set<string>());
    } catch (err) {
      this.logger.warn(`SelectionResolver error: ${err}`);
      return false;
    }
  }

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
      this.logger.warn(`SelectionResolver: circular rule_ref detected for id="${ref.id}" — returning false`);
      return false;
    }

    const def = this._getRuleDefSync(ref.id);
    if (!def) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" not found — returning false`);
      return false;
    }
    if (!(def as any).enabled) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" is disabled — returning false`);
      return false;
    }

    const childVisited = new Set(visited);
    childVisited.add(ref.id);

    return this._evaluate((def as any).selection as AnyNode, ctx, childVisited);
  }

  private _getRuleDefSync(id: string): any | null {
    const cached = this._ruleDefCache.get(id);
    if (cached !== undefined) return cached;
    return null;
  }

  private readonly _ruleDefCache = new Map<string, any | null>();

  async preloadRuleDefs(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const uncached = ids.filter(id => !this._ruleDefCache.has(id));
    if (uncached.length === 0) return;
    const rows = await (this.prisma as any).selectionRuleDef.findMany({
      where: { id: { in: uncached } },
    });
    for (const row of rows) {
      this._ruleDefCache.set(row.id, row);
    }
    for (const id of uncached) {
      if (!this._ruleDefCache.has(id)) this._ruleDefCache.set(id, null);
    }
  }

  async evaluateAsync(node: AnyNode, ctx: SelectionContext): Promise<boolean> {
    const refs = this._collectRuleRefIds(node, new Set());
    await this.preloadRuleDefs([...refs]);
    return this.evaluate(node, ctx);
  }

  async evaluateAllAsync(
    condition: RichSelection | null | undefined,
    ctx: SelectionContext,
  ): Promise<boolean> {
    if (!condition) return true;
    if (!isRichSelectionGroup(condition) && !isRuleRefNode(condition) && !('scope' in condition)) {
      return true;
    }
    return this.evaluateAsync(condition, ctx);
  }

  private _collectRuleRefIds(node: AnyNode, seen: Set<string>): Set<string> {
    if (isRuleRefNode(node)) {
      seen.add(node.id);
      return seen;
    }
    if (isRichSelectionGroup(node)) {
      for (const child of (node as RichSelection).rules) {
        this._collectRuleRefIds(child, seen);
      }
    }
    return seen;
  }

  private _evaluateGroup(group: RichSelection, ctx: SelectionContext, visited: Set<string>): boolean {
    const { op, rules } = group;

    if (!rules || rules.length === 0) return true;

    switch (op) {
      case 'AND':
        return rules.every(r => this._evaluate(r, ctx, visited));
      case 'OR':
        return rules.some(r => this._evaluate(r, ctx, visited));
      case 'NOT':
        return !rules.every(r => this._evaluate(r, ctx, visited));
      default:
        return rules.every(r => this._evaluate(r, ctx, visited));
    }
  }

  private _evaluateRule(rule: RichSelectionRule, ctx: SelectionContext, _visited: Set<string>): boolean {
    if (isStubbedScope(rule.scope)) {
      return true;
    }

    let resolvedCtx = ctx;

    if (rule.where && (rule.scope === 'team' || rule.scope === 'entity' || rule.scope === 'team_member')) {
      const filteredEntities = ctx.entities.filter(entity =>
        this._evaluate(rule.where!, { ...ctx, entities: [entity] }, _visited),
      );
      resolvedCtx = { ...ctx, entities: filteredEntities };
    }

    const values = resolveScope(rule, resolvedCtx);
    const aggregate = rule.aggregate ?? 'self';

    return applyAggregate(aggregate, values, rule.operator, rule.value, rule.caseSensitive);
  }

  evaluateAll(condition: RichSelection | null | undefined, ctx: SelectionContext): boolean {
    if (!condition) return true;
    if (!isRichSelectionGroup(condition) && !('scope' in condition)) return true;
    return this.evaluate(condition, ctx);
  }
}

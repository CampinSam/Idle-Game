import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { SelectionRuleDef } from '@prisma/client';
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

export interface TraceNode {
  type: 'group' | 'rule' | 'rule_ref';
  label: string;
  passed: boolean;
  children?: TraceNode[];
  error?: string;
}

/**
 * Cache entry: `undefined` = not yet loaded; `null` = definitively absent; `SelectionRuleDef` = loaded.
 */
type CacheEntry = SelectionRuleDef | null | undefined;

@Injectable()
export class SelectionResolverService implements OnModuleInit {
  private readonly logger = new Logger(SelectionResolverService.name);

  private readonly _ruleDefCache = new Map<string, SelectionRuleDef | null>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reloadRuleCache();
  }

  /**
   * Reload the in-memory SelectionRuleDef cache from the database.
   * Loads ALL rows (enabled and disabled) so disabled-rule enforcement
   * happens at evaluation time, not at load time.
   *
   * After loading the initial set, performs a BFS to discover transitive
   * rule_ref IDs referenced inside loaded selections and loads those too —
   * repeated until no new IDs are found (up to 20 iterations).
   *
   * Called automatically on startup (OnModuleInit) and after any admin
   * create/update/delete on the selectionRuleDef table.
   */
  async reloadRuleCache(): Promise<void> {
    try {
      const rows = await this.prisma.selectionRuleDef.findMany({});
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
   * BFS through already-loaded rule def selections to find nested rule_ref
   * IDs that haven't been loaded yet, then load those from DB.
   * Continues until no new IDs are discovered.
   */
  private async _loadTransitiveRefs(): Promise<void> {
    const MAX_ITERATIONS = 20;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const unknownIds = new Set<string>();
      for (const def of this._ruleDefCache.values()) {
        if (!def) continue;
        this._collectRuleRefIds(def.selection as unknown as AnyNode, unknownIds);
      }
      const toFetch = [...unknownIds].filter(id => !this._ruleDefCache.has(id));
      if (toFetch.length === 0) break;

      const rows = await this.prisma.selectionRuleDef.findMany({
        where: { id: { in: toFetch } },
      });
      for (const row of rows) {
        this._ruleDefCache.set(row.id, row);
      }
      for (const id of toFetch) {
        if (!this._ruleDefCache.has(id)) {
          this._ruleDefCache.set(id, null);
        }
      }
    }
  }

  /** Return the name of a rule definition (used as fallback label), or undefined if not found. */
  getRuleDefLabel(id: string): string | undefined {
    const entry = this._ruleDefCache.get(id);
    return entry ? entry.name : undefined;
  }

  /** Recursively collect all rule_ref IDs found anywhere in a selection tree. */
  private _collectRuleRefIds(node: AnyNode | null | undefined, out: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (isRuleRefNode(node)) {
      out.add(node.id);
      return;
    }
    if (isRichSelectionGroup(node)) {
      for (const child of (node as RichSelection).rules) {
        this._collectRuleRefIds(child as AnyNode, out);
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

  /**
   * Evaluate a node and return a structured trace annotating every sub-node
   * with its boolean outcome. Unlike `evaluate`, this does NOT short-circuit
   * AND/OR groups so designers always see the full pass/fail picture.
   */
  evaluateWithTrace(node: AnyNode, ctx: SelectionContext): TraceNode {
    try {
      return this._traceNode(node, ctx, new Set<string>());
    } catch (err) {
      this.logger.warn(`SelectionResolver trace error: ${err}`);
      return { type: 'rule', label: 'Error during evaluation', passed: false, error: String(err) };
    }
  }

  // ─── Internal trace evaluation ────────────────────────────────────────────

  private _traceNode(node: AnyNode, ctx: SelectionContext, visited: Set<string>): TraceNode {
    if (isRuleRefNode(node)) {
      return this._traceRuleRef(node, ctx, visited);
    }
    if (isRichSelectionGroup(node)) {
      return this._traceGroup(node as RichSelection, ctx, visited);
    }
    return this._traceRule(node as RichSelectionRule, ctx, visited);
  }

  private _traceRuleRef(ref: RuleRefNode, ctx: SelectionContext, visited: Set<string>): TraceNode {
    const baseLabel = `rule_ref: ${ref.id}`;

    if (visited.has(ref.id)) {
      return { type: 'rule_ref', label: baseLabel, passed: false, error: 'Circular reference detected' };
    }

    const entry: CacheEntry = this._ruleDefCache.get(ref.id);

    if (entry === undefined) {
      return { type: 'rule_ref', label: baseLabel, passed: false, error: 'Not in cache (cache may be stale)' };
    }
    if (entry === null) {
      return { type: 'rule_ref', label: baseLabel, passed: false, error: 'Rule not found in DB' };
    }
    if (!entry.enabled) {
      return { type: 'rule_ref', label: `rule_ref: ${entry.name ?? ref.id} (disabled)`, passed: false, error: 'Rule is disabled' };
    }

    const childVisited = new Set(visited);
    childVisited.add(ref.id);

    const child = this._traceNode(entry.selection as unknown as AnyNode, ctx, childVisited);
    const label = `rule_ref: ${entry.name ?? ref.id}`;
    return { type: 'rule_ref', label, passed: child.passed, children: [child] };
  }

  private _traceGroup(group: RichSelection, ctx: SelectionContext, visited: Set<string>): TraceNode {
    const { op, rules } = group;
    const children = (rules ?? []) as RichSelectionChild[];

    if (children.length === 0) {
      return { type: 'group', label: op ?? 'AND', passed: true, children: [] };
    }

    const childTraces = children.map(r => this._traceNode(r as AnyNode, ctx, visited));

    let passed: boolean;
    switch (op) {
      case 'OR':
        passed = childTraces.some(t => t.passed);
        break;
      case 'NOT':
        passed = !childTraces.every(t => t.passed);
        break;
      case 'AND':
      default:
        passed = childTraces.every(t => t.passed);
        break;
    }

    return { type: 'group', label: op ?? 'AND', passed, children: childTraces };
  }

  private _traceRule(rule: RichSelectionRule, ctx: SelectionContext, visited: Set<string>): TraceNode {
    const parts: string[] = [];
    if (rule.scope) parts.push(rule.scope);
    if (rule.field) parts.push(rule.field);
    if (rule.operator) parts.push(rule.operator);
    if (rule.value !== undefined && rule.value !== null) parts.push(String(rule.value));
    const label = parts.length > 0 ? parts.join(' ') : 'rule';

    const passed = this._evaluateRule(rule, ctx, visited);
    return { type: 'rule', label, passed };
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

    const entry: CacheEntry = this._ruleDefCache.get(ref.id);

    if (entry === undefined) {
      // Cache miss: rule was added after startup and cache hasn't been reloaded yet.
      // Admin CRUD calls reloadRuleCache() after every write, so this window is small.
      this.logger.warn(
        `SelectionResolver: rule_ref id="${ref.id}" not in cache (cache may be stale — returning false)`,
      );
      return false;
    }

    if (entry === null) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" not found in DB — returning false`);
      return false;
    }

    if (!entry.enabled) {
      this.logger.warn(`SelectionResolver: rule_ref id="${ref.id}" is disabled — returning false`);
      return false;
    }

    const childVisited = new Set(visited);
    childVisited.add(ref.id);

    return this._evaluate(entry.selection as unknown as AnyNode, ctx, childVisited);
  }

  private _evaluateGroup(group: RichSelection, ctx: SelectionContext, visited: Set<string>): boolean {
    const { op, rules } = group;
    if (!rules || rules.length === 0) return true;

    const children = rules as RichSelectionChild[];
    switch (op) {
      case 'AND':
        return children.every(r => this._evaluate(r as AnyNode, ctx, visited));
      case 'OR':
        return children.some(r => this._evaluate(r as AnyNode, ctx, visited));
      case 'NOT':
        return !children.every(r => this._evaluate(r as AnyNode, ctx, visited));
      default:
        return children.every(r => this._evaluate(r as AnyNode, ctx, visited));
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

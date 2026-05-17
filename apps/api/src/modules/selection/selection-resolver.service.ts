import { Injectable, Logger } from '@nestjs/common';
import {
  RichSelection,
  RichSelectionRule,
  isRichSelectionGroup,
} from '@derp/shared';
import { applyAggregate } from './aggregate.util';
import { resolveScope, isStubbedScope } from './scope.util';
import type { SelectionContext } from './selection.types';

@Injectable()
export class SelectionResolverService {
  private readonly logger = new Logger(SelectionResolverService.name);

  evaluate(node: RichSelection | RichSelectionRule, ctx: SelectionContext): boolean {
    try {
      return this._evaluate(node, ctx);
    } catch (err) {
      this.logger.warn(`SelectionResolver error: ${err}`);
      return false;
    }
  }

  private _evaluate(node: RichSelection | RichSelectionRule, ctx: SelectionContext): boolean {
    if (isRichSelectionGroup(node)) {
      return this._evaluateGroup(node, ctx);
    }
    return this._evaluateRule(node as RichSelectionRule, ctx);
  }

  private _evaluateGroup(group: RichSelection, ctx: SelectionContext): boolean {
    const { op, rules } = group;

    if (!rules || rules.length === 0) return true;

    switch (op) {
      case 'AND':
        return rules.every(r => this._evaluate(r, ctx));
      case 'OR':
        return rules.some(r => this._evaluate(r, ctx));
      case 'NOT':
        return !rules.every(r => this._evaluate(r, ctx));
      default:
        return rules.every(r => this._evaluate(r, ctx));
    }
  }

  private _evaluateRule(rule: RichSelectionRule, ctx: SelectionContext): boolean {
    if (isStubbedScope(rule.scope)) {
      return true;
    }

    let resolvedCtx = ctx;

    if (rule.where && (rule.scope === 'team' || rule.scope === 'entity' || rule.scope === 'team_member')) {
      const filteredEntities = ctx.entities.filter(entity =>
        this._evaluate(rule.where!, { ...ctx, entities: [entity] }),
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

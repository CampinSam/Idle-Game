import type { CSSProperties } from 'react';
import type { RichSelection, RichSelectionRule, ScopeType, OperatorType, AggregateType } from '@derp/shared';
import {
  containerStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  addButtonStyle,
  dangerIconButtonStyle,
  fieldGroupStyle,
  ghostButtonStyle,
} from './editorStyles';

type RssNode = RichSelection | RichSelectionRule;

function isGroup(n: unknown): n is RichSelection {
  return (
    n !== null &&
    typeof n === 'object' &&
    !Array.isArray(n) &&
    'op' in (n as object) &&
    'rules' in (n as object) &&
    Array.isArray((n as any).rules)
  );
}

const SCOPE_OPTIONS: ScopeType[] = [
  'player', 'entity', 'team', 'team_member', 'location', 'building',
  'context', 'currency_balance', 'item', 'inventory',
];

const AGGREGATE_OPTIONS: AggregateType[] = [
  'self', 'any', 'all', 'none', 'count', 'sum', 'avg', 'min', 'max', 'distinct_count',
];

const OPERATOR_OPTIONS: OperatorType[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'exists', 'not_exists', 'between',
];

const OP_COLOR: Record<string, string> = {
  AND: '#6366f1',
  OR: '#f59e0b',
  NOT: '#ef4444',
};

const MULTI_ENTITY_SCOPES = new Set<ScopeType>(['entity', 'team', 'team_member', 'location']);

function defaultRule(): RichSelectionRule {
  return { scope: 'player', field: 'keeperLevel', operator: 'gte', value: 1 };
}

function defaultGroup(): RichSelection {
  return { op: 'AND', rules: [] };
}

function upgradeFromLegacy(items: any[]): RichSelection {
  const rules: RichSelectionRule[] = items.map((item): RichSelectionRule => {
    const type = (item.type as string) ?? '';
    const rawOp = (item.operator as string) ?? (type === 'flag' ? 'eq' : 'gte');
    const rssOp: OperatorType = rawOp === 'dne' ? 'not_exists' : (rawOp as OperatorType);
    switch (type) {
      case 'keeper_level':
        return { scope: 'player', field: 'keeperLevel', operator: rssOp, value: item.value };
      case 'flag':
        return {
          scope: 'player',
          field: `flags.${item.key ?? ''}`,
          operator: rssOp,
          value: rawOp === 'exists' || rawOp === 'dne' ? undefined : item.value,
        };
      case 'has_building':
      case 'parent_has_building':
        return {
          scope: 'location',
          field: `buildings.${(Array.isArray(item.ids) ? item.ids[0] : item.key) ?? ''}`,
          aggregate: 'any',
          operator: 'eq',
          value: 1,
          label: `Migrated: ${type}${Array.isArray(item.ids) && item.ids.length > 1 ? ' (multi-id — review)' : ''}`,
        };
      case 'has_room':
      case 'parent_has_room':
        return {
          scope: type === 'parent_has_room' ? 'building' : 'location',
          field: `rooms.${(Array.isArray(item.ids) ? item.ids[0] : item.key) ?? ''}`,
          aggregate: type === 'parent_has_room' ? undefined : 'any',
          operator: 'eq',
          value: 1,
          label: `Migrated: ${type}${Array.isArray(item.ids) && item.ids.length > 1 ? ' (multi-id — review)' : ''}`,
        };
      case 'in_region':
        return {
          scope: 'location',
          field: 'regionId',
          aggregate: 'any',
          operator: 'in',
          value: item.ids,
          label: 'Migrated: in_region',
        };
      default:
        return {
          scope: 'player',
          field: `${type}.${item.key ?? ''}`,
          operator: rssOp,
          value: item.value,
          label: `Legacy: ${type}`,
        };
    }
  });
  return { op: 'AND', rules };
}

interface RuleEditorProps {
  rule: RichSelectionRule;
  onChange: (r: RichSelectionRule) => void;
  onRemove: () => void;
}

function RuleEditor({ rule, onChange, onRemove }: RuleEditorProps) {
  const needsValue = rule.operator !== 'exists' && rule.operator !== 'not_exists';
  const showAggregate = MULTI_ENTITY_SCOPES.has(rule.scope);

  const set = <K extends keyof RichSelectionRule>(k: K, v: RichSelectionRule[K]) =>
    onChange({ ...rule, [k]: v });

  const valueStr =
    rule.value !== undefined && rule.value !== null
      ? typeof rule.value === 'object'
        ? JSON.stringify(rule.value)
        : String(rule.value)
      : '';

  const parseValue = (s: string): any => {
    if (s === '') return undefined;
    const n = Number(s);
    if (!isNaN(n) && s.trim() !== '') return n;
    if (s === 'true') return true;
    if (s === 'false') return false;
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j) || typeof j === 'object') return j;
    } catch {}
    return s;
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-end',
    padding: '6px 8px',
    background: '#0d0d26',
    borderRadius: 4,
    border: '1px solid #1e1e3e',
  };

  return (
    <div style={rowStyle}>
      <div style={{ ...fieldGroupStyle, minWidth: 100 }}>
        <span style={labelStyle}>scope</span>
        <select
          value={rule.scope}
          onChange={e => set('scope', e.target.value as ScopeType)}
          style={{ ...selectStyle, width: '100%' }}
        >
          {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 140 }}>
        <span style={labelStyle}>field</span>
        <input
          type="text"
          value={rule.field}
          onChange={e => set('field', e.target.value)}
          placeholder="e.g. keeperLevel, flags.key"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      {showAggregate && (
        <div style={{ ...fieldGroupStyle, minWidth: 80 }}>
          <span style={labelStyle}>aggregate</span>
          <select
            value={rule.aggregate ?? 'self'}
            onChange={e => set('aggregate', e.target.value as AggregateType)}
            style={{ ...selectStyle, width: '100%' }}
          >
            {AGGREGATE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}

      <div style={{ ...fieldGroupStyle, minWidth: 90 }}>
        <span style={labelStyle}>operator</span>
        <select
          value={rule.operator}
          onChange={e => set('operator', e.target.value as OperatorType)}
          style={{ ...selectStyle, width: '100%' }}
        >
          {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {needsValue && (
        <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 80 }}>
          <span style={labelStyle}>value</span>
          <input
            type="text"
            value={valueStr}
            onChange={e => set('value', parseValue(e.target.value))}
            placeholder='number, "text", or ["a","b"]'
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}

      {rule.label && (
        <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 80 }}>
          <span style={labelStyle}>label</span>
          <input
            type="text"
            value={rule.label}
            onChange={e => set('label', e.target.value || undefined)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        style={{ ...dangerIconButtonStyle, alignSelf: 'flex-end', marginBottom: 1 }}
        title="Remove rule"
      >
        ×
      </button>
    </div>
  );
}

interface GroupEditorProps {
  node: RichSelection;
  onChange: (n: RichSelection) => void;
  onRemove?: () => void;
  depth?: number;
}

function GroupEditor({ node, onChange, onRemove, depth = 0 }: GroupEditorProps) {
  const color = OP_COLOR[node.op] ?? '#6366f1';

  const updateChild = (i: number, next: RssNode) => {
    const rules = [...node.rules];
    rules[i] = next;
    onChange({ ...node, rules });
  };

  const removeChild = (i: number) =>
    onChange({ ...node, rules: node.rules.filter((_, idx) => idx !== i) });

  const addRule = () => onChange({ ...node, rules: [...node.rules, defaultRule()] });
  const addGroup = () => onChange({ ...node, rules: [...node.rules, defaultGroup()] });

  const setOp = (op: 'AND' | 'OR' | 'NOT') => onChange({ ...node, op });

  return (
    <div
      style={{
        borderLeft: depth > 0 ? `3px solid ${color}` : 'none',
        paddingLeft: depth > 0 ? 10 : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          padding: '4px 8px',
          background: `${color}18`,
          borderRadius: 4,
          border: `1px solid ${color}30`,
        }}
      >
        <span style={{ fontSize: 10, color: '#888', fontWeight: 600, letterSpacing: '0.06em' }}>
          MATCH
        </span>
        {(['AND', 'OR', 'NOT'] as const).map(op => (
          <button
            key={op}
            type="button"
            onClick={() => setOp(op)}
            style={{
              padding: '2px 8px',
              background: node.op === op ? color : 'transparent',
              border: `1px solid ${node.op === op ? color : '#333'}`,
              borderRadius: 3,
              color: node.op === op ? '#fff' : '#888',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              fontFamily: 'inherit',
            }}
          >
            {op}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={dangerIconButtonStyle}
            title="Remove group"
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {node.rules.map((child, i) =>
          isGroup(child) ? (
            <GroupEditor
              key={i}
              node={child as RichSelection}
              onChange={n => updateChild(i, n)}
              onRemove={() => removeChild(i)}
              depth={depth + 1}
            />
          ) : (
            <RuleEditor
              key={i}
              rule={child as RichSelectionRule}
              onChange={r => updateChild(i, r)}
              onRemove={() => removeChild(i)}
            />
          ),
        )}

        {node.rules.length === 0 && (
          <div
            style={{
              padding: '8px 10px',
              fontSize: 11,
              color: '#555',
              fontStyle: 'italic',
              border: '1px dashed #222',
              borderRadius: 4,
            }}
          >
            No rules yet — add one below
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={addRule} style={addButtonStyle}>
          + rule
        </button>
        <button
          type="button"
          onClick={addGroup}
          style={{ ...addButtonStyle, borderColor: '#555', color: '#aaa' }}
        >
          + group
        </button>
      </div>
    </div>
  );
}

export default function RichSelectionEditor({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: any) => void;
}) {
  const isEmpty = !value || (Array.isArray(value) && value.length === 0) ||
    (isGroup(value) && (value as RichSelection).rules.length === 0);

  if (!value || (Array.isArray(value) && value.length === 0)) {
    return (
      <div style={containerStyle}>
        <button
          type="button"
          style={addButtonStyle}
          onClick={() => onChange({ op: 'AND', rules: [] })}
        >
          + Add Selection Group
        </button>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div
        style={{
          border: '1px solid #f59e0b40',
          borderRadius: 6,
          padding: 10,
          background: '#1a140a',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: '#f59e0b',
            marginBottom: 6,
            fontWeight: 700,
          }}
        >
          Legacy format ({value.length} rule{value.length !== 1 ? 's' : ''}) — upgrade to edit
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#777',
            marginBottom: 8,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          {value.map((r: any, i: number) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginRight: 6,
                marginBottom: 2,
                padding: '1px 4px',
                background: '#2a1a00',
                borderRadius: 3,
              }}
            >
              {r.type}{r.key ? `.${r.key}` : ''} {r.operator ?? ''}{r.value !== undefined ? ` ${JSON.stringify(r.value)}` : ''}
            </span>
          ))}
        </div>
        <button
          type="button"
          style={{ ...addButtonStyle, borderColor: '#f59e0b', color: '#f59e0b' }}
          onClick={() => onChange(upgradeFromLegacy(value))}
        >
          Upgrade to RichSelection
        </button>
      </div>
    );
  }

  if (isGroup(value)) {
    return (
      <div style={containerStyle}>
        <GroupEditor
          node={value as RichSelection}
          onChange={onChange}
          depth={0}
        />
        {!isEmpty && (
          <button
            type="button"
            style={{
              ...ghostButtonStyle,
              color: '#ef4444',
              borderColor: '#3a1e1e',
              marginTop: 6,
            }}
            onClick={() => onChange(null)}
          >
            Clear all
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', wordBreak: 'break-all' }}>
      {JSON.stringify(value)}
      <button
        type="button"
        style={{ ...addButtonStyle, marginLeft: 8 }}
        onClick={() => onChange({ op: 'AND', rules: [] })}
      >
        Reset
      </button>
    </div>
  );
}

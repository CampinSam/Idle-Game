import { useState, useEffect, useId, type CSSProperties } from 'react';
import type { RichSelection, RichSelectionRule, RuleRefNode, ScopeType, OperatorType, AggregateType } from '@derp/shared';
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
import { ensureRefCache } from '../RefSelect';
import {
  SINGLE_VALUE_SCOPES,
  STUBBED_SCOPES,
  allowedAggregates,
  allowedOperators,
} from './selectionRuleConstraints';

type RssNode = RichSelection | RichSelectionRule | RuleRefNode;

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

function isRuleRef(n: unknown): n is RuleRefNode {
  return (
    n !== null &&
    typeof n === 'object' &&
    !Array.isArray(n) &&
    (n as any).type === 'rule_ref' &&
    typeof (n as any).id === 'string'
  );
}

function defaultRuleRef(): RuleRefNode {
  return { type: 'rule_ref', id: '' };
}

const SCOPE_OPTIONS: ScopeType[] = [
  'player', 'entity', 'team', 'team_member', 'location', 'currentLocation', 'building',
  'context', 'currency_balance', 'item', 'inventory',
];

interface FieldSuggestion { value: string; hint?: string; }

const SCOPE_FIELD_SUGGESTIONS: Partial<Record<ScopeType, FieldSuggestion[]>> = {
  player: [
    { value: 'keeperLevel', hint: 'player level (number)' },
    { value: 'flags.<key>', hint: 'player flag — replace <key> with the flag name' },
  ],
  entity: [
    { value: 'level', hint: 'entity level (number)' },
    { value: 'rarity', hint: 'rarity string (common, rare, …)' },
    { value: 'id', hint: 'entity instance id' },
    { value: 'entityType', hint: 'entity type string' },
    { value: 'speciesId', hint: 'species definition id' },
    { value: 'collectionId', hint: 'NFT collection id' },
    { value: 'regionId', hint: 'current region id' },
    { value: 'traitValues', hint: 'all trait values as array — use contains/in operators' },
    { value: 'traitCount', hint: 'number of filled trait slots' },
    { value: 'missionTags', hint: 'array of mission tags on this entity' },
    { value: 'buildingTags', hint: 'array of building tags on this entity' },
    { value: 'locationTypes', hint: 'array of location types this entity can work at' },
    { value: 'traits.<traitValue>', hint: 'has a specific trait value (1/0) — replace <traitValue>' },
    { value: 'stats.ATK', hint: 'ATK stat value' },
    { value: 'stats.DEF', hint: 'DEF stat value' },
    { value: 'stats.SPD', hint: 'SPD stat value' },
    { value: 'stats.INT', hint: 'INT stat value' },
    { value: 'stats.HP', hint: 'HP stat value' },
    { value: 'stats.<stat>', hint: 'any stat — replace <stat> with stat name' },
  ],
  team_member: [
    { value: 'level', hint: 'entity level (number)' },
    { value: 'rarity', hint: 'rarity string (common, rare, …)' },
    { value: 'id', hint: 'entity instance id' },
    { value: 'entityType', hint: 'entity type string' },
    { value: 'speciesId', hint: 'species definition id' },
    { value: 'collectionId', hint: 'NFT collection id' },
    { value: 'regionId', hint: 'current region id' },
    { value: 'traitValues', hint: 'all trait values as array — use contains/in operators' },
    { value: 'traitCount', hint: 'number of filled trait slots' },
    { value: 'missionTags', hint: 'array of mission tags on this entity' },
    { value: 'buildingTags', hint: 'array of building tags on this entity' },
    { value: 'locationTypes', hint: 'array of location types this entity can work at' },
    { value: 'traits.<traitValue>', hint: 'has specific trait value (1/0) — replace <traitValue>' },
    { value: 'stats.ATK', hint: 'ATK stat value' },
    { value: 'stats.DEF', hint: 'DEF stat value' },
    { value: 'stats.SPD', hint: 'SPD stat value' },
    { value: 'stats.INT', hint: 'INT stat value' },
    { value: 'stats.HP', hint: 'HP stat value' },
    { value: 'stats.<stat>', hint: 'any stat — replace <stat> with stat name' },
  ],
  team: [
    { value: 'level', hint: 'aggregate entity level across all team members' },
    { value: 'rarity', hint: 'aggregate rarity across all team members' },
    { value: 'id', hint: 'entity instance id (use with aggregate: count/any)' },
    { value: 'entityType', hint: 'entity type string' },
    { value: 'speciesId', hint: 'species definition id' },
    { value: 'collectionId', hint: 'NFT collection id' },
    { value: 'regionId', hint: 'current region id of each team member' },
    { value: 'traitValues', hint: 'all trait values as array — use aggregate + contains/in' },
    { value: 'traitCount', hint: 'filled trait slot count per entity' },
    { value: 'missionTags', hint: 'mission tags per entity — use aggregate + contains' },
    { value: 'buildingTags', hint: 'building tags per entity — use aggregate + contains' },
    { value: 'locationTypes', hint: 'location types per entity' },
    { value: 'traits.<traitValue>', hint: 'has specific trait value (1/0) — replace <traitValue>' },
    { value: 'stats.ATK', hint: 'ATK stat value' },
    { value: 'stats.DEF', hint: 'DEF stat value' },
    { value: 'stats.SPD', hint: 'SPD stat value' },
    { value: 'stats.INT', hint: 'INT stat value' },
    { value: 'stats.HP', hint: 'HP stat value' },
    { value: 'stats.<stat>', hint: 'any stat — replace <stat> with stat name' },
    { value: 'entities', hint: 'entity count (use with aggregate: count)' },
  ],
  context: [
    { value: 'teamSize', hint: 'number of entities in the team' },
    { value: 'activityType', hint: 'mission, crafting, building, etc.' },
    { value: 'missionTags', hint: 'tags on the current mission — use contains/in' },
    { value: 'missionType', hint: 'mission type string' },
    { value: 'regionId', hint: 'region the activity is happening in' },
    { value: 'seasonId', hint: 'current season id' },
  ],
  location: [
    { value: 'regionId', hint: 'region this location belongs to' },
    { value: 'buildings.<buildingDefId>', hint: 'has building (1/0) — replace <buildingDefId>' },
    { value: 'rooms.<roomDefId>', hint: 'has room (1/0) — replace <roomDefId>' },
  ],
  currentLocation: [
    { value: 'regionId', hint: 'region of the entity\'s current location' },
    { value: 'buildings.<buildingDefId>', hint: 'has building (1/0) — replace <buildingDefId>' },
    { value: 'rooms.<roomDefId>', hint: 'has room (1/0) — replace <roomDefId>' },
  ],
  building: [
    { value: 'buildingDefId', hint: 'building definition id' },
    { value: 'rooms.<roomDefId>', hint: 'has room (1/0) — replace <roomDefId>' },
    { value: 'tags.<tag>', hint: 'has tag (1/0) — replace <tag>' },
  ],
  currency_balance: [
    { value: '<currencyId>', hint: 'replace with the currency definition id (e.g. gold)' },
  ],
  item: [
    { value: '<itemDefId>', hint: 'replace with the item definition id — evaluates quantity owned' },
  ],
};

const OP_COLOR: Record<string, string> = {
  AND: '#6366f1',
  OR: '#f59e0b',
  NOT: '#ef4444',
};

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
        return {
          scope: 'location',
          field: `buildings.${(Array.isArray(item.ids) ? item.ids[0] : item.key) ?? ''}`,
          aggregate: 'any',
          operator: 'eq',
          value: 1,
          label: `Migrated: has_building${Array.isArray(item.ids) && item.ids.length > 1 ? ' (multi-id — review)' : ''}`,
        };
      case 'parent_has_building':
        return {
          scope: 'currentLocation',
          field: `buildings.${(Array.isArray(item.ids) ? item.ids[0] : item.key) ?? ''}`,
          operator: 'eq',
          value: 1,
          label: `Migrated: parent_has_building${Array.isArray(item.ids) && item.ids.length > 1 ? ' (multi-id — review)' : ''}`,
        };
      case 'trait':
        return {
          scope: 'entity',
          field: `traits.${item.key ?? ''}`,
          aggregate: 'sum',
          operator: (rawOp as OperatorType) ?? 'gte',
          value: typeof item.value === 'number' ? item.value : 1,
          label: `Migrated: trait`,
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

const reorderBtnBase: CSSProperties = {
  padding: '1px 4px',
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: 3,
  color: '#666',
  cursor: 'pointer',
  fontSize: 10,
  lineHeight: 1,
  fontFamily: 'inherit',
};

const reorderBtnDisabled: CSSProperties = {
  ...reorderBtnBase,
  color: '#333',
  borderColor: '#222',
  cursor: 'default',
};

interface RuleRefEditorProps {
  node: RuleRefNode;
  onChange: (n: RuleRefNode) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function RuleRefEditor({ node, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }: RuleRefEditorProps) {
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureRefCache('selectionRuleDef').then(rows => {
      setOptions(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selected = options.find(o => o.id === node.id);

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-end',
    padding: '6px 8px',
    background: '#0d1a2e',
    borderRadius: 4,
    border: '1px solid #1e2e3e',
  };

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6 }}>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          style={isFirst ? reorderBtnDisabled : reorderBtnBase}
          title="Move up"
        >↑</button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          style={isLast ? reorderBtnDisabled : reorderBtnBase}
          title="Move down"
        >↓</button>
      </div>

      <div style={{ ...rowStyle, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#7C3AED',
            background: '#2a1060',
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid #7C3AED40',
            flexShrink: 0,
          }}>
            RULE REF
          </span>
        </div>

        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 200 }}>
          <span style={{ ...labelStyle, ...(!node.id ? { color: '#f87171' } : {}) }}>
            rule id{!node.id ? ' ✕' : ''}
          </span>
          {loading ? (
            <input
              type="text"
              value=""
              placeholder="Loading rules…"
              disabled
              style={{ ...inputStyle, width: '100%' }}
            />
          ) : (
            <select
              value={node.id}
              onChange={e => onChange({ ...node, id: e.target.value })}
              style={{
                ...selectStyle,
                width: '100%',
                ...(!node.id ? { borderColor: '#f87171', background: '#1f0a0a' } : {}),
              }}
            >
              <option value="">— select a rule —</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.id}{o.name ? ` — ${o.name}` : ''}{o.enabled === false ? ' (disabled)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && (
          <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', flex: 1, minWidth: 120 }}>
            {selected.description || selected.name || ''}
          </div>
        )}

        <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
          <span style={labelStyle}>label (optional)</span>
          <input
            type="text"
            value={node.label ?? ''}
            onChange={e => onChange({ ...node, label: e.target.value || undefined })}
            placeholder="e.g. Ninja team check"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          style={{ ...dangerIconButtonStyle, alignSelf: 'flex-end', marginBottom: 1 }}
          title="Remove rule ref"
        >×</button>
      </div>
    </div>
  );
}

interface RuleEditorProps {
  rule: RichSelectionRule;
  onChange: (r: RichSelectionRule) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function RuleEditor({ rule, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }: RuleEditorProps) {
  const needsValue = rule.operator !== 'exists' && rule.operator !== 'not_exists';
  const showAggregate = !SINGLE_VALUE_SCOPES.has(rule.scope);

  const aggOptions = showAggregate ? allowedAggregates(rule.scope, rule.field) : [];
  const opOptions = allowedOperators(rule.scope, rule.field);

  const set = <K extends keyof RichSelectionRule>(k: K, v: RichSelectionRule[K]) =>
    onChange({ ...rule, [k]: v });

  const handleScopeChange = (newScope: ScopeType) => {
    const oldOptions = SCOPE_FIELD_SUGGESTIONS[rule.scope] ?? [];
    const wasKnown = oldOptions.some(o => o.value === rule.field);
    const newField = wasKnown ? '' : rule.field;
    const newIsSingleValue = SINGLE_VALUE_SCOPES.has(newScope);
    const newAggOptions = newIsSingleValue ? [] : allowedAggregates(newScope, newField);
    const newOpOptions = allowedOperators(newScope, newField);
    const newAggregate = newIsSingleValue
      ? undefined
      : (newAggOptions.includes(rule.aggregate as AggregateType)
          ? rule.aggregate
          : newAggOptions[0]);
    const newOperator = newOpOptions.includes(rule.operator)
      ? rule.operator
      : newOpOptions[0];
    const updated: RichSelectionRule = {
      ...rule,
      scope: newScope,
      field: newField,
      operator: newOperator,
    };
    if (newIsSingleValue) {
      delete updated.aggregate;
    } else {
      updated.aggregate = newAggregate;
    }
    onChange(updated);
  };

  const handleFieldChange = (newField: string) => {
    const newAggOptions = showAggregate ? allowedAggregates(rule.scope, newField) : [];
    const newOpOptions = allowedOperators(rule.scope, newField);
    const newAggregate = showAggregate
      ? (newAggOptions.includes(rule.aggregate as AggregateType)
          ? rule.aggregate
          : newAggOptions[0])
      : undefined;
    const newOperator = newOpOptions.includes(rule.operator)
      ? rule.operator
      : newOpOptions[0];
    const updated: RichSelectionRule = { ...rule, field: newField, operator: newOperator };
    if (showAggregate) {
      updated.aggregate = newAggregate;
    } else {
      delete updated.aggregate;
    }
    onChange(updated);
  };

  const uid = useId();
  const fieldOptions = SCOPE_FIELD_SUGGESTIONS[rule.scope] ?? [];
  const datalistId = `rss-field-opts-${uid}-${rule.scope}`;

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

  const fieldError = !rule.field.trim();
  const valueError = needsValue && (rule.value === undefined || rule.value === null || valueStr === '');

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
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6 }}>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          style={isFirst ? reorderBtnDisabled : reorderBtnBase}
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          style={isLast ? reorderBtnDisabled : reorderBtnBase}
          title="Move down"
        >
          ↓
        </button>
      </div>

      <div style={{ ...rowStyle, flex: 1, minWidth: 0 }}>
        <div style={{ ...fieldGroupStyle, minWidth: 100 }}>
          <span style={labelStyle}>scope</span>
          <select
            value={rule.scope}
            onChange={e => handleScopeChange(e.target.value as ScopeType)}
            style={{ ...selectStyle, width: '100%' }}
          >
            {SCOPE_OPTIONS.map(s => (
              <option key={s} value={s}>
                {STUBBED_SCOPES.has(s) ? `* ${s}` : s}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 140 }}>
          <span style={{ ...labelStyle, ...(fieldError ? { color: '#f87171' } : {}) }}>
            field{fieldError ? ' ✕' : ''}
          </span>
          <input
            type="text"
            list={fieldOptions.length > 0 ? datalistId : undefined}
            value={rule.field}
            onChange={e => handleFieldChange(e.target.value)}
            placeholder="e.g. keeperLevel, flags.key"
            style={{ ...inputStyle, width: '100%', ...(fieldError ? { borderColor: '#f87171', background: '#1f0a0a' } : {}) }}
          />
          {fieldOptions.length > 0 && (
            <datalist id={datalistId}>
              {fieldOptions.map(opt => (
                <option key={opt.value} value={opt.value} label={opt.hint ?? opt.value} />
              ))}
            </datalist>
          )}
        </div>

        {showAggregate && aggOptions.length > 0 && (
          <div style={{ ...fieldGroupStyle, minWidth: 80 }}>
            <span style={labelStyle}>aggregate</span>
            <select
              value={rule.aggregate ?? aggOptions[0]}
              onChange={e => set('aggregate', e.target.value as AggregateType)}
              style={{ ...selectStyle, width: '100%' }}
            >
              {aggOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}

        <div style={{ ...fieldGroupStyle, minWidth: 90 }}>
          <span style={labelStyle}>operator</span>
          <select
            value={opOptions.includes(rule.operator) ? rule.operator : opOptions[0]}
            onChange={e => set('operator', e.target.value as OperatorType)}
            style={{ ...selectStyle, width: '100%' }}
          >
            {opOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {needsValue && (
          <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 80 }}>
            <span style={{ ...labelStyle, ...(valueError ? { color: '#f87171' } : {}) }}>
              value{valueError ? ' ✕' : ''}
            </span>
            <input
              type="text"
              value={valueStr}
              onChange={e => set('value', parseValue(e.target.value))}
              placeholder='number, "text", or ["a","b"]'
              style={{ ...inputStyle, width: '100%', ...(valueError ? { borderColor: '#f87171', background: '#1f0a0a' } : {}) }}
            />
          </div>
        )}

        <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 80 }}>
          <span style={labelStyle}>label (optional)</span>
          <input
            type="text"
            value={rule.label ?? ''}
            onChange={e => set('label', e.target.value || undefined)}
            placeholder="Shown to players as the requirement description"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          style={{ ...dangerIconButtonStyle, alignSelf: 'flex-end', marginBottom: 1 }}
          title="Remove rule"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface GroupEditorProps {
  node: RichSelection;
  onChange: (n: RichSelection) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  depth?: number;
}

function GroupEditor({
  node,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst = true,
  isLast = true,
  depth = 0,
}: GroupEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const color = OP_COLOR[node.op] ?? '#6366f1';
  const isNested = depth > 0;

  const updateChild = (i: number, next: RssNode) => {
    const rules = [...node.rules];
    rules[i] = next;
    onChange({ ...node, rules });
  };

  const removeChild = (i: number) =>
    onChange({ ...node, rules: node.rules.filter((_, idx) => idx !== i) });

  const moveChild = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= node.rules.length) return;
    const rules = [...node.rules];
    [rules[i], rules[j]] = [rules[j], rules[i]];
    onChange({ ...node, rules });
  };

  const addRule = () => onChange({ ...node, rules: [...node.rules, defaultRule()] });
  const addGroup = () => onChange({ ...node, rules: [...node.rules, defaultGroup()] });
  const addRuleRef = () => onChange({ ...node, rules: [...node.rules, defaultRuleRef()] });
  const setOp = (op: 'AND' | 'OR' | 'NOT') => onChange({ ...node, op });

  return (
    <div
      style={{
        borderLeft: isNested ? `3px solid ${color}` : 'none',
        paddingLeft: isNested ? 10 : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          marginBottom: collapsed ? 0 : 8,
          padding: '4px 8px',
          background: `${color}18`,
          borderRadius: 4,
          border: `1px solid ${color}30`,
        }}
      >
        {isNested && (
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            style={{
              ...reorderBtnBase,
              color: '#aaa',
              borderColor: '#444',
              fontSize: 9,
              padding: '2px 4px',
            }}
            title={collapsed ? 'Expand group' : 'Collapse group'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}

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

        {isNested && (
          <span style={{ fontSize: 10, color: '#555' }}>
            ({node.rules.length} rule{node.rules.length !== 1 ? 's' : ''})
          </span>
        )}

        <span style={{ flex: 1 }} />

        {isNested && (
          <>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              style={isFirst ? reorderBtnDisabled : reorderBtnBase}
              title="Move group up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              style={isLast ? reorderBtnDisabled : reorderBtnBase}
              title="Move group down"
            >
              ↓
            </button>
          </>
        )}

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

      {!collapsed && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {node.rules.map((child, i) =>
              isGroup(child) ? (
                <GroupEditor
                  key={i}
                  node={child as RichSelection}
                  onChange={n => updateChild(i, n)}
                  onRemove={() => removeChild(i)}
                  onMoveUp={() => moveChild(i, -1)}
                  onMoveDown={() => moveChild(i, 1)}
                  isFirst={i === 0}
                  isLast={i === node.rules.length - 1}
                  depth={depth + 1}
                />
              ) : isRuleRef(child) ? (
                <RuleRefEditor
                  key={i}
                  node={child as RuleRefNode}
                  onChange={n => updateChild(i, n)}
                  onRemove={() => removeChild(i)}
                  onMoveUp={() => moveChild(i, -1)}
                  onMoveDown={() => moveChild(i, 1)}
                  isFirst={i === 0}
                  isLast={i === node.rules.length - 1}
                />
              ) : (
                <RuleEditor
                  key={i}
                  rule={child as RichSelectionRule}
                  onChange={r => updateChild(i, r)}
                  onRemove={() => removeChild(i)}
                  onMoveUp={() => moveChild(i, -1)}
                  onMoveDown={() => moveChild(i, 1)}
                  isFirst={i === 0}
                  isLast={i === node.rules.length - 1}
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

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            <button
              type="button"
              onClick={addRuleRef}
              style={{ ...addButtonStyle, borderColor: '#7C3AED80', color: '#a78bfa' }}
              title="Embed a named reusable rule from the Selection Rule Library"
            >
              + rule ref
            </button>
          </div>
        </>
      )}
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
        <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 6, fontWeight: 700 }}>
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
    const isEmpty = (value as RichSelection).rules.length === 0;
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

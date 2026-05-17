import RefSelect from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  inputStyle,
  numberInputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';
import {
  validateRequirement,
  ERROR_BORDER_COLOR,
  errorTextStyle,
  errorWrapperStyle,
} from './validation';

export type RequirementType =
  | 'keeper_level'
  | 'flag'
  | 'building'
  | 'currency'
  | 'item'
  | 'trait';

const REQUIREMENT_TYPES: RequirementType[] = [
  'keeper_level',
  'flag',
  'building',
  'currency',
  'item',
  'trait',
];

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'dne'];

const TYPE_REF_TABLE: Partial<Record<RequirementType, string>> = {
  currency: 'Currency',
  item: 'ItemDef',
  // `trait` requirements take a free-text archetype name — trait metadata
  // now lives embedded in EntityDefinition.traits and has no standalone
  // table to pick from.
  building: 'BuildingDef',
};

interface Requirement {
  type?: RequirementType;
  key?: string;
  operator?: string;
  value?: any;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: Requirement[]) => void;
}

function defaultForType(type: RequirementType): Requirement {
  switch (type) {
    case 'keeper_level':
      return { type, operator: 'gte', value: 1 };
    case 'flag':
      return { type, key: '', operator: 'eq', value: true };
    case 'building':
      return { type, key: '', operator: 'exists' };
    case 'currency':
      return { type, key: '', operator: 'gte', value: 0 };
    case 'item':
      return { type, key: '', operator: 'exists' };
    case 'trait':
      return { type, key: '', operator: 'exists' };
  }
}

function ValueInput({ value, onChange, hasError }: { value: any; onChange: (v: any) => void; hasError?: boolean }) {
  const isBool = typeof value === 'boolean';
  const isNum = typeof value === 'number';

  if (isBool) {
    return (
      <select
        value={String(value)}
        onChange={e => onChange(e.target.value === 'true')}
        style={{ ...selectStyle, width: '100%', borderColor: hasError ? ERROR_BORDER_COLOR : (selectStyle.borderColor as string | undefined) }}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (isNum) {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        style={{ ...numberInputStyle, width: '100%', borderColor: hasError ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined) }}
      />
    );
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, width: '100%', borderColor: hasError ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined) }}
    />
  );
}

function RequirementEditor({
  entry,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  entry: Requirement;
  onChange: (e: Requirement) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const type: RequirementType = (entry.type as RequirementType) || 'keeper_level';
  const refTable = TYPE_REF_TABLE[type];
  const showKey = type !== 'keeper_level';
  const showValue = type !== 'building' && type !== 'item' && type !== 'trait'
    ? true
    : entry.operator !== 'exists' && entry.operator !== 'dne';
  const errs = validateRequirement(entry);

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>type</span>
          <select
            value={type}
            onChange={e => onChange(defaultForType(e.target.value as RequirementType))}
            style={{ ...selectStyle, width: '100%' }}
          >
            {REQUIREMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {showKey && (
          <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
            <span style={labelStyle}>key</span>
            {refTable ? (
              <div style={errs.key ? errorWrapperStyle : undefined}>
                <RefSelect
                  refTable={refTable}
                  value={entry.key ?? null}
                  onChange={v => onChange({ ...entry, key: v ?? '' })}
                  placeholder={`Select ${refTable}...`}
                />
              </div>
            ) : (
              <input
                type="text"
                value={entry.key ?? ''}
                onChange={e => onChange({ ...entry, key: e.target.value })}
                style={{ ...inputStyle, width: '100%', borderColor: errs.key ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined) }}
              />
            )}
            {errs.key && <span style={errorTextStyle}>{errs.key}</span>}
          </div>
        )}

        <div style={fieldGroupStyle}>
          <span style={labelStyle}>operator</span>
          <select
            value={entry.operator ?? 'eq'}
            onChange={e => onChange({ ...entry, operator: e.target.value })}
            style={{ ...selectStyle, width: '100%' }}
          >
            {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {showValue && (
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>value</span>
            <ValueInput value={entry.value} onChange={v => onChange({ ...entry, value: v })} hasError={!!errs.value} />
            {errs.value && <span style={errorTextStyle}>{errs.value}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
    </div>
  );
}

export default function RequirementsListEditor({ value, onChange }: ListProps) {
  const items: Requirement[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: Requirement) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };

  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const arr = items.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };

  const add = (type: RequirementType) => onChange([...items, defaultForType(type)]);

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <RequirementEditor
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {REQUIREMENT_TYPES.map(t => (
          <button key={t} type="button" style={addButtonStyle} onClick={() => add(t)}>+ {t}</button>
        ))}
      </div>
    </div>
  );
}

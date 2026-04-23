import RefSelect from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  numberInputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';
import {
  validateCostEntry,
  ERROR_BORDER_COLOR,
  errorTextStyle,
  errorWrapperStyle,
} from './validation';

export type CostType = 'currency' | 'item' | 'entity';

export interface CostEntry {
  type?: CostType;
  id?: string;
  definitionId?: string;
  amount?: number;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: CostEntry[]) => void;
  allowEntity?: boolean;
}

const TYPE_TO_REF: Record<CostType, string> = {
  currency: 'Currency',
  item: 'ItemDef',
  entity: 'EntityDefinition',
};

function getRefId(entry: CostEntry): string | null {
  if (entry.type === 'entity') return entry.definitionId ?? null;
  return entry.id ?? null;
}

function setRefId(entry: CostEntry, val: string | null): CostEntry {
  const next = { ...entry };
  if (entry.type === 'entity') {
    next.definitionId = val ?? '';
    delete next.id;
  } else {
    next.id = val ?? '';
    delete next.definitionId;
  }
  return next;
}

function CostEntryEditor({
  entry,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  allowEntity,
}: {
  entry: CostEntry;
  onChange: (e: CostEntry) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  allowEntity?: boolean;
}) {
  const type: CostType = (entry.type as CostType) || 'currency';
  const refTable = TYPE_TO_REF[type];
  const errs = validateCostEntry(entry);

  const handleTypeChange = (newType: CostType) => {
    const next: CostEntry = { ...entry, type: newType };
    if (newType === 'entity') {
      next.definitionId = entry.id ?? entry.definitionId ?? '';
      delete next.id;
    } else {
      next.id = entry.id ?? entry.definitionId ?? '';
      delete next.definitionId;
    }
    onChange(next);
  };

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>type</span>
          <select
            value={type}
            onChange={e => handleTypeChange(e.target.value as CostType)}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="currency">currency</option>
            <option value="item">item</option>
            {allowEntity && <option value="entity">entity</option>}
          </select>
        </div>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
          <span style={labelStyle}>{type === 'entity' ? 'definitionId' : 'id'}</span>
          <div style={errs.id ? errorWrapperStyle : undefined}>
            <RefSelect
              refTable={refTable}
              value={getRefId(entry)}
              onChange={v => onChange(setRefId(entry, v))}
              placeholder={`Select ${refTable}...`}
            />
          </div>
          {errs.id && <span style={errorTextStyle}>{errs.id}</span>}
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>amount</span>
          <input
            type="number"
            value={entry.amount ?? ''}
            onChange={e => onChange({ ...entry, amount: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{
              ...numberInputStyle,
              width: '100%',
              borderColor: errs.amount ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined),
            }}
          />
          {errs.amount && <span style={errorTextStyle}>{errs.amount}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
    </div>
  );
}

export default function CostListEditor({ value, onChange, allowEntity = false }: ListProps) {
  const items: CostEntry[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: CostEntry) => {
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

  const add = (type: CostType) => {
    const entry: CostEntry = { type, amount: 1 };
    if (type === 'entity') entry.definitionId = '';
    else entry.id = '';
    onChange([...items, entry]);
  };

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <CostEntryEditor
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
          allowEntity={allowEntity}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={addButtonStyle} onClick={() => add('currency')}>+ currency</button>
        <button type="button" style={addButtonStyle} onClick={() => add('item')}>+ item</button>
        {allowEntity && (
          <button type="button" style={addButtonStyle} onClick={() => add('entity')}>+ entity</button>
        )}
      </div>
    </div>
  );
}

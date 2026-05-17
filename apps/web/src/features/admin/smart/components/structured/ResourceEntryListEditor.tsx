import RefSelect from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  numberInputStyle,
  selectStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

import { errorTextStyle, errorWrapperStyle } from './validation';

export type GrowthRate = 'flat' | 'linear' | 'exp';
export type ResourceEntryType = 'currency' | 'item';
export type PrimaryField = 'baseCapacity' | 'ratePerHour' | 'amount';

export interface ResourceEntry {
  type: ResourceEntryType;
  id: string;
  baseCapacity?: number;
  ratePerHour?: number;
  amount?: number;
  growthRate?: GrowthRate;
  growthScalar?: number;
}

interface Props {
  value: unknown;
  onChange: (v: ResourceEntry[]) => void;
  primaryField: PrimaryField;
}

function validateEntry(entry: ResourceEntry, primaryField: PrimaryField): { id?: string; primary?: string } {
  const errs: { id?: string; primary?: string } = {};
  if (!entry.id || entry.id.trim() === '') errs.id = 'id required';
  const pv = entry[primaryField];
  if (pv === undefined || pv === null || isNaN(Number(pv)) || Number(pv) < 0) {
    errs.primary = `${primaryField} required (≥ 0)`;
  }
  return errs;
}

export function resourceEntryListErrorCount(value: unknown, primaryField: PrimaryField): number {
  if (!Array.isArray(value)) return 0;
  return (value as ResourceEntry[]).reduce(
    (n, e) => n + Object.keys(validateEntry(e, primaryField)).length,
    0,
  );
}

export function resourceEntryListErrorMessages(value: unknown, primaryField: PrimaryField, prefix: string): string[] {
  if (!Array.isArray(value)) return [];
  const msgs: string[] = [];
  (value as ResourceEntry[]).forEach((entry, i) => {
    const errs = validateEntry(entry, primaryField);
    if (errs.id) msgs.push(`${prefix}[${i}]: ${errs.id}`);
    if (errs.primary) msgs.push(`${prefix}[${i}]: ${errs.primary}`);
  });
  return msgs;
}

function ResourceEntryRow({
  entry,
  onChange,
  onRemove,
  primaryField,
}: {
  entry: ResourceEntry;
  onChange: (e: ResourceEntry) => void;
  onRemove: () => void;
  primaryField: PrimaryField;
}) {
  const errs = validateEntry(entry, primaryField);
  const showScalar = entry.growthRate === 'linear' || entry.growthRate === 'exp';

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={{ ...fieldGroupStyle, maxWidth: 110 }}>
          <span style={labelStyle}>type</span>
          <select
            value={entry.type || 'currency'}
            onChange={e => onChange({ ...entry, type: e.target.value as ResourceEntryType })}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="currency">currency</option>
            <option value="item">item</option>
          </select>
        </div>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 140 }}>
          <span style={labelStyle}>id</span>
          <div style={errs.id ? errorWrapperStyle : undefined}>
            <RefSelect
              refTable={entry.type === 'item' ? 'ItemDef' : 'Currency'}
              value={entry.id || null}
              onChange={v => onChange({ ...entry, id: v ?? '' })}
              placeholder={`Select ${entry.type === 'item' ? 'ItemDef' : 'Currency'}...`}
            />
          </div>
          {errs.id && <span style={errorTextStyle}>{errs.id}</span>}
        </div>
        <div style={{ ...fieldGroupStyle, maxWidth: 110 }}>
          <span style={labelStyle}>{primaryField}</span>
          <input
            type="number"
            min={0}
            value={entry[primaryField] ?? ''}
            onChange={e => onChange({ ...entry, [primaryField]: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{
              ...numberInputStyle,
              width: '100%',
              borderColor: errs.primary ? '#ef4444' : (numberInputStyle.borderColor as string | undefined),
            }}
          />
          {errs.primary && <span style={{ color: '#ef4444', fontSize: 11 }}>{errs.primary}</span>}
        </div>
        <div style={{ ...fieldGroupStyle, maxWidth: 100 }}>
          <span style={labelStyle}>growthRate</span>
          <select
            value={entry.growthRate || ''}
            onChange={e => onChange({ ...entry, growthRate: (e.target.value || undefined) as GrowthRate | undefined })}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="">—</option>
            <option value="flat">flat</option>
            <option value="linear">linear</option>
            <option value="exp">exp</option>
          </select>
        </div>
        {showScalar && (
          <div style={{ ...fieldGroupStyle, maxWidth: 90 }}>
            <span style={labelStyle}>growthScalar</span>
            <input
              type="number"
              step={0.01}
              value={entry.growthScalar ?? ''}
              onChange={e => onChange({ ...entry, growthScalar: e.target.value === '' ? undefined : Number(e.target.value) })}
              style={{ ...numberInputStyle, width: '100%' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
    </div>
  );
}

export default function ResourceEntryListEditor({ value, onChange, primaryField }: Props) {
  const items: ResourceEntry[] = Array.isArray(value) ? (value as ResourceEntry[]) : [];

  const update = (idx: number, next: ResourceEntry) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <ResourceEntryRow
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => onChange(items.filter((_, i) => i !== idx))}
          primaryField={primaryField}
        />
      ))}
      <button type="button" style={addButtonStyle} onClick={() => onChange([...items, { type: 'currency', id: '' }])}>
        + Add entry
      </button>
    </div>
  );
}

import RefSelect from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  numberInputStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

export interface CheckInDayReward {
  day?: number;
  giftDefId?: string;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: CheckInDayReward[]) => void;
}

function CheckInDayEntry({
  entry, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  entry: CheckInDayReward;
  onChange: (e: CheckInDayReward) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>day</span>
          <input
            type="number"
            min={0}
            value={entry.day ?? ''}
            onChange={e => onChange({ ...entry, day: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={{ ...fieldGroupStyle, flex: 3, minWidth: 200 }}>
          <span style={labelStyle}>giftDefId</span>
          <RefSelect
            refTable="GiftDef"
            value={entry.giftDefId ?? null}
            onChange={v => onChange({ ...entry, giftDefId: v ?? '' })}
            placeholder="Select GiftDef..."
          />
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

export default function CheckInDaysEditor({ value, onChange }: ListProps) {
  const items: CheckInDayReward[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: CheckInDayReward) => {
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
  const add = () => {
    const nextDay = items.length > 0
      ? Math.max(...items.map(i => Number(i.day) || 0)) + 1
      : 0;
    onChange([...items, { day: nextDay, giftDefId: '' }]);
  };

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <CheckInDayEntry
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
        <button type="button" style={addButtonStyle} onClick={add}>+ day</button>
      </div>
    </div>
  );
}

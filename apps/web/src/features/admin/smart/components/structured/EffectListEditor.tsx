import RefSelect from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

const EFFECT_TARGET_TYPES = ['entity', 'player', 'location', 'team', 'job', 'global'];

export interface EffectEntry {
  effectDefId?: string;
  targetType?: string;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: EffectEntry[]) => void;
}

function EffectEntryEditor({
  entry, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  entry: EffectEntry;
  onChange: (e: EffectEntry) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={{ ...fieldGroupStyle, flex: 3, minWidth: 200 }}>
          <span style={labelStyle}>effectDefId</span>
          <RefSelect
            refTable="EffectDef"
            value={entry.effectDefId ?? null}
            onChange={v => onChange({ ...entry, effectDefId: v ?? '' })}
            placeholder="Select EffectDef..."
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>targetType</span>
          <select
            value={entry.targetType ?? 'player'}
            onChange={e => onChange({ ...entry, targetType: e.target.value })}
            style={{ ...selectStyle, width: '100%' }}
          >
            {EFFECT_TARGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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

export default function EffectListEditor({ value, onChange }: ListProps) {
  const items: EffectEntry[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: EffectEntry) => {
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
  const add = () => onChange([...items, { effectDefId: '', targetType: 'player' }]);

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <EffectEntryEditor
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
        <button type="button" style={addButtonStyle} onClick={add}>+ effect</button>
      </div>
    </div>
  );
}

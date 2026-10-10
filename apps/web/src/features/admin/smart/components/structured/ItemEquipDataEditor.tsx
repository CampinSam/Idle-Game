import StatMapEditor from './StatMapEditor';
import {
  labelStyle,
  fieldGroupStyle,
  inputStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import { errorTextStyle } from './validation';
import { type StructuredEditorProps, omitKey } from './editorContract';

export interface ItemEquipData {
  slot?: string;
  stats?: Record<string, number | number[]>;
}

const BODY_SLOTS = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'];

interface EquipDataErrors {
  slot?: string;
}

type Props = StructuredEditorProps<ItemEquipData>;

const EMPTY: ItemEquipData = {};

export const validate = validateItemEquipData;
export function validateItemEquipData(v: ItemEquipData | null | undefined): EquipDataErrors {
  const errs: EquipDataErrors = {};
  if (v && v.slot !== undefined && v.slot.trim() === '') {
    errs.slot = 'slot required when equipData is set';
  }
  return errs;
}

export function itemEquipDataErrorCount(v: ItemEquipData | null | undefined): number {
  return Object.keys(validateItemEquipData(v)).length;
}

export function itemEquipDataErrorMessages(v: ItemEquipData | null | undefined, fieldName: string): string[] {
  const errs = validateItemEquipData(v);
  return Object.entries(errs).map(([key, msg]) => `${fieldName}.${key}: ${msg}`);
}

export default function ItemEquipDataEditor({ value, onChange }: Props) {
  const data: ItemEquipData = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;
  const errs = validateItemEquipData(data);

  const setSlot = (slot: string) => {
    if (slot === '') {
      const rest = omitKey(data, 'slot');
      onChange(Object.keys(rest).length > 0 ? rest as ItemEquipData : EMPTY);
    } else {
      onChange({ ...data, slot });
    }
  };

  const setStats = (stats: Record<string, number | number[]>) => {
    if (Object.keys(stats).length === 0) {
      const rest = omitKey(data, 'stats');
      onChange(Object.keys(rest).length > 0 ? rest as ItemEquipData : EMPTY);
    } else {
      onChange({ ...data, stats });
    }
  };

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Equipment Slot
        </div>
        <div style={{ ...fieldGroupStyle, maxWidth: 220 }}>
          <span style={labelStyle}>slot</span>
          <span style={{ fontSize: 10, color: '#555' }}>body slot key — leave blank for unequippable items</span>
          <input
            type="text"
            list="equip-slot-suggestions"
            value={data.slot ?? ''}
            placeholder="e.g. head, body, tail …"
            onChange={e => setSlot(e.target.value)}
            style={{ ...inputStyle, width: '100%', borderColor: errs.slot ? '#ef4444' : undefined }}
          />
          <datalist id="equip-slot-suggestions">
            {BODY_SLOTS.map(s => <option key={s} value={s} />)}
          </datalist>
          {errs.slot && <span style={errorTextStyle}>{errs.slot}</span>}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Stat Bonuses
        </div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
          Stats granted to the entity while this item is equipped. Leave blank to grant no stats.
        </div>
        <StatMapEditor
          value={data.stats ?? {}}
          onChange={setStats}
        />
      </div>
    </div>
  );
}

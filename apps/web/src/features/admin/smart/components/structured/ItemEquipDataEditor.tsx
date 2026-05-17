import StatMapEditor from './StatMapEditor';
import {
  labelStyle,
  fieldGroupStyle,
  selectStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import { errorTextStyle } from './validation';

export interface ItemEquipData {
  slot?: string;
  stats?: Record<string, number | number[]>;
}

const BODY_SLOTS = ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'];

interface EquipDataErrors {
  slot?: string;
}

interface Props {
  value: ItemEquipData | null | undefined;
  onChange: (v: ItemEquipData) => void;
}

const EMPTY: ItemEquipData = {};

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

export default function ItemEquipDataEditor({ value, onChange }: Props) {
  const data: ItemEquipData = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;
  const errs = validateItemEquipData(data);

  const setSlot = (slot: string) => {
    if (slot === '') {
      const { slot: _, ...rest } = data as any;
      onChange(Object.keys(rest).length > 0 ? rest : EMPTY);
    } else {
      onChange({ ...data, slot });
    }
  };

  const setStats = (stats: Record<string, number | number[]>) => {
    if (Object.keys(stats).length === 0) {
      const { stats: _, ...rest } = data as any;
      onChange(Object.keys(rest).length > 0 ? rest : EMPTY);
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
          <select
            value={data.slot ?? ''}
            onChange={e => setSlot(e.target.value)}
            style={{ ...selectStyle, width: '100%', borderColor: errs.slot ? '#ef4444' : undefined }}
          >
            <option value="">— none / unequippable —</option>
            {BODY_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
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

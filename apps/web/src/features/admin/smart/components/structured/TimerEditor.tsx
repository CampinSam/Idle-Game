import CostListEditor from './CostListEditor';
import {
  sectionStyle,
  inputStyle,
  selectStyle,
  fieldGroupStyle,
  labelStyle,
  fieldRowStyle,
  ghostButtonStyle,
} from './editorStyles';

interface TimerSpec {
  duration?: number;
  boostable?: boolean;
  skipable?: boolean;
  skip_type?: string;
  skip_cost?: any[];
  [k: string]: any;
}

interface Props {
  value: any;
  onChange: (val: TimerSpec) => void;
}

const SKIP_TYPES = ['absolute', 'relative', 'percent'];

const DEFAULTS: TimerSpec = {
  duration: 0,
  boostable: true,
  skipable: false,
  skip_type: 'absolute',
  skip_cost: [],
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 34, height: 18, borderRadius: 10, position: 'relative',
          background: checked ? '#7c3aed' : '#333',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          width: 14, height: 14, borderRadius: 7, background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
      </div>
      <span style={{ fontSize: 12, color: checked ? '#a78bfa' : '#888' }}>{label}</span>
    </label>
  );
}

export default function TimerEditor({ value, onChange }: Props) {
  const spec: TimerSpec = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const isEmpty = Object.keys(spec).length === 0;

  const update = (patch: Partial<TimerSpec>) => onChange({ ...spec, ...patch });

  if (isEmpty) {
    return (
      <div style={{ ...sectionStyle, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, color: '#666' }}>No timer configured.</span>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULTS })}
          style={{
            padding: '6px 12px', background: 'rgba(251,146,60,0.1)',
            border: '1px solid #fb923c55', borderRadius: 6, color: '#fb923c',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          ⚡ Fill timer defaults
        </button>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <div style={fieldRowStyle}>
        <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
          <span style={labelStyle}>duration (seconds)</span>
          <input
            type="number"
            value={spec.duration ?? ''}
            onChange={e => update({ duration: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
          <span style={labelStyle}>skip_type</span>
          <select
            value={spec.skip_type ?? 'absolute'}
            onChange={e => update({ skip_type: e.target.value })}
            style={{ ...selectStyle, width: '100%' }}
          >
            {SKIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ ...fieldRowStyle, gap: 16 }}>
        <Toggle checked={!!spec.boostable} onChange={v => update({ boostable: v })} label="boostable" />
        <Toggle checked={!!spec.skipable} onChange={v => update({ skipable: v })} label="skipable" />
        <button
          type="button"
          onClick={() => onChange({})}
          style={{ ...ghostButtonStyle, marginLeft: 'auto' }}
          title="Clear timer (removes all fields)"
        >
          Clear
        </button>
      </div>

      {spec.skipable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>skip_cost</span>
          <CostListEditor
            value={Array.isArray(spec.skip_cost) ? spec.skip_cost : []}
            onChange={v => update({ skip_cost: v })}
          />
        </div>
      )}
    </div>
  );
}

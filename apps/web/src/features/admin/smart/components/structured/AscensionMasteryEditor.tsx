import {
  containerStyle, sectionStyle, labelStyle, fieldRowStyle,
  numberInputStyle, fieldGroupStyle,
} from './editorStyles';

interface Props {
  value: any;
  onChange: (v: any) => void;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, position: 'relative',
          background: checked ? '#7c3aed' : '#333',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: 8, background: '#fff',
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ ...labelStyle, color: checked ? '#a78bfa' : '#888' }}>{label}</span>
    </label>
  );
}

export function AscensionEditor({ value, onChange }: Props) {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : { enabled: false };
  const enabled = v.enabled === true;
  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <Toggle
          label="ENABLED"
          checked={enabled}
          onChange={c => onChange({ ...v, enabled: c })}
        />
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>CAP (max ascensions)</div>
            <input
              type="number"
              min={0}
              value={v.cap ?? ''}
              onChange={e => {
                const n = Number(e.target.value);
                onChange({ ...v, cap: e.target.value === '' ? undefined : (isNaN(n) ? undefined : n) });
              }}
              style={numberInputStyle}
              placeholder="—"
              disabled={!enabled}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#555' }}>
          Reserved for future gameplay. costPerStep / effects can be added in raw JSON view.
        </div>
      </div>
    </div>
  );
}

export function MasteryEditor({ value, onChange }: Props) {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : { enabled: false };
  const enabled = v.enabled === true;
  return (
    <div style={containerStyle}>
      <div style={sectionStyle}>
        <Toggle
          label="ENABLED"
          checked={enabled}
          onChange={c => onChange({ ...v, enabled: c })}
        />
        <div style={{ fontSize: 11, color: '#555' }}>
          Reserved for future gameplay. branches can be added in raw JSON view.
        </div>
      </div>
    </div>
  );
}

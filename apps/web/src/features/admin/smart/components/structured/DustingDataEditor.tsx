import OutcomeTiersEditor from './OutcomeTiersEditor';
import {
  sectionStyle,
  fieldGroupStyle,
  fieldRowStyle,
  labelStyle,
  numberInputStyle,
  selectStyle,
} from './editorStyles';

interface Props {
  value: any;
  onChange: (val: any) => void;
}

const SCALING_OPTIONS = [
  { value: 'ALL_AT_ONCE', label: 'All at once' },
  { value: 'LINEAR', label: 'Linear (per item)' },
];

export default function DustingDataEditor({ value, onChange }: Props) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const instant: boolean = data.instant ?? false;
  const durationTicks: number = data.durationTicks ?? 0;
  const quantityScaling: string = data.quantityScaling ?? 'ALL_AT_ONCE';
  const difficulty: number = data.difficulty ?? 0;
  const tiers: any = data.tiers ?? {};

  const update = (patch: Partial<typeof data>) => onChange({ ...data, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>instant</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={instant}
                onChange={(e) => update({ instant: e.target.checked })}
              />
              <span style={{ fontSize: 12, color: '#e0e0ff' }}>
                {instant ? 'Yes — resolves immediately' : 'No — timed job'}
              </span>
            </label>
          </div>

          <div style={fieldGroupStyle}>
            <span style={labelStyle}>difficulty</span>
            <input
              type="number"
              style={numberInputStyle}
              value={difficulty}
              min={0}
              onChange={(e) => update({ difficulty: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        {!instant && (
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>durationTicks</span>
              <input
                type="number"
                style={numberInputStyle}
                value={durationTicks}
                min={0}
                onChange={(e) => update({ durationTicks: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>quantityScaling</span>
              <select
                style={selectStyle}
                value={quantityScaling}
                onChange={(e) => update({ quantityScaling: e.target.value })}
              >
                {SCALING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={fieldGroupStyle}>
        <span style={labelStyle}>tiers</span>
        <OutcomeTiersEditor
          value={tiers}
          onChange={(next) => update({ tiers: next })}
        />
      </div>
    </div>
  );
}

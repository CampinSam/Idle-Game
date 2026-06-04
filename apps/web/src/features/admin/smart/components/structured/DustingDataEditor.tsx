import TimerEditor from './TimerEditor';
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

const TIMER_SCALING_OPTIONS = [
  { value: 'flat', label: 'Flat (all at once)' },
  { value: 'per_unit', label: 'Per unit (linear)' },
];

export default function DustingDataEditor({ value, onChange }: Props) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const instant: boolean = data.instant ?? false;
  const timer: any = data.timer ?? {};
  const timerScaling: string = data.timerScaling ?? 'flat';
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
          <>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>timerScaling</span>
              <select
                style={selectStyle}
                value={timerScaling}
                onChange={(e) => update({ timerScaling: e.target.value })}
              >
                {TIMER_SCALING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <span style={labelStyle}>timer</span>
              <TimerEditor
                value={timer}
                onChange={(next) => update({ timer: next })}
              />
            </div>
          </>
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

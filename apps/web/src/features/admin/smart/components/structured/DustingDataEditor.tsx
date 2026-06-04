import OutcomeTiersEditor from './OutcomeTiersEditor';
import {
  sectionStyle,
  fieldGroupStyle,
  fieldRowStyle,
  labelStyle,
  numberInputStyle,
  selectStyle,
  inputStyle,
} from './editorStyles';

interface Props {
  value: any;
  onChange: (val: any) => void;
}

const SCALING_OPTIONS = [
  { value: 'ALL_AT_ONCE', label: 'All at once' },
  { value: 'LINEAR', label: 'Linear (per item)' },
];

const SKIP_COST_TYPE_OPTIONS = [
  { value: 'currency', label: 'Currency' },
  { value: 'item', label: 'Item' },
];

export default function DustingDataEditor({ value, onChange }: Props) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const instant: boolean = data.instant ?? false;
  const durationTicks: number = data.durationTicks ?? 0;
  const quantityScaling: string = data.quantityScaling ?? 'ALL_AT_ONCE';
  const difficulty: number = data.difficulty ?? 0;
  const tiers: any = data.tiers ?? {};
  const skipCost: any = data.skipCost ?? null;

  const update = (patch: Partial<typeof data>) => onChange({ ...data, ...patch });

  const updateSkipCost = (patch: Partial<{ type: string; id: string; amount: number }>) => {
    const base = skipCost ?? { type: 'currency', id: '', amount: 0 };
    update({ skipCost: { ...base, ...patch } });
  };

  const removeSkipCost = () => {
    const next = { ...data };
    delete next.skipCost;
    onChange(next);
  };

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

        {!instant && (
          <div style={fieldGroupStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>skipCost</span>
              {!skipCost && (
                <button
                  type="button"
                  onClick={() => update({ skipCost: { type: 'currency', id: '', amount: 0 } })}
                  style={{ fontSize: 11, color: '#7c6fcd', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  + Add skip cost
                </button>
              )}
            </div>
            {skipCost && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <div style={fieldRowStyle}>
                  <div style={fieldGroupStyle}>
                    <span style={labelStyle}>type</span>
                    <select
                      style={selectStyle}
                      value={skipCost.type ?? 'currency'}
                      onChange={(e) => updateSkipCost({ type: e.target.value })}
                    >
                      {SKIP_COST_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={fieldGroupStyle}>
                    <span style={labelStyle}>amount</span>
                    <input
                      type="number"
                      style={numberInputStyle}
                      value={skipCost.amount ?? 0}
                      min={1}
                      onChange={(e) => updateSkipCost({ amount: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>id ({skipCost.type === 'item' ? 'item def id' : 'currency id'})</span>
                  <input
                    type="text"
                    style={inputStyle}
                    value={skipCost.id ?? ''}
                    placeholder={skipCost.type === 'item' ? 'e.g. dust_crystal' : 'e.g. gem'}
                    onChange={(e) => updateSkipCost({ id: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={removeSkipCost}
                  style={{ fontSize: 11, color: '#f87171', cursor: 'pointer', background: 'none', border: 'none', padding: 0, alignSelf: 'flex-start' }}
                >
                  Remove skip cost
                </button>
              </div>
            )}
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

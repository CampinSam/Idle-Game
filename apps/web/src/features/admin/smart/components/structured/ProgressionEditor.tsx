import type { CSSProperties } from 'react';
import StatMapEditor from './StatMapEditor';
import { validateProgression } from './validation';
import {
  containerStyle, sectionStyle, inputStyle, selectStyle, labelStyle,
  fieldRowStyle, numberInputStyle, fieldGroupStyle, dangerIconButtonStyle,
  addButtonStyle,
} from './editorStyles';

const errorBorder: CSSProperties = { borderColor: '#ef4444' };
const errorTextStyle: CSSProperties = { fontSize: 10, color: '#ef4444', marginTop: 2 };

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={errorTextStyle}>{msg}</div>;
}

const XP_KIND_OPTIONS = ['geometric', 'table'];
const BONUS_KIND_OPTIONS = ['rarityScaled', 'flat'];

interface Props {
  value: any;
  onChange: (v: any) => void;
}

export default function ProgressionEditor({ value, onChange }: Props) {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const xpCurve = v.xpCurve && typeof v.xpCurve === 'object' ? v.xpCurve : { kind: 'geometric', base: 100, ratio: 1.15 };
  const statGain = v.statGain && typeof v.statGain === 'object' ? v.statGain : null;
  const errors = validateProgression(value);

  const patch = (p: any) => onChange({ ...v, ...p });
  const patchXp = (p: any) => onChange({ ...v, xpCurve: { ...xpCurve, ...p } });

  const setXpKind = (kind: string) => {
    // Preserve all prior fields so the user can switch back without losing data.
    if (kind === 'geometric') {
      onChange({
        ...v,
        xpCurve: {
          ...xpCurve,
          kind: 'geometric',
          base: xpCurve.base ?? 100,
          ratio: xpCurve.ratio ?? 1.15,
        },
      });
    } else {
      onChange({
        ...v,
        xpCurve: {
          ...xpCurve,
          kind: 'table',
          perLevel: Array.isArray(xpCurve.perLevel) ? xpCurve.perLevel : [],
        },
      });
    }
  };

  return (
    <div style={containerStyle}>
      {/* enabled + maxLevel */}
      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <ToggleField
            label="ENABLED"
            checked={v.enabled !== false}
            onChange={c => patch({ enabled: c })}
          />
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>MAX LEVEL</div>
            <input
              type="number"
              min={1}
              value={v.maxLevel ?? ''}
              onChange={e => {
                const n = Number(e.target.value);
                patch({ maxLevel: isNaN(n) ? undefined : n });
              }}
              style={{ ...numberInputStyle, ...(errors.maxLevel ? errorBorder : null) }}
              placeholder="50"
            />
            <FieldError msg={errors.maxLevel} />
          </div>
        </div>
      </div>

      {/* XP curve */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, color: '#a78bfa' }}>XP CURVE</div>
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>KIND</div>
            <select
              value={xpCurve.kind ?? 'geometric'}
              onChange={e => setXpKind(e.target.value)}
              style={{ ...selectStyle, ...(errors.xpKind ? errorBorder : null) }}
            >
              {XP_KIND_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <FieldError msg={errors.xpKind} />
          </div>
        </div>
        {xpCurve.kind === 'geometric' && (
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <div style={labelStyle}>BASE (XP for L1→L2)</div>
              <input
                type="number"
                value={xpCurve.base ?? ''}
                onChange={e => {
                  const n = Number(e.target.value);
                  patchXp({ base: isNaN(n) ? undefined : n });
                }}
                style={{ ...numberInputStyle, ...(errors.xpBase ? errorBorder : null) }}
              />
              <FieldError msg={errors.xpBase} />
            </div>
            <div style={fieldGroupStyle}>
              <div style={labelStyle}>RATIO (per-level multiplier)</div>
              <input
                type="number"
                step={0.01}
                value={xpCurve.ratio ?? ''}
                onChange={e => {
                  const n = Number(e.target.value);
                  patchXp({ ratio: isNaN(n) ? undefined : n });
                }}
                style={{ ...numberInputStyle, ...(errors.xpRatio ? errorBorder : null) }}
              />
              <FieldError msg={errors.xpRatio} />
            </div>
          </div>
        )}
        {xpCurve.kind === 'table' && (
          <>
            <PerLevelEditor
              value={Array.isArray(xpCurve.perLevel) ? xpCurve.perLevel : []}
              onChange={a => patchXp({ perLevel: a })}
            />
            <FieldError msg={errors.perLevel} />
          </>
        )}
      </div>

      {/* Stat gain */}
      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <div style={{ ...labelStyle, color: '#a78bfa', flex: 1 }}>STAT GAIN (per level-up)</div>
          {statGain ? (
            <button type="button" onClick={() => patch({ statGain: undefined })} style={dangerIconButtonStyle} title="Remove statGain (use defaults)">×</button>
          ) : (
            <button
              type="button"
              onClick={() => patch({
                statGain: {
                  guaranteed: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 },
                  bonusPool: { kind: 'rarityScaled', base: 14, exponent: 0.16, rarityField: 'compositRarity' },
                  distribution: { uniformShare: 0.5, weightedShare: 0.5, weightsField: 'scaling' },
                },
              })}
              style={addButtonStyle}
            >
              + statGain
            </button>
          )}
        </div>
        {statGain && (
          <StatGainEditor
            value={statGain}
            onChange={s => patch({ statGain: s })}
            errors={errors}
          />
        )}
        {!statGain && (
          <div style={{ fontSize: 11, color: '#555' }}>
            Using defaults (14-pool / 50-50 split). Add to override.
          </div>
        )}
      </div>
    </div>
  );
}

function StatGainEditor({ value, onChange, errors }: { value: any; onChange: (v: any) => void; errors: ReturnType<typeof validateProgression> }) {
  const guaranteed = value.guaranteed && typeof value.guaranteed === 'object' ? value.guaranteed : {};
  const bonusPool = value.bonusPool && typeof value.bonusPool === 'object' ? value.bonusPool : { kind: 'rarityScaled' };
  const distribution = value.distribution && typeof value.distribution === 'object' ? value.distribution : {};

  const patch = (p: any) => onChange({ ...value, ...p });
  const patchBP = (p: any) => onChange({ ...value, bonusPool: { ...bonusPool, ...p } });
  const patchDist = (p: any) => onChange({ ...value, distribution: { ...distribution, ...p } });

  const setBpKind = (kind: string) => {
    // Preserve hidden fields when toggling between bonusPool kinds.
    if (kind === 'rarityScaled') {
      onChange({
        ...value,
        bonusPool: {
          ...bonusPool,
          kind,
          base: bonusPool.base ?? 14,
          exponent: bonusPool.exponent ?? 0.16,
          rarityField: bonusPool.rarityField ?? 'compositRarity',
        },
      });
    } else {
      onChange({
        ...value,
        bonusPool: {
          ...bonusPool,
          kind: 'flat',
          amount: bonusPool.amount ?? 14,
        },
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>GUARANTEED (per-stat baseline)</div>
        <StatMapEditor value={guaranteed} onChange={v => patch({ guaranteed: v })} />
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>BONUS POOL</div>
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>KIND</div>
            <select
              value={bonusPool.kind ?? 'rarityScaled'}
              onChange={e => setBpKind(e.target.value)}
              style={selectStyle}
            >
              {BONUS_KIND_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {bonusPool.kind === 'rarityScaled' && (
            <>
              <div style={fieldGroupStyle}>
                <div style={labelStyle}>BASE</div>
                <input
                  type="number"
                  value={bonusPool.base ?? ''}
                  onChange={e => { const n = Number(e.target.value); patchBP({ base: isNaN(n) ? undefined : n }); }}
                  style={{ ...numberInputStyle, ...(errors.bonusBase ? errorBorder : null) }}
                />
                <FieldError msg={errors.bonusBase} />
              </div>
              <div style={fieldGroupStyle}>
                <div style={labelStyle}>EXPONENT</div>
                <input
                  type="number"
                  step={0.01}
                  value={bonusPool.exponent ?? ''}
                  onChange={e => { const n = Number(e.target.value); patchBP({ exponent: isNaN(n) ? undefined : n }); }}
                  style={{ ...numberInputStyle, ...(errors.bonusExponent ? errorBorder : null) }}
                />
                <FieldError msg={errors.bonusExponent} />
              </div>
              <div style={fieldGroupStyle}>
                <div style={labelStyle}>RARITY FIELD</div>
                <input
                  type="text"
                  value={bonusPool.rarityField ?? ''}
                  onChange={e => patchBP({ rarityField: e.target.value || undefined })}
                  style={inputStyle}
                />
              </div>
            </>
          )}
          {bonusPool.kind === 'flat' && (
            <div style={fieldGroupStyle}>
              <div style={labelStyle}>AMOUNT</div>
              <input
                type="number"
                value={bonusPool.amount ?? ''}
                onChange={e => { const n = Number(e.target.value); patchBP({ amount: isNaN(n) ? undefined : n }); }}
                style={{ ...numberInputStyle, ...(errors.bonusAmount ? errorBorder : null) }}
              />
              <FieldError msg={errors.bonusAmount} />
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>DISTRIBUTION</div>
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>UNIFORM SHARE</div>
            <input
              type="number"
              step={0.01}
              value={distribution.uniformShare ?? ''}
              onChange={e => { const n = Number(e.target.value); patchDist({ uniformShare: isNaN(n) ? undefined : n }); }}
              style={{ ...numberInputStyle, ...(errors.uniformShare ? errorBorder : null) }}
            />
            <FieldError msg={errors.uniformShare} />
          </div>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>WEIGHTED SHARE</div>
            <input
              type="number"
              step={0.01}
              value={distribution.weightedShare ?? ''}
              onChange={e => { const n = Number(e.target.value); patchDist({ weightedShare: isNaN(n) ? undefined : n }); }}
              style={{ ...numberInputStyle, ...(errors.weightedShare ? errorBorder : null) }}
            />
            <FieldError msg={errors.weightedShare} />
          </div>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>WEIGHTS FIELD</div>
            <input
              type="text"
              value={distribution.weightsField ?? ''}
              onChange={e => patchDist({ weightsField: e.target.value || undefined })}
              style={inputStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PerLevelEditor({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 4 }}>PER-LEVEL XP (perLevel[L-1] = XP to leave level L)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {value.map((n, i) => (
          <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 10, color: '#666' }}>L{i + 1}</span>
            <input
              type="number"
              value={n}
              onChange={e => {
                const next = [...value];
                const num = Number(e.target.value);
                next[i] = isNaN(num) ? 0 : num;
                onChange(next);
              }}
              style={{ ...numberInputStyle, width: 70 }}
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...value, value[value.length - 1] ?? 100])}
          style={addButtonStyle}
        >+ level</button>
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
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

import ResourceEntryListEditor, { resourceEntryListErrorCount, resourceEntryListErrorMessages } from './ResourceEntryListEditor';
import type { ResourceEntry } from './ResourceEntryListEditor';
import {
  containerStyle,
  sectionStyle,
  selectStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductionProfile {
  outputs?: ResourceEntry[];
  inputs?: ResourceEntry[];
  onStarve?: 'starved' | 'paused';
  enabled?: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_ON_STARVE = new Set(['starved', 'paused']);

export function productionProfileErrorCount(value: unknown): number {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value as ProductionProfile : null;
  if (!v) return 0;
  let n = 0;
  if (v.outputs !== undefined) {
    n += resourceEntryListErrorCount(v.outputs, 'ratePerHour');
  }
  if (v.inputs !== undefined) {
    n += resourceEntryListErrorCount(v.inputs, 'ratePerHour');
  }
  if (v.onStarve !== undefined && !VALID_ON_STARVE.has(v.onStarve as string)) {
    n += 1;
  }
  if (v.enabled !== undefined && typeof v.enabled !== 'boolean') {
    n += 1;
  }
  return n;
}

export function productionProfileErrorMessages(value: unknown, fieldName: string): string[] {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value as ProductionProfile : null;
  if (!v) return [];
  const msgs: string[] = [];
  if (v.outputs !== undefined) {
    msgs.push(...resourceEntryListErrorMessages(v.outputs, 'ratePerHour', `${fieldName}.outputs`));
  }
  if (v.inputs !== undefined) {
    msgs.push(...resourceEntryListErrorMessages(v.inputs, 'ratePerHour', `${fieldName}.inputs`));
  }
  if (v.onStarve !== undefined && !VALID_ON_STARVE.has(v.onStarve as string)) {
    msgs.push(`${fieldName}.onStarve: must be "starved" or "paused"`);
  }
  if (v.enabled !== undefined && typeof v.enabled !== 'boolean') {
    msgs.push(`${fieldName}.enabled: must be a boolean`);
  }
  return msgs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: '#60a5fa',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ProductionProfileEditor({
  value,
  onChange,
}: {
  value: ProductionProfile | null | undefined;
  onChange: (v: ProductionProfile) => void;
}) {
  const safe: ProductionProfile = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};

  const set = <K extends keyof ProductionProfile>(key: K, val: ProductionProfile[K]) => {
    onChange({ ...safe, [key]: val });
  };

  const remove = (key: keyof ProductionProfile) => {
    const next = { ...safe };
    delete next[key];
    onChange(next);
  };

  const hasOutputs = 'outputs' in safe;
  const hasInputs = 'inputs' in safe;
  const hasOnStarve = 'onStarve' in safe;
  const hasEnabled = 'enabled' in safe;

  return (
    <div style={containerStyle}>

      {/* Outputs section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={SECTION_LABEL_STYLE}>Outputs (produces)</span>
          {hasOutputs ? (
            <button
              type="button"
              onClick={() => remove('outputs')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
            >
              × remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => set('outputs', [])}
              style={{ background: 'none', border: '1px dashed #a78bfa', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}
            >
              + add outputs
            </button>
          )}
        </div>
        {hasOutputs && (
          <ResourceEntryListEditor
            value={safe.outputs}
            onChange={v => set('outputs', v)}
            primaryField="ratePerHour"
          />
        )}
      </div>

      {/* Inputs section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={SECTION_LABEL_STYLE}>Inputs (consumes)</span>
          {hasInputs ? (
            <button
              type="button"
              onClick={() => remove('inputs')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
            >
              × remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => set('inputs', [])}
              style={{ background: 'none', border: '1px dashed #a78bfa', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}
            >
              + add inputs
            </button>
          )}
        </div>
        {hasInputs && (
          <ResourceEntryListEditor
            value={safe.inputs}
            onChange={v => set('inputs', v)}
            primaryField="ratePerHour"
          />
        )}
      </div>

      {/* onStarve */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={SECTION_LABEL_STYLE}>Starve behaviour</span>
          {hasOnStarve ? (
            <button
              type="button"
              onClick={() => remove('onStarve')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
            >
              × remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => set('onStarve', 'starved')}
              style={{ background: 'none', border: '1px dashed #a78bfa', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}
            >
              + set onStarve
            </button>
          )}
        </div>
        {hasOnStarve && (
          <div style={{ ...fieldGroupStyle, maxWidth: 140 }}>
            <span style={labelStyle}>onStarve</span>
            <select
              value={safe.onStarve || 'starved'}
              onChange={e => set('onStarve', e.target.value as 'starved' | 'paused')}
              style={{ ...selectStyle, width: '100%' }}
            >
              <option value="starved">starved</option>
              <option value="paused">paused</option>
            </select>
          </div>
        )}
      </div>

      {/* enabled */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={SECTION_LABEL_STYLE}>Enabled override</span>
          {hasEnabled ? (
            <button
              type="button"
              onClick={() => remove('enabled')}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
            >
              × remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => set('enabled', true)}
              style={{ background: 'none', border: '1px dashed #a78bfa', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}
            >
              + set enabled
            </button>
          )}
        </div>
        {hasEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => set('enabled', !safe.enabled)}
              style={{
                width: 40, height: 22, borderRadius: 11, position: 'relative',
                background: safe.enabled ? '#7c3aed' : '#333',
                transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: safe.enabled ? 19 : 2,
                width: 18, height: 18, borderRadius: 9, background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </div>
            <span style={{ color: safe.enabled ? '#a78bfa' : '#888', fontSize: 12 }}>
              {safe.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        )}
      </div>

    </div>
  );
}

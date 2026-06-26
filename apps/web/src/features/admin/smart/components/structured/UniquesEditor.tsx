import { useState, useEffect, useRef } from 'react';
import CollapsibleObject from '../CollapsibleObject';
import { adminApi } from '../../../adminApi';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  inputStyle,
  numberInputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  fieldRowStyle,
  labelStyle,
  ghostButtonStyle,
  sectionStyle,
} from './editorStyles';
import { ERROR_BORDER_COLOR, errorTextStyle, validatePower } from './validation';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PowerRef {
  powerDefId?: string;
  name: string;
  key?: string;
  value?: number;
  valueMode?: string;
  durationMinutes?: number;
  dailyLimit?: number;
  scope?: string;
  powerType?: string;
  effectDefId?: string;
  effectOverrides?: Record<string, any>;
  selection?: Record<string, any>;
}

interface PowerDefRow {
  id: string;
  name: string;
  powerType: string;
  defaultValue?: number;
  defaultValueMode?: string;
  defaultDurationMinutes?: number;
  defaultDailyLimit?: number;
  defaultScope?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INLINE_POWER_TYPES = [
  'tick_speed_boost',
  'effect_backed',
  'keeper_xp_boost',
  'entity_xp_boost',
  'mission_power_boost',
  'mission_duration_reduction',
  'crafting_duration_reduction',
  'building_build_duration_reduction',
  'building_upgrade_duration_reduction',
  'injury_recovery_boost',
  'dusting_duration_reduction',
] as const;

const SCOPE_OPTIONS = ['global', 'player', 'entity', 'location'] as const;
const VALUE_MODE_OPTIONS = ['percent_add', 'flat'] as const;

/** Legacy powerType values that differ from their corresponding powerDefId */
const LEGACY_TYPE_TO_DEF_ID: Record<string, string> = {
  tick_speed_boost: 'global_tick_boost',
};

// ─── Migration helpers ────────────────────────────────────────────────────────

function snakeToTitle(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isLegacyPower(p: any): boolean {
  return p && typeof p === 'object' && p.powerType && !p.name;
}

function migrateLegacyPower(p: any, defs: PowerDefRow[]): PowerRef {
  const defId = LEGACY_TYPE_TO_DEF_ID[p.powerType as string] ?? p.powerType;
  const matchedDef = defs.find(d => d.id === defId);

  if (matchedDef) {
    const ref: PowerRef = {
      powerDefId: defId,
      name: matchedDef.name,
      key: p.powerType,
    };
    if (p.value !== undefined) ref.value = p.value;
    if (p.valueMode !== undefined) ref.valueMode = p.valueMode;
    if (p.durationMinutes !== undefined) ref.durationMinutes = p.durationMinutes;
    if (p.dailyLimit !== undefined) ref.dailyLimit = p.dailyLimit;
    return ref;
  }

  return {
    name: snakeToTitle(p.powerType as string),
    powerType: p.powerType,
    value: p.value,
    valueMode: p.valueMode ?? 'percent_add',
    durationMinutes: p.durationMinutes,
    dailyLimit: p.dailyLimit,
  };
}

function migrateUniquesMap(
  value: UniquesMap | null | undefined,
  defs: PowerDefRow[],
): { migrated: UniquesMap; count: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { migrated: {}, count: 0 };
  }
  let count = 0;
  const migrated: UniquesMap = {};
  for (const [assetId, entry] of Object.entries(value)) {
    const powers = Array.isArray((entry as any)?.powers) ? (entry as any).powers : [];
    const newPowers = (powers as any[]).map((p: any) => {
      if (isLegacyPower(p)) {
        count++;
        return migrateLegacyPower(p, defs);
      }
      return p as PowerRef;
    });
    migrated[assetId] = { powers: newPowers };
  }
  return { migrated, count };
}

// ─── Default new power ────────────────────────────────────────────────────────

function defaultPowerRef(defs: PowerDefRow[]): PowerRef {
  if (defs.length > 0) {
    return { powerDefId: defs[0].id, name: defs[0].name, key: '' };
  }
  return {
    name: '',
    powerType: 'tick_speed_boost',
    value: 50,
    durationMinutes: 60,
    dailyLimit: 1,
  };
}

// ─── SearchableSelect ─────────────────────────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— search and select —',
  hasError = false,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';
  const filtered = query.trim()
    ? options.filter(
        o =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.value.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? query : selectedLabel}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder={value ? undefined : placeholder}
        style={{
          ...inputStyle,
          width: '100%',
          borderColor: hasError ? ERROR_BORDER_COLOR : '#333',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 200,
            background: '#0f0f2e',
            border: '1px solid #3a3a6e',
            borderRadius: 4,
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '6px 10px',
                color: '#555',
                fontSize: 11,
              }}
            >
              No matches
            </div>
          )}
          {filtered.map(o => (
            <div
              key={o.value}
              onMouseDown={() => commit(o.value)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 12,
                color: o.value === value ? '#a78bfa' : '#e0e0ff',
                background: o.value === value ? 'rgba(167,139,250,0.08)' : 'transparent',
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PowerRefEditor ───────────────────────────────────────────────────────────

type PowerMode = 'def' | 'inline';

function getPowerMode(p: PowerRef): PowerMode {
  return p.powerDefId ? 'def' : 'inline';
}

function PowerRefEditor({
  power,
  powerDefs,
  defsAvailable,
  onChange,
  onRemove,
}: {
  power: PowerRef;
  powerDefs: PowerDefRow[];
  defsAvailable: boolean;
  onChange: (p: PowerRef) => void;
  onRemove: () => void;
}) {
  const errs = validatePower(power);
  const mode = getPowerMode(power);
  const [showOverrides, setShowOverrides] = useState(false);

  const selectedDef = mode === 'def'
    ? powerDefs.find(d => d.id === power.powerDefId || d.key === power.powerDefId)
    : null;

  const switchMode = (m: PowerMode) => {
    if (m === mode) return;
    if (m === 'def') {
      const firstDef = powerDefs[0];
      onChange({
        powerDefId: firstDef?.id ?? '',
        name: power.name || firstDef?.name || '',
        key: power.key ?? '',
      });
    } else {
      onChange({
        name: power.name,
        powerType: power.powerType ?? 'tick_speed_boost',
        value: power.value ?? 50,
        valueMode: power.valueMode ?? 'percent_add',
        durationMinutes: power.durationMinutes ?? 60,
        dailyLimit: power.dailyLimit ?? 1,
      });
    }
  };

  const hasErr = Object.keys(errs).length > 0;

  return (
    <div style={{ ...sectionStyle, padding: 8, borderColor: hasErr ? ERROR_BORDER_COLOR : '#2a2a4e' }}>
      {/* Mode toggle + remove */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {defsAvailable && (
          <button
            type="button"
            onClick={() => switchMode('def')}
            style={{
              ...ghostButtonStyle,
              ...(mode === 'def'
                ? { borderColor: '#a78bfa', color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }
                : {}),
            }}
          >
            Use PowerDef
          </button>
        )}
        <button
          type="button"
          onClick={() => switchMode('inline')}
          style={{
            ...ghostButtonStyle,
            ...(mode === 'inline'
              ? { borderColor: '#a78bfa', color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }
              : {}),
          }}
        >
          Inline
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={dangerIconButtonStyle}
          onClick={onRemove}
          title="Remove power"
        >
          ×
        </button>
      </div>

      {/* ── By PowerDef ── */}
      {mode === 'def' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={fieldRowStyle}>
            <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 200 }}>
              <span style={labelStyle}>powerDef *</span>
              <SearchableSelect
                options={powerDefs.map(d => ({ value: d.id, label: `${d.name} — ${d.id}` }))}
                value={power.powerDefId ?? ''}
                onChange={defId => {
                  const def = powerDefs.find(d => d.id === defId || d.key === defId);
                  onChange({ ...power, powerDefId: defId, name: def?.name ?? power.name });
                }}
                placeholder="— search PowerDefs —"
                hasError={!power.powerDefId}
              />
              {!power.powerDefId && (
                <span style={errorTextStyle}>powerDef required</span>
              )}
            </div>
            <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 140 }}>
              <span style={labelStyle}>name *</span>
              <input
                type="text"
                value={power.name ?? ''}
                onChange={e => onChange({ ...power, name: e.target.value })}
                placeholder="Display name"
                style={{
                  ...inputStyle,
                  width: '100%',
                  borderColor: errs.name ? ERROR_BORDER_COLOR : '#333',
                }}
              />
              {errs.name && <span style={errorTextStyle}>{errs.name}</span>}
            </div>
            <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 120 }}>
              <span style={labelStyle}>key (slug)</span>
              <input
                type="text"
                value={power.key ?? ''}
                onChange={e => onChange({ ...power, key: e.target.value })}
                placeholder="usage-tracking slug"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>

          {selectedDef && (
            <div
              style={{
                fontSize: 11,
                color: '#666',
                background: '#0a0a1e',
                borderRadius: 4,
                padding: '4px 8px',
              }}
            >
              Def defaults: value={selectedDef.defaultValue ?? '—'}{' '}
              {selectedDef.defaultValueMode ?? ''}
              {', '}
              {selectedDef.defaultDurationMinutes ?? '—'}min
              {', '}
              limit×{selectedDef.defaultDailyLimit ?? '—'}/day
              {', '}
              scope={selectedDef.defaultScope ?? '—'}
            </div>
          )}

          <button
            type="button"
            style={{ ...ghostButtonStyle, alignSelf: 'flex-start', fontSize: 10 }}
            onClick={() => setShowOverrides(o => !o)}
          >
            {showOverrides ? '▾ Hide overrides' : '▸ Overrides (optional)'}
          </button>

          {showOverrides && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                paddingLeft: 10,
                borderLeft: '2px solid #2a2a4e',
              }}
            >
              <div style={fieldRowStyle}>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>value</span>
                  <input
                    type="number"
                    value={power.value ?? ''}
                    onChange={e =>
                      onChange({
                        ...power,
                        value: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder={selectedDef?.defaultValue != null ? String(selectedDef.defaultValue) : '(def)'}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>valueMode</span>
                  <select
                    value={power.valueMode ?? ''}
                    onChange={e => onChange({ ...power, valueMode: e.target.value || undefined })}
                    style={{ ...selectStyle, width: '100%' }}
                  >
                    <option value="">
                      {selectedDef?.defaultValueMode ? `(${selectedDef.defaultValueMode})` : '(use def)'}
                    </option>
                    {VALUE_MODE_OPTIONS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>durationMinutes</span>
                  <input
                    type="number"
                    min={1}
                    value={power.durationMinutes ?? ''}
                    onChange={e =>
                      onChange({
                        ...power,
                        durationMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder={selectedDef?.defaultDurationMinutes != null ? String(selectedDef.defaultDurationMinutes) : '(def)'}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>dailyLimit</span>
                  <input
                    type="number"
                    min={1}
                    value={power.dailyLimit ?? ''}
                    onChange={e =>
                      onChange({
                        ...power,
                        dailyLimit: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder={selectedDef?.defaultDailyLimit != null ? String(selectedDef.defaultDailyLimit) : '(def)'}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>scope</span>
                  <select
                    value={power.scope ?? ''}
                    onChange={e => onChange({ ...power, scope: e.target.value || undefined })}
                    style={{ ...selectStyle, width: '100%' }}
                  >
                    <option value="">
                      {selectedDef?.defaultScope ? `(${selectedDef.defaultScope})` : '(use def)'}
                    </option>
                    {SCOPE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Inline ── */}
      {mode === 'inline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={fieldRowStyle}>
            <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 140 }}>
              <span style={labelStyle}>name *</span>
              <input
                type="text"
                value={power.name ?? ''}
                onChange={e => onChange({ ...power, name: e.target.value })}
                placeholder="Display name"
                style={{
                  ...inputStyle,
                  width: '100%',
                  borderColor: errs.name ? ERROR_BORDER_COLOR : '#333',
                }}
              />
              {errs.name && <span style={errorTextStyle}>{errs.name}</span>}
            </div>
            <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 160 }}>
              <span style={labelStyle}>powerType *</span>
              <select
                value={power.powerType ?? ''}
                onChange={e => onChange({ ...power, powerType: e.target.value })}
                style={{
                  ...selectStyle,
                  width: '100%',
                  borderColor: errs.powerType ? ERROR_BORDER_COLOR : '#333',
                }}
              >
                {!power.powerType && <option value="">— select type —</option>}
                {INLINE_POWER_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errs.powerType && <span style={errorTextStyle}>{errs.powerType}</span>}
            </div>
          </div>

          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>value *</span>
              <input
                type="number"
                value={power.value ?? ''}
                onChange={e =>
                  onChange({
                    ...power,
                    value: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                style={{
                  ...numberInputStyle,
                  width: '100%',
                  borderColor: errs.value ? ERROR_BORDER_COLOR : '#333',
                }}
              />
              {errs.value && <span style={errorTextStyle}>{errs.value}</span>}
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>valueMode</span>
              <select
                value={power.valueMode ?? 'percent_add'}
                onChange={e => onChange({ ...power, valueMode: e.target.value })}
                style={{ ...selectStyle, width: '100%' }}
              >
                {VALUE_MODE_OPTIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>durationMinutes *</span>
              <input
                type="number"
                min={1}
                value={power.durationMinutes ?? ''}
                onChange={e =>
                  onChange({
                    ...power,
                    durationMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                style={{
                  ...numberInputStyle,
                  width: '100%',
                  borderColor: errs.durationMinutes ? ERROR_BORDER_COLOR : '#333',
                }}
              />
              {errs.durationMinutes && <span style={errorTextStyle}>{errs.durationMinutes}</span>}
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>dailyLimit *</span>
              <input
                type="number"
                min={1}
                value={power.dailyLimit ?? ''}
                onChange={e =>
                  onChange({
                    ...power,
                    dailyLimit: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                style={{
                  ...numberInputStyle,
                  width: '100%',
                  borderColor: errs.dailyLimit ? ERROR_BORDER_COLOR : '#333',
                }}
              />
              {errs.dailyLimit && <span style={errorTextStyle}>{errs.dailyLimit}</span>}
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>scope</span>
              <select
                value={power.scope ?? ''}
                onChange={e => onChange({ ...power, scope: e.target.value || undefined })}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="">(default)</option>
                {SCOPE_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {power.powerType === 'effect_backed' && (
            <div style={{ ...fieldGroupStyle, maxWidth: 300 }}>
              <span style={labelStyle}>effectDefId *</span>
              <input
                type="text"
                value={power.effectDefId ?? ''}
                onChange={e => onChange({ ...power, effectDefId: e.target.value || undefined })}
                placeholder="eff_..."
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          )}

          <details style={{ marginTop: 2 }}>
            <summary
              style={{ ...labelStyle, cursor: 'pointer', color: '#555', userSelect: 'none' }}
            >
              effectOverrides (raw JSON)
            </summary>
            <div
              style={{
                background: '#0a0a1e',
                border: '1px solid #2a2a4e',
                borderRadius: 4,
                padding: 8,
                marginTop: 4,
              }}
            >
              <CollapsibleObject
                value={power.effectOverrides ?? {}}
                onChange={v =>
                  onChange({ ...power, effectOverrides: v && Object.keys(v).length > 0 ? v : undefined })
                }
              />
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary
              style={{ ...labelStyle, cursor: 'pointer', color: '#555', userSelect: 'none' }}
            >
              selection (raw JSON)
            </summary>
            <div
              style={{
                background: '#0a0a1e',
                border: '1px solid #2a2a4e',
                borderRadius: 4,
                padding: 8,
                marginTop: 4,
              }}
            >
              <CollapsibleObject
                value={power.selection ?? {}}
                onChange={v =>
                  onChange({ ...power, selection: v && Object.keys(v).length > 0 ? v : undefined })
                }
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── UniqueEntryEditor ────────────────────────────────────────────────────────

function UniqueEntryEditor({
  assetId,
  powers,
  otherKeys,
  powerDefs,
  defsLoading,
  onChangeAssetId,
  onChangePowers,
  onRemove,
}: {
  assetId: string;
  powers: PowerRef[];
  otherKeys: string[];
  powerDefs: PowerDefRow[];
  defsLoading: boolean;
  onChangeAssetId: (id: string) => void;
  onChangePowers: (p: PowerRef[]) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [localId, setLocalId] = useState(assetId);

  const isEmpty = localId.trim() === '';
  const isCollision =
    !isEmpty && localId !== assetId && otherKeys.includes(localId);
  const idError = isEmpty
    ? 'Asset ID is required'
    : isCollision
    ? `"${localId}" already exists — rename one of the entries first`
    : null;

  const commitId = () => {
    if (!idError) onChangeAssetId(localId);
  };

  const defsAvailable = !defsLoading && powerDefs.length > 0;

  const addPower = () =>
    onChangePowers([...powers, defaultPowerRef(powerDefs)]);
  const updatePower = (idx: number, p: PowerRef) => {
    const arr = powers.slice();
    arr[idx] = p;
    onChangePowers(arr);
  };
  const removePower = (idx: number) =>
    onChangePowers(powers.filter((_, i) => i !== idx));

  return (
    <div
      style={{
        ...entryCardStyle,
        borderColor: idError ? ERROR_BORDER_COLOR : '#2a2a4e',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          style={{ ...iconButtonStyle, border: 'none', width: 18 }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span
          style={{
            flex: 1,
            color: idError ? ERROR_BORDER_COLOR : '#a78bfa',
            fontSize: 12,
            fontWeight: 600,
            wordBreak: 'break-all',
          }}
        >
          {assetId || (
            <span style={{ color: '#ef4444' }}>— asset id required —</span>
          )}
          <span style={{ color: '#555', fontWeight: 400, marginLeft: 6 }}>
            ({powers.length} power{powers.length !== 1 ? 's' : ''})
          </span>
        </span>
        <button
          type="button"
          style={ghostButtonStyle}
          onClick={() => setRawMode(r => !r)}
          title="Toggle raw JSON view"
        >
          {rawMode ? 'Form' : 'Raw JSON'}
        </button>
        <button
          type="button"
          style={dangerIconButtonStyle}
          onClick={onRemove}
          title="Remove entry"
        >
          ×
        </button>
      </div>

      {!collapsed &&
        (rawMode ? (
          <div
            style={{
              background: '#0f0f2e',
              border: '1px solid #2a2a4e',
              borderRadius: 4,
              padding: 8,
            }}
          >
            <CollapsibleObject
              value={{ powers }}
              onChange={v =>
                onChangePowers(Array.isArray(v?.powers) ? v.powers : [])
              }
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Asset ID field */}
            <div style={entryHeaderStyle}>
              <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 200 }}>
                <span style={labelStyle}>NFT asset ID</span>
                <input
                  type="text"
                  value={localId}
                  onChange={e => setLocalId(e.target.value)}
                  onBlur={commitId}
                  placeholder="e.g. CARDANO:policyId.assetHex"
                  style={{
                    ...inputStyle,
                    width: '100%',
                    borderColor: idError
                      ? ERROR_BORDER_COLOR
                      : '#333',
                  }}
                />
                {idError && <span style={errorTextStyle}>{idError}</span>}
              </div>
            </div>

            {/* Powers list */}
            <div
              style={{
                borderLeft: '2px solid #2a2a4e',
                marginLeft: 4,
                paddingLeft: 10,
              }}
            >
              <span
                style={{ ...labelStyle, display: 'block', marginBottom: 6 }}
              >
                powers
              </span>
              {defsLoading && (
                <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                  Loading PowerDefs…
                </div>
              )}
              <div style={containerStyle}>
                {powers.map((p, idx) => (
                  <PowerRefEditor
                    key={idx}
                    power={p}
                    powerDefs={powerDefs}
                    defsAvailable={defsAvailable}
                    onChange={next => updatePower(idx, next)}
                    onRemove={() => removePower(idx)}
                  />
                ))}
                <button
                  type="button"
                  style={addButtonStyle}
                  onClick={addPower}
                >
                  + power
                </button>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── UniquesMap type & UniquesEditor ─────────────────────────────────────────

export interface UniquesMap {
  [assetId: string]: { powers: PowerRef[] };
}

interface Props {
  value: UniquesMap | null | undefined;
  onChange: (val: UniquesMap) => void;
}

export default function UniquesEditor({ value, onChange }: Props) {
  const [powerDefs, setPowerDefs] = useState<PowerDefRow[]>([]);
  const [defsLoading, setDefsLoading] = useState(true);
  const [migratedCount, setMigratedCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const migrationApplied = useRef(false);

  useEffect(() => {
    adminApi
      .listPowerDefs(true)
      .then((defs: any[]) => {
        setPowerDefs(defs);
        if (!migrationApplied.current) {
          migrationApplied.current = true;
          const { migrated, count } = migrateUniquesMap(value, defs);
          if (count > 0) {
            onChange(migrated);
            setMigratedCount(count);
          }
        }
      })
      .catch(() => {
        // PowerDefs unavailable — run migration with empty defs so legacy
        // powers still get a generated name (inline fallback path).
        if (!migrationApplied.current) {
          migrationApplied.current = true;
          const { migrated, count } = migrateUniquesMap(value, []);
          if (count > 0) {
            onChange(migrated);
            setMigratedCount(count);
          }
        }
      })
      .finally(() => setDefsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const map: UniquesMap =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const entries = Object.entries(map);

  const update = (
    oldKey: string,
    newKey: string,
    powers: PowerRef[],
  ) => {
    if (newKey !== oldKey && map[newKey] !== undefined) return;
    const next: UniquesMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (k === oldKey) {
        next[newKey] = { powers };
      } else {
        next[k] = v;
      }
    }
    onChange(next);
  };

  const remove = (key: string) => {
    const next: UniquesMap = { ...map };
    delete next[key];
    onChange(next);
  };

  const add = () => {
    let key = 'CARDANO:policyId.assetHex';
    let n = 1;
    while (map[key] !== undefined) {
      key = `CARDANO:policyId.assetHex_${n++}`;
    }
    onChange({ ...map, [key]: { powers: [defaultPowerRef(powerDefs)] } });
  };

  return (
    <div style={containerStyle}>
      {/* Migration banner */}
      {migratedCount > 0 && !bannerDismissed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.4)',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 11,
            color: '#fbbf24',
          }}
        >
          <span>
            ⚠ Auto-migrated {migratedCount} legacy power
            {migratedCount !== 1 ? 's' : ''} to the PowerRef format. Review
            and save to confirm.
          </span>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {entries.length === 0 && (
        <div style={{ color: '#555', fontSize: 12 }}>
          No unique NFT powers defined.
        </div>
      )}

      {entries.map(([assetId, entry]) => {
        const otherKeys = entries.map(([k]) => k).filter(k => k !== assetId);
        return (
          <UniqueEntryEditor
            key={assetId}
            assetId={assetId}
            powers={
              Array.isArray((entry as any)?.powers) ? (entry as any).powers : []
            }
            otherKeys={otherKeys}
            powerDefs={powerDefs}
            defsLoading={defsLoading}
            onChangeAssetId={newId =>
              update(
                assetId,
                newId,
                Array.isArray((entry as any)?.powers)
                  ? (entry as any).powers
                  : [],
              )
            }
            onChangePowers={powers => update(assetId, assetId, powers)}
            onRemove={() => remove(assetId)}
          />
        );
      })}

      <button type="button" style={addButtonStyle} onClick={add}>
        + NFT entry
      </button>
    </div>
  );
}

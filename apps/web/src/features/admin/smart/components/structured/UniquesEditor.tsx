import { useState } from 'react';
import CollapsibleObject from '../CollapsibleObject';
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
import { ERROR_BORDER_COLOR, errorTextStyle } from './validation';

const POWER_TYPES = [
  'tick_boost',
  'keeper_xp_boost',
  'entity_xp_boost',
  'mission_power_boost',
  'mission_duration_reduction',
  'crafting_duration_reduction',
  'building_build_duration_reduction',
  'building_upgrade_duration_reduction',
  'injury_recovery_boost',
] as const;

interface Power {
  powerType: string;
  value: number;
  durationMinutes: number;
  dailyLimit: number;
}

function defaultPower(): Power {
  return { powerType: 'tick_boost', value: 50, durationMinutes: 60, dailyLimit: 1 };
}

function PowerEntryEditor({
  power,
  onChange,
  onRemove,
}: {
  power: Power;
  onChange: (p: Power) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ ...sectionStyle, padding: 8 }}>
      <div style={fieldRowStyle}>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 200 }}>
          <span style={labelStyle}>powerType</span>
          <select
            value={power.powerType}
            onChange={e => onChange({ ...power, powerType: e.target.value })}
            style={{ ...selectStyle, width: '100%' }}
          >
            {POWER_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>value</span>
          <input
            type="number"
            value={power.value ?? ''}
            onChange={e => onChange({ ...power, value: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
            title="For tick_boost: additive percent (50 = +50%). For others: same as GlobalActivePower value."
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>durationMinutes</span>
          <input
            type="number"
            min={1}
            value={power.durationMinutes ?? ''}
            onChange={e => onChange({ ...power, durationMinutes: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>dailyLimit</span>
          <input
            type="number"
            min={1}
            value={power.dailyLimit ?? ''}
            onChange={e => onChange({ ...power, dailyLimit: e.target.value === '' ? 1 : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove power">×</button>
        </div>
      </div>
    </div>
  );
}

function UniqueEntryEditor({
  assetId,
  powers,
  otherKeys,
  onChangeAssetId,
  onChangePowers,
  onRemove,
}: {
  assetId: string;
  powers: Power[];
  otherKeys: string[];
  onChangeAssetId: (id: string) => void;
  onChangePowers: (p: Power[]) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [localId, setLocalId] = useState(assetId);

  const isEmpty = localId.trim() === '';
  const isCollision = !isEmpty && localId !== assetId && otherKeys.includes(localId);
  const idError = isEmpty
    ? 'Asset ID is required'
    : isCollision
      ? `"${localId}" already exists — rename one of the entries first`
      : null;

  const commitId = () => {
    if (!idError) onChangeAssetId(localId);
  };

  const addPower = () => onChangePowers([...powers, defaultPower()]);
  const updatePower = (idx: number, p: Power) => {
    const arr = powers.slice();
    arr[idx] = p;
    onChangePowers(arr);
  };
  const removePower = (idx: number) => onChangePowers(powers.filter((_, i) => i !== idx));

  return (
    <div style={{ ...entryCardStyle, borderColor: idError ? ERROR_BORDER_COLOR : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          style={{ ...iconButtonStyle, border: 'none', width: 18 }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ flex: 1, color: idError ? ERROR_BORDER_COLOR : '#a78bfa', fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>
          {assetId || <span style={{ color: '#ef4444' }}>— asset id required —</span>}
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
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove entry">×</button>
      </div>

      {!collapsed && (
        rawMode ? (
          <div style={{ background: '#0f0f2e', border: '1px solid #2a2a4e', borderRadius: 4, padding: 8 }}>
            <CollapsibleObject
              value={{ powers }}
              onChange={v => onChangePowers(Array.isArray(v?.powers) ? v.powers : [])}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    borderColor: idError ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined),
                  }}
                />
                {idError && <span style={errorTextStyle}>{idError}</span>}
              </div>
            </div>

            <div style={{ borderLeft: '2px solid #2a2a4e', marginLeft: 4, paddingLeft: 10 }}>
              <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>powers</span>
              <div style={containerStyle}>
                {powers.map((p, idx) => (
                  <PowerEntryEditor
                    key={idx}
                    power={p}
                    onChange={next => updatePower(idx, next)}
                    onRemove={() => removePower(idx)}
                  />
                ))}
                <button type="button" style={addButtonStyle} onClick={addPower}>+ power</button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export interface UniquesMap {
  [assetId: string]: { powers: Power[] };
}

interface Props {
  value: UniquesMap | null | undefined;
  onChange: (val: UniquesMap) => void;
}

export default function UniquesEditor({ value, onChange }: Props) {
  const map: UniquesMap = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const entries = Object.entries(map);

  const update = (oldKey: string, newKey: string, powers: Power[]) => {
    if (newKey !== oldKey && map[newKey] !== undefined) {
      return;
    }
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
    onChange({ ...map, [key]: { powers: [defaultPower()] } });
  };

  return (
    <div style={containerStyle}>
      {entries.length === 0 && (
        <div style={{ color: '#555', fontSize: 12 }}>No unique NFT powers defined.</div>
      )}
      {entries.map(([assetId, entry]) => {
        const otherKeys = entries.map(([k]) => k).filter(k => k !== assetId);
        return (
          <UniqueEntryEditor
            key={assetId}
            assetId={assetId}
            powers={Array.isArray(entry?.powers) ? entry.powers : []}
            otherKeys={otherKeys}
            onChangeAssetId={newId => update(assetId, newId, Array.isArray(entry?.powers) ? entry.powers : [])}
            onChangePowers={powers => update(assetId, assetId, powers)}
            onRemove={() => remove(assetId)}
          />
        );
      })}
      <button type="button" style={addButtonStyle} onClick={add}>+ NFT entry</button>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { FieldDef, isAssetKeyField } from '../tableSchemas';
import RefSelect from './RefSelect';
import CollapsibleObject from './CollapsibleObject';
import MediaUploader from './MediaUploader';
import CostListEditor from './structured/CostListEditor';
import RichSelectionEditor from './structured/RichSelectionEditor';
import TimerEditor from './structured/TimerEditor';
import OutcomeListEditor from './structured/OutcomeListEditor';
import ObjectivesListEditor from './structured/ObjectivesListEditor';
import CheckInDaysEditor from './structured/CheckInDaysEditor';
import EffectListEditor from './structured/EffectListEditor';
import ConsumableDataEditor from './structured/ConsumableDataEditor';
import FrequencyEditor from './structured/FrequencyEditor';
import DisplayStyleEditor from './structured/DisplayStyleEditor';
import StatMapEditor from './structured/StatMapEditor';
import SlotStatsEditor from './structured/SlotStatsEditor';
import SlotArchetypesEditor from './structured/SlotArchetypesEditor';
import EquipmentSlotsEditor from './structured/EquipmentSlotsEditor';
import TraitsEditor from './structured/TraitsEditor';
import ProgressionEditor from './structured/ProgressionEditor';
import { AscensionEditor, MasteryEditor } from './structured/AscensionMasteryEditor';
import InitEditor from './structured/InitEditor';
import ModalSpecEditor from '../../modal-editor/ModalSpecEditor';
import UniquesEditor from './structured/UniquesEditor';
import SynergyEffectsEditor from './structured/SynergyEffectsEditor';
import GiftPresentationEditor from './structured/GiftPresentationEditor';
import GiftClaimRulesEditor from './structured/GiftClaimRulesEditor';
import ItemEquipDataEditor from './structured/ItemEquipDataEditor';
import HomeBannerConfigEditor from './structured/HomeBannerConfigEditor';
import EventSecurityEditor from './structured/EventSecurityEditor';
import EntityLevelRulesEditor from './structured/EntityLevelRulesEditor';
import ProductionProfileEditor from './structured/ProductionProfileEditor';
import { TelemetrySubEventListEditor } from './structured/TelemetrySubEventListEditor';
import OutcomeTiersEditor from './structured/OutcomeTiersEditor';
import ContentDocumentDataEditor from './structured/ContentDocumentDataEditor';
import DustingDataEditor from './structured/DustingDataEditor';
import MissionPhasesEditor from './structured/MissionPhasesEditor';
import { uniquesErrorCount } from './structured/validation';

type SafeKind = 'array' | 'object' | 'passthrough';
interface RegistryEntry {
  Component: React.ComponentType<{ value: any; onChange: (v: any) => void }>;
  safe: SafeKind;
}

const STRUCTURED_REGISTRY: Record<string, RegistryEntry> = {
  richSelection:     { Component: RichSelectionEditor,    safe: 'passthrough' },
  timerSpec:         { Component: TimerEditor,             safe: 'passthrough' },
  outcomeSpec:       { Component: OutcomeListEditor,       safe: 'passthrough' },
  objectivesArray:   { Component: ObjectivesListEditor,    safe: 'array' },
  checkInDaysArray:  { Component: CheckInDaysEditor,       safe: 'array' },
  effectsArray:      { Component: EffectListEditor,        safe: 'array' },
  consumableData:    { Component: ConsumableDataEditor,    safe: 'passthrough' },
  frequency:         { Component: FrequencyEditor,         safe: 'passthrough' },
  displayStyle:      { Component: DisplayStyleEditor,      safe: 'passthrough' },
  statMap:           { Component: StatMapEditor,           safe: 'object' },
  slotStatsMap:      { Component: SlotStatsEditor,         safe: 'object' },
  slotArchetypesMap: { Component: SlotArchetypesEditor,    safe: 'object' },
  equipmentSlotsMap: { Component: EquipmentSlotsEditor,    safe: 'object' },
  traits:            { Component: TraitsEditor,            safe: 'object' },
  progression:       { Component: ProgressionEditor,       safe: 'passthrough' },
  ascension:         { Component: AscensionEditor,         safe: 'passthrough' },
  mastery:           { Component: MasteryEditor,           safe: 'passthrough' },
  init:              { Component: InitEditor,              safe: 'passthrough' },
  modalSpec:         { Component: ModalSpecEditor,         safe: 'passthrough' },
  synergyEffectsArray: { Component: SynergyEffectsEditor, safe: 'array' },
  giftPresentation:  { Component: GiftPresentationEditor,  safe: 'object' },
  giftClaimRules:    { Component: GiftClaimRulesEditor,    safe: 'object' },
  itemEquipData:     { Component: ItemEquipDataEditor,     safe: 'object' },
  homeBannerConfig:  { Component: HomeBannerConfigEditor,  safe: 'object' },
  eventSecurity:     { Component: EventSecurityEditor,     safe: 'object' },
  buildingLevelRules:      { Component: (p: any) => <EntityLevelRulesEditor {...p} mode="building" />, safe: 'passthrough' },
  roomLevelRules:          { Component: (p: any) => <EntityLevelRulesEditor {...p} mode="room" />,     safe: 'passthrough' },
  locationLevelRules:      { Component: (p: any) => <EntityLevelRulesEditor {...p} mode="location" />, safe: 'passthrough' },
  productionProfile:       { Component: ProductionProfileEditor,        safe: 'passthrough' },
  telemetrySubEventsArray: { Component: TelemetrySubEventListEditor,    safe: 'array' },
  outcomeTiers:            { Component: OutcomeTiersEditor,             safe: 'passthrough' },
  contentDocumentData:     { Component: ContentDocumentDataEditor,      safe: 'passthrough' },
  dustingData:             { Component: DustingDataEditor,              safe: 'passthrough' },
  missionPhases:           { Component: MissionPhasesEditor,            safe: 'array' },
};

function safeValue(value: any, kind: SafeKind): any {
  if (kind === 'array') return Array.isArray(value) ? value : [];
  if (kind === 'object') return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  return value;
}

interface Props {
  fieldName: string;
  fieldDef: FieldDef;
  value: any;
  onChange: (val: any) => void;
  enumOptions?: Record<string, string[]>;
}

const FALLBACK_ENUMS: Record<string, string[]> = {
  currencyType: ['SOFT', 'HARD', 'PREMIUM', 'SEASONAL', 'EVENT', 'GUILD'],
  itemType: ['MATERIAL', 'CONSUMABLE', 'GEAR', 'QUEST', 'LOOTBOX', 'GIFT_PACKAGE'],
  itemRarity: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'],
  itemCategory: ['MISC', 'WEAPON', 'ARMOR', 'ACCESSORY', 'CONSUMABLE', 'CRAFTING', 'QUEST', 'CURRENCY'],
  buildingCategory: ['PRODUCTION', 'STORAGE', 'UTILITY', 'DEFENSE', 'SPECIAL'],
  eventKind: ['system', 'player', 'admin'],
  handlerKey: ['on_claim_location', 'on_complete_mission', 'on_claim_reward'],
  checkInFrequency: ['daily', 'every_x_days', 'weekly', 'monthly'],
  missionMode: ['single', 'multi_phase'],
  missionRewardsMode: ['final_bundle', 'per_phase', 'hybrid'],
};

function JSONField({ value, onChange, onBlur, touched, error, path }: {
  value: any; onChange: (v: any) => void; onBlur: () => void; touched: boolean; error: string | null; path?: string;
}) {
  const [mode, setMode] = useState<'tree' | 'raw'>('tree');
  const [rawText, setRawText] = useState(() => JSON.stringify(value, null, 2));
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      setLocalError(null);
      onChange(parsed);
    } catch (e: any) {
      setLocalError(`JSON error: ${e.message}`);
    }
  };

  const handleSwitchToTree = () => {
    setRawText(JSON.stringify(value, null, 2));
    setLocalError(null);
    setMode('tree');
  };

  const showError = (touched && error) || localError;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => setMode('tree')}
          style={{
            padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            background: mode === 'tree' ? '#a78bfa' : 'transparent',
            border: mode === 'tree' ? 'none' : '1px solid #333',
            color: mode === 'tree' ? '#fff' : '#888',
          }}
        >
          Tree
        </button>
        <button
          type="button"
          onClick={() => { setMode('raw'); setRawText(JSON.stringify(value, null, 2)); }}
          style={{
            padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            background: mode === 'raw' ? '#a78bfa' : 'transparent',
            border: mode === 'raw' ? 'none' : '1px solid #333',
            color: mode === 'raw' ? '#fff' : '#888',
          }}
        >
          Raw JSON
        </button>
      </div>

      {mode === 'tree' ? (
        <div style={{
          background: '#0f0f2e', border: `1px solid ${showError ? '#ef4444' : '#333'}`,
          borderRadius: 6, padding: 10,
        }}>
          <CollapsibleObject value={value} onChange={onChange} path={path} />
        </div>
      ) : (
        <textarea
          value={rawText}
          onChange={e => handleRawChange(e.target.value)}
          onBlur={() => { handleSwitchToTree(); onBlur(); }}
          style={{
            width: '100%', minHeight: 120, background: '#0f0f2e',
            border: `1px solid ${showError ? '#ef4444' : '#333'}`,
            borderRadius: 6, color: '#e0e0ff', fontSize: 12,
            fontFamily: 'monospace', padding: 8, resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      )}
      {showError && (
        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{localError || error}</div>
      )}
    </div>
  );
}

function StructuredFieldWrapper({
  value, onChange, onBlur, touched, error, path, children,
}: {
  value: any;
  onChange: (v: any) => void;
  onBlur: () => void;
  touched: boolean;
  error: string | null;
  path?: string;
  children: React.ReactNode;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [localError, setLocalError] = useState<string | null>(null);

  const openRaw = () => {
    setRawText(JSON.stringify(value ?? null, null, 2));
    setLocalError(null);
    setShowRaw(true);
  };

  const closeRaw = () => {
    setLocalError(null);
    setShowRaw(false);
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      setLocalError(null);
      onChange(parsed);
    } catch (e: any) {
      setLocalError(`JSON error: ${e.message}`);
    }
  };

  const showError = (touched && error) || localError;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => (showRaw ? closeRaw() : openRaw())}
          style={{
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid #2a2a4e',
            borderRadius: 4,
            color: showRaw ? '#a78bfa' : '#666',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
          title="Toggle raw JSON view (escape hatch)"
        >
          {showRaw ? 'Show editor' : 'Show raw JSON'}
        </button>
      </div>
      {showRaw ? (
        <textarea
          value={rawText}
          onChange={e => handleRawChange(e.target.value)}
          onBlur={onBlur}
          style={{
            width: '100%', minHeight: 160, background: '#0f0f2e',
            border: `1px solid ${showError ? '#ef4444' : '#333'}`,
            borderRadius: 6, color: '#e0e0ff', fontSize: 12,
            fontFamily: 'monospace', padding: 8, resize: 'vertical',
            boxSizing: 'border-box',
          }}
          data-path={path}
        />
      ) : (
        children
      )}
      {showError && (
        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{localError || error}</div>
      )}
    </div>
  );
}

export default function SmartField({ fieldName, fieldDef, value, onChange, enumOptions }: Props) {
  const [touched, setTouched] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const touch = useCallback(() => setTouched(true), []);

  if (fieldDef.readonly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{fieldName}</label>
          <span style={{ fontSize: 11, color: '#4b5563' }}>— {fieldDef.description}</span>
        </div>
        <div style={{
          padding: '6px 10px',
          background: '#0f0f1a',
          border: '1px solid #1f1f3a',
          borderRadius: 6,
          color: '#6b7280',
          fontSize: 12,
          fontFamily: "'ui-monospace', 'SFMono-Regular', 'Fira Code', monospace",
          wordBreak: 'break-all',
          userSelect: 'text',
        }}>
          {value != null && value !== '' ? String(value) : <span style={{ fontStyle: 'italic', color: '#4b5563' }}>auto-generated on save</span>}
        </div>
      </div>
    );
  }

  const isRequired = fieldDef.required;
  const error = touched && isRequired && (value === undefined || value === null || value === '')
    ? `${fieldName} is required`
    : null;

  const borderColor = touched ? (error ? '#ef4444' : '#4ade80') : '#333';

  const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    background: '#1a1a2e',
    border: `1px solid ${borderColor}`,
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  };

  const renderStructured = (inner: React.ReactNode) => (
    <StructuredFieldWrapper
      value={value}
      onChange={onChange}
      onBlur={touch}
      touched={touched}
      error={error}
      path={fieldName}
    >
      {inner}
    </StructuredFieldWrapper>
  );

  const renderField = () => {
    const t = fieldDef.type;

    if (t === 'costArray') {
      const safeVal = Array.isArray(value) ? value : [];
      const allowEntity = fieldName === 'contents';
      const allowOutpostSlots = fieldName === 'contents';
      return renderStructured(
        <CostListEditor value={safeVal} onChange={onChange} allowEntity={allowEntity} allowOutpostSlots={allowOutpostSlots} />
      );
    }

    const registryEntry = STRUCTURED_REGISTRY[t];
    if (registryEntry) {
      const { Component, safe } = registryEntry;
      return renderStructured(<Component value={safeValue(value, safe)} onChange={onChange} />);
    }

    if (t === 'rulesWithUniques') {
      const safeVal = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
      const { uniques, ...otherRules } = safeVal;
      const handleUniquesChange = (newUniques: any) => {
        if (Object.keys(newUniques).length === 0) {
          const { uniques: _removed, ...rest } = safeVal;
          onChange(rest);
        } else {
          onChange({ ...safeVal, uniques: newUniques });
        }
      };
      const handleOtherRulesChange = (partial: any) => {
        if (Object.keys(safeVal).includes('uniques')) {
          onChange({ ...partial, uniques: safeVal.uniques });
        } else {
          onChange(partial);
        }
      };
      const uniqueErrCount = uniquesErrorCount(uniques);
      return renderStructured(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            border: `1px solid ${uniqueErrCount > 0 ? '#ef4444' : '#2a2a4e'}`,
            borderRadius: 6,
            background: '#0f0f2e',
            padding: 10,
          }}>
            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              Unique NFT Powers
              {uniqueErrCount > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 8,
                  fontSize: 9, padding: '1px 5px', fontWeight: 700,
                  minWidth: 14, textAlign: 'center', lineHeight: 1.4,
                }}>
                  {uniqueErrCount}
                </span>
              )}
            </div>
            <UniquesEditor value={uniques} onChange={handleUniquesChange} />
          </div>
          <div style={{
            border: '1px solid #2a2a4e',
            borderRadius: 6,
            background: '#0f0f2e',
            padding: 10,
          }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Other Rules (JSON)
            </div>
            <CollapsibleObject value={otherRules} onChange={handleOtherRulesChange} />
          </div>
        </div>
      );
    }

    if (t === 'ref' && fieldDef.refTable) {
      return (
        <RefSelect
          refTable={fieldDef.refTable}
          value={value ?? null}
          onChange={onChange}
          onBlur={touch}
        />
      );
    }

    if (t === 'boolean') {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
          <div
            onClick={() => { onChange(!value); touch(); }}
            style={{
              width: 42, height: 24, borderRadius: 12, position: 'relative',
              background: value ? '#7c3aed' : '#333',
              transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: value ? 20 : 3,
              width: 18, height: 18, borderRadius: 9, background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </div>
          <span style={{ color: value ? '#a78bfa' : '#888', fontSize: 13 }}>
            {value ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      );
    }

    if (t === 'number') {
      return (
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          onBlur={touch}
          style={inputStyle}
        />
      );
    }

    if (t === 'color') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={value || '#000000'}
            onChange={e => onChange(e.target.value)}
            onBlur={touch}
            style={{ width: 40, height: 34, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'none', padding: 2 }}
          />
          <input
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            onBlur={touch}
            placeholder="#rrggbb"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      );
    }

    if (t === 'enum' && fieldDef.enum) {
      const opts = (enumOptions && enumOptions[fieldDef.enum]) || FALLBACK_ENUMS[fieldDef.enum] || [];
      return (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || undefined)}
          onBlur={touch}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">— select —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    if (t === 'stringArray') {
      const arr: string[] = Array.isArray(value) ? value : [];
      const addTag = (tag: string) => {
        if (tag && !arr.includes(tag)) onChange([...arr, tag]);
      };
      return (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: arr.length ? 6 : 0 }}>
            {arr.map(tag => (
              <span key={tag} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                background: '#1a1a2e', border: '1px solid #444', borderRadius: 20,
                color: '#e0e0ff', fontSize: 12,
              }}>
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(arr.filter(t => t !== tag))}
                  style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="Type and press Enter or comma..."
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = (e.currentTarget.value).trim();
                if (v) { addTag(v); e.currentTarget.value = ''; }
              }
            }}
            onBlur={e => { touch(); const v = e.target.value.trim(); if (v) { addTag(v); e.target.value = ''; } }}
            style={inputStyle}
          />
        </div>
      );
    }

    if (t === 'json' || t === 'requirements' || t === 'timer' || t === 'giftRewardSpec' || t === 'outcomeBlock' || t === 'costObject') {
      const safeVal = value ?? (fieldDef.default !== undefined ? fieldDef.default : {});
      return (
        <JSONField
          value={safeVal}
          onChange={onChange}
          onBlur={touch}
          touched={touched}
          error={error}
          path={fieldName}
        />
      );
    }

    if (t === 'assetKey' || isAssetKeyField(fieldName)) {
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={touch}
            placeholder={`e.g. media/icon.png`}
            style={{ ...inputStyle, flex: 1, borderColor }}
          />
          <button
            type="button"
            onClick={() => setUploaderOpen(true)}
            title="Browse or upload media"
            style={{
              padding: '0 10px', background: '#1a1a2e', border: '1px solid #444',
              borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#a78bfa',
              flexShrink: 0,
            }}
          >
            🖼
          </button>
          {uploaderOpen && (
            <MediaUploader
              fieldName={fieldName}
              onInsert={v => { onChange(v); touch(); }}
              onClose={() => setUploaderOpen(false)}
            />
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={touch}
        style={{ ...inputStyle, borderColor }}
        placeholder={fieldDef.description}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>
          {fieldName}
          {isRequired && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        </label>
        {fieldDef.description && (
          <span style={{ fontSize: 11, color: '#555' }}>— {fieldDef.description}</span>
        )}
      </div>
      {renderField()}
      {error && touched && (
        <div style={{ color: '#ef4444', fontSize: 11 }}>{error}</div>
      )}
    </div>
  );
}

import { useState } from 'react';
import CollapsibleObject from '../CollapsibleObject';
import RefSelect from '../RefSelect';
import TimerEditor from './TimerEditor';
import ResourceEntryListEditor, { resourceEntryListErrorCount, resourceEntryListErrorMessages } from './ResourceEntryListEditor';
import type { ResourceEntry } from './ResourceEntryListEditor';
import {
  containerStyle,
  entryCardStyle,
  sectionStyle,
  addButtonStyle,
  dangerIconButtonStyle,
  labelStyle,
  fieldGroupStyle,
  numberInputStyle,
  selectStyle,
} from './editorStyles';
import { errorTextStyle, errorWrapperStyle } from './validation';

export type EntityLevelRulesMode = 'location' | 'building' | 'room';

// ─── Local types ──────────────────────────────────────────────────────────────

type XpCurve = 'linear' | 'exp' | 'custom';
type OnStarve = 'starved' | 'paused';

interface XpDepositCost {
  type: 'currency' | 'item';
  id: string;
  amount: number;
  xpPerCharge: number;
}

interface AllowedBuilding {
  buildingDefId: string;
  maxCount?: number;
  minCount?: number;
}

interface AllowedRoom {
  roomDefId: string;
  maxCount?: number;
  minCount?: number;
}

interface LevelBlock {
  xpThreshold?: number;
  workers?: { slots: number };
  buildings?: { slots: number; allowed?: AllowedBuilding[] };
  rooms?: { allowed?: AllowedRoom[] };
  storage?: ResourceEntry[];
  production?: ResourceEntry[];
  consumption?: ResourceEntry[];
  constructionCost?: ResourceEntry[];
  effects?: Record<string, unknown>;
  onStarve?: OnStarve;
  timer?: Record<string, any>;
  [key: string]: unknown;
}

interface EntityLevelRules {
  maxLevel?: number;
  xpCurve?: XpCurve;
  baseXP?: number;
  xpRate?: number;
  xpDepositCosts?: XpDepositCost[];
  level?: Record<string, LevelBlock>;
  uniques?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Known field sets (used to preserve unknown fields) ───────────────────────

const KNOWN_ROOT_FIELDS_LOCATION = new Set([
  'maxLevel', 'xpCurve', 'baseXP', 'xpRate', 'xpDepositCosts', 'level', 'uniques',
]);

const KNOWN_ROOT_FIELDS_ENTITY = new Set(['maxLevel', 'level']);

const KNOWN_BLOCK_FIELDS = new Set([
  'xpThreshold', 'workers', 'buildings', 'rooms',
  'storage', 'production', 'consumption', 'constructionCost',
  'effects', 'onStarve', 'timer',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSortedLevelKeys(level: Record<string, unknown>): string[] {
  return Object.keys(level).sort((a, b) => Number(a) - Number(b));
}

function getNextLevelKey(level: Record<string, unknown>): string {
  const keys = Object.keys(level).map(Number).filter(n => !isNaN(n));
  if (keys.length === 0) return '1';
  return String(Math.max(...keys) + 1);
}

function isValidLevelKey(input: string): boolean {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SUBSECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: '#60a5fa',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
};

function SubSectionHeader({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={SUBSECTION_LABEL}>{label}</span>
      <button
        type="button"
        style={{ ...dangerIconButtonStyle, fontSize: 10 }}
        onClick={onRemove}
        title={`Remove ${label}`}
      >
        × remove
      </button>
    </div>
  );
}

// ─── XP Deposit Costs editor ──────────────────────────────────────────────────

function validateDepositCost(c: XpDepositCost): { id?: string; amount?: string; xpPerCharge?: string } {
  const errs: { id?: string; amount?: string; xpPerCharge?: string } = {};
  if (!c.id || c.id.trim() === '') errs.id = 'id required';
  if (!c.amount || c.amount <= 0) errs.amount = 'amount must be > 0';
  if (!c.xpPerCharge || c.xpPerCharge <= 0) errs.xpPerCharge = 'xpPerCharge must be > 0';
  return errs;
}

export function xpDepositCostsErrorCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return (value as XpDepositCost[]).reduce(
    (n, c) => n + Object.keys(validateDepositCost(c)).length,
    0,
  );
}

function XpDepositCostRow({ cost, onChange, onRemove }: {
  cost: XpDepositCost;
  onChange: (c: XpDepositCost) => void;
  onRemove: () => void;
}) {
  const errs = validateDepositCost(cost);
  return (
    <div style={entryCardStyle}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ ...fieldGroupStyle, maxWidth: 100 }}>
          <span style={labelStyle}>type</span>
          <select
            value={cost.type || 'currency'}
            onChange={e => onChange({ ...cost, type: e.target.value as 'currency' | 'item' })}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="currency">currency</option>
            <option value="item">item</option>
          </select>
        </div>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 140 }}>
          <span style={labelStyle}>id</span>
          <div style={errs.id ? errorWrapperStyle : undefined}>
            <RefSelect
              refTable={cost.type === 'item' ? 'ItemDef' : 'Currency'}
              value={cost.id || null}
              onChange={v => onChange({ ...cost, id: v ?? '' })}
              placeholder={`Select ${cost.type === 'item' ? 'ItemDef' : 'Currency'}...`}
            />
          </div>
          {errs.id && <span style={errorTextStyle}>{errs.id}</span>}
        </div>
        <div style={{ ...fieldGroupStyle, maxWidth: 90 }}>
          <span style={labelStyle}>amount</span>
          <input
            type="number"
            min={1}
            value={cost.amount ?? ''}
            onChange={e => onChange({ ...cost, amount: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{
              ...numberInputStyle, width: '100%',
              borderColor: errs.amount ? '#ef4444' : (numberInputStyle.borderColor as string | undefined),
            }}
          />
          {errs.amount && <span style={{ color: '#ef4444', fontSize: 11 }}>{errs.amount}</span>}
        </div>
        <div style={{ ...fieldGroupStyle, maxWidth: 100 }}>
          <span style={labelStyle}>xpPerCharge</span>
          <input
            type="number"
            min={1}
            value={cost.xpPerCharge ?? ''}
            onChange={e => onChange({ ...cost, xpPerCharge: e.target.value === '' ? 0 : Number(e.target.value) })}
            style={{
              ...numberInputStyle, width: '100%',
              borderColor: errs.xpPerCharge ? '#ef4444' : (numberInputStyle.borderColor as string | undefined),
            }}
          />
          {errs.xpPerCharge && <span style={{ color: '#ef4444', fontSize: 11 }}>{errs.xpPerCharge}</span>}
        </div>
        <div style={{ paddingBottom: 1 }}>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
    </div>
  );
}

function XpDepositCostsEditor({ value, onChange }: {
  value: unknown;
  onChange: (v: XpDepositCost[]) => void;
}) {
  const items: XpDepositCost[] = Array.isArray(value) ? (value as XpDepositCost[]) : [];
  const update = (idx: number, next: XpDepositCost) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };
  return (
    <div style={containerStyle}>
      {items.map((cost, idx) => (
        <XpDepositCostRow
          key={idx}
          cost={cost}
          onChange={next => update(idx, next)}
          onRemove={() => onChange(items.filter((_, i) => i !== idx))}
        />
      ))}
      <button
        type="button"
        style={addButtonStyle}
        onClick={() => onChange([...items, { type: 'currency', id: '', amount: 1, xpPerCharge: 1 }])}
      >
        + Add deposit option
      </button>
    </div>
  );
}

// ─── Allowed buildings / rooms editors ───────────────────────────────────────

function AllowedBuildingRow({ entry, onChange, onRemove }: {
  entry: AllowedBuilding;
  onChange: (e: AllowedBuilding) => void;
  onRemove: () => void;
}) {
  const hasErr = !entry.buildingDefId || entry.buildingDefId.trim() === '';
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
        <span style={labelStyle}>buildingDefId</span>
        <div style={hasErr ? errorWrapperStyle : undefined}>
          <RefSelect
            refTable="BuildingDef"
            value={entry.buildingDefId || null}
            onChange={v => onChange({ ...entry, buildingDefId: v ?? '' })}
            placeholder="Select BuildingDef..."
          />
        </div>
        {hasErr && <span style={errorTextStyle}>required</span>}
      </div>
      <div style={{ ...fieldGroupStyle, maxWidth: 68 }}>
        <span style={labelStyle}>min</span>
        <input
          type="number"
          min={0}
          value={entry.minCount ?? ''}
          onChange={e => onChange({ ...entry, minCount: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%' }}
          placeholder="—"
        />
      </div>
      <div style={{ ...fieldGroupStyle, maxWidth: 68 }}>
        <span style={labelStyle}>max</span>
        <input
          type="number"
          min={0}
          value={entry.maxCount ?? ''}
          onChange={e => onChange({ ...entry, maxCount: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%' }}
          placeholder="—"
        />
      </div>
      <div style={{ paddingBottom: 1 }}>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
      </div>
    </div>
  );
}

function AllowedRoomRow({ entry, onChange, onRemove }: {
  entry: AllowedRoom;
  onChange: (e: AllowedRoom) => void;
  onRemove: () => void;
}) {
  const hasErr = !entry.roomDefId || entry.roomDefId.trim() === '';
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
        <span style={labelStyle}>roomDefId</span>
        <div style={hasErr ? errorWrapperStyle : undefined}>
          <RefSelect
            refTable="RoomDef"
            value={entry.roomDefId || null}
            onChange={v => onChange({ ...entry, roomDefId: v ?? '' })}
            placeholder="Select RoomDef..."
          />
        </div>
        {hasErr && <span style={errorTextStyle}>required</span>}
      </div>
      <div style={{ ...fieldGroupStyle, maxWidth: 68 }}>
        <span style={labelStyle}>min</span>
        <input
          type="number"
          min={0}
          value={entry.minCount ?? ''}
          onChange={e => onChange({ ...entry, minCount: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%' }}
          placeholder="—"
        />
      </div>
      <div style={{ ...fieldGroupStyle, maxWidth: 68 }}>
        <span style={labelStyle}>max</span>
        <input
          type="number"
          min={0}
          value={entry.maxCount ?? ''}
          onChange={e => onChange({ ...entry, maxCount: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%' }}
          placeholder="—"
        />
      </div>
      <div style={{ paddingBottom: 1 }}>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
      </div>
    </div>
  );
}

// ─── Level block editor ───────────────────────────────────────────────────────

function LevelBlockEditor({
  levelKey,
  block,
  mode,
  xpCurve,
  onChange,
  onRemove,
}: {
  levelKey: string;
  block: LevelBlock;
  mode: EntityLevelRulesMode;
  xpCurve: XpCurve | undefined;
  onChange: (b: LevelBlock) => void;
  onRemove: () => void;
}) {
  const safe: LevelBlock = (block && typeof block === 'object' && !Array.isArray(block)) ? block : {};
  const safeMap = safe as Record<string, unknown>;

  const isLocation = mode === 'location';
  const isRoom = mode === 'room';

  const setField = (key: string, val: unknown) => onChange({ ...safe, [key]: val });
  const removeField = (key: string) => {
    const next = { ...safeMap };
    delete next[key];
    onChange(next as LevelBlock);
  };

  const unknownFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(safeMap)) {
    if (!KNOWN_BLOCK_FIELDS.has(k)) unknownFields[k] = v;
  }

  const hasXpThreshold = 'xpThreshold' in safe;
  const hasTimer = 'timer' in safe;
  const hasWorkers = 'workers' in safe;
  const hasBuildings = 'buildings' in safe;
  const hasRooms = 'rooms' in safe;
  const hasStorage = 'storage' in safe;
  const hasProduction = 'production' in safe;
  const hasConsumption = 'consumption' in safe;
  const hasConstructionCost = 'constructionCost' in safe;
  const hasEffects = 'effects' in safe;
  const hasOnStarve = 'onStarve' in safe;

  const workers = (safe.workers && typeof safe.workers === 'object' && !Array.isArray(safe.workers))
    ? safe.workers as { slots: number }
    : null;
  const buildings = (safe.buildings && typeof safe.buildings === 'object' && !Array.isArray(safe.buildings))
    ? safe.buildings as { slots: number; allowed?: AllowedBuilding[] }
    : null;
  const rooms = (safe.rooms && typeof safe.rooms === 'object' && !Array.isArray(safe.rooms))
    ? safe.rooms as { allowed?: AllowedRoom[] }
    : null;

  return (
    <div style={{ ...entryCardStyle, border: '1px solid #2a3a6e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700, flex: 1 }}>
          Level {levelKey}
        </span>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove level">×</button>
      </div>

      {/* xpThreshold — location only, custom curve */}
      {isLocation && xpCurve === 'custom' && hasXpThreshold && (
        <div style={sectionStyle}>
          <SubSectionHeader label="xpThreshold" onRemove={() => removeField('xpThreshold')} />
          <input
            type="number"
            min={0}
            value={safe.xpThreshold ?? ''}
            onChange={e => setField('xpThreshold', e.target.value === '' ? undefined : Number(e.target.value))}
            style={{ ...numberInputStyle, width: 160 }}
            placeholder="XP needed to reach this level"
          />
        </div>
      )}

      {/* timer — all modes */}
      {hasTimer && (
        <div style={sectionStyle}>
          <SubSectionHeader label="timer" onRemove={() => removeField('timer')} />
          <TimerEditor value={safe.timer ?? {}} onChange={v => setField('timer', v)} />
        </div>
      )}

      {/* workers */}
      {hasWorkers && (
        <div style={sectionStyle}>
          <SubSectionHeader label="workers" onRemove={() => removeField('workers')} />
          <div style={{ ...fieldGroupStyle, maxWidth: 120 }}>
            <span style={labelStyle}>slots</span>
            <input
              type="number"
              min={0}
              value={workers?.slots ?? ''}
              onChange={e => setField('workers', { ...(workers ?? {}), slots: e.target.value === '' ? 0 : Number(e.target.value) })}
              style={{ ...numberInputStyle, width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* buildings — location only */}
      {isLocation && hasBuildings && (
        <div style={sectionStyle}>
          <SubSectionHeader label="buildings" onRemove={() => removeField('buildings')} />
          <div style={{ ...fieldGroupStyle, maxWidth: 120 }}>
            <span style={labelStyle}>slots (total)</span>
            <input
              type="number"
              min={0}
              value={buildings?.slots ?? ''}
              onChange={e => setField('buildings', {
                ...(buildings ?? { slots: 0 }),
                slots: e.target.value === '' ? 0 : Number(e.target.value),
              })}
              style={{ ...numberInputStyle, width: '100%' }}
            />
          </div>
          <div>
            <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>allowed buildings</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(buildings?.allowed ?? []).map((ab, idx) => (
                <AllowedBuildingRow
                  key={idx}
                  entry={ab}
                  onChange={next => {
                    const allowed = (buildings?.allowed ?? []).slice();
                    allowed[idx] = next;
                    setField('buildings', { ...(buildings ?? { slots: 0 }), allowed });
                  }}
                  onRemove={() => {
                    const allowed = (buildings?.allowed ?? []).filter((_, i) => i !== idx);
                    setField('buildings', { ...(buildings ?? { slots: 0 }), allowed });
                  }}
                />
              ))}
              <button
                type="button"
                style={addButtonStyle}
                onClick={() => {
                  const allowed = [...(buildings?.allowed ?? []), { buildingDefId: '' }];
                  setField('buildings', { ...(buildings ?? { slots: 0 }), allowed });
                }}
              >
                + Add building
              </button>
            </div>
          </div>
        </div>
      )}

      {/* rooms.allowed — location + building (not room) */}
      {!isRoom && hasRooms && (
        <div style={sectionStyle}>
          <SubSectionHeader label="rooms" onRemove={() => removeField('rooms')} />
          <div>
            <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>allowed rooms</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(rooms?.allowed ?? []).map((ar, idx) => (
                <AllowedRoomRow
                  key={idx}
                  entry={ar}
                  onChange={next => {
                    const allowed = (rooms?.allowed ?? []).slice();
                    allowed[idx] = next;
                    setField('rooms', { allowed });
                  }}
                  onRemove={() => {
                    const allowed = (rooms?.allowed ?? []).filter((_, i) => i !== idx);
                    setField('rooms', { allowed });
                  }}
                />
              ))}
              <button
                type="button"
                style={addButtonStyle}
                onClick={() => {
                  const allowed = [...(rooms?.allowed ?? []), { roomDefId: '' }];
                  setField('rooms', { allowed });
                }}
              >
                + Add room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* storage */}
      {hasStorage && (
        <div style={sectionStyle}>
          <SubSectionHeader label="storage" onRemove={() => removeField('storage')} />
          <ResourceEntryListEditor
            value={safe.storage}
            onChange={v => setField('storage', v)}
            primaryField="baseCapacity"
          />
        </div>
      )}

      {/* production */}
      {hasProduction && (
        <div style={sectionStyle}>
          <SubSectionHeader label="production" onRemove={() => removeField('production')} />
          <ResourceEntryListEditor
            value={safe.production}
            onChange={v => setField('production', v)}
            primaryField="ratePerHour"
          />
        </div>
      )}

      {/* consumption */}
      {hasConsumption && (
        <div style={sectionStyle}>
          <SubSectionHeader label="consumption" onRemove={() => removeField('consumption')} />
          <ResourceEntryListEditor
            value={safe.consumption}
            onChange={v => setField('consumption', v)}
            primaryField="ratePerHour"
          />
        </div>
      )}

      {/* constructionCost */}
      {hasConstructionCost && (
        <div style={sectionStyle}>
          <SubSectionHeader label="constructionCost" onRemove={() => removeField('constructionCost')} />
          <ResourceEntryListEditor
            value={safe.constructionCost}
            onChange={v => setField('constructionCost', v)}
            primaryField="amount"
          />
        </div>
      )}

      {/* onStarve */}
      {hasOnStarve && (
        <div style={sectionStyle}>
          <SubSectionHeader label="onStarve" onRemove={() => removeField('onStarve')} />
          <select
            value={(safe.onStarve as string) || 'starved'}
            onChange={e => setField('onStarve', e.target.value)}
            style={{ ...selectStyle, width: 140 }}
          >
            <option value="starved">starved</option>
            <option value="paused">paused</option>
          </select>
        </div>
      )}

      {/* effects */}
      {hasEffects && (
        <div style={sectionStyle}>
          <SubSectionHeader label="effects" onRemove={() => removeField('effects')} />
          <CollapsibleObject
            value={safe.effects ?? {}}
            onChange={v => setField('effects', v)}
            path={`level.${levelKey}.effects`}
          />
        </div>
      )}

      {/* unknown fields catch-all */}
      {Object.keys(unknownFields).length > 0 && (
        <div style={sectionStyle}>
          <span style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>other fields</span>
          <CollapsibleObject
            value={unknownFields}
            onChange={newUnknown => {
              const next: Record<string, unknown> = {};
              for (const k of KNOWN_BLOCK_FIELDS) {
                if (k in safeMap) next[k] = safeMap[k];
              }
              Object.assign(next, newUnknown);
              onChange(next as LevelBlock);
            }}
            path={`level.${levelKey}`}
          />
        </div>
      )}

      {/* Add-field buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {isLocation && xpCurve === 'custom' && !hasXpThreshold && (
          <button type="button" style={addButtonStyle} onClick={() => setField('xpThreshold', 0)}>+ xpThreshold</button>
        )}
        {!hasTimer && (
          <button type="button" style={addButtonStyle} onClick={() => setField('timer', { duration: 0, boostable: true, skipable: false })}>+ timer</button>
        )}
        {!hasWorkers && (
          <button type="button" style={addButtonStyle} onClick={() => setField('workers', { slots: 0 })}>+ workers</button>
        )}
        {isLocation && !hasBuildings && (
          <button type="button" style={addButtonStyle} onClick={() => setField('buildings', { slots: 0, allowed: [] })}>+ buildings</button>
        )}
        {!isRoom && !hasRooms && (
          <button type="button" style={addButtonStyle} onClick={() => setField('rooms', { allowed: [] })}>+ rooms</button>
        )}
        {!hasStorage && (
          <button type="button" style={addButtonStyle} onClick={() => setField('storage', [])}>+ storage</button>
        )}
        {!hasProduction && (
          <button type="button" style={addButtonStyle} onClick={() => setField('production', [])}>+ production</button>
        )}
        {!hasConsumption && (
          <button type="button" style={addButtonStyle} onClick={() => setField('consumption', [])}>+ consumption</button>
        )}
        {!hasConstructionCost && (
          <button type="button" style={addButtonStyle} onClick={() => setField('constructionCost', [])}>+ constructionCost</button>
        )}
        {!hasOnStarve && (
          <button type="button" style={addButtonStyle} onClick={() => setField('onStarve', 'starved')}>+ onStarve</button>
        )}
        {!hasEffects && (
          <button type="button" style={addButtonStyle} onClick={() => setField('effects', {})}>+ effects</button>
        )}
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

interface Props {
  value: any;
  onChange: (v: any) => void;
  mode: EntityLevelRulesMode;
}

export default function EntityLevelRulesEditor({ value, onChange, mode }: Props) {
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const isLocation = mode === 'location';
  const maxLevelPlaceholder = isLocation ? 'default: 50' : 'default: 10';

  const safe: EntityLevelRules = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as EntityLevelRules
    : {};
  const safeMap = safe as Record<string, unknown>;

  const level: Record<string, LevelBlock> = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level))
    ? safe.level as Record<string, LevelBlock>
    : {};
  const sortedKeys = getSortedLevelKeys(level);
  const xpCurve = safe.xpCurve as XpCurve | undefined;

  const knownRoots = isLocation ? KNOWN_ROOT_FIELDS_LOCATION : KNOWN_ROOT_FIELDS_ENTITY;
  const unknownRootFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(safeMap)) {
    if (!knownRoots.has(k)) unknownRootFields[k] = v;
  }

  const set = (key: string, val: unknown) => onChange({ ...safe, [key]: val });
  const remove = (key: string) => {
    const next = { ...safeMap };
    delete next[key];
    onChange(next);
  };

  const setLevelEntry = (key: string, block: LevelBlock) =>
    onChange({ ...safe, level: { ...level, [key]: block } });

  const removeLevelEntry = (key: string) => {
    const next = { ...level };
    delete next[key];
    onChange({ ...safe, level: next });
  };

  const addLevel = () => {
    const key = getNextLevelKey(level);
    onChange({ ...safe, level: { ...level, [key]: {} } });
  };

  const startRename = (key: string) => {
    setRenamingKey(key);
    setRenameInput(key);
    setRenameError(null);
  };

  const commitRename = (oldKey: string) => {
    const newKey = renameInput.trim();
    if (newKey === oldKey) { setRenamingKey(null); return; }
    if (!isValidLevelKey(newKey)) {
      setRenameError('Level key must be a positive integer (e.g. 1, 2, 3)');
      return;
    }
    if (newKey in level) {
      setRenameError(`Level ${newKey} already exists`);
      return;
    }
    const next: Record<string, LevelBlock> = {};
    for (const k of sortedKeys) {
      if (k === oldKey) next[newKey] = level[k];
      else next[k] = level[k];
    }
    onChange({ ...safe, level: next });
    setRenamingKey(null);
    setRenameError(null);
  };

  return (
    <div style={containerStyle}>

      {/* ── XP Curve Settings (location only) ── */}
      {isLocation && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            XP Curve Settings
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ ...fieldGroupStyle, maxWidth: 120 }}>
              <span style={labelStyle}>maxLevel</span>
              <input
                type="number"
                min={1}
                value={safe.maxLevel ?? ''}
                onChange={e => set('maxLevel', e.target.value === '' ? undefined : Number(e.target.value))}
                style={{ ...numberInputStyle, width: '100%' }}
                placeholder={maxLevelPlaceholder}
              />
            </div>
            <div style={{ ...fieldGroupStyle, maxWidth: 120 }}>
              <span style={labelStyle}>xpCurve</span>
              <select
                value={safe.xpCurve || ''}
                onChange={e => set('xpCurve', e.target.value || undefined)}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="">— none —</option>
                <option value="linear">linear</option>
                <option value="exp">exp</option>
                <option value="custom">custom</option>
              </select>
            </div>
            {xpCurve !== 'custom' && (
              <>
                <div style={{ ...fieldGroupStyle, maxWidth: 100 }}>
                  <span style={labelStyle}>baseXP</span>
                  <input
                    type="number"
                    min={1}
                    value={safe.baseXP ?? ''}
                    onChange={e => set('baseXP', e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ ...numberInputStyle, width: '100%' }}
                    placeholder="e.g. 100"
                  />
                </div>
                <div style={{ ...fieldGroupStyle, maxWidth: 100 }}>
                  <span style={labelStyle}>xpRate</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={safe.xpRate ?? ''}
                    onChange={e => set('xpRate', e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ ...numberInputStyle, width: '100%' }}
                    placeholder="e.g. 1.5"
                  />
                </div>
              </>
            )}
          </div>
          {xpCurve === 'custom' && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Custom curve — set xpThreshold on each level block below.
            </div>
          )}
        </div>
      )}

      {/* ── maxLevel (building/room) ── */}
      {!isLocation && (
        <div style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <div style={{ ...fieldGroupStyle, maxWidth: 160 }}>
            <span style={labelStyle}>maxLevel</span>
            <input
              type="number"
              min={1}
              value={safe.maxLevel ?? ''}
              onChange={e => set('maxLevel', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%' }}
              placeholder={maxLevelPlaceholder}
            />
          </div>
          <div style={{ flex: 1, fontSize: 11, color: '#666' }}>
            {sortedKeys.length} level{sortedKeys.length !== 1 ? 's' : ''} defined
          </div>
        </div>
      )}

      {/* ── XP Deposit Costs (location only) ── */}
      {isLocation && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, color: '#fb923c', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            XP Deposit Costs
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
            Options players can spend to deposit XP. Leave empty to use the game default.
          </div>
          <XpDepositCostsEditor
            value={safe.xpDepositCosts}
            onChange={v => {
              if (v.length > 0) set('xpDepositCosts', v);
              else remove('xpDepositCosts');
            }}
          />
        </div>
      )}

      {/* ── Level map header (location) ── */}
      {isLocation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Levels
          </span>
          <span style={{ fontSize: 11, color: '#555' }}>
            {sortedKeys.length} defined
          </span>
        </div>
      )}

      {/* ── Level entries ── */}
      {sortedKeys.map((key) => {
        const isRenaming = renamingKey === key;
        return (
          <div key={key}>
            {isRenaming ? (
              <div style={{ ...entryCardStyle, flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>Level key (positive integer):</span>
                  <input
                    autoFocus
                    type="text"
                    value={renameInput}
                    onChange={e => { setRenameInput(e.target.value); setRenameError(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(key);
                      if (e.key === 'Escape') { setRenamingKey(null); setRenameError(null); }
                    }}
                    style={{
                      ...numberInputStyle,
                      width: 80,
                      borderColor: renameError ? '#ef4444' : (numberInputStyle.borderColor as string | undefined),
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => commitRename(key)}
                    style={{ padding: '3px 8px', background: '#a78bfa', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 11 }}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenamingKey(null); setRenameError(null); }}
                    style={{ padding: '3px 8px', background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: 11 }}
                  >
                    Cancel
                  </button>
                </div>
                {renameError && (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>{renameError}</span>
                )}
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => startRename(key)}
                  style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: '1px 4px', marginBottom: 2, display: 'block' }}
                  title="Click to rename this level key (must be a positive integer)"
                >
                  rename key
                </button>
                <LevelBlockEditor
                  levelKey={key}
                  block={level[key] ?? {}}
                  mode={mode}
                  xpCurve={xpCurve}
                  onChange={v => setLevelEntry(key, v)}
                  onRemove={() => removeLevelEntry(key)}
                />
              </div>
            )}
          </div>
        );
      })}

      <button type="button" style={addButtonStyle} onClick={addLevel}>
        + Add Level
      </button>

      {/* ── Unique NFT Powers (location only) ── */}
      {isLocation && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            Unique NFT Powers (uniques)
          </div>
          <CollapsibleObject
            value={safe.uniques ?? {}}
            onChange={v => {
              if (!v || Object.keys(v as object).length === 0) remove('uniques');
              else set('uniques', v);
            }}
            path="uniques"
          />
        </div>
      )}

      {/* ── Unknown root fields catch-all ── */}
      {Object.keys(unknownRootFields).length > 0 && (
        <div style={sectionStyle}>
          <span style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>other root fields</span>
          <CollapsibleObject
            value={unknownRootFields}
            onChange={newUnknown => {
              const next: Record<string, unknown> = {};
              for (const k of knownRoots) {
                if (k in safeMap) next[k] = safeMap[k];
              }
              Object.assign(next, newUnknown);
              onChange(next);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function entityLevelRulesErrorCount(value: unknown, mode: EntityLevelRulesMode): number {
  const safe: EntityLevelRules = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as EntityLevelRules
    : {};
  let n = 0;

  if (safe.maxLevel !== undefined && safe.maxLevel !== null && (typeof safe.maxLevel !== 'number' || safe.maxLevel < 1)) n++;

  if (mode === 'location') {
    n += xpDepositCostsErrorCount(safe.xpDepositCosts);
  }

  const level = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level))
    ? safe.level as Record<string, LevelBlock>
    : {};

  for (const block of Object.values(level)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;

    if ('timer' in block && block.timer && typeof block.timer === 'object') {
      const d = (block.timer as any).duration;
      if (d === undefined || d === null || isNaN(Number(d)) || Number(d) < 0) n++;
    }

    n += resourceEntryListErrorCount(block.storage, 'baseCapacity');
    n += resourceEntryListErrorCount(block.production, 'ratePerHour');
    n += resourceEntryListErrorCount(block.consumption, 'ratePerHour');
    n += resourceEntryListErrorCount(block.constructionCost, 'amount');

    if (mode === 'location') {
      for (const ab of (block.buildings?.allowed ?? [])) {
        if (!ab.buildingDefId || ab.buildingDefId.trim() === '') n++;
      }
    }
    if (mode !== 'room') {
      for (const ar of (block.rooms?.allowed ?? [])) {
        if (!ar.roomDefId || ar.roomDefId.trim() === '') n++;
      }
    }
  }

  return n;
}

export function entityLevelRulesErrorMessages(value: unknown, mode: EntityLevelRulesMode, fieldName: string): string[] {
  const safe: EntityLevelRules = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as EntityLevelRules
    : {};
  const msgs: string[] = [];

  if (safe.maxLevel !== undefined && safe.maxLevel !== null && (typeof safe.maxLevel !== 'number' || safe.maxLevel < 1)) {
    msgs.push(`${fieldName}.maxLevel: must be a positive integer`);
  }

  if (mode === 'location' && Array.isArray(safe.xpDepositCosts)) {
    (safe.xpDepositCosts as XpDepositCost[]).forEach((c, i) => {
      const errs = validateDepositCost(c);
      Object.entries(errs).forEach(([key, msg]) => {
        msgs.push(`${fieldName}.xpDepositCosts[${i}].${key}: ${msg}`);
      });
    });
  }

  const level = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level))
    ? safe.level as Record<string, LevelBlock>
    : {};

  for (const [levelKey, block] of Object.entries(level)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;

    if ('timer' in block && block.timer && typeof block.timer === 'object') {
      const d = (block.timer as any).duration;
      if (d === undefined || d === null || isNaN(Number(d)) || Number(d) < 0) {
        msgs.push(`${fieldName}.level[${levelKey}].timer.duration: must be a non-negative number`);
      }
    }

    msgs.push(...resourceEntryListErrorMessages(block.storage, 'baseCapacity', `${fieldName}.level[${levelKey}].storage`));
    msgs.push(...resourceEntryListErrorMessages(block.production, 'ratePerHour', `${fieldName}.level[${levelKey}].production`));
    msgs.push(...resourceEntryListErrorMessages(block.consumption, 'ratePerHour', `${fieldName}.level[${levelKey}].consumption`));
    msgs.push(...resourceEntryListErrorMessages(block.constructionCost, 'amount', `${fieldName}.level[${levelKey}].constructionCost`));

    if (mode === 'location') {
      (block.buildings?.allowed ?? []).forEach((ab, idx) => {
        if (!ab.buildingDefId || ab.buildingDefId.trim() === '') {
          msgs.push(`${fieldName}.level[${levelKey}].buildings.allowed[${idx}]: buildingDefId required`);
        }
      });
    }
    if (mode !== 'room') {
      (block.rooms?.allowed ?? []).forEach((ar, idx) => {
        if (!ar.roomDefId || ar.roomDefId.trim() === '') {
          msgs.push(`${fieldName}.level[${levelKey}].rooms.allowed[${idx}]: roomDefId required`);
        }
      });
    }
  }

  return msgs;
}

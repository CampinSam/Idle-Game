import { useState } from 'react';
import CollapsibleObject from '../CollapsibleObject';
import CostListEditor from './CostListEditor';
import TimerEditor from './TimerEditor';
import {
  containerStyle,
  entryCardStyle,
  addButtonStyle,
  dangerIconButtonStyle,
  labelStyle,
  fieldGroupStyle,
  numberInputStyle,
  sectionStyle,
} from './editorStyles';

const KNOWN_LEVEL_FIELDS = new Set(['timer', 'constructionCost']);

interface LevelRulesValue {
  level?: Record<string, any>;
  maxLevel?: number;
  [k: string]: any;
}

interface Props {
  value: any;
  onChange: (v: any) => void;
}

function getSortedLevelKeys(level: Record<string, any>): string[] {
  return Object.keys(level).sort((a, b) => Number(a) - Number(b));
}

function getNextLevelKey(level: Record<string, any>): string {
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

function getUnknownFields(levelEntry: any): Record<string, any> {
  if (!levelEntry || typeof levelEntry !== 'object' || Array.isArray(levelEntry)) return {};
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(levelEntry)) {
    if (!KNOWN_LEVEL_FIELDS.has(k)) result[k] = v;
  }
  return result;
}

function updateUnknownFields(levelEntry: any, newUnknown: Record<string, any>): any {
  const next: any = {};
  for (const k of KNOWN_LEVEL_FIELDS) {
    if (k in (levelEntry ?? {})) next[k] = levelEntry[k];
  }
  return { ...next, ...newUnknown };
}

function LevelEntryEditor({
  levelKey,
  entry,
  onChange,
  onRemove,
}: {
  levelKey: string;
  entry: any;
  onChange: (v: any) => void;
  onRemove: () => void;
}) {
  const safe = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : {};

  const hasTimer = 'timer' in safe;
  const hasCost = 'constructionCost' in safe;
  const unknownFields = getUnknownFields(safe);

  const setField = (key: string, val: any) => onChange({ ...safe, [key]: val });
  const removeField = (key: string) => {
    const next = { ...safe };
    delete next[key];
    onChange(next);
  };

  return (
    <div style={{ ...entryCardStyle, border: '1px solid #3a3a6e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700, flex: 1 }}>
          Level {levelKey}
        </span>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove level">×</button>
      </div>

      {hasTimer && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...labelStyle, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>timer</span>
            <button
              type="button"
              style={{ ...dangerIconButtonStyle, fontSize: 10 }}
              onClick={() => removeField('timer')}
              title="Remove timer"
            >
              × remove
            </button>
          </div>
          <TimerEditor value={safe.timer ?? {}} onChange={v => setField('timer', v)} />
        </div>
      )}

      {hasCost && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...labelStyle, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>constructionCost</span>
            <button
              type="button"
              style={{ ...dangerIconButtonStyle, fontSize: 10 }}
              onClick={() => removeField('constructionCost')}
              title="Remove constructionCost"
            >
              × remove
            </button>
          </div>
          <CostListEditor value={Array.isArray(safe.constructionCost) ? safe.constructionCost : []} onChange={v => setField('constructionCost', v)} />
        </div>
      )}

      <div style={sectionStyle}>
        <span style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>other fields</span>
        <CollapsibleObject
          value={unknownFields}
          onChange={newUnknown => onChange(updateUnknownFields(safe, newUnknown))}
          path={`level.${levelKey}`}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {!hasTimer && (
          <button
            type="button"
            style={addButtonStyle}
            onClick={() => setField('timer', { duration: 0, boostable: true, skipable: false })}
          >
            + timer
          </button>
        )}
        {!hasCost && (
          <button
            type="button"
            style={addButtonStyle}
            onClick={() => setField('constructionCost', [])}
          >
            + constructionCost
          </button>
        )}
      </div>
    </div>
  );
}

export default function LevelRulesEditor({ value, onChange }: Props) {
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const safe: LevelRulesValue = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const level: Record<string, any> = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level)) ? safe.level : {};
  const maxLevel: number | undefined = typeof safe.maxLevel === 'number' ? safe.maxLevel : undefined;

  const sortedKeys = getSortedLevelKeys(level);

  const setMaxLevel = (v: number | undefined) => onChange({ ...safe, maxLevel: v });

  const setLevelEntry = (key: string, entry: any) => {
    onChange({ ...safe, level: { ...level, [key]: entry } });
  };

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
    const next: Record<string, any> = {};
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
      <div style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <div style={{ ...fieldGroupStyle, maxWidth: 160 }}>
          <span style={labelStyle}>maxLevel</span>
          <input
            type="number"
            min={1}
            value={maxLevel ?? ''}
            onChange={e => setMaxLevel(e.target.value === '' ? undefined : Number(e.target.value))}
            style={{ ...numberInputStyle, width: '100%' }}
            placeholder="e.g. 5"
          />
        </div>
        <div style={{ flex: 1, fontSize: 11, color: '#666' }}>
          {sortedKeys.length} level{sortedKeys.length !== 1 ? 's' : ''} defined
        </div>
      </div>

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
                  <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{renameError}</span>
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
                <LevelEntryEditor
                  levelKey={key}
                  entry={level[key]}
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
    </div>
  );
}

export function levelRulesErrorCount(value: any): number {
  const safe = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  let n = 0;

  if (typeof safe.maxLevel !== 'number' || safe.maxLevel < 1) n++;

  const level = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level)) ? safe.level : {};
  for (const entry of Object.values(level)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, any>;
    if ('timer' in e && e.timer && typeof e.timer === 'object') {
      const timerDuration = e.timer.duration;
      if (timerDuration === undefined || timerDuration === null || isNaN(Number(timerDuration)) || Number(timerDuration) < 0) {
        n++;
      }
    }
    if ('constructionCost' in e) {
      const costs = Array.isArray(e.constructionCost) ? e.constructionCost : [];
      for (const cost of costs) {
        const type = cost?.type || 'currency';
        const refKey = type === 'entity' ? cost?.definitionId : cost?.id;
        if (!refKey || String(refKey).trim() === '') n++;
        if (cost?.amount === undefined || cost?.amount === null || isNaN(Number(cost.amount)) || Number(cost.amount) <= 0) n++;
      }
    }
  }

  return n;
}

export function levelRulesErrorMessages(value: any, fieldName: string): string[] {
  const safe = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const msgs: string[] = [];

  if (typeof safe.maxLevel !== 'number' || safe.maxLevel < 1) {
    msgs.push(`${fieldName}.maxLevel: must be a positive integer`);
  }

  const level = (safe.level && typeof safe.level === 'object' && !Array.isArray(safe.level)) ? safe.level : {};
  for (const [levelKey, entry] of Object.entries(level)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, any>;
    if ('timer' in e && e.timer && typeof e.timer === 'object') {
      const timerDuration = e.timer.duration;
      if (timerDuration === undefined || timerDuration === null || isNaN(Number(timerDuration)) || Number(timerDuration) < 0) {
        msgs.push(`${fieldName}.level[${levelKey}].timer.duration: must be a non-negative number`);
      }
    }
    if ('constructionCost' in e) {
      const costs = Array.isArray(e.constructionCost) ? e.constructionCost : [];
      costs.forEach((cost: any, costIdx: number) => {
        const type = cost?.type || 'currency';
        const refKey = type === 'entity' ? cost?.definitionId : cost?.id;
        if (!refKey || String(refKey).trim() === '') {
          msgs.push(`${fieldName}.level[${levelKey}].constructionCost[${costIdx}]: id required`);
        }
        if (cost?.amount === undefined || cost?.amount === null || isNaN(Number(cost.amount)) || Number(cost.amount) <= 0) {
          msgs.push(`${fieldName}.level[${levelKey}].constructionCost[${costIdx}]: amount must be > 0`);
        }
      });
    }
  }

  return msgs;
}

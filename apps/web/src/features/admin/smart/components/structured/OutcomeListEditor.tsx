import { useState } from 'react';
import RefSelect from '../RefSelect';
import CollapsibleObject from '../CollapsibleObject';
import RequirementsListEditor from './RequirementsListEditor';
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
} from './editorStyles';
import {
  validateOutcome,
  ERROR_BORDER_COLOR,
  errorTextStyle,
  errorWrapperStyle,
} from './validation';

type OutcomeKind =
  | 'bundle'
  | 'pick_bundle'
  | 'bundle_ref'
  | 'currency'
  | 'item'
  | 'entity_xp'
  | 'keeper_xp'
  | 'flag'
  | 'text';

interface Outcome {
  type?: string;
  bundle?: any[];
  bundleDefId?: string;
  odds?: number;
  pickMin?: number;
  pickMax?: number;
  key?: string;
  min?: number;
  max?: number;
  message?: string;
  operation?: string;
  value?: any;
  behavior?: string;
  [k: string]: any;
}

interface ListProps {
  value: any;
  onChange: (val: any) => void;
}

function detectKind(entry: Outcome): OutcomeKind {
  if (entry?.type === 'bundle_ref') return 'bundle_ref';
  if (entry && Array.isArray(entry.bundle)) {
    if (entry.pickMin !== undefined || entry.pickMax !== undefined) return 'pick_bundle';
    return 'bundle';
  }
  const t = (entry?.type as string) || '';
  if (t === 'currency') return 'currency';
  if (t === 'item') return 'item';
  if (t === 'entity_xp') return 'entity_xp';
  if (t === 'keeper_xp') return 'keeper_xp';
  if (t === 'flag') return 'flag';
  if (t === 'text') return 'text';
  return 'currency';
}

function defaultForKind(kind: OutcomeKind): Outcome {
  switch (kind) {
    case 'bundle':
      return { bundle: [], odds: 1 };
    case 'pick_bundle':
      return { bundle: [], odds: 1, pickMin: 1, pickMax: 1 };
    case 'bundle_ref':
      return { type: 'bundle_ref', bundleDefId: '' };
    case 'currency':
      return { type: 'currency', key: '', min: 1, max: 10, odds: 1 };
    case 'item':
      return { type: 'item', key: '', min: 1, max: 1, odds: 0.5 };
    case 'entity_xp':
      return { type: 'entity_xp', min: 10, max: 50 };
    case 'keeper_xp':
      return { type: 'keeper_xp', min: 10, max: 50 };
    case 'flag':
      return { type: 'flag', operation: 'set', key: '', value: true };
    case 'text':
      return { type: 'text', message: '' };
  }
}

function summary(entry: Outcome): string {
  const kind = detectKind(entry);
  if (kind === 'bundle') return `bundle (${entry.bundle?.length ?? 0} items)`;
  if (kind === 'pick_bundle') return `pick ${entry.pickMin ?? 1}-${entry.pickMax ?? 1} of ${entry.bundle?.length ?? 0}`;
  if (kind === 'bundle_ref') return `bundle ref → ${entry.bundleDefId || '?'}`;
  if (kind === 'currency') return `currency ${entry.key || '?'} ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'item') return `item ${entry.key || '?'} ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'entity_xp') return `entity_xp ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'keeper_xp') return `keeper_xp ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'flag') return `flag ${entry.operation || 'set'} ${entry.key || '?'}`;
  if (kind === 'text') return `text "${(entry.message || '').slice(0, 30)}"`;
  return 'outcome';
}

function MinMaxOdds({ entry, onChange, showOdds = true, hasRangeError }: { entry: Outcome; onChange: (e: Outcome) => void; showOdds?: boolean; hasRangeError?: boolean }) {
  const rangeBorder = hasRangeError ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined);
  return (
    <>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>min</span>
        <input
          type="number"
          value={entry.min ?? ''}
          onChange={e => onChange({ ...entry, min: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%', borderColor: rangeBorder }}
        />
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>max</span>
        <input
          type="number"
          value={entry.max ?? ''}
          onChange={e => onChange({ ...entry, max: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ ...numberInputStyle, width: '100%', borderColor: rangeBorder }}
        />
      </div>
      {showOdds && (
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>odds</span>
          <input
            type="number"
            step="0.01"
            value={entry.odds ?? ''}
            onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
      )}
    </>
  );
}

function OutcomeEntryEditor({
  entry,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  entry: Outcome;
  onChange: (e: Outcome) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const kind = detectKind(entry);
  const errs = validateOutcome(entry);

  const handleKindChange = (newKind: OutcomeKind) => {
    onChange(defaultForKind(newKind));
  };

  return (
    <div style={entryCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          style={{ ...iconButtonStyle, border: 'none', width: 18 }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ flex: 1, color: '#a78bfa', fontSize: 12, fontWeight: 600 }}>
          {summary(entry)}
        </span>
        <button
          type="button"
          style={ghostButtonStyle}
          onClick={() => setRawMode(r => !r)}
          title="Toggle raw JSON view for power users"
        >
          {rawMode ? 'Form' : 'Raw JSON'}
        </button>
        <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
        <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
      </div>

      {!collapsed && (rawMode ? (
        <div style={{ background: '#0f0f2e', border: '1px solid #2a2a4e', borderRadius: 4, padding: 8 }}>
          <CollapsibleObject value={entry} onChange={onChange} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={entryHeaderStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>kind</span>
              <select
                value={kind}
                onChange={e => handleKindChange(e.target.value as OutcomeKind)}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="bundle">bundle</option>
                <option value="pick_bundle">pick bundle</option>
                <option value="bundle_ref">bundle ref</option>
                <option value="currency">currency</option>
                <option value="item">item</option>
                <option value="entity_xp">entity_xp</option>
                <option value="keeper_xp">keeper_xp</option>
                <option value="flag">flag</option>
                <option value="text">text</option>
              </select>
            </div>

            {(kind === 'currency' || kind === 'item') && (
              <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
                <span style={labelStyle}>key</span>
                <div style={errs.key ? errorWrapperStyle : undefined}>
                  <RefSelect
                    refTable={kind === 'currency' ? 'Currency' : 'ItemDef'}
                    value={entry.key ?? null}
                    onChange={v => onChange({ ...entry, key: v ?? '' })}
                    placeholder={kind === 'currency' ? 'Select Currency...' : 'Select Item...'}
                  />
                </div>
                {errs.key && <span style={errorTextStyle}>{errs.key}</span>}
              </div>
            )}

            {(kind === 'currency' || kind === 'item') && (
              <MinMaxOdds entry={entry} onChange={onChange} hasRangeError={!!errs.range} />
            )}

            {(kind === 'entity_xp' || kind === 'keeper_xp') && (
              <MinMaxOdds entry={entry} onChange={onChange} showOdds={false} hasRangeError={!!errs.range} />
            )}

            {kind === 'flag' && (
              <>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>operation</span>
                  <select
                    value={entry.operation ?? 'set'}
                    onChange={e => onChange({ ...entry, operation: e.target.value })}
                    style={{ ...selectStyle, width: '100%' }}
                  >
                    <option value="set">set</option>
                    <option value="unset">unset</option>
                    <option value="increment">increment</option>
                    <option value="decrement">decrement</option>
                  </select>
                </div>
                <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
                  <span style={labelStyle}>key</span>
                  <input
                    type="text"
                    value={entry.key ?? ''}
                    onChange={e => onChange({ ...entry, key: e.target.value })}
                    style={{ ...inputStyle, width: '100%', borderColor: errs.key ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined) }}
                  />
                  {errs.key && <span style={errorTextStyle}>{errs.key}</span>}
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>value</span>
                  <input
                    type="text"
                    value={entry.value === undefined ? '' : String(entry.value)}
                    onChange={e => {
                      const raw = e.target.value;
                      let v: any = raw;
                      if (raw === 'true') v = true;
                      else if (raw === 'false') v = false;
                      else if (raw !== '' && !isNaN(Number(raw))) v = Number(raw);
                      onChange({ ...entry, value: v });
                    }}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </>
            )}

            {(kind === 'bundle' || kind === 'pick_bundle') && (
              <div style={fieldGroupStyle}>
                <span style={labelStyle}>odds</span>
                <input
                  type="number"
                  step="0.01"
                  value={entry.odds ?? ''}
                  onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                  style={{ ...numberInputStyle, width: '100%' }}
                />
              </div>
            )}

            {kind === 'bundle_ref' && (
              <>
                <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 200 }}>
                  <span style={labelStyle}>bundle def</span>
                  <div style={errs.bundleDefId ? errorWrapperStyle : undefined}>
                    <RefSelect
                      refTable="BundleDef"
                      value={entry.bundleDefId ?? null}
                      onChange={v => onChange({ ...entry, bundleDefId: v ?? '' })}
                      placeholder="Select Bundle..."
                    />
                  </div>
                  {errs.bundleDefId && <span style={errorTextStyle}>{errs.bundleDefId}</span>}
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>odds (override)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={entry.odds ?? ''}
                    placeholder="(use def)"
                    onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>pickMin (override)</span>
                  <input
                    type="number"
                    value={entry.pickMin ?? ''}
                    placeholder="(use def)"
                    onChange={e => onChange({ ...entry, pickMin: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%', borderColor: errs.pickRange ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined) }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>pickMax (override)</span>
                  <input
                    type="number"
                    value={entry.pickMax ?? ''}
                    placeholder="(use def)"
                    onChange={e => onChange({ ...entry, pickMax: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%', borderColor: errs.pickRange ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined) }}
                  />
                </div>
              </>
            )}

            {kind === 'pick_bundle' && (
              <>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>pickMin</span>
                  <input
                    type="number"
                    value={entry.pickMin ?? ''}
                    onChange={e => onChange({ ...entry, pickMin: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%', borderColor: errs.pickRange ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined) }}
                  />
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>pickMax</span>
                  <input
                    type="number"
                    value={entry.pickMax ?? ''}
                    onChange={e => onChange({ ...entry, pickMax: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%', borderColor: errs.pickRange ? ERROR_BORDER_COLOR : (numberInputStyle.borderColor as string | undefined) }}
                  />
                </div>
              </>
            )}
          </div>

          {(errs.range || errs.pickRange || errs.bundle) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {errs.range && <span style={errorTextStyle}>{errs.range}</span>}
              {errs.pickRange && <span style={errorTextStyle}>{errs.pickRange}</span>}
              {errs.bundle && <span style={errorTextStyle}>{errs.bundle}</span>}
            </div>
          )}

          {kind === 'text' && (
            <div style={fieldRowStyle}>
              <div style={{ ...fieldGroupStyle, flex: 1, minWidth: 200 }}>
                <span style={labelStyle}>message</span>
                <textarea
                  value={entry.message ?? ''}
                  onChange={e => onChange({ ...entry, message: e.target.value })}
                  rows={2}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', borderColor: errs.message ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined) }}
                />
                {errs.message && <span style={errorTextStyle}>{errs.message}</span>}
              </div>
              <div style={fieldGroupStyle}>
                <span style={labelStyle}>odds</span>
                <input
                  type="number"
                  step="0.01"
                  value={entry.odds ?? ''}
                  onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                  style={{ ...numberInputStyle, width: '100%' }}
                />
              </div>
            </div>
          )}

          {(kind === 'bundle' || kind === 'pick_bundle') && (
            <div style={{ borderLeft: '2px solid #2a2a4e', marginLeft: 4, paddingLeft: 10 }}>
              <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>bundle entries</span>
              <OutcomeArrayEditor
                items={Array.isArray(entry.bundle) ? entry.bundle : []}
                onChange={v => onChange({ ...entry, bundle: v })}
              />
            </div>
          )}

          {kind === 'bundle_ref' && (
            <div style={{ borderLeft: '2px solid #2a2a4e', marginLeft: 4, paddingLeft: 10 }}>
              <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>requirements (optional)</span>
              <RequirementsListEditor
                value={Array.isArray(entry.requirements) ? entry.requirements : []}
                onChange={v => {
                  const next: any = { ...entry };
                  if (Array.isArray(v) && v.length > 0) next.requirements = v;
                  else delete next.requirements;
                  onChange(next);
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OutcomeArrayEditor({ items, onChange }: { items: Outcome[]; onChange: (v: Outcome[]) => void }) {
  const update = (idx: number, next: Outcome) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const arr = items.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };
  const add = (kind: OutcomeKind) => onChange([...items, defaultForKind(kind)]);

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <OutcomeEntryEditor
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={addButtonStyle} onClick={() => add('bundle')}>+ bundle</button>
        <button type="button" style={addButtonStyle} onClick={() => add('pick_bundle')}>+ pick bundle</button>
        <button type="button" style={addButtonStyle} onClick={() => add('bundle_ref')}>+ bundle ref</button>
        <button type="button" style={addButtonStyle} onClick={() => add('currency')}>+ currency</button>
        <button type="button" style={addButtonStyle} onClick={() => add('item')}>+ item</button>
        <button type="button" style={addButtonStyle} onClick={() => add('entity_xp')}>+ entity_xp</button>
        <button type="button" style={addButtonStyle} onClick={() => add('keeper_xp')}>+ keeper_xp</button>
        <button type="button" style={addButtonStyle} onClick={() => add('flag')}>+ flag</button>
        <button type="button" style={addButtonStyle} onClick={() => add('text')}>+ text</button>
      </div>
    </div>
  );
}

/**
 * Top-level outcome editor. Accepts either:
 *  - an array (e.g. LootboxDef.outcomes) — edits the array directly
 *  - an OutcomeBlock object `{ rewards: [...] }` (e.g. MissionDef.success/failure) — edits the inner rewards
 *  - any other object with no `rewards` key — wraps it as a single-entry array (legacy fallback)
 */
export default function OutcomeListEditor({ value, onChange }: ListProps) {
  if (Array.isArray(value)) {
    return <OutcomeArrayEditor items={value} onChange={onChange} />;
  }

  if (value && typeof value === 'object' && 'rewards' in value && Array.isArray((value as any).rewards)) {
    return (
      <OutcomeArrayEditor
        items={(value as any).rewards}
        onChange={v => onChange({ ...value, rewards: v })}
      />
    );
  }

  // Empty or unrecognized — initialize as OutcomeBlock-style structure
  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>No outcomes yet.</span>
        <button
          type="button"
          style={addButtonStyle}
          onClick={() => onChange([])}
        >
          Initialize as array
        </button>
        <button
          type="button"
          style={addButtonStyle}
          onClick={() => onChange({ rewards: [] })}
        >
          Initialize as {`{rewards: []}`}
        </button>
      </div>
    </div>
  );
}

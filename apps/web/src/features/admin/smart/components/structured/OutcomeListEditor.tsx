import { useState, useEffect } from 'react';
import RefSelect, { ensureRefCache, getCachedRefRow } from '../RefSelect';
import CollapsibleObject from '../CollapsibleObject';
import RichSelectionEditor from './RichSelectionEditor';
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
import {
  validateOutcome,
  outcomeSpecErrorCount,
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
  | 'grant_unlock'
  | 'text'
  | 'effect'
  | 'nothing';

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
  if (t === 'grant_unlock') return 'grant_unlock';
  if (t === 'text') return 'text';
  if (t === 'effect') return 'effect';
  if (t === 'nothing') return 'nothing';
  return 'currency';
}

function defaultForKind(kind: OutcomeKind): Outcome {
  switch (kind) {
    case 'bundle':
      return { bundle: [], odds: 100 };
    case 'pick_bundle':
      return { bundle: [], odds: 100, pickMin: 1, pickMax: 1 };
    case 'bundle_ref':
      return { type: 'bundle_ref', bundleDefId: '' };
    case 'currency':
      return { type: 'currency', key: '', min: 1, max: 10, odds: 100 };
    case 'item':
      return { type: 'item', key: '', min: 1, max: 1, odds: 100 };
    case 'entity_xp':
      return { type: 'entity_xp', min: 10, max: 50, odds: 100 };
    case 'keeper_xp':
      return { type: 'keeper_xp', min: 10, max: 50, odds: 100 };
    case 'flag':
      return { type: 'flag', operation: 'set', key: '', value: true, odds: 100 };
    case 'grant_unlock':
      return { type: 'grant_unlock', key: '', odds: 100 };
    case 'text':
      return { type: 'text', message: '' };
    case 'effect':
      return { type: 'effect', odds: 100 };
    case 'nothing':
      return { type: 'nothing', odds: 98 };
  }
}

function summary(entry: Outcome): string {
  const kind = detectKind(entry);
  if (kind === 'bundle') return `bundle (${entry.bundle?.length ?? 0} items)`;
  if (kind === 'pick_bundle') return `pick ${entry.pickMin ?? 1}-${entry.pickMax ?? 1} of ${entry.bundle?.length ?? 0}`;
  if (kind === 'bundle_ref') return `bundle ref → ${entry.bundleDefId || '?'}`;
  // (the bundle_ref summary above is the fallback; live preview rendered via <BundleRefPreview/>)
  if (kind === 'currency') return `currency ${entry.key || '?'} ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'item') return `item ${entry.key || '?'} ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'entity_xp') return `entity_xp ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'keeper_xp') return `keeper_xp ${entry.min ?? 0}-${entry.max ?? 0}`;
  if (kind === 'flag') return `flag ${entry.operation || 'set'} ${entry.key || '?'}`;
  if (kind === 'grant_unlock') return `grant_unlock ${entry.key || '?'}`;
  if (kind === 'text') return `text "${(entry.message || '').slice(0, 30)}"`;
  if (kind === 'effect') return `effect (odds ${entry.odds ?? 100}%)`;
  if (kind === 'nothing') return `nothing (weight ${entry.odds ?? 98})`;
  return 'outcome';
}

function BundleRefPreview({ entry }: { entry: Outcome }) {
  const id = entry.bundleDefId;
  const [, force] = useState(0);
  useEffect(() => {
    if (!id) return;
    const cached = getCachedRefRow('BundleDef', id);
    if (cached) return;
    let mounted = true;
    ensureRefCache('BundleDef').then(() => { if (mounted) force(n => n + 1); });
    return () => { mounted = false; };
  }, [id]);

  const overrides: string[] = [];
  if (entry.odds !== undefined && entry.odds !== null) overrides.push(`odds=${entry.odds}`);
  if (entry.pickMin !== undefined && entry.pickMin !== null) overrides.push(`pickMin=${entry.pickMin}`);
  if (entry.pickMax !== undefined && entry.pickMax !== null) overrides.push(`pickMax=${entry.pickMax}`);
  if (Array.isArray(entry.requirements) && entry.requirements.length > 0) {
    overrides.push(`+${entry.requirements.length} req${entry.requirements.length === 1 ? '' : 's'}`);
  }
  const overrideStr = overrides.length > 0 ? ` · override ${overrides.join(', ')}` : '';

  if (!id) return <>bundle ref → ?{overrideStr}</>;
  const row = getCachedRefRow('BundleDef', id);
  if (!row) return <>bundle ref → {id}{overrideStr}</>;
  const entries = Array.isArray(row.bundle) ? row.bundle.length : 0;
  const pickMin = row.pickMin;
  const pickMax = row.pickMax;
  const pickStr = (pickMin != null || pickMax != null)
    ? ` — ${pickMin ?? 1}-${pickMax ?? pickMin ?? 1} of ${entries} pick`
    : '';
  const name = row.name ? ` (${row.name})` : '';
  return <>bundle ref → {id}{name} — {entries} entries{pickStr}{overrideStr}</>;
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
          {detectKind(entry) === 'bundle_ref'
            ? <BundleRefPreview entry={entry} />
            : summary(entry)}
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
                <option value="effect">effect</option>
                <option value="nothing">nothing</option>
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
              <MinMaxOdds entry={entry} onChange={onChange} hasRangeError={!!errs.range} />
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
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>odds %</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={entry.odds ?? ''}
                    onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
              </>
            )}

            {kind === 'grant_unlock' && (
              <>
                <div style={{ ...fieldGroupStyle, minWidth: 200 }}>
                  <span style={labelStyle}>key (glob allowed)</span>
                  <input
                    type="text"
                    value={entry.key ?? ''}
                    placeholder="e.g. location_slot.1 or feature.*"
                    onChange={e => onChange({ ...entry, key: e.target.value })}
                    style={{ ...inputStyle, width: '100%', borderColor: errs.key ? ERROR_BORDER_COLOR : (inputStyle.borderColor as string | undefined) }}
                  />
                  {errs.key && <span style={errorTextStyle}>{errs.key}</span>}
                </div>
                <div style={fieldGroupStyle}>
                  <span style={labelStyle}>odds %</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={entry.odds ?? ''}
                    onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ ...numberInputStyle, width: '100%' }}
                  />
                </div>
              </>
            )}

            {kind === 'nothing' && (
              <div style={fieldGroupStyle}>
                <span style={labelStyle}>weight</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={entry.odds ?? ''}
                  onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                  style={{ ...numberInputStyle, width: '100%' }}
                />
              </div>
            )}

            {kind === 'effect' && (
              <div style={fieldGroupStyle}>
                <span style={labelStyle}>odds %</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={entry.odds ?? ''}
                  onChange={e => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
                  style={{ ...numberInputStyle, width: '100%' }}
                />
              </div>
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

          {kind === 'effect' && (
            <div style={{ borderLeft: '2px solid #2a2a4e', marginLeft: 4, paddingLeft: 10 }}>
              <span style={{ ...labelStyle, display: 'block', marginBottom: 4, color: '#888' }}>effect data — backend not yet wired</span>
              <CollapsibleObject value={entry} onChange={onChange} />
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
              <RichSelectionEditor
                value={entry.requirements ?? null}
                onChange={v => {
                  const next: any = { ...entry };
                  const hasRules = v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.rules) && v.rules.length > 0;
                  if (hasRules) next.requirements = v;
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
        <button type="button" style={addButtonStyle} onClick={() => add('grant_unlock')}>+ grant_unlock</button>
        <button type="button" style={addButtonStyle} onClick={() => add('text')}>+ text</button>
        <button type="button" style={addButtonStyle} onClick={() => add('effect')}>+ effect</button>
        <button type="button" style={addButtonStyle} onClick={() => add('nothing')}>+ nothing</button>
      </div>
      <OutcomeTestPanel spec={items} />
    </div>
  );
}

type TestResult = Awaited<ReturnType<typeof adminApi.testOutcome>>;

function refLabel(refTable: string, id: string | null | undefined): string {
  if (!id) return '?';
  const row = getCachedRefRow(refTable, id);
  if (!row) return id;
  const suffix = row.key || id;
  return row.name ? `${row.name} (${suffix})` : suffix;
}

function describeEntry(entry: any): string {
  const t = entry?.type;
  if (t === 'currency') return refLabel('Currency', entry.key);
  if (t === 'item') return refLabel('ItemDef', entry.key);
  if (t === 'entity_xp') return 'entity XP';
  if (t === 'keeper_xp') return 'keeper XP';
  if (t === 'emitEvent') return `event: ${entry.eventDefId ?? entry.id ?? '?'}`;
  return t ?? 'unknown';
}

function OutcomeTestPanel({ spec }: { spec: any }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [seed, setSeed] = useState('');
  const [iterations, setIterations] = useState<number>(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);

  const errorCount = outcomeSpecErrorCount(spec);
  const isEmpty = Array.isArray(spec) ? spec.length === 0 : !(spec && Array.isArray(spec.rewards) && spec.rewards.length > 0);

  // Pre-warm the ref caches so resolved currency/item entries render with
  // friendly names instead of bare ids.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      ensureRefCache('Currency'),
      ensureRefCache('ItemDef'),
    ]).then(() => { if (!cancelled) force((n) => n + 1); });
    return () => { cancelled = true; };
  }, [open]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await adminApi.testOutcome(spec, {
        userId: userId.trim() || undefined,
        seed: seed.trim() || undefined,
        iterations,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Test failed');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...addButtonStyle, alignSelf: 'flex-start' }}
        onClick={() => setOpen(true)}
        disabled={isEmpty}
        title={isEmpty ? 'Add at least one outcome entry first' : 'Run this spec through the live server resolver'}
      >
        ▶ Test outcome
      </button>
    );
  }

  const disabledReason = isEmpty
    ? 'Add at least one outcome entry first.'
    : errorCount > 0
      ? `Fix ${errorCount} validation error${errorCount === 1 ? '' : 's'} above before running.`
      : null;

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: '#a78bfa', fontSize: 12, letterSpacing: '0.04em', flex: 1 }}>
          TEST OUTCOME
        </strong>
        <span style={{ fontSize: 11, color: '#888' }}>
          Runs the saved-shape spec through the same server resolver used at claim time. Read-only — no flags or items are actually granted.
        </span>
        <button
          type="button"
          style={ghostButtonStyle}
          onClick={() => { setOpen(false); setResult(null); setError(null); }}
        >
          Close
        </button>
      </div>

      <div style={fieldRowStyle}>
        <div style={{ ...fieldGroupStyle, minWidth: 220 }}>
          <span style={labelStyle}>player userId (optional)</span>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="empty = no player context"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ ...fieldGroupStyle, minWidth: 160 }}>
          <span style={labelStyle}>seed (optional)</span>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="empty = random"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ ...fieldGroupStyle, minWidth: 100, maxWidth: 140 }}>
          <span style={labelStyle}>iterations (1-1000)</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={iterations}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setIterations(Math.max(1, Math.min(1000, Math.floor(n))));
            }}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            type="button"
            style={{
              ...addButtonStyle,
              opacity: disabledReason || running ? 0.5 : 1,
              cursor: disabledReason || running ? 'not-allowed' : 'pointer',
            }}
            disabled={!!disabledReason || running}
            onClick={run}
            title={disabledReason ?? undefined}
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      {disabledReason && (
        <div style={{ fontSize: 11, color: '#fbbf24' }}>{disabledReason}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#ef4444' }}>Error: {error}</div>
      )}

      {result && <OutcomeTestResultView result={result} />}
    </div>
  );
}

function formatRange(min: number, max: number): string {
  if (min === max) return String(min);
  return `${min}..${max}`;
}

function OutcomeTestResultView({ result }: { result: TestResult }) {
  const { iterations, pickedUser, runs, aggregate } = result;
  const sample = runs[0];
  const showAggregate = iterations > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: '#888' }}>
        Ran {iterations} iteration{iterations === 1 ? '' : 's'}
        {pickedUser && (
          <> · player <span style={{ color: '#e0e0ff' }}>{pickedUser.username ?? pickedUser.id}</span> (lvl {pickedUser.keeperLevel}, {pickedUser.flagCount} flag{pickedUser.flagCount === 1 ? '' : 's'})</>
        )}
        {!pickedUser && <> · empty player context (requirement gates may behave differently than for a real player)</>}
      </div>

      {showAggregate ? (
        <>
          <ResultSection title="Resolved entries (aggregate)" empty="Nothing resolved across all iterations.">
            {aggregate.entries.length > 0 && (
              <ul style={resultListStyle}>
                {aggregate.entries.map((e, i) => (
                  <li key={i} style={resultLineStyle}>
                    <span style={{ color: '#a78bfa', fontWeight: 600, minWidth: 70, fontSize: 11 }}>{e.type}</span>
                    <span style={{ color: '#e0e0ff' }}>{e.key ? (e.type === 'currency' ? refLabel('Currency', e.key) : e.type === 'item' ? refLabel('ItemDef', e.key) : e.key) : '—'}</span>
                    <span style={{ color: '#888', fontSize: 11 }}>
                      {e.count}× · total {e.totalAmount} · per-roll {formatRange(e.minAmount, e.maxAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ResultSection>
          <ResultSection title="Flags (aggregate)" empty="No flag effects fired.">
            {aggregate.flags.length > 0 && (
              <ul style={resultListStyle}>
                {aggregate.flags.map((f, i) => (
                  <li key={i} style={resultLineStyle}>
                    <span style={{ color: '#a78bfa', fontWeight: 600, minWidth: 80, fontSize: 11 }}>{f.operation}</span>
                    <span style={{ color: '#e0e0ff' }}>{f.key}</span>
                    <span style={{ color: '#888', fontSize: 11 }}>
                      {f.count}× · sample values: {f.sampleValues.map((v) => JSON.stringify(v)).join(', ') || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ResultSection>
          <ResultSection title="Texts (aggregate)" empty="No flavor text was rolled.">
            {aggregate.texts.length > 0 && (
              <ul style={resultListStyle}>
                {aggregate.texts.map((t, i) => (
                  <li key={i} style={resultLineStyle}>
                    <span style={{ color: '#888', fontSize: 11, minWidth: 40 }}>{t.count}×</span>
                    <span style={{ color: '#e0e0ff', fontStyle: 'italic' }}>"{t.message}"</span>
                  </li>
                ))}
              </ul>
            )}
          </ResultSection>
        </>
      ) : (
        sample && (
          <>
            <ResultSection title="Resolved entries" empty="Nothing resolved.">
              {sample.resolved.length > 0 && (
                <ul style={resultListStyle}>
                  {sample.resolved.map((r, i) => (
                    <li key={i} style={resultLineStyle}>
                      <span style={{ color: '#a78bfa', fontWeight: 600, minWidth: 70, fontSize: 11 }}>{r.entry?.type ?? '?'}</span>
                      <span style={{ color: '#e0e0ff' }}>{describeEntry(r.entry)}</span>
                      {r.amount !== undefined && (
                        <span style={{ color: '#888', fontSize: 11 }}>×{r.amount}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ResultSection>
            <ResultSection title="Flags" empty="No flag effects fired.">
              {sample.flags.length > 0 && (
                <ul style={resultListStyle}>
                  {sample.flags.map((f, i) => (
                    <li key={i} style={resultLineStyle}>
                      <span style={{ color: '#a78bfa', fontWeight: 600, minWidth: 80, fontSize: 11 }}>{f.entry?.operation ?? 'set'}</span>
                      <span style={{ color: '#e0e0ff' }}>{f.entry?.key ?? '?'}</span>
                      <span style={{ color: '#888', fontSize: 11 }}>= {JSON.stringify(f.entry?.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ResultSection>
            <ResultSection title="Texts" empty="No flavor text was rolled.">
              {sample.texts.length > 0 && (
                <ul style={resultListStyle}>
                  {sample.texts.map((t, i) => (
                    <li key={i} style={resultLineStyle}>
                      <span style={{ color: '#e0e0ff', fontStyle: 'italic' }}>"{t}"</span>
                    </li>
                  ))}
                </ul>
              )}
            </ResultSection>
          </>
        )
      )}
    </div>
  );
}

const resultListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const resultLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  fontSize: 12,
};

function ResultSection({ title, empty, children }: { title: string; empty: string; children?: React.ReactNode }) {
  const hasContent = !!children && (Array.isArray(children) ? children.some(Boolean) : true);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em', marginBottom: 4 }}>
        {title}
      </div>
      {hasContent ? children : <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>{empty}</div>}
    </div>
  );
}

/**
 * Top-level outcome editor. Accepts either:
 *  - an array (e.g. LootboxDef.outcomes, GiftDef.rewardSpec) — edits the array directly
 *  - an OutcomeBlock object `{ rewards: [...] }` (e.g. MissionDef.success/failure) — edits the inner rewards
 *  - anything else — shown as empty with a single init button (array is the only canonical authoring format)
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
      </div>
    </div>
  );
}

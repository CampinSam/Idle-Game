import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { adminApi } from '../adminApi';

const FIELD_INPUT_CLS = "bg-[#1c1830] border border-[#3a3a4a] text-white py-[7px] px-[10px] rounded text-[13px] font-[inherit] [text-transform:none] [letter-spacing:0]";

type Tab = 'tags' | 'effects';

interface TagDef {
  id: string;
  key: string;
  label: string;
  category: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  opacity: number;
  fontSize?: string | null;
  effectKey?: string | null;
  effectKeys?: string[];
  enabled: boolean;
  sortOrder: number;
}

interface VisualEffectDef {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  cssAnimation: string;
  durationMs: number;
  easing: string;
  params: Record<string, any>;
  enabled: boolean;
  sortOrder: number;
}

const ANIMATION_OPTIONS = ['shimmer', 'pulse', 'glow', 'shake', 'bounce', 'rainbow'];
const CATEGORY_OPTIONS = ['rarity', 'ach-tier', 'ach-status', 'quest-status', 'entity-status', 'system'];

function fxVarsFor(effect: VisualEffectDef): CSSProperties {
  return {
    '--fx-duration': `${effect.durationMs}ms`,
    '--fx-easing': effect.easing,
    '--fx-color': effect.params?.color ?? undefined,
    '--fx-min-opacity': effect.params?.minOpacity ?? undefined,
    '--fx-max-scale': effect.params?.maxScale ?? undefined,
  } as CSSProperties;
}

function TagPreview({ tag, fxStack }: { tag: TagDef; fxStack: VisualEffectDef[] }) {
  const tagStyle: CSSProperties = {
    background: tag.backgroundColor,
    color: tag.color,
    borderColor: tag.borderColor,
    opacity: tag.opacity,
    fontSize: tag.fontSize || undefined,
  };
  const pill = (
    <span
      className="inline-flex items-center gap-[6px] py-1 px-[10px] border rounded-full text-[11px] font-semibold tracking-[0.04em] uppercase leading-none whitespace-nowrap overflow-hidden"
      style={tagStyle}
    >
      {tag.label || tag.key || 'preview'}
    </span>
  );
  return (fxStack ?? []).reduceRight<JSX.Element>((children, fx) => (
    <span
      key={fx.key}
      className={`fx-host fx-${fx.cssAnimation} fx-shape-pill`}
      style={fxVarsFor(fx)}
    >
      {children}
    </span>
  ), pill);
}

function EffectPreview({ effect }: { effect: VisualEffectDef }) {
  return (
    <span
      className={`fx-host fx-${effect.cssAnimation}`}
      style={{ ...fxVarsFor(effect), borderRadius: 6 }}
    >
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white font-bold"
        style={{ background: 'linear-gradient(135deg, #2a2050, #5a3aaa)', fontFamily: "'Cinzel', serif" }}
      >
        A
      </span>
    </span>
  );
}

function resolveStack(t: TagDef, effects: VisualEffectDef[]): VisualEffectDef[] {
  const keys = (t.effectKeys && t.effectKeys.length > 0)
    ? t.effectKeys
    : (t.effectKey ? [t.effectKey] : []);
  return keys
    .map((k) => effects.find((e) => e.key === k))
    .filter((e): e is VisualEffectDef => !!e);
}

export default function TagEditorPage() {
  const [tab, setTab] = useState<Tab>('tags');
  const [tags, setTags] = useState<TagDef[]>([]);
  const [effects, setEffects] = useState<VisualEffectDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<TagDef | VisualEffectDef | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsResp, fxResp] = await Promise.all([
        adminApi.list('tagDef') as Promise<TagDef[]>,
        adminApi.list('visualEffectDef') as Promise<VisualEffectDef[]>,
      ]);
      setTags((tagsResp || []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
      setEffects((fxResp || []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setDraft(null);
      return;
    }
    if (tab === 'tags') {
      const found = tags.find((t) => t.key === selectedKey) ?? null;
      setDraft(found ? { ...found } : null);
    } else {
      const found = effects.find((e) => e.key === selectedKey) ?? null;
      setDraft(found ? { ...found } : null);
    }
  }, [selectedKey, tab, tags, effects]);

  const filteredTags = useMemo(
    () => tags.filter((t) => !filter || t.key.includes(filter) || t.label.toLowerCase().includes(filter.toLowerCase())),
    [tags, filter],
  );
  const filteredEffects = useMemo(
    () => effects.filter((e) => !filter || e.key.includes(filter) || e.name.toLowerCase().includes(filter.toLowerCase())),
    [effects, filter],
  );

  const draftStack = useMemo(() => {
    if (tab !== 'tags' || !draft) return [] as VisualEffectDef[];
    return resolveStack(draft as TagDef, effects);
  }, [tab, draft, effects]);

  const updateDraft = (patch: Partial<TagDef & VisualEffectDef>) => {
    setDraft((prev) => (prev ? ({ ...prev, ...patch } as any) : prev));
  };

  const updateParam = (key: string, value: any) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const fx = prev as VisualEffectDef;
      return { ...fx, params: { ...(fx.params || {}), [key]: value } } as any;
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      if (tab === 'tags') {
        await adminApi.update('tagDef', (draft as TagDef).id, draft);
      } else {
        await adminApi.update('visualEffectDef', (draft as VisualEffectDef).id, draft);
      }
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const id = `${tab === 'tags' ? 'tag' : 'fx'}_new_${Date.now().toString(36)}`;
    const data: any = tab === 'tags'
      ? { id, key: id, label: 'New Tag', category: 'system', color: '#ffffff', backgroundColor: '#2a2a3a', borderColor: '#3a3a4a', opacity: 1.0, sortOrder: 999, enabled: true }
      : { id, key: id, name: 'New Effect', cssAnimation: 'pulse', durationMs: 1500, easing: 'ease-in-out', params: {}, sortOrder: 999, enabled: true };
    setSaving(true);
    setError(null);
    try {
      await adminApi.create(tab === 'tags' ? 'tagDef' : 'visualEffectDef', data);
      await reload();
      setSelectedKey(data.key);
    } catch (e: any) {
      setError(e?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-[#0c0a1a] text-[#e0d8ff] min-h-screen"
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      <header className="px-6 py-[18px] border-b border-[#2a2a3a] flex items-center gap-6">
        <h1
          className="m-0 mr-auto text-[22px]"
          style={{ fontFamily: "'Cinzel', serif" }}
        >
          Visual Tag Editor
        </h1>
        <div className="flex gap-2 items-center">
          <button
            className={`border py-[6px] px-[14px] rounded-md cursor-pointer text-[13px] transition-colors ${
              tab === 'tags'
                ? 'bg-[#2a2050] border-[#5a3aaa] text-white'
                : 'bg-transparent border-[#3a3a4a] text-[#cccccc]'
            }`}
            onClick={() => { setTab('tags'); setSelectedKey(null); }}
          >
            Tags ({tags.length})
          </button>
          <button
            className={`border py-[6px] px-[14px] rounded-md cursor-pointer text-[13px] transition-colors ${
              tab === 'effects'
                ? 'bg-[#2a2050] border-[#5a3aaa] text-white'
                : 'bg-transparent border-[#3a3a4a] text-[#cccccc]'
            }`}
            onClick={() => { setTab('effects'); setSelectedKey(null); }}
          >
            Effects ({effects.length})
          </button>
          <a className="ml-4 text-[#8888aa] text-[12px] no-underline" href="/admin">← Back to Admin</a>
        </div>
      </header>

      {error && (
        <div className="mx-6 my-3 px-[14px] py-[10px] bg-[#3a1a1a] border border-[#6a2a2a] rounded-md text-[#ff8c8c] text-[13px]">
          {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-70px)]" style={{ gridTemplateColumns: '320px 1fr' }}>
        <aside className="border-r border-[#2a2a3a] bg-[#14101e] overflow-y-auto p-3 flex flex-col gap-1">
          <div className="flex gap-[6px] mb-2">
            <input
              className="flex-1 bg-[#1c1830] border border-[#3a3a4a] text-white py-[6px] px-[10px] rounded text-[12px]"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="bg-[#2a2050] border border-[#5a3aaa] text-white py-[6px] px-3 rounded cursor-pointer text-[12px]"
              onClick={handleCreate}
              disabled={saving}
            >
              + New
            </button>
          </div>
          {loading && (
            <div className="text-[#6a6a8a] p-6 text-center italic">Loading…</div>
          )}
          {tab === 'tags' && filteredTags.map((t) => (
            <button
              key={t.key}
              className={`border rounded-md py-2 px-[10px] flex items-center gap-[10px] cursor-pointer text-left w-full text-[12px] font-[inherit] transition-colors duration-[120ms] ${
                selectedKey === t.key
                  ? 'bg-[rgba(90,58,170,0.25)] border-[#5a3aaa]'
                  : 'bg-transparent border-transparent hover:bg-[rgba(90,58,170,0.12)]'
              }`}
              onClick={() => setSelectedKey(t.key)}
            >
              <TagPreview tag={t} fxStack={resolveStack(t, effects)} />
              <span className="ml-auto text-[10px] text-[#6a6a8a] uppercase tracking-[0.05em]">{t.category}</span>
            </button>
          ))}
          {tab === 'effects' && filteredEffects.map((e) => (
            <button
              key={e.key}
              className={`border rounded-md py-2 px-[10px] flex items-center gap-[10px] cursor-pointer text-left w-full text-[12px] font-[inherit] transition-colors duration-[120ms] ${
                selectedKey === e.key
                  ? 'bg-[rgba(90,58,170,0.25)] border-[#5a3aaa]'
                  : 'bg-transparent border-transparent hover:bg-[rgba(90,58,170,0.12)]'
              }`}
              onClick={() => setSelectedKey(e.key)}
            >
              <EffectPreview effect={e} />
              <span className="flex-1 font-semibold text-[#e0d8ff]">{e.name}</span>
              <span className="ml-auto text-[10px] text-[#6a6a8a] uppercase tracking-[0.05em]">{e.cssAnimation}</span>
            </button>
          ))}
        </aside>

        <main className="p-6 overflow-y-auto">
          {!draft && (
            <div className="text-[#6a6a8a] p-6 text-center italic">
              Select an item on the left, or create a new one.
            </div>
          )}

          {draft && tab === 'tags' && (
            <TagForm
              draft={draft as TagDef}
              fxStack={draftStack}
              effects={effects}
              onChange={updateDraft}
              onSave={handleSave}
              saving={saving}
            />
          )}

          {draft && tab === 'effects' && (
            <EffectForm
              draft={draft as VisualEffectDef}
              onChange={updateDraft}
              onParamChange={updateParam}
              onSave={handleSave}
              saving={saving}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function TagForm({
  draft,
  fxStack,
  effects,
  onChange,
  onSave,
  saving,
}: {
  draft: TagDef;
  fxStack: VisualEffectDef[];
  effects: VisualEffectDef[];
  onChange: (p: Partial<TagDef>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const stackKeys: string[] = (draft.effectKeys && draft.effectKeys.length > 0)
    ? draft.effectKeys
    : (draft.effectKey ? [draft.effectKey] : []);

  const writeStack = (next: string[]) => {
    const cleaned = next.filter((k) => !!k);
    onChange({
      effectKeys: cleaned,
      effectKey: cleaned[0] ?? null,
    });
  };

  return (
    <>
      <div className="bg-[#1c1830] border border-dashed border-[#3a3a4a] rounded-lg p-7 flex flex-col items-center gap-3 mb-6">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a8a]">Live preview</span>
        <TagPreview tag={draft} fxStack={fxStack} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-[14px] max-w-[720px]">
        <Field label="Key (immutable id)">
          <input className={FIELD_INPUT_CLS} value={draft.key} onChange={(e) => onChange({ key: e.target.value })} />
        </Field>
        <Field label="Label">
          <input className={FIELD_INPUT_CLS} value={draft.label} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className={FIELD_INPUT_CLS} value={draft.category} onChange={(e) => onChange({ category: e.target.value })}>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Sort order">
          <input className={FIELD_INPUT_CLS} type="number" value={draft.sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} />
        </Field>
        <Field label="Text color">
          <ColorInput value={draft.color} onChange={(v) => onChange({ color: v })} />
        </Field>
        <Field label="Background">
          <ColorInput value={draft.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} />
        </Field>
        <Field label="Border">
          <ColorInput value={draft.borderColor} onChange={(v) => onChange({ borderColor: v })} />
        </Field>
        <Field label={`Opacity (${draft.opacity.toFixed(2)})`}>
          <input
            className={FIELD_INPUT_CLS}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={draft.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
        </Field>
        <Field label="Font size (e.g. 11px)">
          <input className={FIELD_INPUT_CLS} value={draft.fontSize || ''} onChange={(e) => onChange({ fontSize: e.target.value || null })} />
        </Field>
        <Field label="Effect stack (outermost → innermost)">
          <div className="flex flex-col gap-[6px]">
            {stackKeys.length === 0 && (
              <div className="text-[#6a6a8a] text-[11px] italic py-1">No effects. Add one below.</div>
            )}
            {stackKeys.map((k, i) => (
              <div key={i} className="flex gap-1 items-center">
                <select
                  className={FIELD_INPUT_CLS + " flex-1"}
                  value={k}
                  onChange={(e) => {
                    const next = stackKeys.slice();
                    next[i] = e.target.value;
                    writeStack(next);
                  }}
                >
                  <option value="">— None —</option>
                  {effects.map((fx) => <option key={fx.key} value={fx.key}>{fx.name}</option>)}
                </select>
                <button
                  type="button"
                  className="bg-[#1c1830] border border-[#3a3a4a] text-white w-7 h-[30px] rounded cursor-pointer text-[13px] leading-none disabled:opacity-[0.35] disabled:cursor-not-allowed"
                  disabled={i === 0}
                  onClick={() => {
                    const next = stackKeys.slice();
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    writeStack(next);
                  }}
                  title="Move outward"
                >↑</button>
                <button
                  type="button"
                  className="bg-[#1c1830] border border-[#3a3a4a] text-white w-7 h-[30px] rounded cursor-pointer text-[13px] leading-none disabled:opacity-[0.35] disabled:cursor-not-allowed"
                  disabled={i === stackKeys.length - 1}
                  onClick={() => {
                    const next = stackKeys.slice();
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    writeStack(next);
                  }}
                  title="Move inward"
                >↓</button>
                <button
                  type="button"
                  className="bg-[#1c1830] border border-[#6a2a2a] text-[#ff8c8c] w-7 h-[30px] rounded cursor-pointer text-[13px] leading-none"
                  onClick={() => writeStack(stackKeys.filter((_, j) => j !== i))}
                  title="Remove"
                >×</button>
              </div>
            ))}
            <button
              type="button"
              className="self-start bg-transparent border border-dashed border-[#3a3a4a] text-[#aaaacc] py-[6px] px-3 rounded cursor-pointer text-[12px] mt-[2px] hover:border-[#5a3aaa] hover:text-white"
              onClick={() => writeStack([...stackKeys, effects[0]?.key ?? ''])}
            >
              + Add effect
            </button>
          </div>
        </Field>
        <Field label="Enabled">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        </Field>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          className="border-0 text-white py-[10px] px-6 rounded-md cursor-pointer text-[13px] font-bold uppercase tracking-[0.05em] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #5a3aaa, #8a4aff)' }}
          disabled={saving}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}

function EffectForm({
  draft,
  onChange,
  onParamChange,
  onSave,
  saving,
}: {
  draft: VisualEffectDef;
  onChange: (p: Partial<VisualEffectDef>) => void;
  onParamChange: (k: string, v: any) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <>
      <div className="bg-[#1c1830] border border-dashed border-[#3a3a4a] rounded-lg p-7 flex flex-col items-center gap-3 mb-6">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[#6a6a8a]">Live preview</span>
        <EffectPreview effect={draft} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-[14px] max-w-[720px]">
        <Field label="Key (immutable id)">
          <input className={FIELD_INPUT_CLS} value={draft.key} onChange={(e) => onChange({ key: e.target.value })} />
        </Field>
        <Field label="Name">
          <input className={FIELD_INPUT_CLS} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Animation">
          <select className={FIELD_INPUT_CLS} value={draft.cssAnimation} onChange={(e) => onChange({ cssAnimation: e.target.value })}>
            {ANIMATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Duration (ms)">
          <input className={FIELD_INPUT_CLS} type="number" value={draft.durationMs} onChange={(e) => onChange({ durationMs: Number(e.target.value) })} />
        </Field>
        <Field label="Easing">
          <input className={FIELD_INPUT_CLS} value={draft.easing} onChange={(e) => onChange({ easing: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <input className={FIELD_INPUT_CLS} type="number" value={draft.sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} />
        </Field>
        <Field label="Param: color">
          <ColorInput
            value={(draft.params?.color as string) || ''}
            onChange={(v) => onParamChange('color', v)}
            allowEmpty
          />
        </Field>
        <Field label="Param: min opacity (pulse)">
          <input
            className={FIELD_INPUT_CLS}
            type="number"
            step="0.05"
            min="0" max="1"
            value={draft.params?.minOpacity ?? ''}
            onChange={(e) => onParamChange('minOpacity', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Field>
        <Field label="Param: max scale (pulse)">
          <input
            className={FIELD_INPUT_CLS}
            type="number"
            step="0.01"
            value={draft.params?.maxScale ?? ''}
            onChange={(e) => onParamChange('maxScale', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={FIELD_INPUT_CLS + " resize-y"}
            rows={2}
            value={draft.description || ''}
            onChange={(e) => onChange({ description: e.target.value || null })}
          />
        </Field>
        <Field label="Enabled">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        </Field>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          className="border-0 text-white py-[10px] px-6 rounded-md cursor-pointer text-[13px] font-bold uppercase tracking-[0.05em] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #5a3aaa, #8a4aff)' }}
          disabled={saving}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[#aaaacc] uppercase tracking-[0.04em]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ColorInput({
  value,
  onChange,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <span className="flex gap-[6px] items-center">
      <input
        type="color"
        className="w-9 h-8 p-0 border border-[#3a3a4a] bg-[#1c1830] rounded cursor-pointer"
        value={isHex ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        className={FIELD_INPUT_CLS + " flex-1"}
        value={value}
        placeholder={allowEmpty ? '(none)' : '#rrggbb / rgba(...)'}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

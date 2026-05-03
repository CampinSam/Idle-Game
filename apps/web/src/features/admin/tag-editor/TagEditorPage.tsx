import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { adminApi } from '../adminApi';
import './TagEditor.css';

/**
 * Admin Tag Editor.
 *
 * Two surfaces in one page:
 *   1. Tags tab — CRUD for `TagDef` rows. Live preview, color pickers,
 *      opacity slider, effect dropdown sourced from VisualEffectDef.
 *   2. Effects tab — CRUD for `VisualEffectDef`. Each effect has a small
 *      preview swatch so admins can pick one without leaving the page.
 *
 * Bypasses the SmartAdmin generic editor on purpose: the entire point of
 * the feature is "see the change before you save it", which a
 * JSON-driven generic form cannot give us.
 *
 * Saving forces a full page reload after PUT so the running app picks
 * up the new bootstrap snapshot. Cheaper than wiring a refetch hook
 * into syncSlice for an admin-only flow.
 */

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

// Tiny self-contained preview that does NOT depend on the Redux catalog
// — it renders straight from the in-flight form state so the admin sees
// uncommitted edits before they hit the server.
function TagPreview({ tag, effect }: { tag: TagDef; effect: VisualEffectDef | null }) {
  const tagStyle: CSSProperties = {
    background: tag.backgroundColor,
    color: tag.color,
    borderColor: tag.borderColor,
    opacity: tag.opacity,
    fontSize: tag.fontSize || undefined,
  };
  const fxClass = effect ? `fx-host fx-${effect.cssAnimation}` : '';
  const fxStyle: CSSProperties = effect
    ? ({
        '--fx-duration': `${effect.durationMs}ms`,
        '--fx-easing': effect.easing,
        '--fx-color': effect.params?.color ?? undefined,
        '--fx-min-opacity': effect.params?.minOpacity ?? undefined,
        '--fx-max-scale': effect.params?.maxScale ?? undefined,
      } as CSSProperties)
    : {};
  return (
    <span className={fxClass} style={fxStyle}>
      <span className="tag-editor-preview-pill" style={tagStyle}>
        {tag.label || tag.key || 'preview'}
      </span>
    </span>
  );
}

function EffectPreview({ effect }: { effect: VisualEffectDef }) {
  const fxStyle: CSSProperties = {
    '--fx-duration': `${effect.durationMs}ms`,
    '--fx-easing': effect.easing,
    '--fx-color': effect.params?.color ?? undefined,
    '--fx-min-opacity': effect.params?.minOpacity ?? undefined,
    '--fx-max-scale': effect.params?.maxScale ?? undefined,
  } as CSSProperties;
  return (
    <span className={`fx-host fx-${effect.cssAnimation}`} style={fxStyle}>
      <span className="tag-editor-effect-swatch">A</span>
    </span>
  );
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

  // Reset draft when switching tab or selection
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

  const draftEffect = useMemo(() => {
    if (tab !== 'tags' || !draft) return null;
    const t = draft as TagDef;
    return effects.find((e) => e.key === t.effectKey) ?? null;
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
    <div className="tag-editor-root">
      <header className="tag-editor-header">
        <h1>Visual Tag Editor</h1>
        <div className="tag-editor-tabs">
          <button className={tab === 'tags' ? 'active' : ''} onClick={() => { setTab('tags'); setSelectedKey(null); }}>
            Tags ({tags.length})
          </button>
          <button className={tab === 'effects' ? 'active' : ''} onClick={() => { setTab('effects'); setSelectedKey(null); }}>
            Effects ({effects.length})
          </button>
          <a className="tag-editor-back" href="/admin">← Back to Admin</a>
        </div>
      </header>

      {error && <div className="tag-editor-error">{error}</div>}

      <div className="tag-editor-body">
        <aside className="tag-editor-list">
          <div className="tag-editor-list-controls">
            <input
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button onClick={handleCreate} disabled={saving}>+ New</button>
          </div>
          {loading && <div className="tag-editor-loading">Loading…</div>}
          {tab === 'tags' && filteredTags.map((t) => {
            const fx = effects.find((e) => e.key === t.effectKey) ?? null;
            return (
              <button
                key={t.key}
                className={`tag-editor-list-row ${selectedKey === t.key ? 'selected' : ''}`}
                onClick={() => setSelectedKey(t.key)}
              >
                <TagPreview tag={t} effect={fx} />
                <span className="tag-editor-list-meta">{t.category}</span>
              </button>
            );
          })}
          {tab === 'effects' && filteredEffects.map((e) => (
            <button
              key={e.key}
              className={`tag-editor-list-row ${selectedKey === e.key ? 'selected' : ''}`}
              onClick={() => setSelectedKey(e.key)}
            >
              <EffectPreview effect={e} />
              <span className="tag-editor-list-name">{e.name}</span>
              <span className="tag-editor-list-meta">{e.cssAnimation}</span>
            </button>
          ))}
        </aside>

        <main className="tag-editor-form">
          {!draft && <div className="tag-editor-empty">Select an item on the left, or create a new one.</div>}

          {draft && tab === 'tags' && (
            <TagForm
              draft={draft as TagDef}
              effect={draftEffect}
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
  effect,
  effects,
  onChange,
  onSave,
  saving,
}: {
  draft: TagDef;
  effect: VisualEffectDef | null;
  effects: VisualEffectDef[];
  onChange: (p: Partial<TagDef>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <>
      <div className="tag-editor-preview-area">
        <span className="tag-editor-preview-label">Live preview</span>
        <TagPreview tag={draft} effect={effect} />
      </div>

      <div className="tag-editor-form-grid">
        <Field label="Key (immutable id)">
          <input value={draft.key} onChange={(e) => onChange({ key: e.target.value })} />
        </Field>
        <Field label="Label">
          <input value={draft.label} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <Field label="Category">
          <select value={draft.category} onChange={(e) => onChange({ category: e.target.value })}>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Sort order">
          <input type="number" value={draft.sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} />
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
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={draft.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
        </Field>
        <Field label="Font size (e.g. 11px)">
          <input value={draft.fontSize || ''} onChange={(e) => onChange({ fontSize: e.target.value || null })} />
        </Field>
        <Field label="Effect">
          <select value={draft.effectKey || ''} onChange={(e) => onChange({ effectKey: e.target.value || null })}>
            <option value="">— None —</option>
            {effects.map((fx) => <option key={fx.key} value={fx.key}>{fx.name}</option>)}
          </select>
        </Field>
        <Field label="Enabled">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        </Field>
      </div>

      <div className="tag-editor-form-actions">
        <button className="primary" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>
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
      <div className="tag-editor-preview-area">
        <span className="tag-editor-preview-label">Live preview</span>
        <EffectPreview effect={draft} />
      </div>

      <div className="tag-editor-form-grid">
        <Field label="Key (immutable id)">
          <input value={draft.key} onChange={(e) => onChange({ key: e.target.value })} />
        </Field>
        <Field label="Name">
          <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Animation">
          <select value={draft.cssAnimation} onChange={(e) => onChange({ cssAnimation: e.target.value })}>
            {ANIMATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Duration (ms)">
          <input type="number" value={draft.durationMs} onChange={(e) => onChange({ durationMs: Number(e.target.value) })} />
        </Field>
        <Field label="Easing">
          <input value={draft.easing} onChange={(e) => onChange({ easing: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <input type="number" value={draft.sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} />
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
            type="number"
            step="0.05"
            min="0" max="1"
            value={draft.params?.minOpacity ?? ''}
            onChange={(e) => onParamChange('minOpacity', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Field>
        <Field label="Param: max scale (pulse)">
          <input
            type="number"
            step="0.01"
            value={draft.params?.maxScale ?? ''}
            onChange={(e) => onParamChange('maxScale', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={2}
            value={draft.description || ''}
            onChange={(e) => onChange({ description: e.target.value || null })}
          />
        </Field>
        <Field label="Enabled">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        </Field>
      </div>

      <div className="tag-editor-form-actions">
        <button className="primary" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="tag-editor-field">
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
  // The native <input type=color> needs a 6-char hex. Pass-through for
  // the rgba() / named-color cases that VisualEffectDef.params uses.
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <span className="tag-editor-color-input">
      <input
        type="color"
        value={isHex ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        value={value}
        placeholder={allowEmpty ? '(none)' : '#rrggbb / rgba(...)'}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

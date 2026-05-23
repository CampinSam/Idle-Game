import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import ContentDocumentDataEditor from '../smart/components/structured/ContentDocumentDataEditor';
import {
  inputStyle,
  selectStyle,
  labelStyle,
  fieldGroupStyle,
  entryCardStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
} from '../smart/components/structured/editorStyles';
import '../admin.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

const SCREEN_COMPONENT_KEYS = [
  'ResourceSummaryBar',
  'SeasonBanner',
  'BannerCarousel',
  'QuickStatusCards',
  'DailyQuestPanel',
  'GlobalBuffsSection',
  'CraftingWorkshopsCard',
  'MissionFeaturedCard',
  'ActiveMissionList',
  'EmptyStateCard',
  'HelpTipCard',
  'CTAButtonGroup',
  'SkeletonCard',
  'DailyCheckInCard',
  'FeaturedBirdCard',
  'StoreOfferCard',
  'StoreOfferCarousel',
  'StoreItemGrid',
  'StoreItemRail',
  'FeaturedShopRail',
  'GemPackGrid',
  'BattlePassProgress',
  'BattlePassTierList',
  'EventCarousel',
  'EventCardList',
  'SeasonBossPanel',
  'NewsCard',
  'AnnouncementFeed',
  'MissionCategoryRail',
  'CraftingQueuePreview',
  'RecipeCategoryRail',
  'OutpostReadyList',
  'OutpostSummaryCards',
  'InventoryCategoryGrid',
  'WalletPromptCard',
  'NFTCapacityInfoCard',
  'PatchNotesCard',
];

const LAYOUT_TYPES = [
  'vertical_feed',
  'tabbed_feed',
  'grid',
  'split_panel',
  'modal_stack',
  'wizard',
  'fixed_structure',
  'hero_stack',
  'grid_feed',
  'carousel_feed',
];

const DEF_TYPES = ['screen_composition', 'content_document'] as const;
type DefType = typeof DEF_TYPES[number];

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      padding: '0.15rem 0.45rem',
      borderRadius: 4,
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      background: isActive ? 'rgba(76,175,80,0.15)' : 'rgba(100,100,140,0.15)',
      color: isActive ? '#4caf50' : '#888',
      border: `1px solid ${isActive ? 'rgba(76,175,80,0.3)' : 'rgba(100,100,140,0.25)'}`,
    }}>
      {isActive ? 'live' : 'draft'}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isScreen = type === 'screen_composition';
  return (
    <span style={{
      padding: '0.15rem 0.4rem',
      borderRadius: 4,
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: isScreen ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.12)',
      color: isScreen ? '#a78bfa' : '#60a5fa',
      border: `1px solid ${isScreen ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.25)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isScreen ? 'screen' : 'content'}
    </span>
  );
}

function Msg({ msg }: { msg: { text: string; type: 'success' | 'error' } | null }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      borderRadius: 6,
      fontSize: '0.85rem',
      background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
      color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
      border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
    }}>{msg.text}</div>
  );
}

function newSection(idx: number) {
  return {
    id: `section_${idx + 1}`,
    component: 'HelpTipCard',
    priority: (idx + 1) * 10,
    props: {},
  };
}

function SectionEditor({
  sections,
  onChange,
}: {
  sections: any[];
  onChange: (s: any[]) => void;
}) {
  const [propsText, setPropsText] = useState<Record<number, string>>({});
  const [propsError, setPropsError] = useState<Record<number, string>>({});
  const [customComp, setCustomComp] = useState<Record<number, string>>({});

  const getPropsText = (idx: number, section: any) => {
    if (propsText[idx] !== undefined) return propsText[idx];
    try { return JSON.stringify(section.props ?? {}, null, 2); } catch { return '{}'; }
  };

  const update = (idx: number, patch: any) => {
    const next = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange(next);
  };

  const handlePropsChange = (idx: number, text: string) => {
    setPropsText(p => ({ ...p, [idx]: text }));
    try {
      const parsed = JSON.parse(text);
      setPropsError(p => { const n = { ...p }; delete n[idx]; return n; });
      update(idx, { props: parsed });
    } catch {
      setPropsError(p => ({ ...p, [idx]: 'Invalid JSON' }));
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setPropsText({});
    onChange(next);
  };

  const remove = (idx: number) => {
    setPropsText(p => {
      const n: Record<number, string> = {};
      Object.entries(p).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki !== idx) n[ki > idx ? ki - 1 : ki] = v;
      });
      return n;
    });
    onChange(sections.filter((_, i) => i !== idx));
  };

  const add = () => onChange([...sections, newSection(sections.length)]);

  const isCustomComponent = (idx: number, section: any) => {
    return !SCREEN_COMPONENT_KEYS.includes(section.component) && section.component;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Sections ({sections.length})
      </div>
      {sections.map((section, idx) => {
        const isCustom = isCustomComponent(idx, section);
        const compValue = isCustom ? '__custom__' : (section.component || '');
        return (
          <div key={idx} style={{ ...entryCardStyle, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ ...fieldGroupStyle, flex: '2 1 140px' }}>
                <span style={labelStyle}>id</span>
                <input
                  type="text"
                  value={section.id ?? ''}
                  onChange={e => update(idx, { id: e.target.value })}
                  style={{ ...inputStyle, width: '100%' }}
                  placeholder="section_id"
                />
              </div>
              <div style={{ ...fieldGroupStyle, flex: '3 1 180px' }}>
                <span style={labelStyle}>component</span>
                {isCustom || customComp[idx] ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="text"
                      value={section.component ?? ''}
                      onChange={e => update(idx, { component: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="CustomComponentKey"
                    />
                    <button
                      type="button"
                      style={{ ...iconButtonStyle, fontSize: 10, padding: '0 6px', width: 'auto' }}
                      onClick={() => {
                        setCustomComp(p => { const n = { ...p }; delete n[idx]; return n; });
                        if (!SCREEN_COMPONENT_KEYS.includes(section.component)) {
                          update(idx, { component: SCREEN_COMPONENT_KEYS[0] });
                        }
                      }}
                    >list</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      value={compValue}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setCustomComp(p => ({ ...p, [idx]: '1' }));
                          update(idx, { component: '' });
                        } else {
                          update(idx, { component: e.target.value });
                        }
                      }}
                      style={{ ...selectStyle, flex: 1 }}
                    >
                      {SCREEN_COMPONENT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                      <option value="__custom__">— custom key —</option>
                    </select>
                  </div>
                )}
              </div>
              <div style={{ ...fieldGroupStyle, flex: '0 0 80px' }}>
                <span style={labelStyle}>priority</span>
                <input
                  type="number"
                  value={section.priority ?? 0}
                  onChange={e => update(idx, { priority: Number(e.target.value) })}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
                <button type="button" style={iconButtonStyle} disabled={idx === 0} onClick={() => move(idx, idx - 1)} title="Move up">↑</button>
                <button type="button" style={iconButtonStyle} disabled={idx === sections.length - 1} onClick={() => move(idx, idx + 1)} title="Move down">↓</button>
                <button type="button" style={dangerIconButtonStyle} onClick={() => remove(idx)} title="Remove">×</button>
              </div>
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>props (JSON)</span>
              <textarea
                value={getPropsText(idx, section)}
                onChange={e => handlePropsChange(idx, e.target.value)}
                rows={3}
                style={{
                  ...inputStyle,
                  width: '100%',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: propsError[idx] ? '#ff6b6b' : '#a0e0a0',
                  boxSizing: 'border-box',
                }}
              />
              {propsError[idx] && <span style={{ color: '#ff6b6b', fontSize: 11 }}>{propsError[idx]}</span>}
            </div>
          </div>
        );
      })}
      <button type="button" style={addButtonStyle} onClick={add}>+ Add Section</button>
    </div>
  );
}

function LayoutEditor({ layout, onChange }: { layout: any; onChange: (l: any) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>layoutType</span>
        <select
          value={layout?.layoutType ?? 'vertical_feed'}
          onChange={e => onChange({ ...(layout ?? {}), layoutType: e.target.value })}
          style={selectStyle}
        >
          {LAYOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>scroll</span>
        <select
          value={layout?.scroll !== false ? 'true' : 'false'}
          onChange={e => onChange({ ...(layout ?? {}), scroll: e.target.value === 'true' })}
          style={{ ...selectStyle, width: 80 }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>maxWidth</span>
        <select
          value={layout?.maxWidth ?? ''}
          onChange={e => onChange({ ...(layout ?? {}), maxWidth: e.target.value || undefined })}
          style={{ ...selectStyle, width: 140 }}
        >
          <option value="">— none —</option>
          <option value="mobile_full">mobile_full</option>
          <option value="content">content</option>
          <option value="wide">wide</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>gap</span>
        <select
          value={layout?.gap ?? ''}
          onChange={e => onChange({ ...(layout ?? {}), gap: e.target.value || undefined })}
          style={{ ...selectStyle, width: 100 }}
        >
          <option value="">— none —</option>
          <option value="none">none</option>
          <option value="tight">tight</option>
          <option value="standard">standard</option>
          <option value="loose">loose</option>
        </select>
      </div>
    </div>
  );
}

function DefinitionEditor({
  def,
  allDefs,
  onSaved,
}: {
  def: any | null;
  allDefs: any[];
  onSaved: (updated: any) => void;
}) {
  const isNew = !def;

  const [form, setForm] = useState<{
    type: DefType;
    key: string;
    version: string;
    startsAt: string;
    endsAt: string;
  }>({
    type: (def?.type as DefType) ?? 'screen_composition',
    key: def?.key ?? '',
    version: String(def?.version ?? 1),
    startsAt: def?.startsAt ? def.startsAt.slice(0, 16) : '',
    endsAt: def?.endsAt ? def.endsAt.slice(0, 16) : '',
  });

  const [data, setData] = useState<any>(() => {
    if (def?.data) return def.data;
    if (form.type === 'screen_composition') {
      return { sections: [], layout: { layoutType: 'vertical_feed', scroll: true } };
    }
    return { blocks: [] };
  });

  const [jsonMode, setJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const switchToJson = () => {
    setRawJson(JSON.stringify(data, null, 2));
    setJsonError('');
    setJsonMode(true);
  };

  const switchToVisual = () => {
    if (rawJson) {
      try {
        setData(JSON.parse(rawJson));
        setJsonError('');
      } catch {
        setJsonError('Invalid JSON — fix before switching');
        return;
      }
    }
    setJsonMode(false);
  };

  const handleRawJsonChange = (text: string) => {
    setRawJson(text);
    try {
      setData(JSON.parse(text));
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  const buildPayload = () => ({
    type: form.type,
    key: form.key.trim(),
    version: Number(form.version),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    data,
  });

  const validate = () => {
    if (!form.key.trim()) return 'Key is required';
    if (!form.version || isNaN(Number(form.version))) return 'Version must be a number';
    if (!isNew) return null;
    const clash = allDefs.find(
      d => d.type === form.type && d.key === form.key.trim() && d.version === Number(form.version),
    );
    if (clash) return `Version ${form.version} already exists for key "${form.key}"`;
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setMsg({ text: err, type: 'error' }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const payload = buildPayload();
      let saved: any;
      if (isNew) {
        saved = await adminApi.createGameDefinition(payload);
      } else {
        saved = await adminApi.updateGameDefinition(def.id, payload);
      }
      setMsg({ text: isNew ? 'Created successfully' : 'Saved successfully', type: 'success' });
      onSaved(saved);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!def) return;
    if (!confirm(`Publish version ${def.version} of "${def.key}"? All other active versions will be deactivated.`)) return;
    setPublishing(true);
    setMsg(null);
    try {
      const updated = await adminApi.publishGameDefinition(def.key, def.version);
      setMsg({ text: `Version ${def.version} is now live`, type: 'success' });
      onSaved(updated);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const rollback = async () => {
    if (!def) return;
    if (!confirm(`Rollback to version ${def.version} of "${def.key}"? The currently active version will be replaced.`)) return;
    setPublishing(true);
    setMsg(null);
    try {
      const updated = await adminApi.rollbackGameDefinition(def.key, def.version);
      setMsg({ text: `Rolled back to version ${def.version}`, type: 'success' });
      onSaved(updated);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const isScreenComp = form.type === 'screen_composition';
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];
  const layout = data?.layout ?? { layoutType: 'vertical_feed', scroll: true };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#e0e0ff' }}>
          {isNew ? 'New Definition' : (
            <span>
              <span style={{ color: '#888', fontWeight: 400 }}>{def.type === 'screen_composition' ? 'screen' : 'content'} / </span>
              {def.key}
              <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>v{def.version}</span>
              <span style={{ marginLeft: 8 }}><StatusBadge isActive={def.isActive} /></span>
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => jsonMode ? switchToVisual() : switchToJson()}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid #555',
              borderRadius: 5,
              background: jsonMode ? 'rgba(167,139,250,0.12)' : 'transparent',
              color: jsonMode ? '#a78bfa' : '#aaa',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            {jsonMode ? '← Visual' : 'JSON ↓'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-save"
            style={{ padding: '0.35rem 1rem', fontSize: '0.85rem' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!isNew && !def.isActive && (
            <button
              onClick={publish}
              disabled={publishing}
              style={{
                padding: '0.35rem 1rem',
                border: '1px solid rgba(76,175,80,0.4)',
                borderRadius: 5,
                background: 'rgba(76,175,80,0.12)',
                color: '#4caf50',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {publishing ? '…' : 'Publish'}
            </button>
          )}
          {!isNew && def.isActive && (
            <button
              onClick={rollback}
              disabled={publishing}
              style={{
                padding: '0.35rem 1rem',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 5,
                background: 'rgba(239,68,68,0.08)',
                color: '#f87171',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {publishing ? '…' : 'Rollback'}
            </button>
          )}
        </div>
      </div>

      <Msg msg={msg} />

      <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Metadata
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>type</span>
            <select
              value={form.type}
              onChange={e => {
                const t = e.target.value as DefType;
                setForm(f => ({ ...f, type: t }));
                if (t === 'screen_composition') {
                  setData({ sections: [], layout: { layoutType: 'vertical_feed', scroll: true } });
                } else {
                  setData({ blocks: [] });
                }
              }}
              disabled={!isNew}
              style={{ ...selectStyle, opacity: isNew ? 1 : 0.5 }}
            >
              {DEF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ ...fieldGroupStyle, flex: '2 1 160px' }}>
            <span style={labelStyle}>key</span>
            <input
              type="text"
              value={form.key}
              onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
              disabled={!isNew}
              style={{ ...inputStyle, width: '100%', opacity: isNew ? 1 : 0.5 }}
              placeholder="home_screen"
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: '0 0 70px' }}>
            <span style={labelStyle}>version</span>
            <input
              type="number"
              value={form.version}
              onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
              min="1"
            />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>startsAt</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>endsAt</span>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      </div>

      {jsonMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Raw JSON (data)
          </div>
          <textarea
            value={rawJson}
            onChange={e => handleRawJsonChange(e.target.value)}
            rows={22}
            style={{
              ...inputStyle,
              width: '100%',
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: 12,
              color: jsonError ? '#ff6b6b' : '#a0e0a0',
              boxSizing: 'border-box',
            }}
          />
          {jsonError && <span style={{ color: '#ff6b6b', fontSize: 12 }}>{jsonError}</span>}
        </div>
      ) : isScreenComp ? (
        <>
          <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Layout
            </div>
            <LayoutEditor layout={layout} onChange={l => setData((d: any) => ({ ...d, layout: l }))} />
          </div>
          <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionEditor
              sections={sections}
              onChange={s => setData((d: any) => ({ ...d, sections: s }))}
            />
          </div>
        </>
      ) : (
        <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            Content Blocks
          </div>
          <ContentDocumentDataEditor
            value={data}
            onChange={setData}
          />
        </div>
      )}
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (loginKey: string) => {
    setLoading(true);
    setError('');
    setAdminKey(loginKey);
    try {
      await adminApi.getTables();
      onLogin();
    } catch {
      setError('Invalid admin key');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  useEffect(() => {
    if (import.meta.env.DEV && DEV_ADMIN_KEY && !autoSubmitted.current) {
      autoSubmitted.current = true;
      doLogin(DEV_ADMIN_KEY);
    }
  }, [doLogin]);

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={e => { e.preventDefault(); doLogin(key); }}>
        <h1>Derp Universe Admin</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Screen Composer</p>
        <input type="password" placeholder="Admin Key" value={key} onChange={e => setKey(e.target.value)} autoFocus />
        <button type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Enter'}</button>
        {error && <div className="admin-error">{error}</div>}
      </form>
    </div>
  );
}

function ScreenComposer() {
  const [defs, setDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | DefType>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await adminApi.listGameDefinitions();
      setDefs(all);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: any) => {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    setSelected(updated);
    setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this definition? This cannot be undone.')) return;
    try {
      await adminApi.deleteGameDefinition(id);
      setDefs(prev => prev.filter(d => d.id !== id));
      if (selected?.id === id) { setSelected(null); setShowNew(false); }
      setDeleteId(null);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    }
  };

  const filtered = defs.filter(d => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (search && !d.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, any[]>>((acc, d) => {
    const k = `${d.type}::${d.key}`;
    if (!acc[k]) acc[k] = [];
    acc[k].push(d);
    return acc;
  }, {});

  const groups = Object.entries(grouped).map(([k, items]) => ({
    groupKey: k,
    key: items[0].key,
    type: items[0].type,
    versions: items.sort((a, b) => b.version - a.version),
  }));

  return (
    <div className="admin-panel">
      <div className="admin-sidebar" style={{ minWidth: 260, maxWidth: 300 }}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Screen Composer</h2>
            <a href="/admin" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'none' }}>← Admin</a>
          </div>
          <button
            className="btn-save"
            style={{ width: '100%', padding: '0.45rem', fontSize: '0.85rem' }}
            onClick={() => { setSelected(null); setShowNew(true); }}
          >
            + New Definition
          </button>
          <input
            type="text"
            placeholder="Filter by key…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'screen_composition', 'content_document'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  flex: 1,
                  padding: '0.25rem 0',
                  border: '1px solid #2a2a4e',
                  borderRadius: 4,
                  background: filterType === t ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: filterType === t ? '#a78bfa' : '#666',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                {t === 'all' ? 'All' : t === 'screen_composition' ? 'Screen' : 'Content'}
              </button>
            ))}
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0.5rem 0', overflowY: 'auto' }}>
          {loading && <div style={{ color: '#666', padding: '0.75rem 1rem', fontSize: '0.85rem' }}>Loading…</div>}
          {!loading && groups.length === 0 && (
            <div style={{ color: '#666', padding: '0.75rem 1rem', fontSize: '0.85rem' }}>No definitions found</div>
          )}
          {groups.map(({ groupKey, key, type, versions }) => (
            <div key={groupKey} style={{ borderBottom: '1px solid #1a1a3e' }}>
              <div style={{
                padding: '0.5rem 1rem 0.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <TypeBadge type={type} />
                <span style={{ fontSize: '0.8rem', color: '#e0e0ff', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {key}
                </span>
              </div>
              {versions.map(v => (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelected(v); setShowNew(false); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setSelected(v); setShowNew(false); } }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0.3rem 1rem 0.3rem 1.5rem',
                    background: selected?.id === v.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                    color: selected?.id === v.id ? '#c4b5fd' : '#888',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    borderLeft: selected?.id === v.id ? '2px solid #7c3aed' : '2px solid transparent',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ flex: 1 }}>v{v.version}</span>
                  <StatusBadge isActive={v.isActive} />
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(v.id); }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                    title="Delete"
                  >×</button>
                </div>
              ))}
            </div>
          ))}
        </nav>
        <button
          onClick={load}
          style={{ margin: '0.5rem', padding: '0.35rem', border: '1px solid #2a2a4e', borderRadius: 5, background: 'transparent', color: '#666', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          ↺ Refresh
        </button>
      </div>
      <div className="admin-content">
        <Msg msg={msg} />
        {(showNew || selected) ? (
          <DefinitionEditor
            key={selected?.id ?? 'new'}
            def={showNew ? null : selected}
            allDefs={defs}
            onSaved={handleSaved}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16, color: '#444' }}>
            <div style={{ fontSize: '2rem' }}>🎛️</div>
            <div style={{ fontSize: '0.9rem' }}>Select a definition to edit, or create a new one</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScreenComposerPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return <ScreenComposer />;
}

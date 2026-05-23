import { Component, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import { ScreenCompositionRenderer } from '../../screens/ScreenCompositionRenderer';
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

// ─── Component registry ───────────────────────────────────────────────────────

const SCREEN_COMPONENT_KEYS = [
  'ResourceSummaryBar', 'SeasonBanner', 'BannerCarousel', 'QuickStatusCards',
  'DailyQuestPanel', 'GlobalBuffsSection', 'CraftingWorkshopsCard',
  'MissionFeaturedCard', 'ActiveMissionList', 'EmptyStateCard', 'HelpTipCard',
  'CTAButtonGroup', 'SkeletonCard', 'DailyCheckInCard', 'FeaturedBirdCard',
  'StoreOfferCard', 'StoreOfferCarousel', 'StoreItemGrid', 'StoreItemRail',
  'FeaturedShopRail', 'GemPackGrid', 'BattlePassProgress', 'BattlePassTierList',
  'EventCarousel', 'EventCardList', 'SeasonBossPanel', 'NewsCard',
  'AnnouncementFeed', 'MissionCategoryRail', 'CraftingQueuePreview',
  'RecipeCategoryRail', 'OutpostReadyList', 'OutpostSummaryCards',
  'InventoryCategoryGrid', 'WalletPromptCard', 'NFTCapacityInfoCard',
  'PatchNotesCard',
];

const LAYOUT_TYPES = [
  'vertical_feed', 'tabbed_feed', 'grid', 'split_panel', 'modal_stack',
  'wizard', 'fixed_structure', 'hero_stack', 'grid_feed', 'carousel_feed',
];

const DEF_TYPES = ['screen_composition', 'content_document'] as const;
type DefType = typeof DEF_TYPES[number];

// ─── Prop schema hints (from render-blocks.md) ────────────────────────────────

interface PropHint { type: 'string' | 'number' | 'boolean' | 'array' | 'object'; description?: string; required?: boolean; }

const COMPONENT_PROP_HINTS: Record<string, Record<string, PropHint>> = {
  ResourceSummaryBar: { maxItems: { type: 'number', description: 'Max currencies shown (default: 4)' } },
  EmptyStateCard: {
    message: { type: 'string', description: 'Text shown in the empty state', required: true },
    actionKey: { type: 'string', description: 'Action key emitted when button tapped (omit to hide button)' },
    actionLabel: { type: 'string', description: 'Button label text (default: "OK")' },
  },
  HelpTipCard: {
    icon: { type: 'string', description: 'Emoji shown as lead icon (default: "ℹ️")' },
    title: { type: 'string', description: 'Bold title above message' },
    message: { type: 'string', description: 'Body text of the tip', required: true },
  },
  CTAButtonGroup: {
    buttons: {
      type: 'array',
      description: 'Array of { actionKey: string, label: string, style?: "primary"|"secondary" }',
      required: true,
    },
  },
  SkeletonCard: {},
  DailyCheckInCard: {},
  StoreOfferCard: {},
  StoreOfferCarousel: {},
  StoreItemGrid: {},
  StoreItemRail: {},
  FeaturedShopRail: {},
  GemPackGrid: {},
  BattlePassProgress: {},
  BattlePassTierList: {},
};

// ─── Small shared UI ──────────────────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase' as const,
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
      padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
      background: isScreen ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.12)',
      color: isScreen ? '#a78bfa' : '#60a5fa',
      border: `1px solid ${isScreen ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.25)'}`,
    }}>
      {isScreen ? 'screen' : 'content'}
    </span>
  );
}

function Msg({ msg }: { msg: { text: string; type: 'success' | 'error' } | null }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.85rem',
      background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
      color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
      border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
    }}>{msg.text}</div>
  );
}

// ─── Structured props editor ──────────────────────────────────────────────────

type PropType = 'string' | 'number' | 'boolean' | 'json';

function detectPropType(val: unknown): PropType {
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';
  if (val !== null && (typeof val === 'object' || Array.isArray(val))) return 'json';
  return 'string';
}

function PropsEditor({
  props,
  onChange,
  componentKey,
}: {
  props: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  componentKey: string;
}) {
  const hints = COMPONENT_PROP_HINTS[componentKey] ?? {};
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [jsonTexts, setJsonTexts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<PropType>('string');
  const [showAdd, setShowAdd] = useState(false);

  const entries = Object.entries(props);
  const hasHints = Object.keys(hints).length > 0;
  const suggestedKeys = Object.keys(hints).filter(k => !(k in props));

  const updateProp = (key: string, val: unknown) => onChange({ ...props, [key]: val });
  const removeProp = (key: string) => {
    const next = { ...props };
    delete next[key];
    onChange(next);
  };

  const getJsonText = (key: string, val: unknown) => {
    if (jsonTexts[key] !== undefined) return jsonTexts[key];
    return JSON.stringify(val, null, 2);
  };

  const handleJsonChange = (key: string, text: string) => {
    setJsonTexts(t => ({ ...t, [key]: text }));
    try {
      const parsed = JSON.parse(text);
      setJsonErrors(e => { const n = { ...e }; delete n[key]; return n; });
      updateProp(key, parsed);
    } catch {
      setJsonErrors(e => ({ ...e, [key]: 'Invalid JSON' }));
    }
  };

  const addProp = () => {
    if (!newKey.trim()) return;
    const defaultVal = newType === 'number' ? 0 : newType === 'boolean' ? false : newType === 'json' ? [] : '';
    onChange({ ...props, [newKey.trim()]: defaultVal });
    setNewKey('');
    setShowAdd(false);
  };

  const addHintedProp = (key: string, hint: PropHint) => {
    const defaultVal = hint.type === 'number' ? 0 : hint.type === 'boolean' ? false
      : hint.type === 'array' ? [] : hint.type === 'object' ? {} : '';
    onChange({ ...props, [key]: defaultVal });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {hasHints && (
        <div style={{ fontSize: 11, color: '#888', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 5, padding: '6px 10px' }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>Props for {componentKey}:</span>
          {Object.entries(hints).map(([k, h]) => (
            <span key={k} style={{ display: 'inline-block', marginLeft: 8 }}>
              <code style={{ color: h.required ? '#f87171' : '#e0e0ff', fontSize: 11 }}>{k}</code>
              <span style={{ color: '#666' }}>: {h.type}{h.required ? '*' : ''}</span>
              {h.description && <span style={{ color: '#555', marginLeft: 4 }}>— {h.description}</span>}
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>No props set — add one below.</div>
      )}

      {entries.map(([key, val]) => {
        const ptype = detectPropType(val);
        const hint = hints[key];
        return (
          <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ ...labelStyle, paddingTop: 6, minWidth: 100, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={key}>{key}</span>
            <div style={{ flex: 1 }}>
              {ptype === 'boolean' ? (
                <select
                  value={String(val)}
                  onChange={e => updateProp(key, e.target.value === 'true')}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : ptype === 'number' ? (
                <input
                  type="number"
                  value={String(val)}
                  onChange={e => updateProp(key, Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%' }}
                />
              ) : ptype === 'json' ? (
                <div>
                  {hint?.description && (
                    <div style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{hint.description}</div>
                  )}
                  <textarea
                    value={getJsonText(key, val)}
                    onChange={e => handleJsonChange(key, e.target.value)}
                    rows={3}
                    style={{
                      ...inputStyle, width: '100%', resize: 'vertical' as const,
                      fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' as const,
                      color: jsonErrors[key] ? '#ff6b6b' : '#a0e0a0',
                    }}
                  />
                  {jsonErrors[key] && <span style={{ color: '#ff6b6b', fontSize: 10 }}>{jsonErrors[key]}</span>}
                </div>
              ) : (
                <input
                  type="text"
                  value={String(val ?? '')}
                  onChange={e => updateProp(key, e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                />
              )}
            </div>
            <button
              type="button"
              style={{ ...dangerIconButtonStyle, marginTop: 2, flexShrink: 0 }}
              onClick={() => removeProp(key)}
              title="Remove prop"
            >×</button>
          </div>
        );
      })}

      {suggestedKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 2 }}>
          {suggestedKeys.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => addHintedProp(k, hints[k])}
              style={{
                padding: '2px 8px', border: '1px dashed #4b5563', borderRadius: 4,
                background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 10,
                fontFamily: 'inherit',
              }}
            >+ {k}</button>
          ))}
        </div>
      )}

      {showAdd ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addProp(); if (e.key === 'Escape') setShowAdd(false); }}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="propKey"
            autoFocus
          />
          <select value={newType} onChange={e => setNewType(e.target.value as PropType)} style={{ ...selectStyle, width: 90 }}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="json">JSON</option>
          </select>
          <button type="button" style={{ ...iconButtonStyle, color: '#4caf50', borderColor: '#1e3a1e' }} onClick={addProp}>+</button>
          <button type="button" style={iconButtonStyle} onClick={() => setShowAdd(false)}>×</button>
        </div>
      ) : (
        <button type="button" style={{ ...addButtonStyle, alignSelf: 'flex-start' }} onClick={() => setShowAdd(true)}>
          + Add prop
        </button>
      )}
    </div>
  );
}

// ─── Section editor ───────────────────────────────────────────────────────────

function newSection(idx: number) {
  return { id: `section_${idx + 1}`, component: 'HelpTipCard', priority: (idx + 1) * 10, props: {} };
}

function SectionEditor({ sections, onChange }: { sections: any[]; onChange: (s: any[]) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) => setExpanded(prev => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });

  const update = (idx: number, patch: any) => {
    onChange(sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  const remove = (idx: number) => {
    setExpanded(prev => {
      const s = new Set<number>();
      prev.forEach(i => { if (i !== idx) s.add(i > idx ? i - 1 : i); });
      return s;
    });
    onChange(sections.filter((_, i) => i !== idx));
  };

  const add = () => {
    const idx = sections.length;
    setExpanded(prev => new Set([...prev, idx]));
    onChange([...sections, newSection(idx)]);
  };

  // Rule that is deterministically false: keeper level is always >= 1, never < 0.
  // When user is null, the path resolves to undefined and less_than returns false.
  const ADMIN_HIDDEN_VISIBILITY = { any: [{ path: 'user.keeperLevel', operator: 'less_than', value: 0 }] };

  const isHidden = (section: any) => {
    const v = section.visibility;
    return (
      v?.any?.length === 1 &&
      v.any[0].path === 'user.keeperLevel' &&
      v.any[0].operator === 'less_than' &&
      v.any[0].value < 0
    );
  };

  const toggleVisibility = (idx: number, section: any) => {
    if (isHidden(section)) {
      const next = { ...section };
      delete next.visibility;
      onChange(sections.map((s, i) => i === idx ? next : s));
    } else {
      update(idx, { visibility: ADMIN_HIDDEN_VISIBILITY });
    }
  };

  const CUSTOM_SENTINEL = '__custom__';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
        Sections ({sections.length})
      </div>

      {sections.map((section, idx) => {
        const isOpen = expanded.has(idx);
        const isCustom = !SCREEN_COMPONENT_KEYS.includes(section.component) && section.component;
        const hidden = isHidden(section);

        return (
          <div key={idx} style={{
            ...entryCardStyle,
            opacity: hidden ? 0.55 : 1,
            border: hidden ? '1px dashed #3a3a5e' : '1px solid #2a2a4e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              <button
                type="button"
                onClick={() => toggle(idx)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: '0 2px', flexShrink: 0 }}
              >
                {isOpen ? '▼' : '▶'}
              </button>
              <span style={{ ...labelStyle, color: '#a78bfa', minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: '1 1 60px' }}>
                {section.component || '—'}
              </span>
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{section.id}</span>
              <span style={{ fontSize: 10, color: '#444' }}>p:{section.priority}</span>
              <button
                type="button"
                title={hidden ? 'Section hidden — click to show' : 'Click to hide section'}
                onClick={() => toggleVisibility(idx, section)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: hidden ? '#555' : '#a78bfa', padding: '0 2px', flexShrink: 0,
                }}
              >{hidden ? '👁️‍🗨️' : '👁️'}</button>
              <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
                <button type="button" style={iconButtonStyle} disabled={idx === 0} onClick={() => move(idx, idx - 1)} title="Move up">↑</button>
                <button type="button" style={iconButtonStyle} disabled={idx === sections.length - 1} onClick={() => move(idx, idx + 1)} title="Move down">↓</button>
                <button type="button" style={dangerIconButtonStyle} onClick={() => remove(idx)} title="Remove">×</button>
              </div>
            </div>

            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px solid #1a1a3e' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <div style={{ ...fieldGroupStyle, flex: '2 1 140px' }}>
                    <span style={labelStyle}>id</span>
                    <input type="text" value={section.id ?? ''} onChange={e => update(idx, { id: e.target.value })} style={{ ...inputStyle, width: '100%' }} placeholder="section_id" />
                  </div>
                  <div style={{ ...fieldGroupStyle, flex: '3 1 180px' }}>
                    <span style={labelStyle}>component</span>
                    {isCustom ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="text" value={section.component ?? ''} onChange={e => update(idx, { component: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                        <button type="button" style={{ ...iconButtonStyle, fontSize: 9, padding: '0 5px', width: 'auto' }} onClick={() => update(idx, { component: SCREEN_COMPONENT_KEYS[0] })}>list</button>
                      </div>
                    ) : (
                      <select
                        value={section.component || ''}
                        onChange={e => {
                          if (e.target.value === CUSTOM_SENTINEL) update(idx, { component: '' });
                          else update(idx, { component: e.target.value });
                        }}
                        style={{ ...selectStyle, width: '100%' }}
                      >
                        {SCREEN_COMPONENT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                        <option value={CUSTOM_SENTINEL}>— custom key —</option>
                      </select>
                    )}
                  </div>
                  <div style={{ ...fieldGroupStyle, flex: '0 0 76px' }}>
                    <span style={labelStyle}>priority</span>
                    <input type="number" value={section.priority ?? 0} onChange={e => update(idx, { priority: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                </div>

                <div>
                  <span style={{ ...labelStyle, display: 'block', marginBottom: 5 }}>props</span>
                  <PropsEditor
                    props={section.props ?? {}}
                    onChange={p => update(idx, { props: p })}
                    componentKey={section.component}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" style={addButtonStyle} onClick={add}>+ Add Section</button>
    </div>
  );
}

// ─── Renderer error boundary ──────────────────────────────────────────────────

class RendererErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; msg: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, msg: err.message };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[ScreenComposer preview]', err.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, color: '#f87171', fontSize: 12, fontFamily: 'monospace', background: '#0a0a1a', borderRadius: 6 }}>
          Preview error: {this.state.msg}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Preview panel ────────────────────────────────────────────────────────────

function PreviewPanel({ draftRow, type, data }: { draftRow: any; type: string; data: any }) {
  if (type !== 'screen_composition') {
    const blocks = data?.blocks ?? [];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Content Preview ({blocks.length} blocks)
        </div>
        {blocks.map((block: any, i: number) => (
          <div key={i} style={{ background: '#13132b', border: '1px solid #2a2a4e', borderRadius: 5, padding: '6px 10px' }}>
            <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>{block.type}</span>
            {block.text && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(block.text).slice(0, 80)}</div>}
            {block.content && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(block.content).slice(0, 80)}</div>}
          </div>
        ))}
        {blocks.length === 0 && <div style={{ color: '#444', fontSize: 12, fontStyle: 'italic' }}>No blocks</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
        Live Preview <span style={{ fontSize: 9, color: '#555', fontWeight: 400, textTransform: 'none' as const }}>(debounced · admin-mode)</span>
      </div>
      <div style={{
        background: '#080818',
        border: '1px solid #2a2a4e',
        borderRadius: 10,
        overflowY: 'auto',
        flex: 1,
        minHeight: 200,
        padding: '0 0 8px',
      }}>
        <RendererErrorBoundary key={draftRow.key + '/' + draftRow.version}>
          <ScreenCompositionRenderer definition={draftRow} />
        </RendererErrorBoundary>
      </div>
    </div>
  );
}

// ─── Layout editor ────────────────────────────────────────────────────────────

function LayoutEditor({ layout, onChange }: { layout: any; onChange: (l: any) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>layoutType</span>
        <select value={layout?.layoutType ?? 'vertical_feed'} onChange={e => onChange({ ...(layout ?? {}), layoutType: e.target.value })} style={selectStyle}>
          {LAYOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>scroll</span>
        <select value={layout?.scroll !== false ? 'true' : 'false'} onChange={e => onChange({ ...(layout ?? {}), scroll: e.target.value === 'true' })} style={{ ...selectStyle, width: 80 }}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>maxWidth</span>
        <select value={layout?.maxWidth ?? ''} onChange={e => onChange({ ...(layout ?? {}), maxWidth: e.target.value || undefined })} style={{ ...selectStyle, width: 140 }}>
          <option value="">— none —</option>
          <option value="mobile_full">mobile_full</option>
          <option value="content">content</option>
          <option value="wide">wide</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>gap</span>
        <select value={layout?.gap ?? ''} onChange={e => onChange({ ...(layout ?? {}), gap: e.target.value || undefined })} style={{ ...selectStyle, width: 100 }}>
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

// ─── Main definition editor ───────────────────────────────────────────────────

function DefinitionEditor({
  def,
  allDefs,
  onSaved,
}: {
  def: any | null;
  allDefs: any[];
  onSaved: (updated: any) => void;
}) {
  const isNew = !def || !def.id;

  const [form, setForm] = useState<{ type: DefType; key: string; version: string; startsAt: string; endsAt: string; }>({
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

  // Debounced draft for the live preview (400 ms)
  const [debouncedData, setDebouncedData] = useState(data);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedData(data), 400);
    return () => clearTimeout(debounceTimer.current);
  }, [data]);

  const draftRow = useMemo(() => ({
    id: def?.id || 'preview-draft',
    type: form.type,
    key: form.key || 'preview',
    version: Number(form.version) || 0,
    isActive: false,
    data: debouncedData,
    startsAt: null,
    endsAt: null,
  }), [def?.id, form.type, form.key, form.version, debouncedData]);

  const switchToJson = () => { setRawJson(JSON.stringify(data, null, 2)); setJsonError(''); setJsonMode(true); };
  const switchToVisual = () => {
    if (rawJson) {
      try { setData(JSON.parse(rawJson)); setJsonError(''); }
      catch { setJsonError('Invalid JSON — fix before switching'); return; }
    }
    setJsonMode(false);
  };
  const handleRawJsonChange = (text: string) => {
    setRawJson(text);
    try { setData(JSON.parse(text)); setJsonError(''); }
    catch { setJsonError('Invalid JSON'); }
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
    const clash = allDefs.find(d => d.type === form.type && d.key === form.key.trim() && d.version === Number(form.version));
    if (clash) return `Version ${form.version} already exists for key "${form.key}"`;
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setMsg({ text: err, type: 'error' }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = buildPayload();
      const saved = isNew
        ? await adminApi.createGameDefinition(payload)
        : await adminApi.updateGameDefinition(def.id, payload);
      setMsg({ text: isNew ? 'Created successfully' : 'Saved successfully', type: 'success' });
      onSaved(saved);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const isScreenComp = form.type === 'screen_composition';
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];
  const layout = data?.layout ?? { layoutType: 'vertical_feed', scroll: true };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' as const }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#e0e0ff' }}>
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
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #555', borderRadius: 5, background: jsonMode ? 'rgba(167,139,250,0.12)' : 'transparent', color: jsonMode ? '#a78bfa' : '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {jsonMode ? '← Visual' : 'JSON ↓'}
          </button>
          <button onClick={save} disabled={saving} className="btn-save" style={{ padding: '0.35rem 1rem', fontSize: '0.85rem' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <Msg msg={msg} />

      <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem 1rem' }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Metadata</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>type</span>
            <select
              value={form.type}
              onChange={e => {
                const t = e.target.value as DefType;
                setForm(f => ({ ...f, type: t }));
                setData(t === 'screen_composition' ? { sections: [], layout: { layoutType: 'vertical_feed', scroll: true } } : { blocks: [] });
              }}
              disabled={!isNew}
              style={{ ...selectStyle, opacity: isNew ? 1 : 0.5 }}
            >
              {DEF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ ...fieldGroupStyle, flex: '2 1 160px' }}>
            <span style={labelStyle}>key</span>
            <input type="text" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} disabled={!isNew} style={{ ...inputStyle, width: '100%', opacity: isNew ? 1 : 0.5 }} placeholder="home_screen" />
          </div>
          <div style={{ ...fieldGroupStyle, flex: '0 0 70px' }}>
            <span style={labelStyle}>version</span>
            <input type="number" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} style={{ ...inputStyle, width: '100%' }} min="1" />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>startsAt</span>
            <input type="datetime-local" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>endsAt</span>
            <input type="datetime-local" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>
      </div>

      {jsonMode ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Raw JSON (data)</div>
          <textarea
            value={rawJson}
            onChange={e => handleRawJsonChange(e.target.value)}
            rows={22}
            style={{ ...inputStyle, flex: 1, resize: 'vertical' as const, fontFamily: 'monospace', fontSize: 12, color: jsonError ? '#ff6b6b' : '#a0e0a0', boxSizing: 'border-box' as const }}
          />
          {jsonError && <span style={{ color: '#ff6b6b', fontSize: 12 }}>{jsonError}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: '0 0 55%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isScreenComp && (
              <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Layout</div>
                <LayoutEditor layout={layout} onChange={l => setData((d: any) => ({ ...d, layout: l }))} />
              </div>
            )}
            <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem' }}>
              {isScreenComp ? (
                <SectionEditor sections={sections} onChange={s => setData((d: any) => ({ ...d, sections: s }))} />
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 10 }}>Content Blocks</div>
                  <ContentDocumentDataEditor value={data} onChange={setData} />
                </>
              )}
            </div>
          </div>
          <div style={{ flex: '0 0 42%', overflowY: 'auto' }}>
            <div style={{ background: '#12122a', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem', height: '100%' }}>
              <PreviewPanel draftRow={draftRow} type={form.type} data={data} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin login ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (loginKey: string) => {
    setLoading(true); setError(''); setAdminKey(loginKey);
    try { await adminApi.getTables(); onLogin(); }
    catch { setError('Invalid admin key'); }
    finally { setLoading(false); }
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

// ─── Main composer ────────────────────────────────────────────────────────────

function ScreenComposer() {
  const [defs, setDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | DefType>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dupeSource, setDupeSource] = useState<any | null>(null);
  const [globalMsg, setGlobalMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await adminApi.list('gameDefinition');
      setDefs(all);
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: any) => {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === updated.id);
      return idx >= 0
        ? prev.map((d, i) => i === idx ? updated : d)
        : [...prev, updated];
    });
    setSelected(updated);
    setShowNew(false);
    setDupeSource(null);
  };

  const handlePublish = async (def: any) => {
    if (!confirm(`Publish version ${def.version} of "${def.key}"? All other active versions for this key will be deactivated.`)) return;
    setActionLoading(def.id);
    setGlobalMsg(null);
    try {
      await adminApi.publishGameDefinition(def.key, def.version);
      await load();
      setGlobalMsg({ text: `v${def.version} of "${def.key}" is now live`, type: 'success' });
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setActionLoading(null); }
  };

  const handleRollback = async (def: any) => {
    if (!confirm(`Rollback to v${def.version} of "${def.key}"?`)) return;
    setActionLoading(def.id);
    setGlobalMsg(null);
    try {
      await adminApi.rollbackGameDefinition(def.key, def.version);
      await load();
      setGlobalMsg({ text: `Rolled back to v${def.version} of "${def.key}"`, type: 'success' });
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setActionLoading(null); }
  };

  const handleDuplicate = (def: any) => {
    const sameKey = defs.filter(d => d.type === def.type && d.key === def.key);
    const maxVersion = Math.max(...sameKey.map(d => d.version));
    setDupeSource({ ...def, version: maxVersion + 1, isActive: false, id: undefined });
    setSelected(null);
    setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this definition? This cannot be undone.')) return;
    try {
      await adminApi.deleteGameDefinition(id);
      setDefs(prev => prev.filter(d => d.id !== id));
      if (selected?.id === id) { setSelected(null); setShowNew(false); setDupeSource(null); }
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    }
  };

  const filtered = useMemo(() => defs.filter(d => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (search && !d.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [defs, filterType, search]);

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach(d => {
      const k = `${d.type}::${d.key}`;
      if (!map[k]) map[k] = [];
      map[k].push(d);
    });
    return Object.entries(map).map(([, items]) => ({
      key: items[0].key,
      type: items[0].type,
      versions: items.sort((a, b) => b.version - a.version),
    }));
  }, [filtered]);

  const activeEditor = dupeSource ? dupeSource : selected;
  const showEditor = showNew || !!activeEditor;

  const createNewBlank = () => { setSelected(null); setDupeSource(null); setShowNew(true); };

  return (
    <div className="admin-panel">
      <div className="admin-sidebar" style={{ minWidth: 240, maxWidth: 280 }}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Screen Composer</h2>
            <a href="/admin" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'none' }}>← Admin</a>
          </div>
          <button className="btn-save" style={{ width: '100%', padding: '0.4rem', fontSize: '0.82rem' }} onClick={createNewBlank}>
            + New Definition
          </button>
          <input type="text" placeholder="Filter by key…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {(['all', 'screen_composition', 'content_document'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{ flex: 1, padding: '0.22rem 0', border: '1px solid #2a2a4e', borderRadius: 4, background: filterType === t ? 'rgba(139,92,246,0.15)' : 'transparent', color: filterType === t ? '#a78bfa' : '#666', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em' }}
              >
                {t === 'all' ? 'All' : t === 'screen_composition' ? 'Screen' : 'Content'}
              </button>
            ))}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0.4rem 0', overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ color: '#666', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>Loading…</div>}
          {!loading && groups.length === 0 && (
            <div style={{ color: '#555', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>No definitions found</div>
          )}
          {groups.map(({ key, type, versions }) => (
            <div key={`${type}::${key}`} style={{ borderBottom: '1px solid #1a1a3e' }}>
              <div style={{ padding: '0.45rem 0.8rem 0.2rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <TypeBadge type={type} />
                <span style={{ fontSize: '0.78rem', color: '#e0e0ff', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {key}
                </span>
              </div>
              {versions.map(v => {
                const isActive = actionLoading === v.id;
                return (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0.25rem 0.8rem 0.25rem 1.4rem',
                      background: (selected?.id === v.id || dupeSource?.id === v.id) ? 'rgba(139,92,246,0.12)' : 'transparent',
                      borderLeft: (selected?.id === v.id || dupeSource?.id === v.id) ? '2px solid #7c3aed' : '2px solid transparent',
                    }}
                  >
                    <span
                      onClick={() => { setSelected(v); setDupeSource(null); setShowNew(false); }}
                      style={{ flex: 1, fontSize: '0.78rem', color: '#888', cursor: 'pointer' }}
                    >v{v.version}</span>
                    <StatusBadge isActive={v.isActive} />
                    {!v.isActive && (
                      <button
                        onClick={() => handlePublish(v)}
                        disabled={isActive}
                        title="Publish this version"
                        style={{ background: 'none', border: 'none', color: '#4caf50', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: isActive ? 0.5 : 1 }}
                      >↑</button>
                    )}
                    {v.isActive && (
                      <button
                        onClick={() => handleRollback(v)}
                        disabled={isActive}
                        title="Rollback (republish) this version"
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: isActive ? 0.5 : 1 }}
                      >↩</button>
                    )}
                    <button
                      onClick={() => handleDuplicate(v)}
                      title="Duplicate as new version"
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
                    >⎘</button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 1px', lineHeight: 1 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <button onClick={load} style={{ margin: '0.5rem', padding: '0.3rem', border: '1px solid #2a2a4e', borderRadius: 5, background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '0.72rem' }}>
          ↺ Refresh
        </button>
      </div>

      <div className="admin-content" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {globalMsg && <div style={{ marginBottom: 12 }}><Msg msg={globalMsg} /></div>}
        {showEditor ? (
          <DefinitionEditor
            key={showNew ? 'new' : dupeSource ? `dupe-${dupeSource.key}-${dupeSource.version}` : selected?.id}
            def={showNew ? null : dupeSource ?? selected}
            allDefs={defs}
            onSaved={handleSaved}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14, color: '#444' }}>
            <div style={{ fontSize: '2.5rem' }}>🎛️</div>
            <div style={{ fontSize: '0.9rem' }}>Select a definition to edit, or create a new one</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function ScreenComposerPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <ScreenComposer />;
}

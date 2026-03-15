import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ModalSpecV1,
  ModalBlock,
  ModalButton,
  ModalAction,
  RichTextDoc,
  RichTextNode,
  ModalHeader,
} from '@derp/shared';
import { MODAL_BLOCK_TYPES, MODAL_ACTION_TYPES } from '@derp/shared';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import BlockRenderer from '../../../components/modal/blocks/BlockRenderer';
import '../../../components/modal/GameModal.css';
import '../admin.css';
import './ModalEditorPage.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

// ─── Rich text helpers ────────────────────────────────────────────────────────

function domNodesToRichText(nodes: NodeList): RichTextNode[] {
  return Array.from(nodes).flatMap((n): RichTextNode[] => {
    if (n.nodeType === Node.TEXT_NODE) {
      const v = n.textContent || '';
      return v ? [{ t: 'text', v }] : [];
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return [];
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const c = domNodesToRichText(el.childNodes);
    if (tag === 'br') return [{ t: 'br' }];
    if (tag === 'a') return [{ t: 'link', href: el.getAttribute('href') || '', c }];
    if (['p', 'h1', 'h2', 'ul', 'li', 'strong', 'em', 'code'].includes(tag)) {
      return [{ t: tag as 'p', c }];
    }
    return c;
  });
}

function htmlToRichTextDoc(html: string): RichTextDoc {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return domNodesToRichText(doc.body.childNodes);
}

function nodeToHtml(n: RichTextNode): string {
  if (n.t === 'text') return n.v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (n.t === 'br') return '<br>';
  if (n.t === 'token') return `{{${n.key}}}`;
  if (n.t === 'link') return `<a href="${n.href}">${n.c.map(nodeToHtml).join('')}</a>`;
  return `<${n.t}>${n.c.map(nodeToHtml).join('')}</${n.t}>`;
}

function richTextDocToHtml(doc: RichTextDoc): string {
  return doc.map(nodeToHtml).join('');
}

// ─── Block defaults ───────────────────────────────────────────────────────────

const BLOCK_DEFAULTS: Record<string, () => ModalBlock> = {
  richText: () => ({ type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: 'Enter text...' }] }] }),
  divider: () => ({ type: 'divider' }),
  image: () => ({ type: 'image', image: { assetKey: '', alt: '' }, caption: '' }),
  metaRows: () => ({ type: 'metaRows', rows: [{ label: 'Label', value: 'Value' }] }),
  timer: () => ({ type: 'timer', endsAt: new Date(Date.now() + 3_600_000).toISOString(), label: 'Time Remaining' }),
  progress: () => ({ type: 'progress', label: 'Progress', current: 50, max: 100 }),
  rewardsPreview: () => ({ type: 'rewardsPreview', items: [{ name: 'Reward', qty: 1 }] }),
  rewardsList: () => ({ type: 'rewardsList', title: 'Rewards', items: [{ name: 'Reward', qty: 1 }] }),
  inventoryDelta: () => ({ type: 'inventoryDelta', items: [{ name: 'Item', qtyDelta: 1 }] }),
  giftReveal: () => ({ type: 'giftReveal', gift: { giftId: '', title: 'Gift Name' } }),
  error: () => ({ type: 'error', message: 'Something went wrong.' }),
};

const BLOCK_COLORS: Record<string, string> = {
  richText: '#818cf8', divider: '#64748b', image: '#22d3ee', metaRows: '#a78bfa',
  timer: '#fb923c', progress: '#34d399', rewardsPreview: '#fbbf24',
  rewardsList: '#fbbf24', inventoryDelta: '#f472b6', giftReveal: '#f59e0b', error: '#ef4444',
};

const BUTTON_DEFAULTS: () => ModalButton = () => ({
  id: `btn_${Date.now()}`, label: 'Button', variant: 'secondary', action: { type: 'CLOSE_MODAL' },
});

const DEFAULT_SPEC: ModalSpecV1 = {
  version: 1, id: '', kind: 'custom',
  dismiss: { backdrop: true, x: true, escape: true },
  header: { title: '', subtitle: '' },
  body: [],
  buttons: [{ id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } }],
};

const DEFAULT_DB = { id: '', name: '', description: '', enabled: true, version: 1 };

// ─── Shared input styles ──────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '6px 10px', background: '#0a0a1e', border: '1px solid #2a2a4e',
  borderRadius: 6, color: '#e0e0ff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

// ─── Section (collapsible) ────────────────────────────────────────────────────

function Section({ title, open, onToggle, badge, children }: {
  title: string; open: boolean; onToggle: () => void;
  badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="me-section">
      <button className="me-section-hdr" onClick={onToggle} type="button">
        <span className="me-section-chevron">{open ? '▼' : '▶'}</span>
        <span className="me-section-title">{title}</span>
        {badge && <span className="me-section-badge">{badge}</span>}
      </button>
      {open && <div className="me-section-body">{children}</div>}
    </div>
  );
}

// ─── Block Editor ─────────────────────────────────────────────────────────────

function RewardItemsEditor({ items, onChange }: { items: any[]; onChange: (v: any[]) => void }) {
  const add = () => onChange([...items, { name: '', qty: 1 }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const set = (i: number, k: string, v: any) => {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    onChange(next);
  };
  return (
    <div>
      {items.map((item: any, i: number) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input style={{ ...inp, flex: 2 }} placeholder="name" value={item.name || ''} onChange={e => set(i, 'name', e.target.value)} />
          <input style={{ ...inp, flex: 1, width: 60 }} placeholder="qty" type="number" value={item.qty ?? 1} onChange={e => set(i, 'qty', Number(e.target.value))} />
          <input style={{ ...inp, flex: 1 }} placeholder="assetKey" value={item.assetKey || ''} onChange={e => set(i, 'assetKey', e.target.value)} />
          <input style={{ ...inp, flex: 1 }} placeholder="rarity" value={item.rarity || ''} onChange={e => set(i, 'rarity', e.target.value)} />
          <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add} className="me-add-btn">+ Add item</button>
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: ModalBlock; onChange: (b: ModalBlock) => void }) {
  const set = (updates: object) => onChange({ ...block, ...updates } as ModalBlock);

  switch (block.type) {
    case 'richText': {
      const html = richTextDocToHtml(block.doc || []);
      return (
        <Field label="HTML content (supports <p> <strong> <em> <h1> <h2> <ul> <li> <code> <a> <br>)">
          <textarea
            style={{ ...inp, height: 100, resize: 'vertical' }}
            value={html}
            onChange={e => set({ doc: htmlToRichTextDoc(e.target.value) })}
          />
        </Field>
      );
    }
    case 'divider':
      return <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>No fields — renders a horizontal rule.</div>;

    case 'image':
      return (
        <>
          <Field label="Asset Key"><input style={inp} value={(block as any).image?.assetKey || ''} onChange={e => set({ image: { ...(block as any).image, assetKey: e.target.value } })} /></Field>
          <Field label="Alt text"><input style={inp} value={(block as any).image?.alt || ''} onChange={e => set({ image: { ...(block as any).image, alt: e.target.value } })} /></Field>
          <Field label="Caption"><input style={inp} value={(block as any).caption || ''} onChange={e => set({ caption: e.target.value })} /></Field>
        </>
      );

    case 'metaRows': {
      const rows = (block as any).rows || [];
      const setRows = (next: any[]) => set({ rows: next });
      const addRow = () => setRows([...rows, { label: '', value: '' }]);
      const removeRow = (i: number) => setRows(rows.filter((_: any, j: number) => j !== i));
      const setRow = (i: number, k: string, v: string) => {
        const next = [...rows];
        next[i] = { ...next[i], [k]: v };
        setRows(next);
      };
      return (
        <div>
          {rows.map((r: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={{ ...inp, flex: 1 }} placeholder="Label" value={r.label || ''} onChange={e => setRow(i, 'label', e.target.value)} />
              <input style={{ ...inp, flex: 2 }} placeholder="Value" value={r.value || ''} onChange={e => setRow(i, 'value', e.target.value)} />
              <button type="button" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="me-add-btn">+ Add row</button>
        </div>
      );
    }

    case 'timer': {
      const endsAt = (block as any).endsAt ? new Date((block as any).endsAt).toISOString().slice(0, 16) : '';
      return (
        <Row>
          <div style={{ flex: 2 }}>
            <Field label="Ends At (UTC)">
              <input type="datetime-local" style={inp} value={endsAt}
                onChange={e => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Label"><input style={inp} value={(block as any).label || ''} onChange={e => set({ label: e.target.value })} /></Field>
          </div>
        </Row>
      );
    }

    case 'progress':
      return (
        <Row>
          <div style={{ flex: 2 }}>
            <Field label="Label"><input style={inp} value={(block as any).label || ''} onChange={e => set({ label: e.target.value })} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Current"><input type="number" style={inp} value={(block as any).current ?? 0} onChange={e => set({ current: Number(e.target.value) })} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Max"><input type="number" style={inp} value={(block as any).max ?? 100} onChange={e => set({ max: Number(e.target.value) })} /></Field>
          </div>
        </Row>
      );

    case 'rewardsPreview':
      return (
        <Field label="Items (name, qty, assetKey, rarity)">
          <RewardItemsEditor items={(block as any).items || []} onChange={v => set({ items: v })} />
        </Field>
      );

    case 'rewardsList':
      return (
        <>
          <Field label="Title (optional)"><input style={inp} value={(block as any).title || ''} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="Items (name, qty, assetKey, rarity)">
            <RewardItemsEditor items={(block as any).items || []} onChange={v => set({ items: v })} />
          </Field>
        </>
      );

    case 'inventoryDelta': {
      const items = (block as any).items || [];
      const setItems = (next: any[]) => set({ items: next });
      const addItem = () => setItems([...items, { name: '', qtyDelta: 1 }]);
      const removeItem = (i: number) => setItems(items.filter((_: any, j: number) => j !== i));
      const setItem = (i: number, k: string, v: any) => {
        const next = [...items];
        next[i] = { ...next[i], [k]: v };
        setItems(next);
      };
      return (
        <div>
          {items.map((it: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={{ ...inp, flex: 2 }} placeholder="name" value={it.name || ''} onChange={e => setItem(i, 'name', e.target.value)} />
              <input type="number" style={{ ...inp, flex: 1, width: 70 }} placeholder="qty delta" value={it.qtyDelta ?? 1} onChange={e => setItem(i, 'qtyDelta', Number(e.target.value))} />
              <input style={{ ...inp, flex: 1 }} placeholder="assetKey" value={it.assetKey || ''} onChange={e => setItem(i, 'assetKey', e.target.value)} />
              <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="me-add-btn">+ Add item</button>
        </div>
      );
    }

    case 'giftReveal': {
      const gift = (block as any).gift || {};
      const rewards = (block as any).rewards || [];
      return (
        <>
          <Row>
            <div style={{ flex: 1 }}>
              <Field label="Gift ID"><input style={inp} value={gift.giftId || ''} onChange={e => set({ gift: { ...gift, giftId: e.target.value } })} /></Field>
            </div>
            <div style={{ flex: 2 }}>
              <Field label="Title"><input style={inp} value={gift.title || ''} onChange={e => set({ gift: { ...gift, title: e.target.value } })} /></Field>
            </div>
          </Row>
          <Field label="Rewards (optional)">
            <RewardItemsEditor items={rewards} onChange={v => set({ rewards: v })} />
          </Field>
        </>
      );
    }

    case 'error':
      return (
        <Field label="Message"><input style={inp} value={(block as any).message || ''} onChange={e => set({ message: e.target.value })} /></Field>
      );

    default:
      return <div style={{ color: '#555', fontSize: 12 }}>Unknown block type</div>;
  }
}

// ─── Block List ───────────────────────────────────────────────────────────────

function BlockList({ blocks, onChange }: { blocks: ModalBlock[]; onChange: (b: ModalBlock[]) => void }) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleCollapse = (i: number) => setCollapsed(prev => {
    const s = new Set(prev);
    s.has(i) ? s.delete(i) : s.add(i);
    return s;
  });

  const removeBlock = (i: number) => {
    const next = blocks.filter((_, j) => j !== i);
    setCollapsed(prev => {
      const s = new Set<number>();
      prev.forEach(c => { if (c !== i) s.add(c > i ? c - 1 : c); });
      return s;
    });
    onChange(next);
  };

  const updateBlock = (i: number, b: ModalBlock) => {
    const next = [...blocks];
    next[i] = b;
    onChange(next);
  };

  const addBlock = (type: string) => {
    const fn = BLOCK_DEFAULTS[type];
    if (!fn) return;
    const next = [...blocks, fn()];
    const idx = next.length - 1;
    setCollapsed(prev => { const s = new Set(prev); s.delete(idx); return s; });
    onChange(next);
    setPickerOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, i: number) => {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (i !== dropIdx) setDropIdx(i);
  };
  const handleDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDropIdx(null); return; }
    const next = [...blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setCollapsed(prev => {
      const s = new Set<number>();
      prev.forEach(c => {
        if (c === dragIdx) { s.add(i); return; }
        const adj = c < dragIdx && c >= i ? c + 1 : c > dragIdx && c <= i ? c - 1 : c;
        s.add(adj);
      });
      return s;
    });
    onChange(next);
    setDragIdx(null);
    setDropIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null); };

  return (
    <div>
      {blocks.map((block, i) => {
        const color = BLOCK_COLORS[block.type] || '#888';
        const isCollapsed = collapsed.has(i);
        const isDragging = dragIdx === i;
        const isDropTarget = dropIdx === i && dragIdx !== null && dragIdx !== i;
        return (
          <div
            key={i}
            draggable
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            style={{
              marginBottom: 6, borderRadius: 8,
              border: isDropTarget ? `2px solid ${color}` : '1px solid #2a2a4e',
              background: isDragging ? 'rgba(167,139,250,0.06)' : '#0f0f2e',
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6, borderBottom: isCollapsed ? 'none' : '1px solid #1a1a3e' }}>
              <span style={{ cursor: 'grab', color: '#444', fontSize: 14, userSelect: 'none', padding: '0 2px' }}>⣿</span>
              <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                {block.type}
              </span>
              <button type="button" onClick={() => toggleCollapse(i)} style={{ flex: 1, background: 'none', border: 'none', color: '#888', cursor: 'pointer', textAlign: 'left', fontSize: 11, padding: '2px 0', fontFamily: 'inherit' }}>
                <span style={{ color: '#444', fontSize: 9 }}>{isCollapsed ? '▶' : '▼'}</span>
                {isCollapsed && <span style={{ marginLeft: 6, color: '#555' }}>{block.type === 'richText' ? richTextDocToHtml((block as any).doc || []).replace(/<[^>]+>/g, '').slice(0, 40) || '…' : ''}</span>}
              </button>
              <button type="button" onClick={() => removeBlock(i)} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1, flexShrink: 0 }} title="Remove">×</button>
            </div>
            {!isCollapsed && (
              <div style={{ padding: '10px 12px' }}>
                <BlockEditor block={block} onChange={b => updateBlock(i, b)} />
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => setPickerOpen(p => !p)} className="me-add-btn" style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}>
        + Add block {pickerOpen ? '▲' : '▼'}
      </button>
      {pickerOpen && (
        <div style={{ marginTop: 4, padding: '10px 12px', background: '#0a0a1e', border: '1px dashed #2a2a4e', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MODAL_BLOCK_TYPES.map(t => {
            const color = BLOCK_COLORS[t] || '#888';
            return (
              <button key={t} type="button" onClick={() => addBlock(t)} style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: `${color}18`, border: `1px solid ${color}44`, color, letterSpacing: '0.04em',
                textTransform: 'uppercase', fontFamily: 'inherit',
              }}>{t}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Action Editor ────────────────────────────────────────────────────────────

function ActionEditor({ action, onChange }: { action: ModalAction; onChange: (a: ModalAction) => void }) {
  const type = action.type;
  const set = (extra: object) => onChange({ type, ...extra } as ModalAction);

  const actionTypeFields: Record<string, React.ReactNode> = {
    CLOSE_MODAL: null,
    OPEN_INVENTORY: null,
    OPEN_MISSIONS: null,
    OPEN_CRAFTING: null,
    NAVIGATE: (
      <Field label="Route">
        <input style={inp} value={(action as any).route || ''} onChange={e => set({ route: e.target.value })} />
      </Field>
    ),
    ACK_NOTIFICATION: (
      <Field label="Notification ID">
        <input style={inp} value={(action as any).notificationId || ''} onChange={e => set({ notificationId: e.target.value })} />
      </Field>
    ),
    COMPLETE_JOB: (
      <Field label="Job ID">
        <input style={inp} value={(action as any).jobId || ''} onChange={e => set({ jobId: e.target.value })} />
      </Field>
    ),
    CLAIM_GIFT: (
      <Field label="Gift ID">
        <input style={inp} value={(action as any).giftId || ''} onChange={e => set({ giftId: e.target.value })} />
      </Field>
    ),
    REPEAT_MISSION: (
      <Row>
        <div style={{ flex: 1 }}>
          <Field label="Def ID"><input style={inp} value={(action as any).defId || ''} onChange={e => set({ defId: e.target.value, entityIds: (action as any).entityIds })} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Entity IDs (comma-sep)">
            <input style={inp} value={((action as any).entityIds || []).join(',')} onChange={e => set({ defId: (action as any).defId, entityIds: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} />
          </Field>
        </div>
      </Row>
    ),
    CRAFT_AGAIN: (
      <Field label="Recipe Def ID">
        <input style={inp} value={(action as any).recipeDefId || ''} onChange={e => set({ recipeDefId: e.target.value })} />
      </Field>
    ),
    API_CALL: (
      <Row>
        <div style={{ flex: 1 }}>
          <Field label="API Key"><input style={inp} value={(action as any).apiKey || ''} onChange={e => set({ apiKey: e.target.value, payload: (action as any).payload })} /></Field>
        </div>
        <div style={{ flex: 2 }}>
          <Field label="Payload (JSON)">
            <input style={inp} value={JSON.stringify((action as any).payload || {})} onChange={e => {
              try { set({ apiKey: (action as any).apiKey, payload: JSON.parse(e.target.value) }); } catch {}
            }} />
          </Field>
        </div>
      </Row>
    ),
    BUILD_BUILDING: (
      <Row>
        <div style={{ flex: 1 }}>
          <Field label="Location ID"><input style={inp} value={(action as any).locationId || ''} onChange={e => set({ locationId: e.target.value, buildingDefId: (action as any).buildingDefId })} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Building Def ID"><input style={inp} value={(action as any).buildingDefId || ''} onChange={e => set({ locationId: (action as any).locationId, buildingDefId: e.target.value })} /></Field>
        </div>
      </Row>
    ),
    UPGRADE_BUILDING: (
      <Row>
        <div style={{ flex: 1 }}>
          <Field label="Location ID"><input style={inp} value={(action as any).locationId || ''} onChange={e => set({ locationId: e.target.value, buildingId: (action as any).buildingId })} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Building ID"><input style={inp} value={(action as any).buildingId || ''} onChange={e => set({ locationId: (action as any).locationId, buildingId: e.target.value })} /></Field>
        </div>
      </Row>
    ),
    SHOP_PURCHASE: (
      <Field label="Shop Item Def ID">
        <input style={inp} value={(action as any).shopItemDefId || ''} onChange={e => set({ shopItemDefId: e.target.value })} />
      </Field>
    ),
  };

  return (
    <div>
      <Field label="Action Type">
        <select style={inp} value={type} onChange={e => onChange({ type: e.target.value as any })}>
          {MODAL_ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      {actionTypeFields[type] || null}
    </div>
  );
}

// ─── Button List ──────────────────────────────────────────────────────────────

function ButtonList({ buttons, onChange }: { buttons: ModalButton[]; onChange: (b: ModalButton[]) => void }) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set(buttons.map((_, i) => i)));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const toggleCollapse = (i: number) => setCollapsed(prev => {
    const s = new Set(prev);
    s.has(i) ? s.delete(i) : s.add(i);
    return s;
  });

  const removeBtn = (i: number) => {
    const next = buttons.filter((_, j) => j !== i);
    setCollapsed(prev => {
      const s = new Set<number>();
      prev.forEach(c => { if (c !== i) s.add(c > i ? c - 1 : c); });
      return s;
    });
    onChange(next);
  };

  const updateBtn = (i: number, b: ModalButton) => {
    const next = [...buttons];
    next[i] = b;
    onChange(next);
  };

  const addBtn = () => {
    const next = [...buttons, BUTTON_DEFAULTS()];
    const idx = next.length - 1;
    setCollapsed(prev => { const s = new Set(prev); s.delete(idx); return s; });
    onChange(next);
  };

  const handleDragStart = (e: React.DragEvent, i: number) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); if (i !== dropIdx) setDropIdx(i); };
  const handleDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDropIdx(null); return; }
    const next = [...buttons];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDropIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null); };

  const VARIANT_COLORS: Record<string, string> = { primary: '#10B981', secondary: '#64748b', ghost: '#94a3b8', danger: '#ef4444' };

  return (
    <div>
      {buttons.map((btn, i) => {
        const color = VARIANT_COLORS[btn.variant] || '#888';
        const isCollapsed = collapsed.has(i);
        const isDragging = dragIdx === i;
        const isDropTarget = dropIdx === i && dragIdx !== null && dragIdx !== i;
        return (
          <div
            key={i}
            draggable
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            style={{
              marginBottom: 6, borderRadius: 8,
              border: isDropTarget ? `2px solid ${color}` : '1px solid #2a2a4e',
              background: isDragging ? 'rgba(167,139,250,0.06)' : '#0f0f2e',
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6, borderBottom: isCollapsed ? 'none' : '1px solid #1a1a3e' }}>
              <span style={{ cursor: 'grab', color: '#444', fontSize: 14, userSelect: 'none', padding: '0 2px' }}>⣿</span>
              <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                {btn.variant}
              </span>
              <button type="button" onClick={() => toggleCollapse(i)} style={{ flex: 1, background: 'none', border: 'none', color: '#e0e0ff', cursor: 'pointer', textAlign: 'left', fontSize: 12, padding: '2px 0', fontFamily: 'inherit' }}>
                <span style={{ color: '#444', fontSize: 9, marginRight: 4 }}>{isCollapsed ? '▶' : '▼'}</span>
                {btn.label || '(no label)'}
              </button>
              <button type="button" onClick={() => removeBtn(i)} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
            {!isCollapsed && (
              <div style={{ padding: '10px 12px' }}>
                <Row>
                  <div style={{ flex: 1 }}>
                    <Field label="ID"><input style={inp} value={btn.id} onChange={e => updateBtn(i, { ...btn, id: e.target.value })} /></Field>
                  </div>
                  <div style={{ flex: 2 }}>
                    <Field label="Label"><input style={inp} value={btn.label} onChange={e => updateBtn(i, { ...btn, label: e.target.value })} /></Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Variant">
                      <select style={inp} value={btn.variant} onChange={e => updateBtn(i, { ...btn, variant: e.target.value as any })}>
                        {['primary', 'secondary', 'ghost', 'danger'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Disabled">
                      <div style={{ padding: '8px 0' }}>
                        <input type="checkbox" checked={!!btn.disabled} onChange={e => updateBtn(i, { ...btn, disabled: e.target.checked })} />
                      </div>
                    </Field>
                  </div>
                </Row>
                <div style={{ marginTop: 6, borderTop: '1px solid #1a1a3e', paddingTop: 10 }}>
                  <label style={{ ...lbl, marginBottom: 8 }}>Action</label>
                  <ActionEditor action={btn.action} onChange={a => updateBtn(i, { ...btn, action: a })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={addBtn} className="me-add-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>+ Add button</button>
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function LivePreview({ spec }: { spec: ModalSpecV1 }) {
  return (
    <div className="me-preview-outer">
      <div className="gm-modal me-preview-modal">
        {spec.dismiss.x && (
          <button className="gm-close-btn" style={{ cursor: 'default' }} aria-label="Close">✕</button>
        )}
        <div className="gm-header">
          {spec.header.title ? (
            <h2 className="gm-title">{spec.header.title}</h2>
          ) : (
            <h2 className="gm-title" style={{ color: '#333', fontStyle: 'italic' }}>(no title)</h2>
          )}
          {spec.header.subtitle && <p className="gm-subtitle">{spec.header.subtitle}</p>}
        </div>
        <div className="gm-body">
          {spec.body.length === 0 ? (
            <div style={{ color: '#333', fontSize: 12, textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>(no body blocks)</div>
          ) : (
            spec.body.map((block, idx) => <BlockRenderer key={idx} block={block} />)
          )}
        </div>
        {spec.buttons.length > 0 && (
          <div className="gm-footer">
            {spec.buttons.map(btn => (
              <button key={btn.id} className={`gm-btn gm-btn-${btn.variant}`} style={{ cursor: 'default' }} disabled={btn.disabled}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin Login ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (k: string) => {
    setLoading(true);
    setError('');
    setAdminKey(k);
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
        <h1>Modal Editor</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Derp Universe Admin</p>
        <input type="password" placeholder="Admin Key" value={key} onChange={e => setKey(e.target.value)} autoFocus />
        <button type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Enter'}</button>
        {error && <div className="admin-error">{error}</div>}
        <a href="/admin" style={{ display: 'block', marginTop: 16, color: '#555', fontSize: 12, textDecoration: 'none' }}>← Admin Dashboard</a>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModalEditorPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());
  const [modalList, setModalList] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dbRecord, setDbRecord] = useState({ ...DEFAULT_DB });
  const [spec, setSpec] = useState<ModalSpecV1>({ ...DEFAULT_SPEC });

  const [editorOpen, setEditorOpen] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const [payloadJson, setPayloadJson] = useState('');
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const updateSpec = useCallback((updates: Partial<ModalSpecV1>) => {
    setSpec(s => ({ ...s, ...updates }));
    setDirty(true);
  }, []);

  const updateHeader = useCallback((updates: Partial<ModalHeader>) => {
    setSpec(s => ({ ...s, header: { ...s.header, ...updates } }));
    setDirty(true);
  }, []);

  const updateDismiss = useCallback((updates: Partial<ModalSpecV1['dismiss']>) => {
    setSpec(s => ({ ...s, dismiss: { ...s.dismiss, ...updates } }));
    setDirty(true);
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await adminApi.list('modalDef');
      setModalList(list);
    } catch {
      setModalList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadList();
  }, [authed, loadList]);

  const loadModal = async (id: string) => {
    const rec = await adminApi.get('modalDef', id);
    setDbRecord({ id: rec.id, name: rec.name || '', description: rec.description || '', enabled: rec.enabled ?? true, version: rec.version || 1 });
    setSpec(rec.spec as ModalSpecV1 || { ...DEFAULT_SPEC, id: rec.id });
    setSelectedId(id);
    setDirty(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setDbRecord({ ...DEFAULT_DB });
    setSpec({ ...DEFAULT_SPEC });
    setDirty(false);
  };

  const handleSave = async () => {
    if (!dbRecord.id.trim()) {
      setSaveMsg('⚠ ID is required');
      return;
    }
    if (!dbRecord.name.trim()) {
      setSaveMsg('⚠ Name is required');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        id: dbRecord.id.trim(),
        name: dbRecord.name.trim(),
        description: dbRecord.description || null,
        enabled: dbRecord.enabled,
        version: dbRecord.version || 1,
        spec: { ...spec, id: dbRecord.id.trim() },
      };
      if (!selectedId) {
        await adminApi.create('modalDef', payload);
      } else {
        await adminApi.update('modalDef', selectedId, payload);
      }
      setSelectedId(dbRecord.id.trim());
      setSpec(s => ({ ...s, id: dbRecord.id.trim() }));
      setDirty(false);
      setSaveMsg('✓ Saved');
      await loadList();
    } catch (err: any) {
      setSaveMsg(`✗ ${err.message || 'Save failed'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const loadRecentJobs = async () => {
    setJobsLoading(true);
    try {
      const jobs = await adminApi.listRecentJobs(10);
      setRecentJobs(jobs);
    } catch {
      setRecentJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  const loadJobPayload = (job: any) => {
    const payload = { id: job.id, type: job.type, defId: job.defId, status: job.status, data: job.data || {}, results: job.results || null };
    setPayloadJson(JSON.stringify(payload, null, 2));
  };

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  return (
    <div className="me-page">
      <div className="me-topbar">
        <div className="me-topbar-left">
          <a href="/admin" className="me-back-link">← Admin</a>
          <span className="me-topbar-title">Modal Editor</span>
        </div>
        <div className="me-topbar-right">
          {saveMsg && <span className={`me-save-msg ${saveMsg.startsWith('✓') ? 'me-save-ok' : 'me-save-err'}`}>{saveMsg}</span>}
          {dirty && !saving && <span style={{ fontSize: 11, color: '#f59e0b' }}>● unsaved</span>}
          <button type="button" onClick={handleNew} className="me-btn-ghost">New</button>
          <button type="button" onClick={handleSave} disabled={saving} className="me-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="me-load-bar">
        <select
          className="me-select"
          value={selectedId || ''}
          onChange={e => e.target.value ? loadModal(e.target.value) : handleNew()}
        >
          <option value="">— New modal —</option>
          {modalList.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
          ))}
        </select>
        <button type="button" onClick={loadList} className="me-btn-ghost" disabled={listLoading} style={{ flexShrink: 0 }}>
          {listLoading ? '…' : '↻'}
        </button>
      </div>

      <div className="me-content">
        {/* ── Section 1: Editor ── */}
        <Section title="Editor" open={editorOpen} onToggle={() => setEditorOpen(v => !v)} badge={selectedId ? selectedId : 'new'}>
          <div className="me-card">
            <div className="me-group-title">Database Record</div>
            <Row>
              <div style={{ flex: 1 }}>
                <Field label="ID (slug, e.g. mission_complete)">
                  <input style={inp} value={dbRecord.id} onChange={e => { setDbRecord(d => ({ ...d, id: e.target.value })); setDirty(true); }} />
                </Field>
              </div>
              <div style={{ flex: 2 }}>
                <Field label="Name (display)">
                  <input style={inp} value={dbRecord.name} onChange={e => { setDbRecord(d => ({ ...d, name: e.target.value })); setDirty(true); }} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Version">
                  <input type="number" style={inp} value={dbRecord.version} onChange={e => { setDbRecord(d => ({ ...d, version: Number(e.target.value) })); setDirty(true); }} />
                </Field>
              </div>
            </Row>
            <Row>
              <div style={{ flex: 3 }}>
                <Field label="Description (internal note)">
                  <input style={inp} value={dbRecord.description} onChange={e => { setDbRecord(d => ({ ...d, description: e.target.value })); setDirty(true); }} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Enabled">
                  <div style={{ padding: '7px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={dbRecord.enabled} onChange={e => { setDbRecord(d => ({ ...d, enabled: e.target.checked })); setDirty(true); }} />
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{dbRecord.enabled ? 'Yes' : 'No'}</span>
                  </div>
                </Field>
              </div>
            </Row>
          </div>

          <div className="me-card">
            <div className="me-group-title">Modal Spec</div>
            <Row>
              <div style={{ flex: 1 }}>
                <Field label="Kind (e.g. mission_complete)">
                  <input style={inp} value={spec.kind} onChange={e => updateSpec({ kind: e.target.value })} />
                </Field>
              </div>
            </Row>
            <Field label="Dismiss Options">
              <div style={{ display: 'flex', gap: 16, padding: '6px 0' }}>
                {(['backdrop', 'x', 'escape'] as const).map(k => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>
                    <input type="checkbox" checked={spec.dismiss[k]} onChange={e => updateDismiss({ [k]: e.target.checked })} />
                    {k}
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <div className="me-card">
            <div className="me-group-title">Header</div>
            <Row>
              <div style={{ flex: 2 }}>
                <Field label="Title"><input style={inp} value={spec.header.title} onChange={e => updateHeader({ title: e.target.value })} /></Field>
              </div>
              <div style={{ flex: 2 }}>
                <Field label="Subtitle"><input style={inp} value={spec.header.subtitle || ''} onChange={e => updateHeader({ subtitle: e.target.value })} /></Field>
              </div>
            </Row>
            <Row>
              <div style={{ flex: 1 }}>
                <Field label="Icon asset key"><input style={inp} value={spec.header.icon?.assetKey || ''} onChange={e => updateHeader({ icon: e.target.value ? { assetKey: e.target.value } : undefined })} placeholder="e.g. media/icon.png" /></Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Banner asset key"><input style={inp} value={spec.header.banner?.assetKey || ''} onChange={e => updateHeader({ banner: e.target.value ? { assetKey: e.target.value } : undefined })} placeholder="e.g. media/banner.jpg" /></Field>
              </div>
            </Row>
          </div>

          <div className="me-card">
            <div className="me-group-title">Body Blocks</div>
            <BlockList
              blocks={spec.body}
              onChange={blocks => { updateSpec({ body: blocks }); }}
            />
          </div>

          <div className="me-card">
            <div className="me-group-title">Buttons</div>
            <ButtonList
              buttons={spec.buttons}
              onChange={buttons => { updateSpec({ buttons }); }}
            />
          </div>
        </Section>

        {/* ── Section 2: Payload ── */}
        <Section title="Payload" open={payloadOpen} onToggle={() => setPayloadOpen(v => !v)} badge={payloadJson ? 'active' : undefined}>
          <div className="me-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: '#64748b', fontSize: 12, flex: 1 }}>
                Paste sample JSON to simulate dynamic data (e.g. job results). Used for reference when designing blocks.
              </span>
              <button type="button" onClick={loadRecentJobs} disabled={jobsLoading} className="me-btn-ghost" style={{ flexShrink: 0 }}>
                {jobsLoading ? '…' : 'Load recent jobs'}
              </button>
            </div>

            {recentJobs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Recent Jobs (click to load as payload)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {recentJobs.map(j => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => loadJobPayload(j)}
                      style={{
                        padding: '6px 10px', background: '#0a0a1e', border: '1px solid #2a2a4e',
                        borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12,
                        textAlign: 'left', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>{j.type}</span>
                      <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.defId}</span>
                      <span style={{ color: j.status === 'completed' ? '#34d399' : '#f59e0b', fontSize: 11, flexShrink: 0 }}>{j.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              style={{ ...inp, height: 180, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              value={payloadJson}
              onChange={e => setPayloadJson(e.target.value)}
              placeholder={'{\n  "type": "MissionJob",\n  "results": {...}\n}'}
            />
            {payloadJson && (() => {
              try { JSON.parse(payloadJson); return null; }
              catch (e: any) { return <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Invalid JSON: {e.message}</div>; }
            })()}
            {payloadJson && (
              <button type="button" onClick={() => setPayloadJson('')} className="me-btn-ghost" style={{ marginTop: 8 }}>Clear</button>
            )}
          </div>
        </Section>

        {/* ── Section 3: Preview ── */}
        <Section title="Preview" open={previewOpen} onToggle={() => setPreviewOpen(v => !v)}>
          <div className="me-card" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <LivePreview spec={spec} />
          </div>
        </Section>
      </div>
    </div>
  );
}

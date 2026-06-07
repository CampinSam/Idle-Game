import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ModalSpecV1,
  ModalPageSpec,
  ModalBlock,
  ModalButton,
  ModalAction,
  RichTextDoc,
  RichTextNode,
  ModalHeader,
} from '@derp/shared';
import { adminApi } from '../adminApi';
import MediaUploader from '../smart/components/MediaUploader';
import BlockRenderer from '../../../components/modal/blocks/BlockRenderer';
import RichTextEditor from './RichTextEditor';
import BlockPicker from './BlockPicker';
import ActionPicker from './ActionPicker';
import ScriptingHelp from './ScriptingHelp';
import { BLOCK_META } from './modal-editor-meta';

// ─── Rich text helpers ────────────────────────────────────────────────────────

function domNodesToRichText(nodes: NodeList): RichTextNode[] {
  return Array.from(nodes).flatMap((n): RichTextNode[] => {
    if (n.nodeType === Node.TEXT_NODE) {
      const v = n.textContent || '';
      return v ? [{ t: 'text', v }] : [];
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return [];
    const el = n as Element;
    let tag = el.tagName.toLowerCase();
    if (tag === 'b') tag = 'strong';
    if (tag === 'i') tag = 'em';
    const c = domNodesToRichText(el.childNodes);
    if (tag === 'br') return [{ t: 'br' }];
    if (tag === 'a') return [{ t: 'link', href: el.getAttribute('href') || '', c }];
    if (['p', 'h1', 'h2', 'ul', 'li', 'strong', 'em', 'code'].includes(tag)) {
      return [{ t: tag as 'p', c }];
    }
    return c;
  });
}

export function htmlToRichTextDoc(html: string): RichTextDoc {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return domNodesToRichText(doc.body.childNodes);
}

function richTextDocToText(doc: RichTextDoc): string {
  const walk = (n: RichTextNode): string => {
    if (n.t === 'text') return n.v;
    if (n.t === 'br') return ' ';
    if (n.t === 'token') return `\${${n.key}}`;
    return n.c.map(walk).join('');
  };
  return doc.map(walk).join(' ').replace(/\s+/g, ' ').trim();
}

// ─── Client-side token resolver (for preview only) ───────────────────────────

function getByPath(obj: any, dotPath: string): any {
  if (obj == null || !dotPath) return undefined;
  const parts = dotPath.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (part === 'length' && Array.isArray(cur)) return cur.length;
    const idx = Number(part);
    if (Array.isArray(cur) && !isNaN(idx)) {
      cur = cur[idx];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

function resolveTokensClient(str: string, ctx: Record<string, any>): string {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
    const val = getByPath(ctx, path.trim());
    if (val === undefined || val === null) return _match;
    return String(val);
  });
}

function resolveRichTextNodeClient(node: RichTextNode, ctx: Record<string, any>): RichTextNode {
  if (node.t === 'token') {
    const val = getByPath(ctx, node.key);
    if (val !== undefined && val !== null) return { t: 'text', v: String(val) };
    return node;
  }
  if (node.t === 'text') return { t: 'text', v: resolveTokensClient(node.v, ctx) };
  if (node.t === 'br') return node;
  if (node.t === 'link') return { t: 'link', href: resolveTokensClient(node.href, ctx), c: node.c.map(c => resolveRichTextNodeClient(c, ctx)) };
  return { t: node.t, c: node.c.map(c => resolveRichTextNodeClient(c, ctx)) } as RichTextNode;
}

function mapRewardItemClient(r: any): any {
  return {
    name: r.name || r.type || r.key || 'Reward',
    qty: r.qty ?? r.amount ?? 1,
    assetKey: r.assetKey || (r.key ? `icons/${r.key}` : undefined),
    rarity: r.rarity,
    note: r.note,
  };
}

function resolveAllStringsClient(obj: any, ctx: Record<string, any>): any {
  if (obj == null) return obj;
  if (typeof obj === 'string') return resolveTokensClient(obj, ctx);
  if (Array.isArray(obj)) return obj.map(item => resolveAllStringsClient(item, ctx));
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = resolveAllStringsClient(obj[key], ctx);
    }
    return result;
  }
  return obj;
}

function resolveBlockClient(block: any, ctx: Record<string, any>): any {
  let resolved = { ...block };
  const fromPath = resolved.from;

  if (fromPath) {
    const data = getByPath(ctx, fromPath);
    if (data !== undefined && data !== null) {
      switch (block.type) {
        case 'rewardsList':
        case 'rewardsPreview':
          if (Array.isArray(data)) resolved.items = data.map(mapRewardItemClient);
          break;
        case 'metaRows':
          if (Array.isArray(data)) resolved.rows = data.map((r: any) => ({ label: String(r.label ?? ''), value: String(r.value ?? '') }));
          else if (typeof data === 'object') resolved.rows = Object.entries(data).map(([k, v]) => ({ label: k, value: String(v) }));
          break;
        case 'inventoryDelta':
          if (Array.isArray(data)) resolved.items = data.map((it: any) => ({ name: it.name || 'Item', qtyDelta: it.qtyDelta ?? it.amount ?? 0, assetKey: it.assetKey }));
          break;
        case 'timer':
          if (typeof data === 'string') resolved.endsAt = data;
          else if (typeof data === 'object' && data.endsAt) { resolved.endsAt = data.endsAt; if (data.label) resolved.label = data.label; }
          break;
        case 'progress':
          if (typeof data === 'object') { if (data.current !== undefined) resolved.current = Number(data.current); if (data.max !== undefined) resolved.max = Number(data.max); if (data.label) resolved.label = data.label; }
          break;
        case 'richText':
          if (typeof data === 'string') resolved.doc = [{ t: 'p', c: [{ t: 'text', v: data }] }];
          else if (Array.isArray(data)) resolved.doc = data;
          break;
        case 'image':
          if (typeof data === 'object') { resolved.image = { assetKey: data.assetKey || data.url || '', alt: data.alt || '' }; if (data.caption) resolved.caption = data.caption; }
          else if (typeof data === 'string') resolved.image = { assetKey: data };
          break;
        case 'giftReveal':
          if (typeof data === 'object') {
            if (data.gift) {
              resolved.gift = { ...(resolved.gift || {}), ...data.gift };
            } else if (data.giftId || data.title) {
              resolved.gift = { ...(resolved.gift || {}), ...data };
            }
            if (Array.isArray(data.rewards)) {
              resolved.rewards = data.rewards.map(mapRewardItemClient);
            }
          }
          break;
        case 'error':
          if (typeof data === 'string') resolved.message = data;
          else if (typeof data === 'object' && data.message) resolved.message = data.message;
          break;
      }
    }
  }

  if (block.type === 'clickReveal') {
    const childBlocks: any[] = Array.isArray(block.children) ? block.children : [];
    return {
      type: 'clickReveal',
      cover: typeof block.cover === 'string' ? resolveTokensClient(block.cover, ctx) : block.cover,
      coverImage: block.coverImage ? resolveAllStringsClient({ ...block.coverImage }, ctx) : undefined,
      tags: typeof block.tags === 'string' ? resolveTokensClient(block.tags, ctx) : block.tags,
      soundMap: typeof block.soundMap === 'string' ? resolveTokensClient(block.soundMap, ctx) : block.soundMap,
      fxMap: typeof block.fxMap === 'string' ? resolveTokensClient(block.fxMap, ctx) : block.fxMap,
      children: childBlocks.map(c => resolveBlockClient(c, ctx)),
    };
  }

  if (block.type === 'list') {
    const expr: string = typeof block.list === 'string' ? block.list : '';
    const trimmed = expr.trim();
    const m = /^\$\{([^}]+)\}$/.exec(trimmed);
    const path = m ? m[1].trim() : trimmed;
    const data = path ? getByPath(ctx, path) : undefined;
    const childBlocks: any[] = Array.isArray(block.children) ? block.children : [];
    const out: any[] = [];
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((item, index) => {
        const itemCtx = { ...ctx, item, index };
        for (const child of childBlocks) {
          out.push(resolveBlockClient(child, itemCtx));
        }
      });
    } else if (typeof block.emptyText === 'string' && block.emptyText.length > 0) {
      out.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: resolveTokensClient(block.emptyText, ctx) }] }],
      });
    }
    return { type: 'list', list: expr, children: out };
  }

  if ('from' in resolved) delete resolved.from;

  if (resolved.type === 'richText' && Array.isArray(resolved.doc)) {
    resolved.doc = resolved.doc.map((n: RichTextNode) => resolveRichTextNodeClient(n, ctx));
  } else {
    resolved = resolveAllStringsClient(resolved, ctx);
  }

  return resolved;
}

function resolveSpecClient(spec: ModalSpecV1, ctx: Record<string, any>): ModalSpecV1 {
  const resolved: ModalSpecV1 = { ...spec };
  if (resolved.header) {
    resolved.header = resolveAllStringsClient({ ...resolved.header }, ctx);
  }
  if (Array.isArray(resolved.buttons)) {
    resolved.buttons = resolved.buttons.map((btn: any) => resolveAllStringsClient({ ...btn }, ctx));
  }
  if (Array.isArray(resolved.pages)) {
    resolved.pages = resolved.pages.map(page => ({
      ...page,
      header: page.header ? resolveAllStringsClient({ ...page.header }, ctx) : undefined,
      body: page.body.map((b: any) => resolveBlockClient(b, ctx)),
      buttons: page.buttons ? page.buttons.map((btn: any) => resolveAllStringsClient({ ...btn }, ctx)) : undefined,
    }));
  }
  return resolved;
}

function computeEffectivePageClient(spec: ModalSpecV1, pageIdx: number) {
  const pages = spec.pages ?? [];
  let header: ModalHeader = { ...spec.header };
  let buttons: ModalButton[] = [...(spec.buttons ?? [])];
  let dismiss = { ...spec.dismiss };
  const clampedIdx = Math.max(0, Math.min(pageIdx, pages.length - 1));
  for (let i = 0; i <= clampedIdx; i++) {
    const page = pages[i];
    if (page?.header) header = { ...header, ...page.header };
    if (page?.buttons !== undefined) buttons = page.buttons;
    if (page?.dismiss) dismiss = { ...dismiss, ...page.dismiss };
  }
  return { header, buttons, dismiss, body: pages[clampedIdx]?.body ?? [] };
}

// ─── Flatten payload JSON to dot-notation paths ──────────────────────────────

export function flattenPaths(obj: any, prefix: string = '', depth: number = 0): string[] {
  const MAX_DEPTH = 8;
  const MAX_ARRAY_INDICES = 3;
  if (depth >= MAX_DEPTH || obj == null) return [];
  const paths: string[] = [];
  if (Array.isArray(obj)) {
    paths.push(prefix ? `${prefix}.length` : 'length');
    const limit = Math.min(obj.length, MAX_ARRAY_INDICES);
    for (let i = 0; i < limit; i++) {
      const idxPath = prefix ? `${prefix}.${i}` : String(i);
      paths.push(idxPath);
      if (obj[i] != null && typeof obj[i] === 'object') {
        paths.push(...flattenPaths(obj[i], idxPath, depth + 1));
      }
    }
    return paths;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      paths.push(fullPath);
      if (val != null && typeof val === 'object') {
        paths.push(...flattenPaths(val, fullPath, depth + 1));
      }
    }
  }
  return paths;
}

// ─── Block defaults ───────────────────────────────────────────────────────────

export const BLOCK_DEFAULTS: Record<string, () => ModalBlock> = {
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
  list: () => ({
    type: 'list',
    list: '${results.rewards}',
    emptyText: '',
    children: [
      { type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: '${item.name}' }] }] },
    ],
  }),
  clickReveal: () => ({
    type: 'clickReveal',
    cover: 'Tap to reveal',
    tags: '',
    soundMap: '*=sfx.reveal_default',
    fxMap: '*=shimmer',
    children: [
      { type: 'richText', doc: [{ t: 'p', c: [{ t: 'text', v: 'Surprise!' }] }] },
    ],
  }),
  error: () => ({ type: 'error', message: 'Something went wrong.' }),
};

const BLOCK_COLORS: Record<string, string> = {
  richText: '#818cf8', divider: '#64748b', image: '#22d3ee', metaRows: '#a78bfa',
  timer: '#fb923c', progress: '#34d399', rewardsPreview: '#fbbf24',
  rewardsList: '#fbbf24', inventoryDelta: '#f472b6', giftReveal: '#f59e0b',
  list: '#60a5fa', clickReveal: '#c084fc', error: '#ef4444',
};

export const BUTTON_DEFAULTS: () => ModalButton = () => ({
  id: `btn_${Date.now()}`, label: 'Button', variant: 'secondary', action: { type: 'CLOSE_MODAL' },
});

export const DEFAULT_PAGE: () => ModalPageSpec = () => ({ body: [] });

export const DEFAULT_SPEC: ModalSpecV1 = {
  version: 1, id: '', kind: 'custom',
  dismiss: { backdrop: true, x: true, escape: true },
  header: { title: '', subtitle: '' },
  buttons: [{ id: 'close', label: 'Close', variant: 'secondary', action: { type: 'CLOSE_MODAL' } }],
  pages: [{ body: [] }],
};

const FROM_HINTS: Record<string, string> = {
  richText: 'e.g. results.message',
  metaRows: 'e.g. results.stats',
  rewardsList: 'e.g. results.rewards',
  rewardsPreview: 'e.g. results.rewards',
  inventoryDelta: 'e.g. results.delta',
  timer: 'e.g. timer.endsAt',
  progress: 'e.g. timer.progress',
  image: 'e.g. results.image',
  giftReveal: 'e.g. gift',
  error: 'e.g. results.errorMessage',
};

// ─── Shared input styles ──────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '6px 10px', background: '#0a0a1e', border: '1px solid #2a2a4e',
  borderRadius: 6, color: '#e0e0ff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={lbl}>
        {label}
        {hint && <HelpHint text={hint} />}
      </label>
      {children}
    </div>
  );
}

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-[6px]">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#1a1140] border border-[#7c3aed55] text-[#a78bfa] text-[10px] font-[800] font-[inherit] cursor-pointer p-0 leading-none hover:bg-[#2a1a5a] hover:border-[#a78bfa] hover:text-white transition-colors"
        title={text}
        aria-label={text}
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && <span className="absolute top-full left-0 z-[30] mt-[6px] min-w-[220px] max-w-[320px] px-[10px] py-2 bg-[#06061a] border border-[#7c3aed55] rounded-[6px] text-[#cbd5e1] text-[11px] leading-[1.5] font-normal normal-case tracking-normal shadow-[0_6px_20px_rgba(0,0,0,0.6)] whitespace-normal" role="tooltip">{text}</span>}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

// ─── Section (collapsible) ────────────────────────────────────────────────────

function Section({ title, open, onToggle, badge, children, sectionClass }: {
  title: string; open: boolean; onToggle: () => void;
  badge?: string; children: React.ReactNode; sectionClass?: string;
}) {
  return (
    <div className={`border-b border-[#1a1a3e] ${sectionClass ?? ''}`}>
      <button className="me-section-hdr w-full flex items-center gap-[10px] px-4 py-3 bg-gradient-to-br from-[#0e0e28] to-[#0a0a1e] border-none cursor-pointer text-left font-[inherit] transition-[background]" onClick={onToggle} type="button">
        <span className="me-section-chevron text-[10px] text-[#4c1d95] shrink-0">{open ? '▼' : '▶'}</span>
        <span className="text-xs font-[800] tracking-[0.1em] uppercase text-[#a78bfa]">{title}</span>
        {badge && <span className="ml-auto text-[10px] text-[#64748b] bg-[#1a1a3e] border border-[#2a2a4e] rounded-[4px] px-[6px] py-[1px] font-mono">{badge}</span>}
      </button>
      {open && <div className="me-section-body px-4 py-3 flex flex-col gap-[10px] bg-[#0a0a1e]">{children}</div>}
    </div>
  );
}

// ─── From Field ───────────────────────────────────────────────────────────────

function FromField({ block, onChange }: { block: ModalBlock; onChange: (b: ModalBlock) => void }) {
  if (block.type === 'divider' || block.type === 'list' || block.type === 'clickReveal') return null;
  const hint = FROM_HINTS[block.type] || '';
  return (
    <div className="mb-[10px] pb-2 border-b border-dashed border-[#2a2a4e]">
      <label style={{ ...lbl, fontSize: 10, color: '#7c3aed', marginBottom: 2 }}>FROM (payload path)</label>
      <input
        style={{ ...inp, borderColor: '#3d2a6e', fontSize: 12 }}
        value={(block as any).from || ''}
        onChange={e => onChange({ ...block, from: e.target.value || undefined } as any)}
        placeholder={hint}
      />
    </div>
  );
}

// ─── Tag/Value Map Editor ─────────────────────────────────────────────────────

const FX_BUILTINS = ['shimmer', 'burst', 'glow', 'pulse'];

type MapRow = { tag: string; value: string };

function parseTagValueMap(raw: string): MapRow[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(part => {
    const s = part.trim();
    if (!s) return null;
    const eq = s.indexOf('=');
    if (eq < 0) return { tag: '*', value: s };
    return { tag: s.slice(0, eq).trim(), value: s.slice(eq + 1).trim() };
  }).filter((r): r is MapRow => !!r);
}

function serializeTagValueMap(rows: MapRow[]): string {
  return rows
    .filter(r => r.tag || r.value)
    .map(r => `${r.tag || '*'}=${r.value}`)
    .join(', ');
}

let soundOptionsCache: string[] | null = null;
let soundOptionsPromise: Promise<string[]> | null = null;
function loadSoundOptions(): Promise<string[]> {
  if (soundOptionsCache) return Promise.resolve(soundOptionsCache);
  if (!soundOptionsPromise) {
    soundOptionsPromise = adminApi.listSoundMappings()
      .then((items: any[]) => {
        const keys = Array.from(new Set((items || [])
          .map(it => String(it?.actionKey || ''))
          .filter(Boolean))).sort();
        soundOptionsCache = keys;
        return keys;
      })
      .catch(() => {
        soundOptionsPromise = null;
        return [];
      });
  }
  return soundOptionsPromise;
}

function useSoundActionKeys(enabled: boolean): string[] {
  const [keys, setKeys] = useState<string[]>(soundOptionsCache || []);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadSoundOptions().then(k => { if (alive) setKeys(k); });
    return () => { alive = false; };
  }, [enabled]);
  return keys;
}

function TagValueMapEditor({
  value,
  onChange,
  kind,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  kind: 'sound' | 'fx';
  placeholder: string;
}) {
  const [rawMode, setRawMode] = useState(false);
  const [customRows, setCustomRows] = useState<Set<number>>(new Set());
  const soundKeys = useSoundActionKeys(kind === 'sound');
  const rows = useMemo(() => parseTagValueMap(value || ''), [value]);
  const datalistId = useMemo(
    () => `tvm-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    [kind],
  );

  const setRows = (next: MapRow[]) => onChange(serializeTagValueMap(next));
  const addRow = () => setRows([...rows, { tag: rows.length === 0 ? '*' : '', value: '' }]);
  const removeRow = (i: number) => {
    setCustomRows(prev => {
      const s = new Set<number>();
      prev.forEach(idx => {
        if (idx === i) return;
        s.add(idx > i ? idx - 1 : idx);
      });
      return s;
    });
    setRows(rows.filter((_, j) => j !== i));
  };
  const setRow = (i: number, patch: Partial<MapRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };
  const setRowCustom = (i: number, on: boolean) => {
    setCustomRows(prev => {
      const s = new Set(prev);
      if (on) s.add(i); else s.delete(i);
      return s;
    });
  };

  const isCustomFx = (i: number, v: string) =>
    customRows.has(i) || (!!v && !FX_BUILTINS.includes(v));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setRawMode(m => !m)}
          style={{
            background: 'none', border: '1px solid #2a2a4e', color: '#94a3b8',
            fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {rawMode ? 'Use rows' : 'Edit as text'}
        </button>
      </div>

      {rawMode ? (
        <textarea
          style={{ ...inp, minHeight: 50, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div>
          {kind === 'sound' && (
            <datalist id={datalistId}>
              {soundKeys.map(k => <option key={k} value={k} />)}
            </datalist>
          )}
          {rows.length === 0 && (
            <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic', marginBottom: 6 }}>
              No entries. Add a row to set a fallback (* = …) or per-tag value.
            </div>
          )}
          {rows.map((r, i) => {
            const fxIsCustom = kind === 'fx' && isCustomFx(i, r.value);
            return (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  placeholder="tag (use * for fallback)"
                  value={r.tag}
                  onChange={e => setRow(i, { tag: e.target.value })}
                />
                <span style={{ color: '#555', fontSize: 12 }}>=</span>
                {kind === 'sound' ? (
                  <input
                    style={{ ...inp, flex: 2, fontFamily: 'monospace', fontSize: 12 }}
                    list={datalistId}
                    placeholder="sfx.action_key"
                    value={r.value}
                    onChange={e => setRow(i, { value: e.target.value })}
                  />
                ) : (
                  <>
                    <select
                      style={{ ...inp, flex: fxIsCustom ? 1 : 2, fontSize: 12 }}
                      value={fxIsCustom ? '__custom__' : r.value}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '__custom__') {
                          setRowCustom(i, true);
                        } else {
                          setRowCustom(i, false);
                          setRow(i, { value: v });
                        }
                      }}
                    >
                      <option value="">— none —</option>
                      {FX_BUILTINS.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="__custom__">custom…</option>
                    </select>
                    {fxIsCustom && (
                      <input
                        style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                        placeholder="custom fx name"
                        value={r.value}
                        onChange={e => setRow(i, { value: e.target.value })}
                      />
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                  title="Remove"
                >×</button>
              </div>
            );
          })}
          <button type="button" onClick={addRow} className="me-add-btn">+ Add row</button>
        </div>
      )}
    </div>
  );
}

// ─── Asset key field with built-in media picker ───────────────────────────────

const pickerBtnStyle: React.CSSProperties = {
  padding: '0 8px', background: '#1a1a2e', border: '1px solid #2a2a4e',
  borderRadius: 6, cursor: 'pointer', fontSize: 15, color: '#a78bfa',
  flexShrink: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
};

function AssetKeyInput({ value, onChange, placeholder, fieldName, style }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fieldName: string;
  style?: React.CSSProperties;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', ...style }}>
      <input
        style={{ ...inp, flex: 1 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'images/example.png'}
      />
      <button type="button" onClick={() => setPickerOpen(true)} style={pickerBtnStyle} title="Browse or upload media">
        🖼
      </button>
      {pickerOpen && (
        <MediaUploader
          fieldName={fieldName}
          onInsert={v => { onChange(v); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
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
          <AssetKeyInput style={{ flex: 1 }} fieldName="rewardAssetKey" placeholder="assetKey" value={item.assetKey || ''} onChange={v => set(i, 'assetKey', v)} />
          <input style={{ ...inp, flex: 1 }} placeholder="rarity" value={item.rarity || ''} onChange={e => set(i, 'rarity', e.target.value)} />
          <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add} className="me-add-btn">+ Add item</button>
    </div>
  );
}

function BlockEditor({ block, onChange, tokenPaths }: { block: ModalBlock; onChange: (b: ModalBlock) => void; tokenPaths?: string[] }) {
  const set = (updates: object) => onChange({ ...block, ...updates } as ModalBlock);

  switch (block.type) {
    case 'richText': {
      return (
        <Field label="Content">
          <RichTextEditor
            doc={block.doc || []}
            onChange={doc => set({ doc })}
            tokenPaths={tokenPaths}
          />
        </Field>
      );
    }
    case 'divider':
      return <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>No fields — renders a horizontal rule.</div>;

    case 'image': {
      const disp = (block as any).display ?? {};
      const setDisp = (patch: Record<string, unknown>) => set({ display: { ...disp, ...patch } });
      const sizing = disp.sizing ?? 'stretch';
      return (
        <>
          <Field label="Asset Key">
            <AssetKeyInput fieldName="image.assetKey" value={(block as any).image?.assetKey || ''} onChange={v => set({ image: { ...(block as any).image, assetKey: v } })} />
          </Field>
          <Field label="Alt text"><input style={inp} value={(block as any).image?.alt || ''} onChange={e => set({ image: { ...(block as any).image, alt: e.target.value } })} /></Field>
          <Field label="Caption" hint="Optional caption rendered below the image. Supports ${token} substitution from payload."><input style={inp} value={(block as any).caption || ''} onChange={e => set({ caption: e.target.value })} /></Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Alignment">
              <select style={{ ...inp, width: 'auto' }} value={disp.align ?? 'center'} onChange={e => setDisp({ align: e.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Sizing">
              <select style={{ ...inp, width: 'auto' }} value={sizing} onChange={e => setDisp({ sizing: e.target.value, width: undefined })}>
                <option value="stretch">Stretch (full width)</option>
                <option value="percent">Percent width</option>
                <option value="px">Fixed px width</option>
              </select>
            </Field>
            {(sizing === 'percent' || sizing === 'px') && (
              <Field label={`Width (${sizing === 'percent' ? '%' : 'px'})`}>
                <input
                  style={{ ...inp, width: 80 }}
                  type="number"
                  min={1}
                  max={sizing === 'percent' ? 100 : 2000}
                  value={disp.width ?? ''}
                  placeholder={sizing === 'percent' ? '50' : '200'}
                  onChange={e => setDisp({ width: e.target.value ? Number(e.target.value) : undefined })}
                />
              </Field>
            )}
            <Field label="Border radius (px)">
              <input
                style={{ ...inp, width: 70 }}
                type="number"
                min={0}
                max={200}
                value={disp.borderRadius ?? ''}
                placeholder="12"
                onChange={e => setDisp({ borderRadius: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
          </div>
        </>
      );
    }

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
              <AssetKeyInput style={{ flex: 1 }} fieldName="inventoryDelta.assetKey" placeholder="assetKey" value={it.assetKey || ''} onChange={v => setItem(i, 'assetKey', v)} />
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
              <Field label="Title" hint="Title shown above the gift. Supports ${token} substitution, e.g. ${gift.name} or ${user.name}."><input style={inp} value={gift.title || ''} onChange={e => set({ gift: { ...gift, title: e.target.value } })} /></Field>
            </div>
          </Row>
          <Field label="Rewards (optional)">
            <RewardItemsEditor items={rewards} onChange={v => set({ rewards: v })} />
          </Field>
        </>
      );
    }

    case 'list': {
      const children = (block as any).children || [];
      const childTokenPaths = [
        ...(tokenPaths || []),
        'item', 'item.name', 'item.qty', 'item.assetKey', 'item.rarity', 'index',
      ];
      return (
        <>
          <Field label="Source array" hint="Path or token expression for the array to iterate over. Use ${path} or just path. Examples: ${results.rewards}, results.team, data.members.">
            <input style={inp} value={(block as any).list || ''} onChange={e => set({ list: e.target.value })} placeholder="${results.rewards}" />
          </Field>
          <Field label="Empty text (optional)" hint="Shown as a single line of text when the source array is empty or missing. Leave blank to render nothing.">
            <input style={inp} value={(block as any).emptyText || ''} onChange={e => set({ emptyText: e.target.value || undefined })} placeholder="No items." />
          </Field>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>
              Children (rendered once per item)
              <HelpHint text="Inside these blocks, ${item} is the current array element and ${index} is its position. e.g. ${item.name}, ${item.qty}." />
            </label>
            <div style={{ borderLeft: '2px solid #60a5fa44', paddingLeft: 8, marginTop: 4 }}>
              <BlockList blocks={children} onChange={next => set({ children: next })} tokenPaths={childTokenPaths} />
            </div>
          </div>
        </>
      );
    }

    case 'clickReveal': {
      const children = (block as any).children || [];
      return (
        <>
          <Field label="Cover label" hint="Text shown on the tap-to-reveal cover. Supports ${tokens}.">
            <input style={inp} value={(block as any).cover || ''} onChange={e => set({ cover: e.target.value })} placeholder="Tap to reveal" />
          </Field>
          <Row>
            <div style={{ flex: 1 }}>
              <Field label="Cover image asset (optional)" hint="If set, the cover renders this image instead of the label text.">
                <AssetKeyInput
                  fieldName="clickReveal.coverImage.assetKey"
                  value={(block as any).coverImage?.assetKey || ''}
                  onChange={v => set({ coverImage: v ? { assetKey: v, alt: (block as any).coverImage?.alt || '' } : undefined })}
                  placeholder="icons/mystery_box"
                />
              </Field>
            </div>
          </Row>
          <Field label="Tags" hint="Comma-separated tags driving sound/fx selection. Supports ${tokens}, e.g. ${item.rarity} or ${item.tags}.">
            <input style={inp} value={(block as any).tags || ''} onChange={e => set({ tags: e.target.value })} placeholder="${item.rarity}" />
          </Field>
          <Field label="Sound map" hint='First matching tag wins; * is the fallback. Values come from the audio mappings table (Admin → Audio).'>
            <TagValueMapEditor kind="sound" value={(block as any).soundMap || ''} onChange={v => set({ soundMap: v })} placeholder="legendary=sfx.reveal_legendary, rare=sfx.reveal_rare, *=sfx.reveal_default" />
          </Field>
          <Field label="FX map" hint='First matching tag wins; * is the fallback. Built-in effects: shimmer, burst, glow, pulse. Use "custom…" for any other CSS class name.'>
            <TagValueMapEditor kind="fx" value={(block as any).fxMap || ''} onChange={v => set({ fxMap: v })} placeholder="legendary=glow, rare=burst, *=shimmer" />
          </Field>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>
              Hidden children (revealed on tap)
              <HelpHint text="Blocks rendered after the user taps the cover. Tokens like ${item.*} from a parent List still resolve here." />
            </label>
            <div style={{ borderLeft: '2px solid #c084fc44', paddingLeft: 8, marginTop: 4 }}>
              <BlockList blocks={children} onChange={next => set({ children: next })} tokenPaths={tokenPaths} />
            </div>
          </div>
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

function BlockList({ blocks, onChange, tokenPaths }: { blocks: ModalBlock[]; onChange: (b: ModalBlock[]) => void; tokenPaths?: string[] }) {
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

  const handleDragStart = (e: React.DragEvent, i: number) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); if (i !== dropIdx) setDropIdx(i); };
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
        const meta = BLOCK_META[block.type];
        const color = meta?.color || BLOCK_COLORS[block.type] || '#888';
        const friendly = meta?.friendlyName || block.type;
        const isCollapsed = collapsed.has(i);
        const isDragging = dragIdx === i;
        const isDropTarget = dropIdx === i && dragIdx !== null && dragIdx !== i;
        const hasFrom = !!(block as any).from;
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
            <div className="flex items-center px-2 py-[5px] gap-[6px]" style={{ borderBottom: isCollapsed ? 'none' : '1px solid #1a1a3e' }}>
              <span style={{ cursor: 'grab', color: '#444', fontSize: 14, userSelect: 'none', padding: '0 2px' }}>⣿</span>
              <span className="text-[11px] font-[700] rounded-[4px] px-2 py-[2px] tracking-[0.04em] shrink-0 whitespace-nowrap max-w-[50%] overflow-hidden text-ellipsis" style={{ color, background: `${color}22`, border: `1px solid ${color}44` }} title={block.type}>
                {friendly}
              </span>
              {hasFrom && (
                <span className="text-[10px] text-[#7c3aed] bg-[#7c3aed18] border border-[#7c3aed33] rounded-[4px] px-[5px] py-[1px] font-mono shrink-0 max-w-[35%] overflow-hidden text-ellipsis whitespace-nowrap">← {(block as any).from}</span>
              )}
              <button type="button" onClick={() => toggleCollapse(i)} className="flex-1 bg-transparent border-none text-[#888] cursor-pointer text-left text-[11px] py-[2px] font-[inherit] min-w-0 overflow-hidden">
                <span style={{ color: '#444', fontSize: 9 }}>{isCollapsed ? '▶' : '▼'}</span>
                {isCollapsed && <span style={{ marginLeft: 6, color: '#555' }}>{block.type === 'richText' ? richTextDocToText((block as any).doc || []).slice(0, 40) || '…' : ''}</span>}
              </button>
              <button type="button" onClick={() => removeBlock(i)} className="me-block-remove bg-transparent border-none text-[#ef444488] cursor-pointer text-[18px] px-2 py-[2px] leading-none shrink-0 min-h-[32px] min-w-[32px] hover:text-[#ef4444] transition-colors" title="Remove">×</button>
            </div>
            {!isCollapsed && (
              <div style={{ padding: '10px 12px' }}>
                <FromField block={block} onChange={b => updateBlock(i, b)} />
                <BlockEditor block={block} onChange={b => updateBlock(i, b)} tokenPaths={tokenPaths} />
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => setPickerOpen(p => !p)} className="me-add-btn" style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}>
        + Add block {pickerOpen ? '▲' : '▼'}
      </button>
      <BlockPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addBlock} />
    </div>
  );
}

// ─── Action Editor ────────────────────────────────────────────────────────────

function ActionEditor({ action, onChange }: { action: ModalAction; onChange: (a: ModalAction) => void }) {
  const type = action.type;
  const set = (extra: object) => onChange({ type, ...extra } as ModalAction);

  const actionTypeFields: Record<string, React.ReactNode> = {
    CLOSE_MODAL: null,
    NEXT_PAGE: null,
    PREV_PAGE: null,
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
        <ActionPicker current={type} onPick={t => onChange({ type: t as any })} />
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
                    <Field label="Label" hint="Button text shown to the player. Supports ${token} substitution from payload, e.g. ${user.name}."><input style={inp} value={btn.label} onChange={e => updateBtn(i, { ...btn, label: e.target.value })} /></Field>
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

// ─── Header Override Editor ───────────────────────────────────────────────────

function HeaderOverrideEditor({
  header,
  onChange,
}: {
  header: Partial<ModalHeader> | undefined;
  onChange: (h: Partial<ModalHeader> | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasOverride = !!header;

  const enable = () => onChange({ title: '' });
  const clear = () => { onChange(undefined); setOpen(false); };
  const set = (updates: Partial<ModalHeader>) => onChange({ ...(header || {}), ...updates });

  return (
    <div style={{ marginBottom: 6, borderRadius: 6, border: '1px solid #1a1a3e', background: '#0a0a1e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <button
          type="button"
          onClick={() => hasOverride && setOpen(o => !o)}
          style={{ flex: 1, background: 'none', border: 'none', color: hasOverride ? '#e0e0ff' : '#3a3a5e', cursor: hasOverride ? 'pointer' : 'default', textAlign: 'left', fontSize: 12, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {hasOverride && <span style={{ color: '#444', fontSize: 9 }}>{open ? '▼' : '▶'}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Header Override
          </span>
          {hasOverride && <span style={{ fontSize: 10, color: '#7c3aed', background: '#3d2a6e', borderRadius: 3, padding: '0 5px' }}>overridden</span>}
          {!hasOverride && <span style={{ fontSize: 11, color: '#3a3a5e', fontStyle: 'italic' }}>— inheriting from default</span>}
        </button>
        {!hasOverride && (
          <button type="button" onClick={enable} className="me-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}>Override</button>
        )}
        {hasOverride && (
          <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} title="Clear override">✕</button>
        )}
      </div>
      {hasOverride && open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid #1a1a3e' }}>
          <Row>
            <div style={{ flex: 2 }}>
              <Field label="Title"><input style={inp} value={header?.title ?? ''} onChange={e => set({ title: e.target.value })} placeholder="Override title…" /></Field>
            </div>
            <div style={{ flex: 2 }}>
              <Field label="Subtitle"><input style={inp} value={header?.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} /></Field>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1 }}>
              <Field label="Icon asset key">
                <AssetKeyInput fieldName="header.icon.assetKey" value={header?.icon?.assetKey ?? ''} onChange={v => set({ icon: v ? { assetKey: v } : undefined })} placeholder="icons/header_icon.png" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Banner asset key">
                <AssetKeyInput fieldName="header.banner.assetKey" value={header?.banner?.assetKey ?? ''} onChange={v => set({ banner: v ? { assetKey: v } : undefined })} placeholder="images/banner.png" />
              </Field>
            </div>
          </Row>
        </div>
      )}
    </div>
  );
}

// ─── Buttons Override Editor ──────────────────────────────────────────────────

function ButtonsOverrideEditor({
  buttons,
  onChange,
}: {
  buttons: ModalButton[] | undefined;
  onChange: (b: ModalButton[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasOverride = buttons !== undefined;

  const enable = () => { onChange([BUTTON_DEFAULTS()]); setOpen(true); };
  const clear = () => { onChange(undefined); setOpen(false); };

  return (
    <div style={{ marginBottom: 6, borderRadius: 6, border: '1px solid #1a1a3e', background: '#0a0a1e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <button
          type="button"
          onClick={() => hasOverride && setOpen(o => !o)}
          style={{ flex: 1, background: 'none', border: 'none', color: hasOverride ? '#e0e0ff' : '#3a3a5e', cursor: hasOverride ? 'pointer' : 'default', textAlign: 'left', fontSize: 12, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {hasOverride && <span style={{ color: '#444', fontSize: 9 }}>{open ? '▼' : '▶'}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Buttons Override
          </span>
          {hasOverride && <span style={{ fontSize: 10, color: '#7c3aed', background: '#3d2a6e', borderRadius: 3, padding: '0 5px' }}>overridden</span>}
          {!hasOverride && <span style={{ fontSize: 11, color: '#3a3a5e', fontStyle: 'italic' }}>— inheriting from default</span>}
        </button>
        {!hasOverride && (
          <button type="button" onClick={enable} className="me-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}>Override</button>
        )}
        {hasOverride && (
          <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} title="Clear override">✕</button>
        )}
      </div>
      {hasOverride && open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid #1a1a3e' }}>
          <ButtonList buttons={buttons!} onChange={b => onChange(b)} />
        </div>
      )}
    </div>
  );
}

// ─── Dismiss Override Editor ──────────────────────────────────────────────────

function DismissOverrideEditor({
  dismiss,
  onChange,
}: {
  dismiss: ModalPageSpec['dismiss'];
  onChange: (d: ModalPageSpec['dismiss']) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasOverride = !!dismiss;

  const enable = () => { onChange({}); setOpen(true); };
  const clear = () => { onChange(undefined); setOpen(false); };
  const set = (k: 'backdrop' | 'x' | 'escape', v: boolean) => onChange({ ...(dismiss || {}), [k]: v });

  return (
    <div style={{ marginBottom: 6, borderRadius: 6, border: '1px solid #1a1a3e', background: '#0a0a1e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <button
          type="button"
          onClick={() => hasOverride && setOpen(o => !o)}
          style={{ flex: 1, background: 'none', border: 'none', color: hasOverride ? '#e0e0ff' : '#3a3a5e', cursor: hasOverride ? 'pointer' : 'default', textAlign: 'left', fontSize: 12, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {hasOverride && <span style={{ color: '#444', fontSize: 9 }}>{open ? '▼' : '▶'}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Dismiss Override
          </span>
          {hasOverride && <span style={{ fontSize: 10, color: '#7c3aed', background: '#3d2a6e', borderRadius: 3, padding: '0 5px' }}>overridden</span>}
          {!hasOverride && <span style={{ fontSize: 11, color: '#3a3a5e', fontStyle: 'italic' }}>— inheriting from default</span>}
        </button>
        {!hasOverride && (
          <button type="button" onClick={enable} className="me-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}>Override</button>
        )}
        {hasOverride && (
          <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} title="Clear override">✕</button>
        )}
      </div>
      {hasOverride && open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid #1a1a3e' }}>
          <div style={{ display: 'flex', gap: 16, padding: '4px 0' }}>
            {(['backdrop', 'x', 'escape'] as const).map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={dismiss?.[k] ?? false}
                  onChange={e => set(k, e.target.checked)}
                />
                {k}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Editor ─────────────────────────────────────────────────────────────

function PageEditor({
  page,
  onChange,
  tokenPaths,
}: {
  page: ModalPageSpec;
  onChange: (p: ModalPageSpec) => void;
  tokenPaths?: string[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#4c4c7a] mb-3 pb-2 border-b border-[#1a1a3e]" style={{ marginBottom: 6 }}>Body Blocks</div>
        <BlockList
          blocks={page.body}
          onChange={body => onChange({ ...page, body })}
          tokenPaths={tokenPaths}
        />
      </div>
      <HeaderOverrideEditor
        header={page.header}
        onChange={header => onChange({ ...page, header })}
      />
      <ButtonsOverrideEditor
        buttons={page.buttons}
        onChange={buttons => onChange({ ...page, buttons })}
      />
      <DismissOverrideEditor
        dismiss={page.dismiss}
        onChange={dismiss => onChange({ ...page, dismiss })}
      />
    </div>
  );
}

// ─── Page Tab Strip ───────────────────────────────────────────────────────────

function PageTabStrip({
  pageCount,
  activeIdx,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
}: {
  pageCount: number;
  activeIdx: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 12, padding: '8px 0', borderBottom: '1px solid #1a1a3e' }}>
      {Array.from({ length: pageCount }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={() => onSelect(i)}
            style={{
              padding: '4px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              borderRadius: 6, border: activeIdx === i ? '1px solid #7c3aed' : '1px solid #2a2a4e',
              background: activeIdx === i ? 'rgba(124,58,237,0.2)' : '#0a0a1e',
              color: activeIdx === i ? '#c4b5fd' : '#64748b',
              fontWeight: activeIdx === i ? 700 : 400,
            }}
          >
            Page {i + 1}
          </button>
          {activeIdx === i && (
            <>
              <button
                type="button"
                onClick={() => onDuplicate(i)}
                title="Duplicate this page after current"
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '0 3px', lineHeight: 1 }}
              >⧉</button>
              <button
                type="button"
                onClick={() => onDelete(i)}
                disabled={pageCount <= 1}
                title="Delete this page"
                style={{ background: 'none', border: 'none', color: pageCount <= 1 ? '#2a2a4e' : '#ef444488', cursor: pageCount <= 1 ? 'not-allowed' : 'pointer', fontSize: 14, padding: '0 3px', lineHeight: 1 }}
              >×</button>
            </>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: '4px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          borderRadius: 6, border: '1px dashed #2a2a4e',
          background: 'none', color: '#64748b',
        }}
      >
        + Add Page
      </button>
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function LivePreview({ spec, payloadJson }: { spec: ModalSpecV1; payloadJson: string }) {
  const [previewPage, setPreviewPage] = useState(0);

  useEffect(() => {
    setPreviewPage(0);
  }, [spec?.pages?.length]);

  const resolvedSpec = useMemo(() => {
    let ctx: Record<string, any> | null = null;
    if (payloadJson) {
      try { ctx = JSON.parse(payloadJson); } catch {}
    }
    if (ctx) return resolveSpecClient(spec, ctx);
    return spec;
  }, [spec, payloadJson]);

  const totalPages = resolvedSpec?.pages?.length ?? 0;
  const clampedPage = Math.max(0, Math.min(previewPage, totalPages - 1));
  const { header, body, buttons, dismiss } = computeEffectivePageClient(resolvedSpec, clampedPage);

  return (
    <div className="flex items-start justify-center py-4">
      <div style={{ width: '100%' }}>
        {payloadJson && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#7c3aed', marginBottom: 8, opacity: 0.7 }}>
            Client-side preview only — tokens resolved from payload above
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              style={{ background: 'none', border: '1px solid #2a2a4e', color: clampedPage === 0 ? '#2a2a4e' : '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: clampedPage === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}
            >←</button>
            <span style={{ fontSize: 11, color: '#64748b' }}>Preview: Page {clampedPage + 1} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage === totalPages - 1}
              style={{ background: 'none', border: '1px solid #2a2a4e', color: clampedPage === totalPages - 1 ? '#2a2a4e' : '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: clampedPage === totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}
            >→</button>
          </div>
        )}
        <div className="gm-modal me-preview-modal">
          {dismiss.x && (
            <button className="gm-close-btn" style={{ cursor: 'default' }} aria-label="Close">✕</button>
          )}
          {spec.showPageIndicator && totalPages > 1 && (
            <div className="gm-page-indicator">{clampedPage + 1} / {totalPages}</div>
          )}
          <div className="gm-header">
            {header.title ? (
              <h2 className="gm-title">{header.title}</h2>
            ) : (
              <h2 className="gm-title" style={{ color: '#333', fontStyle: 'italic' }}>(no title)</h2>
            )}
            {header.subtitle && <p className="gm-subtitle">{header.subtitle}</p>}
          </div>
          <div className="gm-body">
            {body.length === 0 ? (
              <div style={{ color: '#333', fontSize: 12, textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>(no body blocks)</div>
            ) : (
              body.map((block, idx) => <BlockRenderer key={idx} block={block} />)
            )}
          </div>
          {buttons.length > 0 && (
            <div className="gm-footer">
              {buttons.map(btn => (
                <button key={btn.id} className={`gm-btn gm-btn-${btn.variant}`} style={{ cursor: 'default' }} disabled={btn.disabled}>
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

interface ModalSpecEditorProps {
  value: any;
  onChange: (spec: any) => void;
}

export default function ModalSpecEditor({ value, onChange }: ModalSpecEditorProps) {
  const spec: ModalSpecV1 = useMemo(() => {
    if (value && typeof value === 'object' && value.version) {
      const incoming = value as Partial<ModalSpecV1>;
      return { ...DEFAULT_SPEC, ...incoming, pages: incoming.pages ?? DEFAULT_SPEC.pages };
    }
    return { ...DEFAULT_SPEC };
  }, [value]);

  const [activePage, setActivePage] = useState(0);
  const [editorOpen, setEditorOpen] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [payloadJson, setPayloadJson] = useState('');
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  useEffect(() => {
    const pages = spec.pages || [];
    if (activePage >= pages.length && pages.length > 0) {
      setActivePage(pages.length - 1);
    }
  }, [spec.pages?.length, activePage]);

  const dynamicTokenPaths = useMemo(() => {
    if (!payloadJson) return [];
    try { return flattenPaths(JSON.parse(payloadJson)); }
    catch { return []; }
  }, [payloadJson]);

  const updateSpec = useCallback((updates: Partial<ModalSpecV1>) => {
    onChange({ ...spec, ...updates });
  }, [spec, onChange]);

  const updateHeader = useCallback((updates: Partial<ModalHeader>) => {
    onChange({ ...spec, header: { ...spec.header, ...updates } });
  }, [spec, onChange]);

  const updateDismiss = useCallback((updates: Partial<ModalSpecV1['dismiss']>) => {
    onChange({ ...spec, dismiss: { ...spec.dismiss, ...updates } });
  }, [spec, onChange]);

  const pages = spec.pages ?? [];
  const currentPageIdx = Math.max(0, Math.min(activePage, pages.length - 1));
  const currentPage = pages[currentPageIdx] ?? DEFAULT_PAGE();

  const updatePages = useCallback((next: ModalPageSpec[]) => {
    onChange({ ...spec, pages: next });
  }, [spec, onChange]);

  const updateCurrentPage = useCallback((page: ModalPageSpec) => {
    const next = [...pages];
    next[currentPageIdx] = page;
    onChange({ ...spec, pages: next });
  }, [spec, onChange, pages, currentPageIdx]);

  const addPage = () => {
    const next = [...pages, DEFAULT_PAGE()];
    updatePages(next);
    setActivePage(next.length - 1);
  };

  const duplicatePage = (i: number) => {
    const clone = JSON.parse(JSON.stringify(pages[i]));
    const next = [...pages.slice(0, i + 1), clone, ...pages.slice(i + 1)];
    updatePages(next);
    setActivePage(i + 1);
  };

  const deletePage = (i: number) => {
    if (pages.length <= 1) return;
    const next = pages.filter((_, j) => j !== i);
    updatePages(next);
    setActivePage(Math.min(i, next.length - 1));
  };

  const loadRecentJobs = async () => {
    setJobsLoading(true);
    try {
      const jobs = await adminApi.listRecentJobs(10);
      setRecentJobs(jobs);
    } catch { setRecentJobs([]); }
    finally { setJobsLoading(false); }
  };

  const loadJobPayload = (job: any) => {
    const payload = { id: job.id, type: job.type, defId: job.defId, status: job.status, data: job.data || {}, results: job.results || null };
    setPayloadJson(JSON.stringify(payload, null, 2));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #1a1a3e', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── Editor ── */}
      <Section title="Modal Spec" open={editorOpen} onToggle={() => setEditorOpen(v => !v)} sectionClass="me-section-edit">
        <div className="me-card">
          <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#4c4c7a] mb-3 pb-2 border-b border-[#1a1a3e]">Spec Options</div>
          <Row>
            <div style={{ flex: 2 }}>
              <Field label="Kind (e.g. mission_complete)">
                <input style={inp} value={spec.kind} onChange={e => updateSpec({ kind: e.target.value })} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Show Page Indicator">
                <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!spec.showPageIndicator}
                    onChange={e => updateSpec({ showPageIndicator: e.target.checked })}
                  />
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>Show "N / Total" counter</span>
                </div>
              </Field>
            </div>
          </Row>
          <Field label="Default Dismiss Options">
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
          <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#4c4c7a] mb-3 pb-2 border-b border-[#1a1a3e]">Default Header</div>
          <Row>
            <div style={{ flex: 2 }}>
              <Field label="Title" hint="Supports ${path} tokens — e.g. ${results.message}, ${defId}, ${data.amount}. They're replaced from the payload at render time.">
                <input style={inp} value={spec.header.title} onChange={e => updateHeader({ title: e.target.value })} placeholder="e.g. Mission Complete!" />
              </Field>
            </div>
            <div style={{ flex: 2 }}>
              <Field label="Subtitle">
                <input style={inp} value={spec.header.subtitle || ''} onChange={e => updateHeader({ subtitle: e.target.value })} />
              </Field>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1 }}>
              <Field label="Icon asset key">
                <AssetKeyInput fieldName="spec.header.icon.assetKey" value={spec.header.icon?.assetKey || ''} onChange={v => updateHeader({ icon: v ? { assetKey: v } : undefined })} placeholder="icons/header_icon.png" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Banner asset key">
                <AssetKeyInput fieldName="spec.header.banner.assetKey" value={spec.header.banner?.assetKey || ''} onChange={v => updateHeader({ banner: v ? { assetKey: v } : undefined })} placeholder="images/banner.jpg" />
              </Field>
            </div>
          </Row>
        </div>

        <div className="me-card">
          <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#4c4c7a] mb-3 pb-2 border-b border-[#1a1a3e]">Default Buttons</div>
          <ButtonList buttons={spec.buttons} onChange={buttons => updateSpec({ buttons })} />
        </div>

        <div className="me-card">
          <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#4c4c7a] mb-3 pb-2 border-b border-[#1a1a3e]">Pages</div>
          <PageTabStrip
            pageCount={pages.length}
            activeIdx={currentPageIdx}
            onSelect={setActivePage}
            onAdd={addPage}
            onDuplicate={duplicatePage}
            onDelete={deletePage}
          />
          <PageEditor
            page={currentPage}
            onChange={updateCurrentPage}
            tokenPaths={dynamicTokenPaths}
          />
        </div>
      </Section>

      {/* ── Payload ── */}
      <Section title="Payload" open={payloadOpen} onToggle={() => setPayloadOpen(v => !v)} badge={payloadJson ? 'active' : undefined} sectionClass="me-section-edit">
        <div className="me-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: '#64748b', fontSize: 12, flex: 1 }}>
              Paste sample JSON or load a recent job. Token paths (e.g. <code style={{ color: '#7c3aed', fontSize: 11 }}>${'${results.rewards}'}</code>) in headers, blocks, and buttons will resolve against this data in the preview.
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
        <ScriptingHelp dynamicPaths={dynamicTokenPaths} />
      </Section>

      {/* ── Preview ── */}
      <Section title="Preview" open={previewOpen} onToggle={() => setPreviewOpen(v => !v)} sectionClass="me-section-preview">
        <div className="me-card" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <LivePreview spec={spec} payloadJson={payloadJson} />
        </div>
      </Section>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  selectStyle,
  inputStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

const BLOCK_TYPES = [
  'mission_hero',
  'mission_stats',
  'mission_requirements',
  'mission_stats_requirements',
  'mission_synergy',
  'team_section',
  'reward_list',
  'narrative_text',
  'rich_text',
  'image',
  'divider',
  'key_value_row',
] as const;

type BlockType = typeof BLOCK_TYPES[number];

/** Mission-specific blocks have no configurable props — they read from SurfaceContext. */
const MISSION_CONTEXT_BLOCKS = new Set<BlockType>([
  'mission_hero', 'mission_stats', 'mission_requirements',
  'mission_stats_requirements', 'mission_synergy', 'team_section', 'reward_list',
]);

/** Content-document blocks that have a structured editor. */
const CONTENT_STRUCTURED_BLOCKS = new Set<BlockType>([
  'narrative_text', 'rich_text', 'image', 'divider', 'key_value_row',
]);

const MISSION_MODES = ['planning', 'in_progress', 'outcome'] as const;
const TEAM_MODES = ['editable', 'locked'] as const;
const REWARD_MODES = ['preview', 'actual'] as const;

interface Block {
  type: BlockType | string;
  [k: string]: unknown;
}

interface Context {
  missionMode?: string;
  teamMode?: string;
  rewardMode?: string;
}

interface DocumentData {
  id?: string;
  version?: number;
  blocks?: Block[];
  context?: Context;
}

function defaultBlock(type: string): Block {
  switch (type) {
    case 'narrative_text': return { type, text: '' };
    case 'rich_text': return { type, content: '' };
    case 'image': return { type, assetKey: '', caption: '' };
    case 'key_value_row': return { type, label: '', value: '' };
    default: return { type };
  }
}

// ─── Tab bar shared style ─────────────────────────────────────────────────────

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
  textTransform: 'uppercase', border: '1px solid',
  borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
  background: active ? 'rgba(139,92,246,0.18)' : 'transparent',
  color: active ? '#a78bfa' : '#555',
  borderColor: active ? 'rgba(139,92,246,0.4)' : '#2a2a4e',
});

// ─── Structured field editors per block type ──────────────────────────────────

function NarrativeTextFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>text</span>
      <input
        type="text"
        value={String(block.text ?? '')}
        onChange={e => onChange({ ...block, text: e.target.value })}
        placeholder="Static fallback text (shown when surface provides no dynamic narrative)"
        style={{ ...inputStyle, width: '100%' }}
      />
      <span style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
        Sources text from <code style={{ color: '#a78bfa' }}>SurfaceContext.narrativeTexts</code> first; this field is the static fallback.
      </span>
    </div>
  );
}

function RichTextFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>content <span style={{ color: '#f87171' }}>*</span></span>
      <textarea
        value={String(block.content ?? '')}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="Plain text to display as a paragraph"
        rows={3}
        style={{ ...inputStyle, width: '100%', resize: 'vertical' as const, fontFamily: 'inherit' }}
      />
    </div>
  );
}

function ImageFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ ...fieldGroupStyle, flex: 2 }}>
        <span style={labelStyle}>assetKey <span style={{ color: '#f87171' }}>*</span></span>
        <input
          type="text"
          value={String(block.assetKey ?? '')}
          onChange={e => onChange({ ...block, assetKey: e.target.value })}
          placeholder="banner_mission_ruins"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
      <div style={{ ...fieldGroupStyle, flex: 1 }}>
        <span style={labelStyle}>caption</span>
        <input
          type="text"
          value={String(block.caption ?? '')}
          onChange={e => onChange({ ...block, caption: e.target.value })}
          placeholder="Optional caption"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
    </div>
  );
}

function DividerFields() {
  return (
    <div style={{
      fontSize: 11, color: '#6b7280', background: 'rgba(100,100,140,0.06)',
      border: '1px solid rgba(100,100,140,0.2)', borderRadius: 5, padding: '7px 12px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 13 }}>🔲</span>
      <span>No props — renders a horizontal separator line.</span>
    </div>
  );
}

function KeyValueRowFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ ...fieldGroupStyle, flex: 1 }}>
        <span style={labelStyle}>label <span style={{ color: '#f87171' }}>*</span></span>
        <input
          type="text"
          value={String(block.label ?? '')}
          onChange={e => onChange({ ...block, label: e.target.value })}
          placeholder="Difficulty"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
      <div style={{ ...fieldGroupStyle, flex: 1 }}>
        <span style={labelStyle}>value <span style={{ color: '#f87171' }}>*</span></span>
        <input
          type="text"
          value={String(block.value ?? '')}
          onChange={e => onChange({ ...block, value: e.target.value })}
          placeholder="Hard"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
    </div>
  );
}

// ─── Block entry ──────────────────────────────────────────────────────────────

function BlockEntry({
  block, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const blockType = block.type as BlockType;
  const isKnownType = (BLOCK_TYPES as readonly string[]).includes(block.type as string);
  const isMissionContext = MISSION_CONTEXT_BLOCKS.has(blockType);
  const isContentStructured = CONTENT_STRUCTURED_BLOCKS.has(blockType);

  const [tab, setTab] = useState<'structured' | 'raw'>('structured');
  const [rawText, setRawText] = useState(() => JSON.stringify(block, null, 2));
  const [rawError, setRawError] = useState('');
  const prevType = useRef(block.type);

  useEffect(() => {
    if (prevType.current !== block.type) {
      prevType.current = block.type;
      setTab('structured');
      setRawText(JSON.stringify(block, null, 2));
      setRawError('');
    }
  }, [block]);

  const handleTabChange = (next: 'structured' | 'raw') => {
    if (next === 'raw') {
      setRawText(JSON.stringify(block, null, 2));
      setRawError('');
    }
    setTab(next);
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setRawError('Must be a JSON object {}');
        return;
      }
      setRawError('');
      onChange(parsed as Block);
    } catch {
      setRawError('Invalid JSON');
    }
  };

  const rawJsonPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        value={rawText}
        onChange={e => handleRawChange(e.target.value)}
        rows={5}
        style={{
          ...inputStyle, width: '100%', resize: 'vertical' as const,
          fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' as const,
          color: rawError ? '#ff6b6b' : '#a0e0a0',
        }}
      />
      {rawError && <span style={{ color: '#ff6b6b', fontSize: 10 }}>{rawError}</span>}
    </div>
  );

  const renderStructuredBody = () => {
    if (!isKnownType) return null;
    if (isMissionContext) {
      return (
        <div style={{
          fontSize: 11, color: '#6b7280', background: 'rgba(100,100,140,0.06)',
          border: '1px solid rgba(100,100,140,0.2)', borderRadius: 5, padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 13 }}>🔒</span>
          <span>No configurable props — reads all data from <code style={{ color: '#a78bfa' }}>SurfaceContext</code>.</span>
        </div>
      );
    }
    switch (blockType) {
      case 'narrative_text': return <NarrativeTextFields block={block} onChange={onChange} />;
      case 'rich_text': return <RichTextFields block={block} onChange={onChange} />;
      case 'image': return <ImageFields block={block} onChange={onChange} />;
      case 'divider': return <DividerFields />;
      case 'key_value_row': return <KeyValueRowFields block={block} onChange={onChange} />;
      default: return null;
    }
  };

  const showTabs = isKnownType;

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
          <span style={labelStyle}>type</span>
          <select
            value={block.type as string}
            onChange={e => {
              const next = defaultBlock(e.target.value);
              onChange(next);
            }}
            style={{ ...selectStyle, width: '100%' }}
          >
            {BLOCK_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
            {!isKnownType && (
              <option value={block.type as string}>{block.type as string} (unknown)</option>
            )}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>

      {/* Tab bar — shown for all known types; unknown types go straight to raw JSON */}
      {showTabs ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" style={tabBtnStyle(tab === 'structured')} onClick={() => handleTabChange('structured')}>
              Structured
            </button>
            {(isContentStructured || isMissionContext) && (
              <button type="button" style={tabBtnStyle(tab === 'raw')} onClick={() => handleTabChange('raw')}>
                Raw JSON
              </button>
            )}
          </div>
          {tab === 'raw' ? rawJsonPanel : renderStructuredBody()}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontSize: 10, color: '#6b7280', background: 'rgba(100,100,140,0.06)',
            border: '1px solid rgba(100,100,140,0.2)', borderRadius: 4, padding: '5px 10px',
          }}>
            Unknown block type — no schema available. Select a known type or edit as raw JSON.
          </div>
          {rawJsonPanel}
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

interface Props {
  value: DocumentData | null | undefined;
  onChange: (v: DocumentData) => void;
}

export default function ContentDocumentDataEditor({ value, onChange }: Props) {
  const doc: DocumentData = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const blocks: Block[] = Array.isArray(doc.blocks) ? doc.blocks as Block[] : [];
  const ctx: Context = (doc.context && typeof doc.context === 'object') ? doc.context as Context : {};

  const setBlocks = (next: Block[]) => onChange({ ...doc, blocks: next });
  const setCtx = (next: Context) => onChange({ ...doc, context: next });

  const updateBlock = (idx: number, next: Block) => {
    const arr = blocks.slice();
    arr[idx] = next;
    setBlocks(arr);
  };

  const removeBlock = (idx: number) => setBlocks(blocks.filter((_, i) => i !== idx));

  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const arr = blocks.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    setBlocks(arr);
  };

  const addBlock = () => setBlocks([...blocks, defaultBlock('rich_text')]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...containerStyle, gap: 6 }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          Blocks ({blocks.length})
        </div>
        {blocks.map((block, idx) => (
          <BlockEntry
            key={idx}
            block={block}
            onChange={next => updateBlock(idx, next)}
            onRemove={() => removeBlock(idx)}
            onMoveUp={() => moveBlock(idx, idx - 1)}
            onMoveDown={() => moveBlock(idx, idx + 1)}
            canMoveUp={idx > 0}
            canMoveDown={idx < blocks.length - 1}
          />
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={addButtonStyle} onClick={addBlock}>+ block</button>
        </div>
      </div>

      <div style={{ background: '#0f0f2e', border: '1px solid #2a2a4e', borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Default Context
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>missionMode</span>
            <select
              value={ctx.missionMode ?? ''}
              onChange={e => setCtx({ ...ctx, missionMode: e.target.value || undefined })}
              style={selectStyle}
            >
              <option value="">— none —</option>
              {MISSION_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>teamMode</span>
            <select
              value={ctx.teamMode ?? ''}
              onChange={e => setCtx({ ...ctx, teamMode: e.target.value || undefined })}
              style={selectStyle}
            >
              <option value="">— none —</option>
              {TEAM_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>rewardMode</span>
            <select
              value={ctx.rewardMode ?? ''}
              onChange={e => setCtx({ ...ctx, rewardMode: e.target.value || undefined })}
              style={selectStyle}
            >
              <option value="">— none —</option>
              {REWARD_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function contentDocumentDataErrorCount(value: any): number {
  if (!value || typeof value !== 'object') return 1;
  const blocks = value.blocks;
  if (!Array.isArray(blocks)) return 1;
  const VALID_TYPES = [
    'mission_hero', 'mission_stats', 'mission_requirements', 'mission_stats_requirements',
    'mission_synergy', 'team_section', 'reward_list',
    'narrative_text', 'rich_text', 'image', 'divider', 'key_value_row',
  ];
  let n = 0;
  blocks.forEach((b: any) => {
    if (!b || typeof b !== 'object' || !b.type || !VALID_TYPES.includes(b.type)) n++;
    if (b?.type === 'key_value_row' && (!b.label || !b.value)) n++;
    if (b?.type === 'rich_text' && !b.content) n++;
    if (b?.type === 'image' && !b.assetKey) n++;
  });
  return n;
}

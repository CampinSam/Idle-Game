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
  'mission_synergy',
  'team_section',
  'reward_list',
  'entity_roster',
  'mission_timer',
  'outcome_banner',
  'narrative_text',
  'rich_text',
  'image',
  'divider',
  'key_value_row',
] as const;

type BlockType = typeof BLOCK_TYPES[number];

const MISSION_MODES = ['planning', 'in_progress', 'outcome'] as const;
const TEAM_MODES = ['editable', 'locked'] as const;
const REWARD_MODES = ['preview', 'actual'] as const;

/** Fields that are optional on certain block types. */
interface BlockExtra {
  text?: string;
  content?: string;
  assetKey?: string;
  caption?: string;
  label?: string;
  value?: string;
}

interface Block extends BlockExtra {
  type: BlockType;
  [k: string]: any;
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

function defaultBlock(type: BlockType): Block {
  switch (type) {
    case 'narrative_text': return { type, text: '' };
    case 'rich_text': return { type, content: '' };
    case 'image': return { type, assetKey: '', caption: '' };
    case 'key_value_row': return { type, label: '', value: '' };
    default: return { type };
  }
}

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
  const hasText = block.type === 'narrative_text';
  const hasContent = block.type === 'rich_text';
  const hasAsset = block.type === 'image';
  const hasKV = block.type === 'key_value_row';

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
          <span style={labelStyle}>type</span>
          <select
            value={block.type}
            onChange={e => onChange(defaultBlock(e.target.value as BlockType))}
            style={{ ...selectStyle, width: '100%' }}
          >
            {BLOCK_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>

      {hasText && (
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>text</span>
          <input
            type="text"
            value={block.text ?? ''}
            onChange={e => onChange({ ...block, text: e.target.value })}
            placeholder="Narrative fallback text"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}

      {hasContent && (
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>content</span>
          <input
            type="text"
            value={block.content ?? ''}
            onChange={e => onChange({ ...block, content: e.target.value })}
            placeholder="Plain text content"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}

      {hasAsset && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...fieldGroupStyle, flex: 2 }}>
            <span style={labelStyle}>assetKey</span>
            <input
              type="text"
              value={block.assetKey ?? ''}
              onChange={e => onChange({ ...block, assetKey: e.target.value })}
              placeholder="media/image.png"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: 1 }}>
            <span style={labelStyle}>caption</span>
            <input
              type="text"
              value={block.caption ?? ''}
              onChange={e => onChange({ ...block, caption: e.target.value })}
              placeholder="Optional caption"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      )}

      {hasKV && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...fieldGroupStyle, flex: 1 }}>
            <span style={labelStyle}>label</span>
            <input
              type="text"
              value={block.label ?? ''}
              onChange={e => onChange({ ...block, label: e.target.value })}
              placeholder="Label"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: 1 }}>
            <span style={labelStyle}>value</span>
            <input
              type="text"
              value={block.value ?? ''}
              onChange={e => onChange({ ...block, value: e.target.value })}
              placeholder="Value"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

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

  const addBlock = () => setBlocks([...blocks, { type: 'mission_hero' }]);

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
    'mission_hero', 'mission_stats', 'mission_requirements', 'mission_synergy',
    'team_section', 'reward_list', 'entity_roster', 'mission_timer',
    'outcome_banner', 'narrative_text', 'rich_text', 'image', 'divider', 'key_value_row',
  ];
  let n = 0;
  blocks.forEach((b: any) => {
    if (!b || typeof b !== 'object' || !b.type || !VALID_TYPES.includes(b.type)) n++;
    if (b?.type === 'key_value_row' && (!b.label || !b.value)) n++;
  });
  return n;
}

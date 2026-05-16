import { useState } from 'react';
import StatMapEditor from './StatMapEditor';
import SlotStatsEditor from './SlotStatsEditor';
import {
  containerStyle, inputStyle, addButtonStyle, dangerIconButtonStyle,
  labelStyle, fieldRowStyle, selectStyle, numberInputStyle,
} from './editorStyles';

const RARITY_OPTIONS = ['common', 'uncommon', 'scare', 'rare', 'epic', 'mythic', 'legendary', 'unique'];

type Trait = {
  slotStats?: Record<string, Record<string, number | number[]>>;
  tags?: string[];
  emoji?: string | null;
  color?: string | null;
  gradient?: string | null;
  scaling?: Record<string, number | number[]>;
  rarityMultiplier?: number;
  rarity?: string | null;
};

interface Props {
  value: Record<string, Trait> | null | undefined;
  onChange: (v: Record<string, Trait>) => void;
}

export default function TraitsEditor({ value, onChange }: Props) {
  const current: Record<string, Trait> =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const archetypes = Object.keys(current);

  const isOpen = (a: string) => expanded[a] === true;
  const toggle = (a: string) => setExpanded(p => ({ ...p, [a]: !isOpen(a) }));

  const setTrait = (a: string, t: Trait) => onChange({ ...current, [a]: t });
  const patchTrait = (a: string, p: Partial<Trait>) => setTrait(a, { ...current[a], ...p });
  const removeTrait = (a: string) => {
    const next = { ...current };
    delete next[a];
    onChange(next);
  };
  const addTrait = () => {
    const t = newName.trim();
    if (!t || current[t] !== undefined) return;
    onChange({ ...current, [t]: { slotStats: {}, tags: [], scaling: {}, rarityMultiplier: 1, rarity: 'common' } });
    setExpanded(p => ({ ...p, [t]: true }));
    setNewName('');
  };

  return (
    <div style={containerStyle}>
      {archetypes.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '6px 0' }}>
          No archetypes — add one below
        </div>
      )}
      {archetypes.map(a => {
        const t = current[a] ?? {};
        const open = isOpen(a);
        return (
          <div key={a} style={{
            border: '1px solid #2a2a4e', borderRadius: 6, background: '#13132b', overflow: 'hidden',
          }}>
            <div
              onClick={() => toggle(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                background: '#161636', cursor: 'pointer', userSelect: 'none',
                borderBottom: open ? '1px solid #2a2a4e' : 'none',
              }}
            >
              <span style={{ fontSize: 10, color: '#666', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em' }}>{a}</span>
              {t.rarity && (
                <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t.rarity}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeTrait(a); }}
                style={dangerIconButtonStyle}
                title={`Remove ${a}`}
              >×</button>
            </div>
            {open && (
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>SLOT STATS (per body slot)</div>
                  <SlotStatsEditor
                    value={t.slotStats ?? {}}
                    onChange={v => patchTrait(a, { slotStats: v })}
                  />
                </div>

                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>SCALING (multipliers per stat)</div>
                  <StatMapEditor
                    value={t.scaling ?? {}}
                    onChange={v => patchTrait(a, { scaling: v as Record<string, number | number[]> })}
                  />
                </div>

                <div style={fieldRowStyle}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={labelStyle}>RARITY</div>
                    <select
                      value={t.rarity ?? ''}
                      onChange={e => patchTrait(a, { rarity: e.target.value || null })}
                      style={{ ...selectStyle, width: '100%' }}
                    >
                      <option value="">— none —</option>
                      {RARITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ minWidth: 100 }}>
                    <div style={labelStyle}>RARITY MULT</div>
                    <input
                      type="number"
                      step={0.01}
                      value={t.rarityMultiplier ?? 1}
                      onChange={e => {
                        const n = Number(e.target.value);
                        patchTrait(a, { rarityMultiplier: isNaN(n) ? 1 : n });
                      }}
                      style={numberInputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 80 }}>
                    <div style={labelStyle}>EMOJI</div>
                    <input
                      type="text"
                      value={t.emoji ?? ''}
                      onChange={e => patchTrait(a, { emoji: e.target.value || null })}
                      style={{ ...inputStyle, width: 60 }}
                      placeholder="🥷"
                    />
                  </div>
                </div>

                <div style={fieldRowStyle}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={labelStyle}>COLOR</div>
                    <input
                      type="text"
                      value={t.color ?? ''}
                      onChange={e => patchTrait(a, { color: e.target.value || null })}
                      placeholder="#0F172A"
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <div style={labelStyle}>GRADIENT</div>
                    <input
                      type="text"
                      value={t.gradient ?? ''}
                      onChange={e => patchTrait(a, { gradient: e.target.value || null })}
                      placeholder="linear-gradient(...)"
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                </div>

                <TagsEditor value={t.tags ?? []} onChange={v => patchTrait(a, { tags: v })} />
              </div>
            )}
          </div>
        );
      })}
      <div style={fieldRowStyle}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTrait(); } }}
          placeholder="archetype name (e.g. Ninja)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={addTrait} disabled={!newName.trim()} style={addButtonStyle}>
          + archetype
        </button>
      </div>
    </div>
  );
}

function TagsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <div>
      <div style={labelStyle}>TAGS</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        {value.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 12,
            padding: '2px 8px', fontSize: 11, color: '#e0e0ff',
          }}>
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter(t => t !== tag))}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={fieldRowStyle}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder="add tag"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} style={addButtonStyle}>+</button>
      </div>
    </div>
  );
}

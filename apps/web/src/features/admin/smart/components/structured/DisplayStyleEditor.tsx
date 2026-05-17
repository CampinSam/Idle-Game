import { useState } from 'react';
import {
  containerStyle,
  sectionStyle,
  fieldGroupStyle,
  fieldRowStyle,
  inputStyle,
  selectStyle,
  labelStyle,
} from './editorStyles';

interface Props {
  value: any;
  onChange: (next: any) => void;
}

const BG_POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'];
const BG_SIZES = ['cover', 'contain', '100%', '100% 100%', 'auto'];
const BG_REPEATS = ['', 'no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'space', 'round'];
const TEXT_TRANSFORMS = ['', 'none', 'uppercase', 'lowercase', 'capitalize'];
const FONT_FAMILIES = [
  `'Exo 2', system-ui, sans-serif`,
  `'Cinzel', serif`,
  `system-ui, sans-serif`,
  `serif`,
  `monospace`,
  `Georgia, serif`,
  `'Courier New', monospace`,
  `Impact, sans-serif`,
];

type EditorMode = 'missionCategory' | 'mission' | 'generic';

const MODES: { value: EditorMode; label: string }[] = [
  { value: 'missionCategory', label: 'Mission Category' },
  { value: 'mission', label: 'Mission' },
  { value: 'generic', label: 'Generic' },
];

const SECTION_VISIBILITY: Record<string, EditorMode[]> = {
  overlay: ['missionCategory', 'mission', 'generic'],
  background: ['missionCategory', 'mission', 'generic'],
  title: ['missionCategory', 'mission', 'generic'],
  body: ['missionCategory', 'mission', 'generic'],
  inlineButtons: ['missionCategory', 'generic'],
};

function sectionVisible(section: string, mode: EditorMode): boolean {
  return SECTION_VISIBILITY[section]?.includes(mode) ?? true;
}

function PresetOrCustom({ value, presets, placeholder, onChange }: {
  value: string;
  presets: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  // Track "custom mode" in local UI state so toggling the dropdown doesn't write
  // a sentinel value (like ' ') into persisted data before the user types.
  const valueIsCustom = value !== '' && !presets.includes(value);
  const [customMode, setCustomMode] = useState<boolean>(valueIsCustom);
  const showCustom = customMode || valueIsCustom;

  return (
    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
      <select
        value={showCustom ? '__custom__' : value}
        onChange={e => {
          const v = e.target.value;
          if (v === '__custom__') {
            setCustomMode(true);
          } else {
            setCustomMode(false);
            onChange(v);
          }
        }}
        style={{ ...selectStyle, width: '100%' }}
      >
        <option value="">— default —</option>
        {presets.map(p => <option key={p} value={p}>{p}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, width: '100%' }}
          autoFocus
        />
      )}
    </div>
  );
}

function setPath(obj: any, section: string, key: string, val: any): any {
  const next = { ...(obj || {}) };
  const sec = { ...(next[section] || {}) };
  if (val === '' || val === undefined || val === null) {
    delete sec[key];
  } else {
    sec[key] = val;
  }
  if (Object.keys(sec).length === 0) {
    delete next[section];
  } else {
    next[section] = sec;
  }
  return next;
}

function ColorWithText({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="color"
        value={value && /^#([a-f\d]{3}|[a-f\d]{6})$/i.test(value) ? value : '#000000'}
        onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 26, border: 'none', cursor: 'pointer', background: 'none', padding: 0 }}
      />
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '#rrggbb'}
        style={{ ...inputStyle, flex: 1, minWidth: 80 }}
      />
    </div>
  );
}

function setDeepPath(obj: any, section: string, sub: string, key: string, val: any): any {
  const next = { ...(obj || {}) };
  const sec = { ...(next[section] || {}) };
  const subsec = { ...(sec[sub] || {}) };
  if (val === '' || val === undefined || val === null) {
    delete subsec[key];
  } else {
    subsec[key] = val;
  }
  if (Object.keys(subsec).length === 0) {
    delete sec[sub];
  } else {
    sec[sub] = subsec;
  }
  if (Object.keys(sec).length === 0) {
    delete next[section];
  } else {
    next[section] = sec;
  }
  return next;
}

function ButtonStatePanel({ label, stateKey, stateValue, onChange }: {
  label: string;
  stateKey: string;
  stateValue: any;
  onChange: (sub: string, key: string, val: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const state = stateValue || {};

  return (
    <div style={{ border: '1px solid #2a2a4e', borderRadius: 4, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          background: '#13132b',
          border: 'none',
          color: '#a0a0c8',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: 8, background: '#0f0f2e', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>background (gradient-friendly)</span>
            <input
              type="text"
              value={state.background || ''}
              onChange={e => onChange(stateKey, 'background', e.target.value)}
              placeholder="e.g. linear-gradient(135deg, …) or #3a1a6e"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>text color</span>
              <ColorWithText
                value={state.color || ''}
                onChange={val => onChange(stateKey, 'color', val)}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>border color</span>
              <ColorWithText
                value={state.borderColor || ''}
                onChange={val => onChange(stateKey, 'borderColor', val)}
                placeholder="#rrggbb or rgba(…)"
              />
            </div>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>
              opacity: {typeof state.opacity === 'number' ? `${Math.round(state.opacity * 100)}%` : '— default —'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={typeof state.opacity === 'number' ? Math.round(state.opacity * 100) : 100}
                onChange={e => onChange(stateKey, 'opacity', Number(e.target.value) / 100)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => onChange(stateKey, 'opacity', '')}
                style={{ ...inputStyle, padding: '2px 8px', cursor: 'pointer' }}
                title="Reset to default"
              >
                clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DisplayStyleEditor({ value, onChange }: Props) {
  const v = value && typeof value === 'object' ? value : {};
  const overlay = v.overlay || {};
  const bg = v.background || {};
  const title = v.title || {};
  const body = v.body || {};
  const inlineButtons = v.inlineButtons || {};
  const mode: EditorMode = ((v.data || {})._mode as EditorMode) || 'generic';

  function setMode(m: EditorMode) {
    onChange(setPath(v, 'data', '_mode', m));
  }

  function setInlineButtonState(sub: string, key: string, val: any) {
    onChange(setDeepPath(v, 'inlineButtons', sub, key, val));
  }

  return (
    <div style={containerStyle}>
      {/* Mode picker */}
      <div style={{ display: 'flex', gap: 2, background: '#0a0a1e', borderRadius: 6, padding: 3, border: '1px solid #2a2a4e' }}>
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              transition: 'background 0.15s, color 0.15s',
              background: mode === m.value ? '#3b1fa8' : 'transparent',
              color: mode === m.value ? '#fff' : '#666',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Overlay */}
      {sectionVisible('overlay', mode) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>OVERLAY (darkness over background image)</div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>color</span>
              <ColorWithText
                value={overlay.color || ''}
                onChange={val => onChange(setPath(v, 'overlay', 'color', val))}
                placeholder="#0F0A28"
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>
                opacity (darkness): {typeof overlay.opacity === 'number' ? `${Math.round(overlay.opacity * 100)}%` : '— default —'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={typeof overlay.opacity === 'number' ? Math.round(overlay.opacity * 100) : 0}
                  onChange={e => onChange(setPath(v, 'overlay', 'opacity', Number(e.target.value) / 100))}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => onChange(setPath(v, 'overlay', 'opacity', ''))}
                  style={{ ...inputStyle, padding: '2px 8px', cursor: 'pointer' }}
                  title="Reset to default"
                >
                  clear
                </button>
              </div>
            </div>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>gradient (raw CSS — overrides color/opacity)</span>
            <input
              type="text"
              value={overlay.gradient || ''}
              onChange={e => onChange(setPath(v, 'overlay', 'gradient', e.target.value))}
              placeholder="linear-gradient(90deg, rgba(0,0,0,0.7), rgba(0,0,0,0.2))"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Background */}
      {sectionVisible('background', mode) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>BACKGROUND IMAGE LAYOUT</div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>position</span>
              <PresetOrCustom
                value={bg.position || ''}
                presets={BG_POSITIONS}
                placeholder="e.g. 30% 70%"
                onChange={val => onChange(setPath(v, 'background', 'position', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>size</span>
              <PresetOrCustom
                value={bg.size || ''}
                presets={BG_SIZES}
                placeholder="e.g. 200px or 80% auto"
                onChange={val => onChange(setPath(v, 'background', 'size', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>repeat</span>
              <select
                value={bg.repeat || ''}
                onChange={e => onChange(setPath(v, 'background', 'repeat', e.target.value))}
                style={{ ...selectStyle, width: '100%' }}
              >
                {BG_REPEATS.map(r => <option key={r} value={r}>{r || '— default (no-repeat) —'}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Title font */}
      {sectionVisible('title', mode) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>TITLE FONT (card / hero heading)</div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontFamily</span>
              <PresetOrCustom
                value={title.fontFamily || ''}
                presets={FONT_FAMILIES}
                placeholder={`e.g. 'My Font', sans-serif`}
                onChange={val => onChange(setPath(v, 'title', 'fontFamily', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontWeight</span>
              <input
                type="text"
                value={title.fontWeight ?? ''}
                onChange={e => onChange(setPath(v, 'title', 'fontWeight', e.target.value))}
                placeholder="e.g. 700 or bold"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontSize</span>
              <input
                type="text"
                value={title.fontSize || ''}
                onChange={e => onChange(setPath(v, 'title', 'fontSize', e.target.value))}
                placeholder="e.g. 22px or 1.4rem"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>color</span>
              <ColorWithText
                value={title.color || ''}
                onChange={val => onChange(setPath(v, 'title', 'color', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>letterSpacing</span>
              <input
                type="text"
                value={title.letterSpacing || ''}
                onChange={e => onChange(setPath(v, 'title', 'letterSpacing', e.target.value))}
                placeholder="e.g. 0.5px"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>textTransform</span>
              <select
                value={title.textTransform || ''}
                onChange={e => onChange(setPath(v, 'title', 'textTransform', e.target.value))}
                style={{ ...selectStyle, width: '100%' }}
              >
                {TEXT_TRANSFORMS.map(t => <option key={t} value={t}>{t || '— default —'}</option>)}
              </select>
            </div>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>textShadow</span>
            <input
              type="text"
              value={title.textShadow || ''}
              onChange={e => onChange(setPath(v, 'title', 'textShadow', e.target.value))}
              placeholder="e.g. 0 2px 8px rgba(0,0,0,0.6)"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Body font */}
      {sectionVisible('body', mode) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>BODY / INLINE TEXT FONT (everything else inside the card)</div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontFamily</span>
              <PresetOrCustom
                value={body.fontFamily || ''}
                presets={FONT_FAMILIES}
                placeholder={`e.g. 'My Font', sans-serif`}
                onChange={val => onChange(setPath(v, 'body', 'fontFamily', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontWeight</span>
              <input
                type="text"
                value={body.fontWeight ?? ''}
                onChange={e => onChange(setPath(v, 'body', 'fontWeight', e.target.value))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>fontSize</span>
              <input
                type="text"
                value={body.fontSize || ''}
                onChange={e => onChange(setPath(v, 'body', 'fontSize', e.target.value))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
          <div style={fieldRowStyle}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>color</span>
              <ColorWithText
                value={body.color || ''}
                onChange={val => onChange(setPath(v, 'body', 'color', val))}
              />
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>lineHeight</span>
              <input
                type="text"
                value={body.lineHeight || ''}
                onChange={e => onChange(setPath(v, 'body', 'lineHeight', e.target.value))}
                placeholder="e.g. 1.4"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Inline Buttons (Mission Category mode only) */}
      {sectionVisible('inlineButtons', mode) && (
        <div style={sectionStyle}>
          <div style={labelStyle}>INLINE BUTTONS</div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>placement</span>
            <select
              value={inlineButtons.placement || 'inline'}
              onChange={e => onChange(setPath(v, 'inlineButtons', 'placement', e.target.value))}
              style={{ ...selectStyle, width: '100%' }}
            >
              <option value="inline">inline (default — beside content)</option>
              <option value="bottom">bottom (pushed to card bottom)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...labelStyle, marginBottom: 2 }}>per-state styles (leave empty to use defaults)</span>
            <ButtonStatePanel
              label="Normal (can afford)"
              stateKey="normal"
              stateValue={inlineButtons.normal}
              onChange={setInlineButtonState}
            />
            <ButtonStatePanel
              label="Requirements Not Met (cannot afford)"
              stateKey="requirementsNotMet"
              stateValue={inlineButtons.requirementsNotMet}
              onChange={setInlineButtonState}
            />
            <ButtonStatePanel
              label="Disabled"
              stateKey="disabled"
              stateValue={inlineButtons.disabled}
              onChange={setInlineButtonState}
            />
          </div>
        </div>
      )}
    </div>
  );
}

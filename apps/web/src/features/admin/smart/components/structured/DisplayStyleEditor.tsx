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
const BG_SIZES = ['cover', 'contain', '100% 100%', 'auto'];
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

export default function DisplayStyleEditor({ value, onChange }: Props) {
  const v = value && typeof value === 'object' ? value : {};
  const overlay = v.overlay || {};
  const bg = v.background || {};
  const title = v.title || {};
  const body = v.body || {};

  return (
    <div style={containerStyle}>
      {/* Overlay */}
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

      {/* Background */}
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

      {/* Title font */}
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

      {/* Body font */}
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
    </div>
  );
}

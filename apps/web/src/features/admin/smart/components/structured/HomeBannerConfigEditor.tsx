import {
  inputStyle,
  numberInputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import { errorTextStyle } from './validation';
import { type StructuredEditorProps, omitKey } from './editorContract';

export interface HomeBannerConfig {
  autoAdvanceMs?: number;
  tagline?: string;
  deriveFromActiveSeason?: boolean;
}

interface ConfigErrors {
  autoAdvanceMs?: string;
}

type Props = StructuredEditorProps<HomeBannerConfig>;

const EMPTY: HomeBannerConfig = {};

export function validateHomeBannerConfig(v: HomeBannerConfig | null | undefined): ConfigErrors {
  const errs: ConfigErrors = {};
  if (!v) return errs;
  if (v.autoAdvanceMs !== undefined && (isNaN(Number(v.autoAdvanceMs)) || Number(v.autoAdvanceMs) < 100)) {
    errs.autoAdvanceMs = 'must be ≥ 100 ms';
  }
  return errs;
}

export function homeBannerConfigErrorCount(v: HomeBannerConfig | null | undefined): number {
  return Object.keys(validateHomeBannerConfig(v)).length;
}

export default function HomeBannerConfigEditor({ value, onChange }: Props) {
  const cfg: HomeBannerConfig = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;

  const setNum = (key: keyof HomeBannerConfig, v: number | undefined) => {
    if (v === undefined) {
      const rest = omitKey(cfg, key);
      onChange(Object.keys(rest).length > 0 ? rest as HomeBannerConfig : EMPTY);
    } else {
      onChange({ ...cfg, [key]: v });
    }
  };

  const setStr = (key: keyof HomeBannerConfig, v: string) => {
    if (v === '') {
      const rest = omitKey(cfg, key);
      onChange(Object.keys(rest).length > 0 ? rest as HomeBannerConfig : EMPTY);
    } else {
      onChange({ ...cfg, [key]: v });
    }
  };

  const setBool = (key: keyof HomeBannerConfig, v: boolean | undefined) => {
    if (v === undefined) {
      const rest = omitKey(cfg, key);
      onChange(Object.keys(rest).length > 0 ? rest as HomeBannerConfig : EMPTY);
    } else {
      onChange({ ...cfg, [key]: v });
    }
  };

  const errs = validateHomeBannerConfig(cfg);

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Banner Config
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, maxWidth: 200 }}>
            <span style={labelStyle}>autoAdvanceMs</span>
            <span style={{ fontSize: 10, color: '#555' }}>carousel auto-advance delay (blank = no auto-advance)</span>
            <input
              type="number"
              value={cfg.autoAdvanceMs ?? ''}
              placeholder="e.g. 7000"
              min={100}
              step={500}
              onChange={e => setNum('autoAdvanceMs', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.autoAdvanceMs ? '#ef4444' : undefined }}
            />
            {errs.autoAdvanceMs && <span style={errorTextStyle}>{errs.autoAdvanceMs}</span>}
          </div>

          <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 200 }}>
            <span style={labelStyle}>tagline</span>
            <span style={{ fontSize: 10, color: '#555' }}>small text line shown on the banner card (optional)</span>
            <input
              type="text"
              value={cfg.tagline ?? ''}
              placeholder="e.g. Limited Time Offer"
              onChange={e => setStr('tagline', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setBool('deriveFromActiveSeason', cfg.deriveFromActiveSeason ? undefined : true)}
              style={{
                width: 36, height: 20, borderRadius: 10, position: 'relative',
                background: cfg.deriveFromActiveSeason ? '#22d3ee' : '#333',
                transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: cfg.deriveFromActiveSeason ? 17 : 2,
                width: 16, height: 16, borderRadius: 8, background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, color: cfg.deriveFromActiveSeason ? '#22d3ee' : '#888' }}>
                deriveFromActiveSeason
              </span>
              <span style={{ fontSize: 10, color: '#555' }}>
                auto-fill title &amp; countdown from the currently active Season record
              </span>
            </div>
          </label>
        </div>
      </div>

      <div style={{ border: '1px solid #1a1a3e', borderRadius: 6, background: '#0a0a1e', padding: 8 }}>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
          Tip
        </div>
        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
          Enable <code style={{ color: '#22d3ee', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>deriveFromActiveSeason</code> to
          have the banner automatically inherit the active Season's name and end time.
          Set <code style={{ color: '#22d3ee', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>autoAdvanceMs</code> to control how
          long each carousel slide is shown (e.g. 7000 = 7 seconds).
        </div>
      </div>
    </div>
  );
}

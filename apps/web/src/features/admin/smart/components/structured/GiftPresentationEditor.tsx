import {
  inputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import { type StructuredEditorProps, omitKey } from './editorContract';

export interface GiftPresentation {
  iconKey?: string;
  title?: string;
  subtitle?: string;
  animationKey?: string;
  accentColor?: string;
}

type Props = StructuredEditorProps<GiftPresentation>;

const EMPTY: GiftPresentation = {};

export const validate = validateGiftPresentation;
export function validateGiftPresentation(_v: GiftPresentation | null | undefined): Record<string, string> {
  return {};
}

export function giftPresentationErrorCount(v: GiftPresentation | null | undefined): number {
  return Object.keys(validateGiftPresentation(v)).length;
}

export default function GiftPresentationEditor({ value, onChange }: Props) {
  const pres: GiftPresentation = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;

  const set = <K extends keyof GiftPresentation>(key: K, v: string) => {
    if (v === '') {
      const rest = omitKey(pres, key);
      onChange(Object.keys(rest).length > 0 ? rest as GiftPresentation : EMPTY);
    } else {
      onChange({ ...pres, [key]: v });
    }
  };

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#e879f9', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Gift Presentation
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
            <span style={labelStyle}>iconKey</span>
            <input
              type="text"
              value={pres.iconKey ?? ''}
              placeholder="e.g. gift_stars"
              onChange={e => set('iconKey', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
            <span style={labelStyle}>animationKey</span>
            <input
              type="text"
              value={pres.animationKey ?? ''}
              placeholder="e.g. confetti_burst"
              onChange={e => set('animationKey', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={labelStyle}>accentColor</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="color"
                value={pres.accentColor || '#a78bfa'}
                onChange={e => set('accentColor', e.target.value)}
                style={{ width: 36, height: 30, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'none', padding: 2 }}
              />
              <input
                type="text"
                value={pres.accentColor ?? ''}
                placeholder="#rrggbb"
                onChange={e => set('accentColor', e.target.value)}
                style={{ ...inputStyle, width: 90 }}
              />
            </div>
          </div>
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>title override</span>
          <input
            type="text"
            value={pres.title ?? ''}
            placeholder="Overrides the gift name in the claim UI"
            onChange={e => set('title', e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>subtitle</span>
          <input
            type="text"
            value={pres.subtitle ?? ''}
            placeholder="Small line below the title"
            onChange={e => set('subtitle', e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

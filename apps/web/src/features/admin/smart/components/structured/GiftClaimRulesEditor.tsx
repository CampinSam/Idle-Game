import {
  inputStyle,
  numberInputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import { errorTextStyle } from './validation';
import type { StructuredEditorProps } from './editorContract';

export interface GiftClaimRules {
  limitPerPlayer?: number;
  expiresInSeconds?: number;
}

interface ClaimRulesErrors {
  limitPerPlayer?: string;
  expiresInSeconds?: string;
}

type Props = StructuredEditorProps<GiftClaimRules>;

const EMPTY: GiftClaimRules = {};

export const validate = validateGiftClaimRules;
/**
 * Actual backend fields (gift.service.ts):
 *   limitPerPlayer — max claims per player (undefined = unlimited)
 *   expiresInSeconds — gift instance TTL after send (undefined = no expiry)
 */
export function validateGiftClaimRules(v: GiftClaimRules | null | undefined): ClaimRulesErrors {
  const errs: ClaimRulesErrors = {};
  if (!v) return errs;
  if (v.limitPerPlayer !== undefined && (isNaN(Number(v.limitPerPlayer)) || Number(v.limitPerPlayer) < 1)) {
    errs.limitPerPlayer = 'must be ≥ 1';
  }
  if (v.expiresInSeconds !== undefined && (isNaN(Number(v.expiresInSeconds)) || Number(v.expiresInSeconds) < 1)) {
    errs.expiresInSeconds = 'must be ≥ 1 second';
  }
  return errs;
}

export function giftClaimRulesErrorCount(v: GiftClaimRules | null | undefined): number {
  return Object.keys(validateGiftClaimRules(v)).length;
}

export default function GiftClaimRulesEditor({ value, onChange }: Props) {
  const rules: GiftClaimRules = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;

  const set = <K extends keyof GiftClaimRules>(key: K, v: number | undefined) => {
    if (v === undefined) {
      const { [key]: _, ...rest } = rules as any;
      onChange(Object.keys(rest).length > 0 ? rest : EMPTY);
    } else {
      onChange({ ...rules, [key]: v });
    }
  };

  const errs = validateGiftClaimRules(rules);
  const isEmpty = Object.keys(rules).length === 0;

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#e879f9', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Claim Rules
        </div>
        {isEmpty && (
          <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            No claim restrictions. Players can claim this gift any number of times.
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, maxWidth: 200 }}>
            <span style={labelStyle}>limitPerPlayer</span>
            <span style={{ fontSize: 10, color: '#555' }}>max claims per player (blank = unlimited)</span>
            <input
              type="number"
              value={rules.limitPerPlayer ?? ''}
              placeholder="—"
              min={1}
              onChange={e => set('limitPerPlayer', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.limitPerPlayer ? '#ef4444' : undefined }}
            />
            {errs.limitPerPlayer && <span style={errorTextStyle}>{errs.limitPerPlayer}</span>}
          </div>
          <div style={{ ...fieldGroupStyle, maxWidth: 220 }}>
            <span style={labelStyle}>expiresInSeconds</span>
            <span style={{ fontSize: 10, color: '#555' }}>gift instance TTL in seconds (blank = no expiry)</span>
            <input
              type="number"
              value={rules.expiresInSeconds ?? ''}
              placeholder="—"
              min={1}
              onChange={e => set('expiresInSeconds', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.expiresInSeconds ? '#ef4444' : undefined }}
            />
            {errs.expiresInSeconds && <span style={errorTextStyle}>{errs.expiresInSeconds}</span>}
          </div>
        </div>
        {rules.expiresInSeconds !== undefined && (
          <div style={{ fontSize: 11, color: '#888' }}>
            = {Math.floor(rules.expiresInSeconds / 3600)}h {Math.floor((rules.expiresInSeconds % 3600) / 60)}m
          </div>
        )}
      </div>

      <div style={{ ...sectionStyle, background: '#0a0a1e', border: '1px solid #1a1a3e' }}>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Tip
        </div>
        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
          Use <code style={{ color: '#a78bfa', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>limitPerPlayer: 1</code> to make a gift claimable only once.
          Use <code style={{ color: '#a78bfa', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>expiresInSeconds: 86400</code> for a 24-hour window after the gift is sent.
        </div>
      </div>
    </div>
  );
}

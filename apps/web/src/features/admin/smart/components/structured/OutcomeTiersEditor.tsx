import { useMemo } from 'react';
import OutcomeListEditor from './OutcomeListEditor';
import { RarityCurveChart } from '../../../../forge/components/RarityCurveChart';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  labelStyle,
  fieldGroupStyle,
  fieldRowStyle,
  numberInputStyle,
} from './editorStyles';

const TIER_META: Array<{ key: string; label: string; color: string; isSuccess: boolean }> = [
  { key: 'failure',   label: 'Failure',   color: '#ef4444', isSuccess: false },
  { key: 'common',    label: 'Common',    color: '#94a3b8', isSuccess: true  },
  { key: 'uncommon',  label: 'Uncommon',  color: '#34d399', isSuccess: true  },
  { key: 'scare',     label: 'Scare',     color: '#4db0da', isSuccess: true  },
  { key: 'rare',      label: 'Rare',      color: '#a98aff', isSuccess: true  },
  { key: 'epic',      label: 'Epic',      color: '#ff6090', isSuccess: true  },
  { key: 'mythic',    label: 'Mythic',    color: '#ffc040', isSuccess: true  },
  { key: 'legendary', label: 'Legendary', color: '#ffe040', isSuccess: true  },
];

interface TierBlock {
  rewards?: any[];
  clRequirement?: number;
}

interface OutcomeTiersValue {
  [key: string]: TierBlock;
}

interface OutcomeTiersEditorProps {
  value: any;
  onChange: (v: any) => void;
}

export default function OutcomeTiersEditor({ value, onChange }: OutcomeTiersEditorProps) {
  const tiers: OutcomeTiersValue =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const sigmaValue: number | undefined = typeof (tiers as any).sigma === 'number'
    ? (tiers as any).sigma
    : undefined;

  const centerOverrides = useMemo(() => {
    const overrides: Partial<Record<string, number>> = {};
    for (const meta of TIER_META) {
      if (!meta.isSuccess) continue;
      const block = tiers[meta.key];
      if (block && typeof block === 'object' && typeof block.clRequirement === 'number') {
        overrides[meta.key] = block.clRequirement;
      }
    }
    return overrides;
  }, [tiers]);

  const setTier = (key: string, block: TierBlock) => {
    onChange({ ...tiers, [key]: block });
  };

  const setSigma = (raw: string) => {
    const parsed = raw === '' ? undefined : Number(raw);
    const next = { ...tiers };
    if (parsed === undefined) {
      delete (next as any).sigma;
    } else {
      (next as any).sigma = parsed;
    }
    onChange(next);
  };

  return (
    <div style={containerStyle}>
      <div style={{ ...entryCardStyle, marginBottom: 4 }}>
        <div style={entryHeaderStyle}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            Quality Spread (sigma)
          </span>
          <div style={{ ...fieldRowStyle, marginLeft: 'auto' }}>
            <span style={labelStyle}>Default 22 — lower = narrower, higher = wider</span>
            <input
              type="number"
              min={5}
              max={60}
              placeholder="22"
              value={sigmaValue ?? ''}
              style={numberInputStyle}
              onChange={(e) => setSigma(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 10, borderRadius: 6, overflow: 'hidden', height: 72 }}>
          <RarityCurveChart
            recipeTiers={tiers}
            entityCl={100}
            centerOverrides={centerOverrides}
            sigma={sigmaValue ?? 22}
            cap={220}
          />
        </div>
        <p style={{ ...labelStyle, marginTop: 6, opacity: 0.55, fontSize: 10 }}>
          Preview at CL 100 — hairline shows where that entity falls on the curve
        </p>
      </div>
      {TIER_META.map((meta) => {
        const block: TierBlock = tiers[meta.key] ?? { rewards: [] };
        const rewards = Array.isArray(block.rewards) ? block.rewards : [];
        const clReq = block.clRequirement;

        return (
          <div key={meta.key} style={entryCardStyle}>
            <div style={entryHeaderStyle}>
              <span
                style={{
                  ...labelStyle,
                  color: meta.color,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {meta.label}
              </span>
              {meta.isSuccess && (
                <div style={{ ...fieldRowStyle, marginLeft: 'auto' }}>
                  <span style={labelStyle}>CL Center Override</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    placeholder="default"
                    value={clReq ?? ''}
                    style={numberInputStyle}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = raw === '' ? undefined : Number(raw);
                      setTier(meta.key, { ...block, clRequirement: parsed });
                    }}
                  />
                </div>
              )}
            </div>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>Rewards</span>
              <OutcomeListEditor
                value={rewards}
                onChange={(newRewards) => setTier(meta.key, { ...block, rewards: newRewards })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

import OutcomeListEditor from './OutcomeListEditor';
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
  { key: 'legendary', label: 'Legendary', color: '#ffe040', isSuccess: true  },
];

interface TierBlock {
  rewards?: any[];
  clRequirement?: number;
}

interface CraftingTiersValue {
  [key: string]: TierBlock;
}

interface CraftingTiersEditorProps {
  value: any;
  onChange: (v: any) => void;
}

export default function CraftingTiersEditor({ value, onChange }: CraftingTiersEditorProps) {
  const tiers: CraftingTiersValue =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const setTier = (key: string, block: TierBlock) => {
    onChange({ ...tiers, [key]: block });
  };

  return (
    <div style={containerStyle}>
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

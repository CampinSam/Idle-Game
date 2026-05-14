import { useState } from 'react';
import { Badge, Card, Chip } from '../../../../../components/ui';
import { formatAmount } from '../../../../../utils/locationProduction';
import { api } from '../../../../../services/api';
import { useModal } from '../../../../../context/ModalContext';

type Tab = 'LEVEL' | 'TRAITS';

const BUILDING_SLOT_KEYS = new Set([
  'comms tower',
  'mining facility',
  'workshop',
  'generator',
  'storage',
  'turret',
  'barracks',
  'lab',
]);

function isBuildingSlot(key: string): boolean {
  return BUILDING_SLOT_KEYS.has(key.toLowerCase());
}

interface Trait {
  key: string;
  value: string;
  isBuildingSlot: boolean;
}

function parseTraits(nftAttributes: Record<string, string>): Trait[] {
  return Object.entries(nftAttributes).map(([key, value]) => ({
    key,
    value,
    isBuildingSlot: isBuildingSlot(key),
  }));
}

function traitChipTone(trait: Trait): 'tier-3' | 'tier-2' | 'neutral' {
  if (trait.isBuildingSlot) return 'tier-2';
  const v = trait.value.toLowerCase();
  if (v === 'large' || v === 'legendary') return 'tier-3';
  return 'neutral';
}

interface OutpostDetailsCardProps {
  outpost: any;
}

export function OutpostDetailsCard({ outpost }: OutpostDetailsCardProps) {
  const { pushModal } = useModal();

  const hasNft = Boolean(outpost.nftAssetId);
  const tabs: Tab[] = hasNft ? ['LEVEL', 'TRAITS'] : ['LEVEL'];
  const [activeTab, setActiveTab] = useState<Tab>('LEVEL');

  const id = outpost.id;
  const xpNum = Number(outpost.xp || 0);
  const xpToNext = Number((outpost as Record<string, unknown>).xpToNext || 0);
  const maxLevel = Number((outpost as Record<string, unknown>).maxLevel || 0);
  const isMax = maxLevel > 0 && Number(outpost.level) >= maxLevel;
  const pct = isMax ? 100 : xpToNext > 0 ? (xpNum / xpToNext) * 100 : 0;

  const nftAttributes: Record<string, string> | null = outpost.nftAttributes ?? null;
  const traits = nftAttributes ? parseTraits(nftAttributes) : [];
  const coreTraits = traits.filter((t) => !t.isBuildingSlot);
  const buildingSlots = traits.filter((t) => t.isBuildingSlot);

  const handleDeposit = async () => {
    if (isMax) return;
    try {
      const spec = await api.getModalSpec({ locationId: id, depositXp: true });
      if (spec?.version === 1) pushModal(spec);
    } catch (err) {
      console.error('[OutpostDetailsCard] Failed to load deposit XP modal:', err);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div
        className="flex border-b border-[rgba(139,92,246,0.2)] shrink-0"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={activeTab === tab}
            className={[
              'flex-1 py-2 px-1 text-[10px] font-extrabold tracking-[0.4px] bg-transparent border-none',
              'border-b-2 cursor-pointer whitespace-nowrap text-center',
              '[transition:color_0.15s,border-color_0.15s]',
              activeTab === tab
                ? 'text-[#A78BFA] border-b-[#A78BFA]'
                : 'text-[rgba(255,255,255,0.45)] border-b-transparent',
            ].join(' ')}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-3.5">
        {activeTab === 'LEVEL' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="info">Level {outpost.level}</Badge>
            </div>

            {outpost.xp != null && (
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1.5 bg-black/35 border border-[rgba(139,92,246,0.2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-[400ms] ease-linear shadow-[0_0_10px_rgba(167,139,250,0.55)]"
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      background: 'linear-gradient(90deg, #a78bfa, #8b5cf6 60%, #6d28d9)',
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold tracking-[0.08em] text-[#c4b5fd] whitespace-nowrap">
                  {isMax ? 'XP MAX' : `XP ${formatAmount(xpNum)} / ${formatAmount(xpToNext)}`}
                </span>
              </div>
            )}

            <div>
              <button
                type="button"
                disabled={isMax}
                title={isMax ? 'Outpost is at max level' : undefined}
                onClick={handleDeposit}
                className="px-3 py-1.5 rounded-full border border-[rgba(167,139,250,0.55)] text-[#ede9fe] text-[11px] font-bold tracking-[0.06em] cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:grayscale disabled:brightness-75"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(109,40,217,0.4))',
                }}
              >
                {isMax ? 'Max Level' : '＋ Deposit XP'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'TRAITS' && (
          <div className="flex flex-col gap-3">
            {traits.length === 0 ? (
              <p className="text-[11px] text-text-secondary text-center py-3">No traits available yet.</p>
            ) : (
              <>
                {coreTraits.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {coreTraits.map((trait) => (
                      <div
                        key={trait.key}
                        className="flex flex-col items-center gap-0.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-[rgba(15,12,38,0.45)] px-2 py-2"
                      >
                        <span className="text-[10px] text-text-secondary uppercase tracking-[0.08em]">
                          {trait.key}
                        </span>
                        <Chip tone={traitChipTone(trait)}>{trait.value}</Chip>
                      </div>
                    ))}
                  </div>
                )}

                {buildingSlots.length > 0 && (
                  <>
                    {coreTraits.length > 0 && (
                      <div className="h-px bg-[rgba(139,92,246,0.15)]" />
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-text-secondary mb-2 px-0.5">
                        Building Slots
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {buildingSlots.map((trait) => (
                          <div
                            key={trait.key}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(96,165,250,0.35)] bg-[rgba(15,12,38,0.45)] px-2 py-1"
                          >
                            <span className="text-[10px] text-text-secondary">{trait.key}</span>
                            <span className="text-[10px] font-bold text-[#bfdbfe]">Lv {trait.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

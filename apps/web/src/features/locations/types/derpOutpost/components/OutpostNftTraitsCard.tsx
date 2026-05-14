import { Card, SectionHeader, Chip } from '../../../../../components/ui';

interface OutpostNftTraitsCardProps {
  nftAttributes: Record<string, string> | null | undefined;
}

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

export function OutpostNftTraitsCard({ nftAttributes }: OutpostNftTraitsCardProps) {
  if (!nftAttributes || Object.keys(nftAttributes).length === 0) return null;

  const traits = parseTraits(nftAttributes);

  const coreTraits = traits.filter((t) => !t.isBuildingSlot);
  const buildingSlots = traits.filter((t) => t.isBuildingSlot);

  return (
    <Card className="p-3.5">
      <SectionHeader as="h3" title="NFT Traits" />
      <div className="flex flex-col gap-3">
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
      </div>
    </Card>
  );
}

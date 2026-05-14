import { getRegionDisplay } from '@derp/shared';
import { formatAmount } from '../../../../../utils/locationProduction';
import { api } from '../../../../../services/api';
import { useModal } from '../../../../../context/ModalContext';
import { Badge } from '../../../../../components/ui';

function buildNftExplorerUrl(nftAssetId: string): string | null {
  const parts = nftAssetId.split(':');
  if (parts.length < 3) return null;
  const [chain, policyId, assetId] = parts;
  if (chain === 'CARDANO') {
    return `https://pool.pm/${policyId}.${assetId}`;
  }
  return null;
}

interface OutpostHeroSectionProps {
  outpost: any;
}

export function OutpostHeroSection({ outpost }: OutpostHeroSectionProps) {
  const { pushModal } = useModal();

  const id = outpost.id;
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;
  const nftAssetId: string | undefined = outpost.nftAssetId;
  const nftExplorerUrl = nftAssetId ? buildNftExplorerUrl(nftAssetId) : null;

  const xpNum = Number(outpost.xp || 0);
  const xpToNext = Number((outpost as Record<string, unknown>).xpToNext || 0);
  const maxLevel = Number((outpost as Record<string, unknown>).maxLevel || 0);
  const isMax = maxLevel > 0 && Number(outpost.level) >= maxLevel;
  const pct = isMax ? 100 : xpToNext > 0 ? (xpNum / xpToNext) * 100 : 0;

  const handleDeposit = async () => {
    if (isMax) return;
    try {
      const spec = await api.getModalSpec({ locationId: id, depositXp: true });
      if (spec?.version === 1) pushModal(spec);
    } catch (err) {
      console.error('[OutpostHeroSection] Failed to load deposit XP modal:', err);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <img src={regionImage} alt={regionName} className="block w-full h-[160px] object-cover" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(21,17,60,0) 30%, rgba(21,17,60,0.82) 78%, #15113c 100%)',
        }}
      />
      <div className="relative z-10 -mt-[52px] px-4 pb-3.5 flex flex-col gap-1.5">
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <Badge tone="info">Level {outpost.level}</Badge>
          {nftAssetId && (
            nftExplorerUrl ? (
              <a
                href={nftExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded text-[10px] font-bold tracking-[0.4px] text-white no-underline transition-opacity hover:opacity-80"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                🔗 NFT
              </a>
            ) : (
              <span
                className="inline-flex items-center px-2 py-[3px] rounded text-[10px] font-bold tracking-[0.4px] text-white"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                NFT
              </span>
            )
          )}
        </div>

        {outpost.xp != null && (
          <div className="flex items-center gap-2.5 mt-1">
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

        <div className="mt-2 flex items-center gap-2 flex-wrap">
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
    </div>
  );
}

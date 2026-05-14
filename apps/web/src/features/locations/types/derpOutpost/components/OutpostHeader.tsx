import { useState } from 'react';
import { getRegionDisplay } from '@derp/shared';
import { formatAmount } from '../../../../../utils/locationProduction';
import { api } from '../../../../../services/api';
import { useModal } from '../../../../../context/ModalContext';
import { useCommand } from '../../../../../hooks/useCommand';
import { useSyncPlayer } from '../../../../../hooks/useSyncSelectors';
import { Badge, OutpostCard } from '../../../../../components/ui';

function buildNftExplorerUrl(nftAssetId: string): string | null {
  const parts = nftAssetId.split(':');
  if (parts.length < 3) return null;
  const [chain, policyId, assetId] = parts;
  if (chain === 'CARDANO') {
    return `https://pool.pm/${policyId}.${assetId}`;
  }
  return null;
}

interface OutpostHeaderProps {
  outpost: any;
}

interface DeactivateConfirmProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function DeactivateConfirm({ name, onConfirm, onCancel, isLoading }: DeactivateConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 mb-6 sm:mb-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border-2 border-[rgba(239,68,68,0.4)] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <h3 className="font-cinzel text-base font-black text-text-primary mb-1">Deactivate Outpost?</h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              <strong className="text-text-primary">{name}</strong> will be deactivated.
            </p>
          </div>
        </div>
        <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-xl p-3 flex flex-col gap-1.5">
          <div className="text-[11px] font-bold text-[#f87171] tracking-[0.3px] mb-0.5">THIS WILL IMMEDIATELY:</div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Unassign all workers from this outpost
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Cancel all active jobs for every team member
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Archive related notifications
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-[12px] font-bold tracking-[0.3px] bg-transparent hover:border-[rgba(139,92,246,0.4)] hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-[rgba(239,68,68,0.5)] text-[#f87171] text-[12px] font-bold tracking-[0.3px] bg-[rgba(239,68,68,0.12)] hover:bg-[rgba(239,68,68,0.2)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OutpostHeader({ outpost }: OutpostHeaderProps) {
  const { pushModal } = useModal();
  const { execute } = useCommand();
  const player = useSyncPlayer();

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(false);

  const id = outpost.id;
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;
  const nftAssetId: string | undefined = outpost.nftAssetId;
  const nftExplorerUrl = nftAssetId ? buildNftExplorerUrl(nftAssetId) : null;

  const xpNum = Number(outpost.xp || 0);
  const xpToNext = Number((outpost as any).xpToNext || 0);
  const maxLevel = Number((outpost as any).maxLevel || 0);
  const isMax = maxLevel > 0 && Number(outpost.level) >= maxLevel;
  const pct = isMax ? 100 : (xpToNext > 0 ? (xpNum / xpToNext) * 100 : 0);

  const isPrimary = player?.primaryLocationId === id;
  const isActive = outpost.enabled !== false;

  const handleDeposit = async () => {
    if (isMax) return;
    try {
      const spec = await api.getModalSpec({ locationId: id, depositXp: true });
      if (spec?.version === 1) pushModal(spec);
    } catch (err: any) {
      console.error('[DerpOutpostPage] Failed to load deposit XP modal:', err);
    }
  };

  const handleSetPrimary = async () => {
    setSettingPrimary(true);
    try {
      await execute('SetPrimaryOutpost', { locationId: id });
    } catch (err: any) {
      console.error('[OutpostHeader] SetPrimaryOutpost failed:', err);
    } finally {
      setSettingPrimary(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    setDeactivating(true);
    try {
      await execute('ToggleLocation', { locationId: id, enabled: false });
      setShowDeactivate(false);
    } catch (err: any) {
      console.error('[OutpostHeader] ToggleLocation failed:', err);
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <>
      <OutpostCard accent="header" className="!p-0">
        <div className="relative overflow-hidden rounded-t-[13px]">
          <img src={regionImage} alt={regionName} className="block w-full h-[180px] object-cover" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(21,17,60,0) 35%, rgba(21,17,60,0.8) 80%, #15113c 100%)',
            }}
          />
          {isPrimary && (
            <div className="absolute top-3 left-3">
              <span className="bg-gradient-to-br from-[#a78bfa] to-[#7C3AED] text-white text-[9px] font-black px-2.5 py-[3px] rounded-full tracking-[0.6px] uppercase shadow-[0_0_10px_rgba(167,139,250,0.6)]">
                ★ Primary Outpost
              </span>
            </div>
          )}
        </div>
        <div className="relative z-10 -mt-[52px] px-4 pb-3.5 flex flex-col gap-1.5">
          <h1 className="font-cinzel text-[22px] font-black tracking-[0.04em] leading-[1.15] text-[#f5f3ff] m-0 [text-shadow:0_0_22px_rgba(139,92,246,0.55),0_2px_6px_rgba(0,0,0,0.6)]">
            {outpost.name || 'Outpost'}
            <span className="block mt-1 font-sans text-[11px] font-semibold tracking-[0.12em] uppercase text-[rgba(196,181,253,0.75)] [text-shadow:none]">
              &bull; {regionName}
            </span>
          </h1>
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
            <div className="flex items-center gap-2.5 mt-1.5">
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
            {isActive && !isPrimary && (
              <button
                type="button"
                disabled={settingPrimary}
                onClick={handleSetPrimary}
                className="px-3 py-1.5 rounded-full border border-[rgba(167,139,250,0.35)] text-[#c4b5fd] text-[11px] font-bold tracking-[0.06em] cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.25))',
                }}
              >
                {settingPrimary ? 'Setting…' : '★ Set as Primary'}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                onClick={() => setShowDeactivate(true)}
                className="px-3 py-1.5 rounded-full border border-[rgba(239,68,68,0.3)] text-[#f87171] text-[11px] font-bold tracking-[0.06em] cursor-pointer transition-[filter,opacity] hover:brightness-110 active:scale-[0.97]"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                }}
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
      </OutpostCard>

      {showDeactivate && (
        <DeactivateConfirm
          name={outpost.name || regionName}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setShowDeactivate(false)}
          isLoading={deactivating}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import { EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';
import { useJobPreview, type BuildingPreviewData, type BuildingUpgradePreview, type CostEntry } from '../../../../jobs/useJobPreview';
import { formatDuration } from '../../../../../utils/formatDuration';
import ItemQty from '../../../../../components/ItemQty';

interface AddBuildingCardProps {
  loading: boolean;
  availableData: any;
  hasWarehouse: boolean;
  warehouseDefId: string;
  locationId: string;
  onBuild: (def: any) => void;
  onUpgrade: (buildingDefId: string) => void;
}

interface BuildingPreviewProps {
  defId: string;
  locationId: string;
  slotBlocked: boolean;
  onBuild: () => void;
  onUpgrade: () => void;
}

function BuildingPreviewPanel({ defId, locationId, slotBlocked, onBuild, onUpgrade }: BuildingPreviewProps) {
  const { preview, loading, error } = useJobPreview({ jobType: 'building', defId, locationId });

  if (loading) {
    return (
      <div className="mt-2.5 flex flex-col gap-1.5 animate-pulse">
        <div className="h-3 rounded bg-white/10 w-2/3" />
        <div className="h-3 rounded bg-white/10 w-1/2" />
        <div className="h-3 rounded bg-white/10 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2.5 text-[11px] text-[#f87171] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2">
        Could not load preview.
      </div>
    );
  }

  if (!preview) return null;

  const buildInfo: BuildingPreviewData | undefined = preview.building;
  const upgrade: BuildingUpgradePreview | null = buildInfo?.upgrade ?? null;

  const canBuild = preview.canAfford && preview.allRequirementsMet && !slotBlocked;
  const canUpgrade = upgrade ? upgrade.canAfford && preview.allRequirementsMet : false;

  const effectiveSecs: number = buildInfo?.effectiveDurationTicks ?? preview.durationSeconds;
  const baseAndEffectiveDiffer =
    preview.durationSeconds > 0 && Math.abs(effectiveSecs - preview.durationSeconds) > 1;

  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      <div className="border-t border-white/[0.07]" />

      {preview.requirements.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-text-secondary">
            Requirements
          </span>
          {preview.requirements.map((req, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span className={req.met ? 'text-[#34d399]' : 'text-[#f87171]'}>
                {req.met ? '✓' : '✗'}
              </span>
              <span className={req.met ? 'text-text-secondary' : 'text-[#f87171]'}>
                {req.label ?? (req.met ? 'Requirement met' : 'Requirement not met')}
              </span>
            </div>
          ))}
        </div>
      )}

      {preview.cost.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-text-secondary">
            Build Cost
          </span>
          <div className="flex flex-wrap gap-2">
            {preview.cost.map((c: any, i: number) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                  preview.canAfford ? 'text-[#34d399]' : 'text-[#f87171]'
                }`}
              >
                <ItemQty src={c.id} amount={c.amount} size={14} className="text-[12px] font-bold" />
                <span className={preview.canAfford ? 'text-[#34d399]' : 'text-[#f87171]'}>
                  {preview.canAfford ? '✓' : '✗'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.cost.length === 0 && (
        <div className="text-[11px] text-text-secondary">No cost — free to build.</div>
      )}

      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-text-secondary">⏱ Build Time</span>
        <span className="font-bold text-[#f5f3ff]">{formatDuration(effectiveSecs)}</span>
        {baseAndEffectiveDiffer && (
          <span className="text-[10px] text-text-secondary line-through">
            {formatDuration(preview.durationSeconds)}
          </span>
        )}
      </div>

      <button
        onClick={onBuild}
        disabled={!canBuild}
        title={
          slotBlocked
            ? 'No building slots available'
            : !preview.allRequirementsMet
              ? 'Requirements not met'
              : !preview.canAfford
                ? 'Cannot afford'
                : undefined
        }
        className="self-start px-4 py-1.5 rounded-full border border-[rgba(94,234,212,0.45)] bg-[rgba(20,184,166,0.16)] text-[#5eead4] text-[11px] font-extrabold tracking-[0.08em] uppercase cursor-pointer hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
      >
        BUILD
      </button>

      {upgrade && (
        <>
          <div className="border-t border-white/[0.07]" />
          <span className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">
            Upgrade to Level {upgrade.toLevel}
          </span>

          {upgrade.cost.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {upgrade.cost.map((c: any, i: number) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                    upgrade.canAfford ? 'text-[#34d399]' : 'text-[#f87171]'
                  }`}
                >
                  <ItemQty src={c.id} amount={c.amount} size={14} className="text-[12px] font-bold" />
                  <span className={upgrade.canAfford ? 'text-[#34d399]' : 'text-[#f87171]'}>
                    {upgrade.canAfford ? '✓' : '✗'}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-text-secondary">⏱ Upgrade Time</span>
            <span className="font-bold text-[#f5f3ff]">
              {formatDuration(upgrade.effectiveDurationTicks ?? upgrade.durationSeconds)}
            </span>
          </div>

          <button
            onClick={onUpgrade}
            disabled={!canUpgrade}
            title={
              !preview.allRequirementsMet
                ? 'Requirements not met'
                : !upgrade.canAfford
                  ? 'Cannot afford upgrade'
                  : undefined
            }
            className="self-start px-4 py-1.5 rounded-full border border-[rgba(167,139,250,0.45)] bg-[rgba(139,92,246,0.18)] text-[#c4b5fd] text-[11px] font-extrabold tracking-[0.08em] uppercase cursor-pointer hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
          >
            UPGRADE
          </button>
        </>
      )}
    </div>
  );
}

export function AddBuildingCard({
  loading,
  availableData,
  hasWarehouse,
  warehouseDefId,
  locationId,
  onBuild,
  onUpgrade,
}: AddBuildingCardProps) {
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const filteredAvailable = (availableData?.available || []).filter(
    (def: any) => def.id !== warehouseDefId || !hasWarehouse,
  );
  const slotBlocked = availableData?.slotsAvailable === false;

  function toggleSelected(defId: string) {
    setSelectedDefId((prev) => (prev === defId ? null : defId));
  }

  return (
    <OutpostCard accent="add">
      <OutpostCardTitle accent="add">ADD A BUILDING</OutpostCardTitle>
      {loading && <EmptyState message="Loading available buildings..." />}
      {!loading && filteredAvailable.length === 0 && (
        <EmptyState message="No buildings available to build." />
      )}
      {!loading && filteredAvailable.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {slotBlocked && (
            <div className="text-[11px] text-[#fbbf24] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] rounded-lg px-3 py-2">
              {availableData?.nextSlotRequirement
                ? `Requires ${availableData.nextSlotRequirement} for more building slots.`
                : 'No additional building slots available.'}
            </div>
          )}
          {filteredAvailable.map((def: any) => {
            const isSelected = selectedDefId === def.id;
            return (
              <div
                key={def.id}
                className={`rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-[rgba(139,92,246,0.45)] bg-[rgba(139,92,246,0.06)]'
                    : 'border-white/[0.06] bg-white/[0.02]'
                } p-3 ${slotBlocked ? 'opacity-55 grayscale-[40%]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelected(def.id)}
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer bg-transparent border-0 p-0"
                >
                  <span className="text-[13px] font-extrabold text-[#f5f3ff] tracking-wide">
                    {def.name}
                  </span>
                  <span
                    className={`text-[14px] transition-transform ${isSelected ? 'rotate-180' : ''} text-text-secondary`}
                  >
                    ▾
                  </span>
                </button>
                <div className="my-2 border-t border-white/[0.06]" />
                <div>
                  <span className="text-[12px] leading-relaxed text-text-secondary">
                    {def.description}
                  </span>
                </div>
                {isSelected && (
                  <BuildingPreviewPanel
                    defId={def.id}
                    locationId={locationId}
                    slotBlocked={slotBlocked}
                    onBuild={() => onBuild(def)}
                    onUpgrade={() => onUpgrade(def.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </OutpostCard>
  );
}

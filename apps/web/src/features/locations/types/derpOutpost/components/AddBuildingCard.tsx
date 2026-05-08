import { EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';

interface AddBuildingCardProps {
  loading: boolean;
  availableData: any;
  hasWarehouse: boolean;
  warehouseDefId: string;
  onBuild: (def: any) => void;
}

export function AddBuildingCard({
  loading,
  availableData,
  hasWarehouse,
  warehouseDefId,
  onBuild,
}: AddBuildingCardProps) {
  const filteredAvailable = (availableData?.available || []).filter(
    (def: any) => def.id !== warehouseDefId || !hasWarehouse,
  );
  const slotBlocked = availableData?.slotsAvailable === false;

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
          {filteredAvailable.map((def: any) => (
            <div
              key={def.id}
              className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 ${slotBlocked ? 'opacity-55 grayscale-[40%]' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-extrabold text-[#f5f3ff] tracking-wide">
                  {def.name}
                </span>
                <button
                  onClick={() => onBuild(def)}
                  disabled={slotBlocked}
                  title={slotBlocked ? 'No building slots available' : undefined}
                  className="px-3 py-1 rounded-full border border-[rgba(94,234,212,0.45)] bg-[rgba(20,184,166,0.16)] text-[#5eead4] text-[10px] font-extrabold tracking-[0.08em] uppercase cursor-pointer hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  BUILD
                </button>
              </div>
              <div className="my-2 border-t border-white/[0.06]" />
              <div>
                <span className="text-[12px] leading-relaxed text-text-secondary">
                  {def.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </OutpostCard>
  );
}

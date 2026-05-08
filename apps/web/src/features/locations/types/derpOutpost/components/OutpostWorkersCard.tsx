import { useState } from 'react';
import { useCommand } from '../../../../../hooks/useCommand';
import { audioEngine } from '../../../../../services/AudioEngine';
import { EntityCard, EntityList } from '../../../../entities/components';
import { EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';

interface OutpostWorkersCardProps {
  outpost: any;
  entities: any[];
  workersData: any[];
}

export function OutpostWorkersCard({ outpost, entities, workersData }: OutpostWorkersCardProps) {
  const { execute } = useCommand();
  const [activeWorkerSlot, setActiveWorkerSlot] = useState<number | null>(null);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [workerError, setWorkerError] = useState<string>('');

  const id = outpost.id;
  const maxWorkers = Number(outpost.maxWorkers ?? 2);
  const idleEntities = entities.filter((e: any) => e.status === 'idle');
  const emptySlotCount = Math.max(0, maxWorkers - workersData.length);

  const handleAssignWorker = async (entityId: string) => {
    setWorkerError('');
    setShowWorkerPicker(false);
    setActiveWorkerSlot(null);
    try {
      await execute('AssignWorker', { locationId: id, entityId });
    } catch (err: any) {
      audioEngine.play('ui.error');
      setWorkerError(err?.message || 'Failed to assign worker');
    }
  };

  const handleRemoveWorker = async (entityId: string) => {
    setWorkerError('');
    try {
      await execute('RemoveWorker', { locationId: id, entityId });
    } catch (err: any) {
      audioEngine.play('ui.error');
      setWorkerError(err?.message || 'Failed to remove worker');
    }
  };

  const openSlot = (slotIndex: number) => {
    setActiveWorkerSlot(slotIndex);
    setShowWorkerPicker(true);
  };

  const prodBps = Number(outpost?.storage?.workerProductionMultBps ?? 10000);
  const consBps = Number(outpost?.storage?.workerConsumptionMultBps ?? 10000);
  const fmtPct = (bps: number) => {
    const pct = (bps - 10000) / 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${sign}${Math.abs(rounded).toFixed(1)}%`;
  };
  const toneClass = (good: boolean, bad: boolean) =>
    good ? 'text-[#34d399]' : bad ? 'text-[#f87171]' : 'text-text-secondary';
  const prodTone = toneClass(prodBps > 10000, prodBps < 10000);
  // Lower consumption is *good* for the player.
  const consTone = toneClass(consBps < 10000, consBps > 10000);

  return (
    <OutpostCard accent="workers">
      <OutpostCardTitle accent="workers" className="pb-2.5 border-b border-[rgba(96,165,250,0.22)]">
        WORKERS ({workersData.length}/{maxWorkers})
      </OutpostCardTitle>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0 grid gap-2 justify-start" style={{ gridTemplateColumns: 'repeat(auto-fill, 90px)' }}>
          {workersData.map((w: any) => {
            const entity = entities.find((e: any) => e.id === w.entityId);
            if (!entity) {
              return (
                <div key={w.id} className="w-[90px] aspect-square rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
                  <span className="text-text-secondary text-[18px]">…</span>
                </div>
              );
            }
            return (
              <EntityCard
                key={w.id}
                entity={entity}
                useCase="outpost"
                onRemove={() => handleRemoveWorker(entity.id)}
              />
            );
          })}
          {Array.from({ length: emptySlotCount }).map((_, i) => {
            const slotIndex = workersData.length + i;
            const isActive = activeWorkerSlot === slotIndex;
            return (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => openSlot(slotIndex)}
                className={`w-[90px] rounded-xl border-2 border-dashed cursor-pointer overflow-hidden flex flex-col p-0 transition-colors ${
                  isActive
                    ? 'border-[rgba(139,92,246,0.5)] bg-[rgba(139,92,246,0.1)] shadow-[0_0_12px_rgba(139,92,246,0.5),inset_0_0_8px_rgba(139,92,246,0.15)]'
                    : 'border-white/15 bg-bg-card hover:border-white/25'
                }`}
              >
                <div className="aspect-square flex items-center justify-center bg-white/[0.03]">
                  <span className="text-[28px] text-white/20 font-light">＋</span>
                </div>
                <div className="px-2 py-2 bg-bg-card text-center">
                  <span className="block text-[11px] font-extrabold text-text-primary uppercase tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
                    Add Worker
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div
          className="flex-shrink-0 flex flex-col gap-2 pl-3.5 self-stretch border-l border-[rgba(96,165,250,0.22)]"
          style={{ flexBasis: '38%', minWidth: 130, maxWidth: 180 }}
          aria-label="Combined worker effects"
        >
          <OutpostCardTitle accent="workers" className="!mb-0">EFFECTS</OutpostCardTitle>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Production</span>
            <span className={`text-[14px] font-extrabold tabular-nums ${prodTone}`}>{fmtPct(prodBps)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Consumption</span>
            <span className={`text-[14px] font-extrabold tabular-nums ${consTone}`}>{fmtPct(consBps)}</span>
          </div>
        </div>
      </div>
      {workersData.length === 0 && emptySlotCount === 0 && (
        <EmptyState message="No worker slots on this outpost." />
      )}
      {showWorkerPicker && (
        <div className="mt-3">
          <h4 className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-text-secondary m-0 mb-2.5">
            Select an Entity
          </h4>
          <EntityList
            entities={idleEntities}
            mode="picker"
            useCase="outpost"
            onSelect={(entity) => handleAssignWorker(entity.id)}
            emptyMessage="No idle entities. Pull one back from a mission."
          />
        </div>
      )}
      {workerError && (
        <div className="mt-2.5 px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-[12px]">
          {workerError}
        </div>
      )}
    </OutpostCard>
  );
}

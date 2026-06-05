import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNow } from '../../../../hooks/useNow';
import { serverNow } from '../../../../services/clockSync';
import { useNavigate } from 'react-router-dom';
import { useAnimatedProgress } from './useAnimatedProgress';
import { GameImage } from '../../../../components/GameImage';
import GameIcon from '../../../../components/GameIcon';
import { getEntityImagePath, ENTITY_ARCHETYPE_IMAGES } from '../../../../config/images';
import { getArchetypeDisplay, type TraitPrimitive } from '@derp/shared';
import { getEntityArchetype } from '../../registry';
import { getEntityPower, getXpForLevel, normalizeStats } from '../../utils';
import { useSyncItems } from '../../../../hooks/useSyncSelectors';
import { useCommand } from '../../../../hooks/useCommand';
import { useModal } from '../../../../context/ModalContext';
import StatRadarChart from './StatRadarChart';
import DefaultEntityCard from './DefaultEntityCard';
import EquipPickerModal from '../../components/EquipPickerModal';
import {
  isEntityBusy,
  gearWouldChangeStats,
  BUSY_EQUIP_TOOLTIP,
} from '../../../inventory/utils/statChangeHelpers';
import type { EntityDetailProps } from '../../types';
import { api } from '../../../../services/api';
import { useAppSelector } from '../../../../store';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../../../tick';
import { useNotifications } from '../../../../context/NotificationContext';
import { getUtcDay, getSecondsUntilUtcMidnight, formatCountdown } from '../../../powers/powerUtils';

const PROGRESSION_TABS = ['LEVEL', 'ASCENSION', 'MASTERY', 'RELICS', 'HISTORY', 'TRAITS'] as const;
type ProgressionTab = typeof PROGRESSION_TABS[number];


const EQUIP_SLOTS = [
  { icon: '⚔️', label: 'WEAPON', slot: 'weapon' },
  { icon: '🛡️', label: 'ARMOR', slot: 'armor' },
  { icon: '💍', label: 'ACCESSORY', slot: 'accessory' },
] as const;

type EquipSlot = typeof EQUIP_SLOTS[number]['slot'];

type EntityEvent = {
  type: 'mission' | 'level_up' | 'injury';
  timestamp?: string | null;
  missionName?: string;
  success?: boolean;
  xpGained?: number;
  injured?: boolean;
  level?: number;
  gains?: Record<string, number>;
};

type CollapsedGroup = { event: EntityEvent; count: number };

function timeAgo(dateStr: string): string {
  const diffMs = serverNow() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function collapseEvents(events: EntityEvent[]): CollapsedGroup[] {
  const result: CollapsedGroup[] = [];
  for (const ev of events) {
    const last = result[result.length - 1];
    if (last && last.event.type === ev.type) {
      last.count++;
    } else {
      result.push({ event: ev, count: 1 });
    }
  }
  return result;
}

function useEntityEvents(entityId: string) {
  const [events, setEvents] = useState<EntityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getEntityEvents(entityId)
      .then((data) => {
        if (!cancelled) { setEvents(data as EntityEvent[]); setLoading(false); }
      })
      .catch((err: any) => {
        if (!cancelled) { setError(err?.message ?? 'Failed to load events'); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [entityId]);

  return { events, loading, error };
}

export default function DefaultEntityDetail(props: EntityDetailProps) {
  const { entity, variant = 'full', useCase = 'mission', onRemove } = props;

  if (variant === 'lightweight') {
    return (
      <DefaultEntityCard
        entity={entity}
        useCase={useCase}
        onRemove={onRemove}
      />
    );
  }

  return <FullEntityDetail entity={entity} portraitBadge={props.portraitBadge} />;
}

const GEAR_STAT_KEYS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;

function getGearStats(item: any): Record<string, number> {
  return item?.definition?.equipData?.stats ?? item?.equipData?.stats ?? {};
}

function FullEntityDetail({ entity, portraitBadge }: { entity: EntityDetailProps['entity']; portraitBadge?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ProgressionTab>('LEVEL');
  const [pickerSlot, setPickerSlot] = useState<EquipSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [hoveredPickerItem, setHoveredPickerItem] = useState<any | null>(null);
  const progress = useAnimatedProgress(800);
  const allItems = useSyncItems();
  const { pushModal } = useModal();
  const { execute } = useCommand({
    onUiIntent: (intent) => {
      if (intent.type === 'modal' && intent.spec) pushModal(intent.spec);
    },
  });

  const navigate = useNavigate();
  const { events: entityEvents, loading: eventsLoading } = useEntityEvents(entity.id);

  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const allJobs = useAppSelector((s) => s.sync.jobs);

  const entityActiveJob = useMemo(() => {
    return Object.values(allJobs).find((j: any) =>
      Array.isArray(j.team) &&
      j.team.includes(entity.id) &&
      (j.status === 'active' || j.status === 'ready_notified'),
    ) as any | undefined;
  }, [allJobs, entity.id]);

  const archetype = getEntityArchetype(entity);
  const archetypeDisplay = getArchetypeDisplay(archetype || 'default');
  const power = getEntityPower(entity);
  const baseStats = useMemo(
    () => (entity as any).baseStats || normalizeStats(entity.stats),
    [entity],
  );
  const equippedStats = (entity as any).equippedStats as Record<string, number> | undefined;
  const traits: Record<string, TraitPrimitive> = entity.traits || {};
  const entityBusy = isEntityBusy(entity);

  const uniquePowers = useMemo(() => {
    const nftAssetId: string | undefined = (entity as any).nftAssetId;
    if (!nftAssetId) return [];
    const rules = (entity as any).definition?.rules as any;
    const uniques = rules?.uniques as Record<string, any> | undefined;
    if (!uniques) return [];
    const entry = uniques[nftAssetId];
    if (!entry) return [];
    return (entry.powers as import('@derp/shared').PowerRef[]) || [];
  }, [entity]);

  const equippedBySlot = useMemo(() => {
    const map: Record<string, any> = {};
    const equipment: any[] = Array.isArray((entity as any).equipment) ? (entity as any).equipment : [];
    for (const eq of equipment) {
      const item = (allItems as any[]).find((i) => i.id === eq.itemInstanceId);
      if (!item) continue;
      const equipData = item.definition?.equipData;
      const slot: string | undefined = equipData?.slot;
      if (!slot) continue;
      if (!map[slot]) map[slot] = item;
    }
    return map;
  }, [entity, allItems]);

  /**
   * When the player hovers over a candidate item in the picker, compute a
   * preview of what `equippedStats` would look like if that item were equipped
   * instead of the current slot occupant. This drives the radar chart overlay.
   */
  const previewEquippedStats = useMemo<Record<string, number> | undefined>(() => {
    if (!pickerSlot || !hoveredPickerItem) return undefined;
    const base: Record<string, number> = { ...(equippedStats ?? baseStats) };
    const currentSlotItem = equippedBySlot[pickerSlot] ?? null;

    if (currentSlotItem) {
      const curStats = getGearStats(currentSlotItem);
      for (const k of GEAR_STAT_KEYS) {
        if (typeof curStats[k] === 'number') {
          base[k] = (base[k] ?? 0) - curStats[k];
        }
      }
    }

    const hoverStats = getGearStats(hoveredPickerItem);
    for (const k of GEAR_STAT_KEYS) {
      if (typeof hoverStats[k] === 'number') {
        base[k] = (base[k] ?? 0) + hoverStats[k];
      }
    }

    return base;
  }, [pickerSlot, hoveredPickerItem, equippedStats, baseStats, equippedBySlot]);

  const handleSlotClick = useCallback((slot: EquipSlot) => {
    if (busy) return;
    // Always open the picker — occupied slots show comparison + unequip option
    setPickerSlot(slot);
  }, [busy]);

  const handlePickerSelect = useCallback((itemInstanceId: string) => {
    if (!pickerSlot) return;
    setBusy(true);
    setPickerSlot(null);
    setHoveredPickerItem(null);
    execute('EquipItem', { entityId: entity.id, itemInstanceId })
      .catch((err) => console.error('[EntityDetail] EquipItem failed:', err))
      .finally(() => setBusy(false));
  }, [pickerSlot, execute, entity.id]);

  const handlePickerUnequip = useCallback(() => {
    if (!pickerSlot) return;
    const occupant = equippedBySlot[pickerSlot];
    if (!occupant) return;
    setBusy(true);
    setPickerSlot(null);
    setHoveredPickerItem(null);
    execute('UnequipItem', { entityId: entity.id, itemInstanceId: occupant.id })
      .catch((err) => console.error('[EntityDetail] UnequipItem failed:', err))
      .finally(() => setBusy(false));
  }, [pickerSlot, equippedBySlot, execute, entity.id]);

  const rawXpMax = getXpForLevel(entity.level);
  const xpMax = rawXpMax > 0 ? rawXpMax : 100;
  const xpCurrent = Number(entity.xp || 0);
  const xpPercent = xpMax > 0 ? Math.min((xpCurrent / xpMax) * 100, 100) : 0;

  const collapsedEvents = useMemo(() => collapseEvents(entityEvents), [entityEvents]);

  return (
    <div className="flex flex-col gap-[10px] h-full p-[10px]">

      {/* ── Top section: portrait card + power/radar ── */}
      <div className="grid grid-cols-2 gap-[10px] items-stretch shrink-0">

        {/* Portrait card */}
        <div className="entity-detail__hero [background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] overflow-hidden flex flex-col items-center p-[6px] gap-[6px] relative">
          <div className="absolute top-2 left-2 flex items-center gap-[3px] bg-[rgba(0,0,0,0.65)] border border-[rgba(139,92,246,0.6)] rounded-[20px] px-2 py-[3px] z-[3]">
            <span className="text-[11px]">⚡</span>
            <span className="text-[10px] font-black text-white tracking-[0.5px]">LEVEL {entity.level}</span>
          </div>

          {portraitBadge}

          <div className="flex-1 flex items-start justify-center w-full">
            <GameImage
              src={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'full')}
              placeholderSrc={getEntityImagePath(entity.id, archetype, entity.imageUrl, 'thumb')}
              category="entities"
              alt={entity.name}
              fallbackSrc={ENTITY_ARCHETYPE_IMAGES[archetype] || ENTITY_ARCHETYPE_IMAGES['Warrior']}
              className="!w-full !h-auto object-contain !rounded-[6px]"
              glow
              glowColor={archetypeDisplay.color}
            />
          </div>

          {/* Equipment slots */}
          <div className="flex gap-[6px] w-full">
            {EQUIP_SLOTS.map(({ icon, label, slot }) => {
              const occupant = equippedBySlot[slot];
              const occupantIcon = occupant?.definition?.iconKey ?? null;
              const occupantName = occupant?.definition?.name ?? '';
              const filled = !!occupant;
              const blockedByBusy =
                entityBusy && filled && gearWouldChangeStats(occupant);
              const slotDisabled = busy || blockedByBusy;
              const slotTitle = blockedByBusy
                ? BUSY_EQUIP_TOOLTIP
                : filled
                  ? `${occupantName} — tap to manage`
                  : `Equip ${label.toLowerCase()}`;

              const slotCls = [
                'flex-1 aspect-square relative flex items-center justify-center',
                'bg-[#0e0c1e] rounded-[10px] cursor-pointer overflow-hidden',
                '[transition:border-color_0.15s,background_0.15s]',
                filled
                  ? 'border-[1.5px] border-solid border-[rgba(245,158,11,0.7)] bg-[rgba(245,158,11,0.08)]'
                  : 'border-[1.5px] border-dashed border-[rgba(255,255,255,0.25)]',
                blockedByBusy
                  ? 'cursor-not-allowed opacity-40 grayscale-[0.7] !border-dashed !border-[rgba(255,255,255,0.15)] !bg-[#0e0c1e]'
                  : 'enabled:hover:border-[rgba(139,92,246,0.7)] enabled:hover:bg-[rgba(139,92,246,0.1)]',
                !blockedByBusy && slotDisabled && 'cursor-wait opacity-60',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={label}
                  className={slotCls}
                  type="button"
                  aria-label={filled ? `Manage ${occupantName} (${label})` : `Equip ${label}`}
                  aria-disabled={slotDisabled}
                  title={slotTitle}
                  disabled={slotDisabled}
                  onClick={() => handleSlotClick(slot)}
                >
                  {filled && occupantIcon ? (
                    <GameIcon src={occupantIcon} size={32} />
                  ) : (
                    <span className="text-[20px] opacity-50 leading-none">{icon}</span>
                  )}
                  <span className={[
                    'absolute bottom-[3px] right-[5px] text-xs font-black leading-none',
                    filled ? 'text-[rgba(248,113,113,0.95)]' : 'text-[rgba(255,255,255,0.6)]',
                  ].join(' ')}>{filled ? '×' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Power score + divider + radar */}
        <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] pt-3 px-[10px] pb-2 flex flex-col">
          <div className="flex flex-col">
            <div className="text-[10px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.6)] mb-[2px]">POWER SCORE</div>
            <div className="text-[32px] font-black text-[#F59E0B] leading-none tracking-[-0.5px]">{(power * progress).toFixed(2)}</div>
          </div>

          <div className="h-px bg-[rgba(139,92,246,0.2)] mt-1" />

          <div className="flex justify-center items-center flex-1 pt-[10px]">
            <StatRadarChart
              stats={baseStats}
              equippedStats={previewEquippedStats ?? equippedStats}
              size={155}
              progress={progress}
            />
          </div>
        </div>
      </div>

      <EquipPickerModal
        isOpen={pickerSlot !== null}
        slot={pickerSlot}
        entityId={entity.id}
        equippedItem={pickerSlot ? (equippedBySlot[pickerSlot] ?? undefined) : undefined}
        onClose={() => { setPickerSlot(null); setHoveredPickerItem(null); }}
        onSelect={handlePickerSelect}
        onHover={setHoveredPickerItem}
        onUnequip={handlePickerUnequip}
      />

      {uniquePowers.length > 0 && (
        <EntityUniquePowerPanel entityId={entity.id} powers={uniquePowers} />
      )}

      {/* ── Full-width progression tab panel ── */}
      <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] flex flex-col flex-1 min-h-[200px]">
        <div
          className="flex border-b border-[rgba(139,92,246,0.2)] shrink-0"
          role="tablist"
        >
          {PROGRESSION_TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={[
                'flex-1 py-2 px-1 text-[8px] font-extrabold tracking-[0.4px] bg-transparent border-none',
                'border-b-2 cursor-pointer whitespace-nowrap text-center',
                '[transition:color_0.15s,border-color_0.15s]',
                activeTab === tab
                  ? 'text-[#A78BFA] border-b-[#A78BFA]'
                  : 'text-[rgba(255,255,255,0.45)] border-b-transparent',
              ].join(' ')}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-[10px] flex-1 flex flex-col">
          {activeTab === 'LEVEL' && (
            <div className="flex flex-col gap-[10px] flex-1">
              {/* Level / XP section */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[rgba(255,255,255,0.55)]">Current Level</span>
                <span className="text-xs font-extrabold text-white">{entity.level} / {entity.maxLevel ?? '—'}</span>
              </div>
              <div className="flex flex-col items-stretch gap-[5px]">
                <span className="text-[11px] text-[rgba(255,255,255,0.55)]">XP</span>
                <div className="h-[7px] bg-[rgba(255,255,255,0.08)] rounded-[4px] overflow-hidden">
                  <div
                    className="h-full [background:linear-gradient(90deg,#7C3AED,#A78BFA)] rounded-[4px]"
                    style={{ width: `${xpPercent * progress}%`, transition: 'none' }}
                  />
                </div>
                <span className="text-[10px] font-bold text-[rgba(255,255,255,0.45)] text-right">{xpCurrent} / {xpMax}</span>
              </div>

              <div className="h-px bg-[rgba(139,92,246,0.2)]" />

              {/* Status panel */}
              {(() => {
                const st = entity.status ?? 'idle';
                const DISPLAY_LABEL: Record<string, string> = {
                  idle:    'Ready',
                  mission: 'On Mission',
                  working: 'Working',
                  injured: 'Injured',
                };
                const label = DISPLAY_LABEL[st] ?? (st.charAt(0).toUpperCase() + st.slice(1));
                const statusColor: Record<string, string> = {
                  idle:    'rgba(255,255,255,0.55)',
                  mission: '#F59E0B',
                  working: '#60A5FA',
                  injured: '#ef4444',
                };
                const color = statusColor[st] ?? 'rgba(255,255,255,0.55)';

                // Deeplink targets
                let link: string | null = null;
                if (st === 'mission') {
                  // Mission jobs don't carry a locationId — route to the
                  // missions page, which is the canonical in-game context for
                  // a running mission.
                  link = '/missions';
                } else if (st === 'working') {
                  const locationId = entityActiveJob?.data?.locationId;
                  link = locationId ? `/locations/${locationId}/workshop` : '/crafting';
                } else if (st === 'injured') {
                  link = '/inventory';
                }

                // Countdown
                let countdownMs: number | null = null;
                if ((st === 'mission' || st === 'working') && entityActiveJob?.startTick != null && entityActiveJob?.durationTicks != null) {
                  const timer = createCountdownTimer({ startTick: entityActiveJob.startTick, durationTicks: entityActiveJob.durationTicks });
                  countdownMs = timer.getRemainingMs(currentTick, tickRate);
                } else if (st === 'injured' && entity.injuredUntilTick != null) {
                  const injuredTimer = createCountdownTimer({ startTick: currentTick, durationTicks: Math.max(0, entity.injuredUntilTick - currentTick) });
                  countdownMs = injuredTimer.getRemainingMs(currentTick, tickRate);
                }

                const fmtMs = (ms: number): string => {
                  const totalSec = Math.ceil(ms / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  if (h > 0) return `${h}h ${m}m ${s}s`;
                  if (m > 0) return `${m}m ${s}s`;
                  return `${s}s`;
                };

                // Compose the display value inline: "On Mission · 4m 12s"
                let displayValue = label;
                if (countdownMs !== null && countdownMs > 0) {
                  displayValue = `${label} · ${fmtMs(countdownMs)}`;
                } else if (countdownMs !== null && countdownMs <= 0 && st !== 'idle') {
                  displayValue = `${label} · ✅`;
                }

                const handleClick = () => {
                  if (st === 'injured') {
                    try { localStorage.setItem('inv_activeCategory', 'CONSUMABLE'); } catch (e) { console.error('[status-deeplink] localStorage write failed', e); }
                  }
                  navigate(link!);
                };

                const inner = (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[rgba(255,255,255,0.55)]">Status</span>
                    <span className="flex items-center gap-1 text-xs font-extrabold" style={{ color }}>
                      {displayValue}
                      {link && <span className="text-[9px] opacity-60">›</span>}
                    </span>
                  </div>
                );

                return link ? (
                  <button
                    type="button"
                    className="w-full text-left bg-transparent border-none cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/[0.04] active:bg-white/[0.08] [transition:background_0.15s]"
                    onClick={handleClick}
                  >
                    {inner}
                  </button>
                ) : (
                  <div>{inner}</div>
                );
              })()}

              {/* Recent Events */}
              <div className="flex flex-col flex-1">
                <div className="text-[9px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.45)] mb-2">RECENT EVENTS</div>
                {eventsLoading ? (
                  <div className="flex flex-col gap-1.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-7 rounded-lg bg-white/[0.04] animate-pulse" />
                    ))}
                  </div>
                ) : collapsedEvents.length === 0 ? (
                  <div className="text-center py-4 text-[rgba(255,255,255,0.3)] text-[11px] italic">
                    No recent activity yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {collapsedEvents.map((group, i) => (
                      <EventRow key={i} group={group} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'TRAITS' && (
            <div className="flex flex-col gap-[6px]">
              <div className="text-[9px] font-extrabold tracking-[1px] text-[rgba(255,255,255,0.45)] mb-1">SLOTS &amp; TRAITS</div>
              <div className="h-px bg-[rgba(139,92,246,0.2)]" />
              {Object.keys(traits).map((slot) => {
                const rawValue = traits[slot];
                const value = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';
                const archetypeColor = value
                  ? (getArchetypeDisplay(value)?.color ?? '#A78BFA')
                  : 'rgba(255,255,255,0.3)';
                const displayValue = value
                  ? value.replace(/\b\w/g, (c) => c.toUpperCase())
                  : '—';
                return (
                  <div key={slot} className="grid grid-cols-2 items-center py-1.5 px-2 rounded-lg bg-white/[0.03] border border-[rgba(255,255,255,0.05)]">
                    <span className="text-[11px] text-[rgba(255,255,255,0.6)] font-semibold">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
                    <span className="text-[11px] font-extrabold text-right" style={{ color: archetypeColor }}>
                      {displayValue}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab !== 'LEVEL' && activeTab !== 'TRAITS' && (
            <div className="flex flex-col items-center justify-center gap-2 py-5 text-[rgba(255,255,255,0.35)] text-xs italic">
              <span className="text-[22px]">🔒</span>
              <span>Coming soon</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityUniquePowerPanel({
  entityId,
  powers,
}: {
  entityId: string;
  powers: import('@derp/shared').PowerRef[];
}) {
  const { execute } = useCommand();
  const { addTransientToast } = useNotifications();
  const storedUsages = useAppSelector((s) => s.sync.entityPowerUsages[entityId] ?? {});
  const [triggering, setTriggering] = useState<string | null>(null);
  const now = useNow(1000);
  const countdown = getSecondsUntilUtcMidnight(now);

  const today = getUtcDay();
  const usageState = useMemo<Record<string, { usageCount: number; dailyLimit: number }>>(() => {
    const result: Record<string, { usageCount: number; dailyLimit: number }> = {};
    for (const p of powers) {
      const k = p.key ?? p.powerType ?? p.effectDefId ?? 'unknown';
      const entry = storedUsages[k];
      if (entry && entry.lastUsedUtcDay === today) {
        result[k] = { usageCount: entry.usageCount, dailyLimit: p.dailyLimit ?? 1 };
      }
    }
    return result;
  }, [storedUsages, powers, today]);

  const handleTrigger = useCallback(
    async (key: string) => {
      if (triggering) return;
      setTriggering(key);
      try {
        const res = await execute('TriggerEntityPower', { entityId, powerKey: key });
        const toast = (res.ui as any[]).find((u) => u.type === 'toast');
        if (toast) {
          addTransientToast({
            title: toast.tone === 'success' ? 'Power Triggered!' : 'Error',
            body: toast.message,
            icon: toast.tone === 'success' ? '⚡' : '❌',
            accentColor: toast.tone === 'success' ? '#F59E0B' : '#EF4444',
            durationMs: 8000,
          });
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to trigger power';
        const isLimit = msg.includes('Daily limit') || msg.includes('limit reached');
        addTransientToast({
          title: isLimit ? 'Daily Limit Reached' : 'Power Failed',
          body: msg,
          icon: '❌',
          accentColor: '#EF4444',
          durationMs: 8000,
        });
      } finally {
        setTriggering(null);
      }
    },
    [entityId, execute, addTransientToast, triggering],
  );

  if (powers.length === 0) return null;

  return (
    <div className="[background:linear-gradient(160deg,#1a1640_0%,#1e1850_100%)] border border-[rgba(139,92,246,0.2)] rounded-[14px] p-[10px] flex flex-col gap-[6px] shrink-0">
      <div className="text-[9px] font-black tracking-[0.8px] text-[#fde68a]/70 uppercase">Unique NFT Powers</div>
      {powers.map((p) => {
        const k = p.key ?? p.powerType ?? p.effectDefId ?? 'unknown';
        const usage = usageState[k];
        const limit = typeof p.dailyLimit === 'number' && p.dailyLimit > 0 ? p.dailyLimit : 1;
        const isAtLimit = usage ? usage.usageCount >= limit : false;
        const usageCount = usage?.usageCount ?? 0;
        const label = p.name || k;
        const isPercent = p.powerType === 'tick_boost' || p.powerType === 'tick_speed_boost'
          || p.powerDefId === 'global_tick_boost';
        const valStr = p.value !== undefined ? (isPercent ? `+${p.value}%` : `+${p.value}`) : '—';
        const durStr = p.durationMinutes !== undefined ? `${p.durationMinutes}m` : '—';
        const valueLabel = `${valStr} · ${durStr}`;
        const remaining = Math.max(0, limit - usageCount);
        return (
          <div key={k}>
            {isAtLimit ? (
              <div className="flex items-center justify-between gap-1 bg-white/[0.04] rounded px-2 py-1.5">
                <span className="text-[9px] font-bold text-white/40 truncate">{label}</span>
                <span className="text-[8px] font-mono text-white/30 flex-shrink-0">
                  Resets {formatCountdown(countdown)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-[2px] bg-gradient-to-r from-[#7C3AED]/30 to-[#F59E0B]/20 border border-[#F59E0B]/30 rounded px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-bold text-[#fde68a] truncate">{label}</span>
                  <span className="text-[8px] text-[#fde68a]/70 flex-shrink-0">{valueLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: limit }).map((_, i) => (
                      <div
                        key={i}
                        className={[
                          'w-1.5 h-1.5 rounded-full',
                          i < usageCount
                            ? 'bg-white/15'
                            : 'bg-[#F59E0B]/60',
                        ].join(' ')}
                      />
                    ))}
                    <span className="text-[8px] text-white/40 ml-0.5">{remaining}/{limit}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!!triggering}
                    onClick={() => handleTrigger(p.key ?? p.powerType ?? p.effectDefId ?? 'unknown')}
                    className="px-2 py-[2px] rounded text-[8px] font-extrabold tracking-[0.04em] cursor-pointer transition-[filter] hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed border border-[#F59E0B]/50"
                    style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.7), rgba(245,158,11,0.5))', color: '#fde68a' }}
                  >
                    Activate
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ group }: { group: CollapsedGroup }) {
  const { event, count } = group;

  if (event.type === 'mission') {
    if (count > 1) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] text-[11px]">
          <span className="text-[13px]">⚔️</span>
          <span className="text-[rgba(255,255,255,0.7)]">Went on {count} missions</span>
        </div>
      );
    }
    const icon = event.success ? '✅' : '❌';
    const label = event.success ? 'Mission completed' : 'Mission failed';
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03]">
        <span className="text-[13px] shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-[rgba(255,255,255,0.7)]">{label}</span>
          {event.missionName && (
            <span className="text-[10px] text-[rgba(255,255,255,0.4)] ml-1 truncate">· {event.missionName}</span>
          )}
        </div>
        {(event.xpGained ?? 0) > 0 && (
          <span className="text-[10px] font-bold text-[#A78BFA] shrink-0">+{event.xpGained} XP</span>
        )}
        {event.timestamp && (
          <span className="text-[10px] text-[rgba(255,255,255,0.4)] shrink-0">{timeAgo(event.timestamp)}</span>
        )}
      </div>
    );
  }

  if (event.type === 'level_up') {
    if (count > 1) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] text-[11px]">
          <span className="text-[13px]">⬆️</span>
          <span className="text-[rgba(255,255,255,0.7)]">Levelled up {count} times</span>
        </div>
      );
    }
    const gains = event.gains ?? {};
    const gainText = Object.entries(gains)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}+${v}`)
      .join(' ');
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03]">
        <span className="text-[13px] shrink-0">⬆️</span>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-[rgba(255,255,255,0.7)]">Reached level {event.level}</span>
          {gainText && (
            <span className="text-[10px] text-[rgba(167,139,250,0.7)] ml-1">{gainText}</span>
          )}
        </div>
        {event.timestamp && (
          <span className="text-[10px] text-[rgba(255,255,255,0.4)] shrink-0">{timeAgo(event.timestamp)}</span>
        )}
      </div>
    );
  }

  if (event.type === 'injury') {
    if (count > 1) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] text-[11px]">
          <span className="text-[13px]">🩹</span>
          <span className="text-[rgba(255,255,255,0.7)]">Was injured {count} times</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] text-[11px]">
        <span className="text-[13px]">🩹</span>
        <div className="flex-1 min-w-0">
          <span className="text-[rgba(255,255,255,0.7)]">Was injured</span>
          {event.missionName && (
            <span className="text-[10px] text-[rgba(255,255,255,0.4)] ml-1 truncate">· {event.missionName}</span>
          )}
        </div>
        {event.timestamp && (
          <span className="text-[10px] text-[rgba(255,255,255,0.4)] shrink-0">{timeAgo(event.timestamp)}</span>
        )}
      </div>
    );
  }

  return null;
}

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeGeneratorProduction } from '../../utils/locationProduction';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveMissions,
  useSyncLocations,
} from '../../hooks/useSyncSelectors';
import { useModal } from '../../context/ModalContext';
import { useCollectJob } from '../../hooks/useCollectJob';
import { api } from '../../services/api';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import { GameImage } from '../../components/GameImage';
import { HomePageSkeleton } from '../../components/Skeleton';
import './HomePage.css';

function formatTime(ms: number) {
  if (ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s left`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { pushModal } = useModal();
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const activeMissions = useSyncActiveMissions();
  const locations = useSyncLocations();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();

  const { collectJob } = useCollectJob();
  const [claimError, setClaimError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const openModalSpec = useCallback(async (params: { jobId?: string; giftId?: string }) => {
    try {
      const spec = await api.getModalSpec(params);
      if (spec?.version === 1) {
        pushModal(spec);
      }
    } catch (err) {
      console.error('[HomePage] Failed to fetch modal spec:', err);
    }
  }, [pushModal]);

  if (!profile) return <HomePageSkeleton />;

  const totalProductionByResource = (locations as any[]).reduce<Record<string, number>>((acc, loc) => {
    const generators = computeGeneratorProduction(loc);
    for (const gen of generators) {
      acc[gen.outputRefId] = (acc[gen.outputRefId] ?? 0) + gen.ratePerHour;
    }
    return acc;
  }, {});
  const arcaniumRate = totalProductionByResource['soft_arcanium'] ?? 0;
  const otherRate = Object.entries(totalProductionByResource)
    .filter(([id]) => id !== 'soft_arcanium')
    .reduce((sum, [, rate]) => sum + rate, 0);

  const idleEntities = entities.filter((b: any) => b.status === 'idle').length;
  const busyEntities = entities.length - idleEntities;
  const getMissionRemaining = (m: any): number => {
    if (m.startTick == null || m.durationTicks == null) return Infinity;
    const timer = createCountdownTimer({ startTick: m.startTick, durationTicks: m.durationTicks });
    const remainingTicks = timer.getValue(currentTick);
    return tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
  };
  const completedMissions = activeMissions.filter((m: any) => getMissionRemaining(m) <= 0);
  const inProgressMissions = activeMissions.filter((m: any) => getMissionRemaining(m) > 0);

  const handleClaim = async (missionId: string) => {
    setClaimError('');
    setClaimingId(missionId);
    try {
      await collectJob(missionId);
    } catch (err: any) {
      console.error('[HomePage] Mission claim failed:', err);
      setClaimError(err?.message || 'Failed to claim mission');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="hp">
      {/* TODO(Phase 5): Replace with live season data from GET /season/current.
           Season name, time remaining, and CTA label should come from the SeasonService.
           See Phase 5 in the post-MVP roadmap. */}
      <div className="hp-section">
        <div className="hp-season-banner" onClick={() => navigate('/missions')}>
          <img src="/images/season-banner.png" alt="" className="hp-season-bg" />
          <div className="hp-season-content">
            <h3>VOID CONVERGENCE</h3>
            <p className="hp-season-sub">SEASON ENDS IN: <strong>24d 17h</strong></p>
            <p className="hp-season-desc">Cosmic mysteries await!</p>
            <button className="hp-season-btn">SEASON MISSIONS</button>
          </div>
        </div>
      </div>

      <div className="hp-combined-card">
        <div className="hp-combined-top">
          <div className="hp-section-label">OUTPOST PRODUCTION</div>
          <div className="hp-outpost-scene">
            <GameImage
              src="/images/regions/derpshire-valley.png"
              category="regions"
              alt="Outpost"
              fallbackSrc="/images/regions/fallback.png"
            />
          </div>
          <div className="hp-outpost-stats">
            <div className="hp-outpost-stat">
              <span className="hp-outpost-stat-icon">💎</span>
              <span className="hp-outpost-stat-val">{arcaniumRate.toLocaleString()} /h</span>
            </div>
            {otherRate > 0 && (
              <div className="hp-outpost-stat">
                <span className="hp-outpost-stat-icon">⭐</span>
                <span className="hp-outpost-stat-val">{otherRate.toLocaleString()} /h</span>
              </div>
            )}
            <div className="hp-outpost-stat">
              <span className="hp-outpost-stat-icon">🏠</span>
              <span className="hp-outpost-stat-val">{locations.length}</span>
            </div>
            <button className="hp-claim-all-btn" onClick={() => navigate('/locations')}>
              CLAIM ALL
            </button>
          </div>
        </div>

        <div className="hp-combined-divider" />

        <div className="hp-combined-bottom">
          <div className="hp-combined-bottom-header">
            <span className="hp-section-label">MISSIONS</span>
            <button className="hp-section-link" onClick={() => navigate('/missions')}>›</button>
          </div>

          {claimError && (
            <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '4px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, margin: '0 8px 8px' }}>{claimError}</div>
          )}

          {completedMissions.length > 0 && (
            <>
              {completedMissions.map((m: any) => (
                <div key={m.id} className="hp-mission-row hp-mission-ready" onClick={() => openModalSpec({ jobId: m.id })} style={{ cursor: 'pointer' }}>
                  <div className="hp-mission-icon hp-mission-icon-done">✅</div>
                  <div className="hp-mission-info">
                    <span className="hp-mission-name">{(m.defId || '').replace(/_/g, ' ')}</span>
                    <span className="hp-mission-status-text">Ready to claim!</span>
                  </div>
                  <button className="hp-claim-btn" onClick={(e) => { e.stopPropagation(); handleClaim(m.id); }} disabled={claimingId === m.id}>
                    {claimingId === m.id ? '...' : 'CLAIM'}
                  </button>
                </div>
              ))}
            </>
          )}

          {inProgressMissions.map((m: any) => {
            const remaining = getMissionRemaining(m);
            const timeStr = formatTime(remaining);
            return (
              <div key={m.id} className="hp-mission-row" onClick={() => openModalSpec({ jobId: m.id })} style={{ cursor: 'pointer' }}>
                <div className="hp-mission-icon">🗺️</div>
                <div className="hp-mission-info">
                  <span className="hp-mission-name">{(m.defId || '').replace(/_/g, ' ')}</span>
                  <span className="hp-mission-reward">💎 {m.arcaniumReward || '?'}</span>
                </div>
                <div className="hp-mission-timer">
                  <span className="hp-timer-badge">{timeStr}</span>
                </div>
              </div>
            );
          })}

          {activeMissions.length === 0 && (
            <div className="hp-empty-state">
              <span>No active missions</span>
              <button className="hp-start-btn" onClick={() => navigate('/missions')}>START A MISSION</button>
            </div>
          )}
        </div>
      </div>

      <div className="hp-section">
        <div className="hp-section-header">
          <h2>KEEPER STATUS</h2>
        </div>
        <div className="hp-keeper-card">
          <div className="hp-keeper-level">
            <div className="hp-keeper-level-num">{profile.keeperLevel}</div>
            <div className="hp-keeper-level-label">KEEPER<br/>LEVEL</div>
          </div>
          <div className="hp-keeper-xp">
            <div className="hp-xp-text">{profile.keeperXp} / {profile.xpToNextLevel || 100} XP</div>
            <div className="hp-xp-bar">
              <div
                className="hp-xp-fill"
                style={{ width: `${(profile.keeperXp / (profile.xpToNextLevel || 100)) * 100}%` }}
              />
            </div>
          </div>
          <div className="hp-keeper-stats">
            <div className="hp-keeper-stat">
              <span>🪶 Entities</span>
              <strong>{entities.length}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🟢 Idle</span>
              <strong>{idleEntities}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🟡 Busy</span>
              <strong>{busyEntities}</strong>
            </div>
            <div className="hp-keeper-stat">
              <span>🏅 Prestige</span>
              <strong>{profile.prestigeTokens || 0}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

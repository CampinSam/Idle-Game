import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveCraftingJobs,
  useSyncCurrencyBalances,
} from '../../hooks/useSyncSelectors';
import { fetchCraftingRecipes } from '../../store/gameSlice';
import { useCommand } from '../../hooks/useCommand';
import { api } from '../../services/api';
import { audioEngine } from '../../services/AudioEngine';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import {
  mergeDisplayStyles,
  overlayToCss,
  textStyleToCss,
  type DisplayStyle,
} from '@derp/shared';
import './ForgePage.css';

const FORGE_FALLBACK = {
  borderColor: '#f97316',
  backgroundImage: '/images/regions/sandcrypt-badlands.png',
  cardBackground: 'linear-gradient(180deg, rgba(249,115,22,0.18) 0%, rgba(34,24,88,0.95) 60%)',
};

const QUALITY_COLOURS: Record<string, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#60a5fa',
  epic: '#c084fc',
};

function bgImageCss(bg?: string | null): string {
  if (!bg) return 'none';
  if (/^(linear-gradient|radial-gradient|url\()/i.test(bg)) return bg;
  return `url(${bg})`;
}

function fmtSeconds(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface ForecastResponse {
  cap: number;
  tiers: Array<{ key: string; label: string; minCl: number }>;
  entities: Array<{
    entityId: string;
    name: string;
    level: number;
    status: string;
    idle: boolean;
    stats: { FOC: number; LCK: number };
    craftingLuck: number;
    quality: string;
    qualityLabel: string;
    tierIndex: number;
    nextTier: { key: string; label: string; minCl: number; deltaCl: number } | null;
  }>;
}

function ForecastBar({
  cap,
  tiers,
  marker,
  qualityKey,
}: {
  cap: number;
  tiers: ForecastResponse['tiers'];
  marker: number | null;
  qualityKey: string | null;
}) {
  const segs = useMemo(() => {
    const sorted = [...tiers].sort((a, b) => a.minCl - b.minCl);
    return sorted.map((t, i) => {
      const start = t.minCl;
      const end = i === sorted.length - 1 ? cap : sorted[i + 1].minCl;
      const widthPct = ((end - start) / cap) * 100;
      return { ...t, start, end, widthPct };
    });
  }, [tiers, cap]);

  const markerPct = marker == null ? null : Math.max(0, Math.min(100, (marker / cap) * 100));

  return (
    <div className="forge-forecast">
      <div className="forge-forecast-track">
        {segs.map((s) => (
          <div
            key={s.key}
            className={`forge-forecast-seg seg-${s.key} ${qualityKey === s.key ? 'is-active' : ''}`}
            style={{ width: `${s.widthPct}%`, background: QUALITY_COLOURS[s.key] || '#475569' }}
            title={`${s.label} — CL ≥ ${s.minCl}`}
          >
            <span className="forge-forecast-label">{s.label}</span>
          </div>
        ))}
        {markerPct != null && (
          <div className="forge-forecast-marker" style={{ left: `${markerPct}%` }} aria-hidden />
        )}
      </div>
      <div className="forge-forecast-axis">
        {segs.map((s) => (
          <span key={s.key} style={{ width: `${s.widthPct}%` }}>
            <small>{s.minCl}</small>
          </span>
        ))}
        <span className="forge-forecast-axis-end"><small>{cap}+</small></span>
      </div>
    </div>
  );
}

export default function ForgePage() {
  const { id: outpostId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const tick = useCurrentTick();
  const tickRate = useTickRate();

  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const activeCraftingJobs = useSyncActiveCraftingJobs();
  const currencyBalances = useSyncCurrencyBalances();
  const { craftingRecipes } = useAppSelector((s) => s.game);

  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workshopChecked, setWorkshopChecked] = useState(false);

  // Server-enforced "crafting is a place": validate that this outpost actually
  // hosts an enabled workshop owned by the player. If not, redirect away so
  // route fiddling can't bypass the requirement.
  useEffect(() => {
    if (!outpostId) {
      navigate('/locations', { replace: true });
      return;
    }
    let cancelled = false;
    setWorkshopChecked(false);
    api.getCraftingWorkshopAtLocation(outpostId)
      .then(() => { if (!cancelled) setWorkshopChecked(true); })
      .catch(() => {
        if (cancelled) return;
        navigate(`/locations/${outpostId}`, { replace: true });
      });
    return () => { cancelled = true; };
  }, [outpostId, navigate]);

  useEffect(() => {
    dispatch(fetchCraftingRecipes());
  }, [dispatch]);

  const forecastBucket = Math.floor(tick / 30);
  useEffect(() => {
    let cancelled = false;
    setForecastLoading(true);
    api.getCraftingForecast(true)
      .then((data) => { if (!cancelled) setForecast(data); })
      .catch(() => { if (!cancelled) setForecast(null); })
      .finally(() => { if (!cancelled) setForecastLoading(false); });
    return () => { cancelled = true; };
  }, [forecastBucket]);

  const idleEntities = entities.filter((e: any) => e.status === 'idle');
  const recipe = craftingRecipes.find((r: any) => r.id === selectedRecipe);

  const recipeStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, recipe?.displayDef?.style),
    [recipe],
  );
  const recipeOverlay = overlayToCss(recipeStyle.overlay);
  const recipeTitleStyle = textStyleToCss(recipeStyle.title);
  const recipeBodyStyle = textStyleToCss(recipeStyle.body);

  const heroStyle: DisplayStyle = useMemo(
    () => mergeDisplayStyles(undefined, undefined),
    [],
  );
  const heroOverlay = overlayToCss(heroStyle.overlay);

  const selectedForecast = useMemo(
    () => (selectedEntity && forecast ? forecast.entities.find((e) => e.entityId === selectedEntity) : null),
    [selectedEntity, forecast],
  );

  const handleStart = async () => {
    if (!selectedRecipe || !selectedEntity) return;
    setError('');
    setBusy(true);
    try {
      audioEngine.play('ui.button_click');
      await execute('StartCrafting', { recipeId: selectedRecipe, entityId: selectedEntity });
      audioEngine.play('sfx.craft.start');
      setSelectedRecipe(null);
      setSelectedEntity(null);
    } catch (e: any) {
      audioEngine.play('ui.error');
      setError(e?.message || 'Failed to start crafting');
    } finally {
      setBusy(false);
    }
  };

  const handleCollect = async (jobId: string) => {
    setError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setError(e?.message || 'Failed to collect');
    }
  };

  if (!workshopChecked) {
    return (
      <div className="forge-scene">
        <div className="forge-loading">Validating workshop…</div>
      </div>
    );
  }

  return (
    <div className="forge-scene">
      <div
        className="forge-hero"
        style={{
          backgroundImage: bgImageCss(FORGE_FALLBACK.backgroundImage),
          borderColor: FORGE_FALLBACK.borderColor,
        }}
      >
        <div className="forge-hero-overlay" style={{ background: heroOverlay || 'rgba(12,10,26,0.55)' }} />
        <button className="forge-back-pill" onClick={() => navigate(`/locations/${outpostId}`)}>
          ← Back to Outpost
        </button>
        <div className="forge-hero-content">
          <div className="forge-hero-eyebrow">⚒️  WORKSHOP</div>
          <h1 className="forge-hero-title">The Forge</h1>
          <p className="forge-hero-blurb">
            Crucibles roar, anvils sing. Pick a recipe, assign a Derp, and let server-side luck shape what you'll pull from the flames.
          </p>
        </div>
      </div>

      {error && <div className="forge-error">{error}</div>}

      <section className="forge-section forge-jobs-section">
        <div className="forge-section-head">
          <h2>In the Crucible</h2>
          <span className="forge-section-sub">{activeCraftingJobs.length} active</span>
        </div>
        {activeCraftingJobs.length === 0 ? (
          <div className="forge-empty">Nothing crafting yet. Pick a recipe below.</div>
        ) : (
          <div className="forge-jobs">
            {activeCraftingJobs.map((job: any) => {
              const timer = (job.startTick != null && job.durationTicks != null)
                ? createCountdownTimer({ startTick: job.startTick, durationTicks: job.durationTicks })
                : null;
              const remTicks = timer ? timer.getValue(tick) : Infinity;
              const remMs = timer && tickRate > 0 ? (remTicks / tickRate) * 1000 : Infinity;
              const isReady = remMs <= 0;
              const recipeDef = craftingRecipes.find((r: any) => r.id === job.recipeId);
              return (
                <div key={job.id} className={`forge-job-card ${isReady ? 'ready' : ''}`}>
                  <div className="forge-job-name">{recipeDef?.name || job.recipeId}</div>
                  {isReady ? (
                    <button className="forge-collect-btn" onClick={() => handleCollect(job.id)}>
                      Collect
                    </button>
                  ) : (
                    <span className="forge-job-time">{fmtSeconds(remMs / 1000)} left</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="forge-section">
        <div className="forge-section-head">
          <h2>Recipes</h2>
          <span className="forge-section-sub">{craftingRecipes.length} known</span>
        </div>
        <div className="forge-recipe-grid">
          {craftingRecipes.map((r: any) => {
            const cost: Array<{ type: string; id: string; amount: number }> = r.cost ?? [];
            const canAfford = cost.every((c) =>
              c.type === 'currency' ? (currencyBalances[c.id] ?? 0) >= c.amount : true);
            const meetsLevel = !profile || profile.keeperLevel >= (r.requiredKeeperLevel || 1);
            const dd = r.displayDef;
            const cardStyle: DisplayStyle = mergeDisplayStyles(undefined, dd?.style);
            return (
              <button
                key={r.id}
                className={`forge-recipe-card ${selectedRecipe === r.id ? 'is-selected' : ''} ${!meetsLevel ? 'is-locked' : ''}`}
                style={{
                  background: dd?.cardBackground || 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(34,24,88,0.6))',
                  borderColor: dd?.borderColor || 'rgba(139,92,246,0.45)',
                }}
                onClick={() => meetsLevel && setSelectedRecipe(r.id)}
                disabled={!meetsLevel}
              >
                <div className="forge-recipe-title" style={textStyleToCss(cardStyle.title) as React.CSSProperties}>
                  {r.name}
                </div>
                {r.description && (
                  <div className="forge-recipe-desc" style={textStyleToCss(cardStyle.body) as React.CSSProperties}>
                    {r.description}
                  </div>
                )}
                <div className="forge-recipe-meta">
                  <span className={canAfford ? '' : 'is-bad'}>
                    {cost.length === 0 ? 'Free' : cost.map((c) => `${c.amount} ${c.id.replace('soft_', '').replace('mat_', '')}`).join(' · ')}
                  </span>
                  <span>{fmtSeconds(r.timer?.duration ?? 0)}</span>
                  {!meetsLevel && <span className="is-locked-tag">Lvl {r.requiredKeeperLevel}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {recipe && (
        <section
          className="forge-section forge-assign"
          style={{
            background: recipe.displayDef?.cardBackground || undefined,
            borderColor: recipe.displayDef?.borderColor || undefined,
          }}
        >
          {recipeOverlay && (
            <div className="forge-assign-overlay" style={{ background: recipeOverlay }} aria-hidden />
          )}
          <div className="forge-assign-inner">
            <div className="forge-assign-head">
              <h2 style={recipeTitleStyle as React.CSSProperties}>Assign a Derp to "{recipe.name}"</h2>
              <p style={recipeBodyStyle as React.CSSProperties}>
                Crafting Luck = FOC×0.5 + LCK×0.3 (+bonuses). Higher CL pushes the result toward better quality tiers.
              </p>
            </div>

            <div className="forge-entity-grid">
              {idleEntities.length === 0 && (
                <div className="forge-empty">No idle Derps. Pull one back from a mission.</div>
              )}
              {idleEntities.map((entity: any) => {
                const f = forecast?.entities.find((x) => x.entityId === entity.id);
                return (
                  <button
                    key={entity.id}
                    className={`forge-entity-card ${selectedEntity === entity.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedEntity(entity.id)}
                  >
                    <div className="forge-entity-name">{entity.name}</div>
                    <div className="forge-entity-meta">Lvl {entity.level}</div>
                    {f && (
                      <div className="forge-entity-stats">
                        <span className="forge-entity-cl">CL {f.craftingLuck.toFixed(0)}</span>
                        <span
                          className="forge-entity-quality"
                          style={{ color: QUALITY_COLOURS[f.quality] || '#94a3b8' }}
                        >
                          {f.qualityLabel}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {forecast && (
              <div className="forge-forecast-box">
                <div className="forge-forecast-head">
                  <span>Quality Forecast</span>
                  {selectedForecast && (
                    <span style={{ color: QUALITY_COLOURS[selectedForecast.quality] || '#94a3b8' }}>
                      {selectedForecast.name} → {selectedForecast.qualityLabel}
                      {selectedForecast.nextTier &&
                        ` · +${selectedForecast.nextTier.deltaCl.toFixed(0)} CL → ${selectedForecast.nextTier.label}`}
                    </span>
                  )}
                </div>
                <ForecastBar
                  cap={forecast.cap}
                  tiers={forecast.tiers}
                  marker={selectedForecast?.craftingLuck ?? null}
                  qualityKey={selectedForecast?.quality ?? null}
                />
                {!selectedEntity && !forecastLoading && (
                  <div className="forge-forecast-hint">
                    Select a Derp to see where their Crafting Luck lands.
                  </div>
                )}
              </div>
            )}

            <button
              className="forge-start-btn"
              disabled={!selectedEntity || busy}
              onClick={handleStart}
            >
              {busy ? 'Igniting…' : `Begin Forging (${(recipe.cost ?? []).map((c: any) => `${c.amount} ${c.id.replace('soft_', '').replace('mat_', '')}`).join(' · ') || 'Free'})`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

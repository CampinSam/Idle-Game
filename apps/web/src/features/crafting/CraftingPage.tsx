import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../tick';
import {
  fetchCraftingRecipes,
} from '../../store/gameSlice';
import { useCommand } from '../../hooks/useCommand';
import {
  useSyncPlayer,
  useSyncEntities,
  useSyncActiveCraftingJobs,
  useSyncCurrencyBalances,
} from '../../hooks/useSyncSelectors';
import './CraftingPage.css';

export default function CraftingPage() {
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const { craftingRecipes } = useAppSelector((s) => s.game);
  const profile = useSyncPlayer();
  const entities = useSyncEntities();
  const activeCraftingJobs = useSyncActiveCraftingJobs();
  const currencyBalances = useSyncCurrencyBalances();
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(fetchCraftingRecipes());
  }, [dispatch]);

  const idleEntities = entities.filter((b: any) => b.status === 'idle');
  const recipe = craftingRecipes.find((r: any) => r.id === selectedRecipe);

  const handleStart = async () => {
    if (!selectedRecipe || !selectedEntity) return;
    setError('');
    try {
      await execute('StartCrafting', { recipeId: selectedRecipe, entityId: selectedEntity });
      setSelectedRecipe(null);
      setSelectedEntity(null);
    } catch (e: any) {
      setError(e.message || 'Failed to start crafting');
    }
  };

  const handleCollect = async (jobId: string) => {
    setError('');
    try {
      await execute('CollectCrafting', { jobId });
    } catch (e: any) {
      setError(e.message || 'Failed to collect');
    }
  };

  return (
    <div className="crafting-page">
      <h1>Crafting Workshop</h1>
      <p className="page-desc">Brew potions and create useful items. Results may vary (hilariously).</p>

      {error && <div className="craft-error">{error}</div>}

      {/* Active Jobs */}
      {activeCraftingJobs.length > 0 && (
        <div className="section">
          <h2>In Progress</h2>
          <div className="craft-jobs">
            {activeCraftingJobs.map((job: any) => {
              const craftTimer = (job.startTick != null && job.durationTicks != null)
                ? createCountdownTimer({ startTick: job.startTick, durationTicks: job.durationTicks })
                : null;
              const remainingTicks = craftTimer ? craftTimer.getValue(currentTick) : Infinity;
              const remaining = craftTimer && tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
              const isReady = remaining <= 0;
              return (
                <div key={job.id} className={`card craft-job-card ${isReady ? 'ready' : ''}`}>
                  <div>
                    <strong>{job.recipeId.replace(/_/g, ' ')}</strong>
                  </div>
                  {isReady ? (
                    <button className="success" onClick={() => handleCollect(job.id)}>
                      Collect
                    </button>
                  ) : (
                    <span className="time-remaining">{Math.ceil(remaining / 60000)}m left</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipes */}
      <div className="section">
        <h2>Recipes</h2>
        <div className="recipes-grid">
          {craftingRecipes.map((r: any) => {
            const recipeCost: Array<{ type: string; id: string; amount: number }> = Array.isArray(r.cost) ? r.cost : [];
            const canAfford = recipeCost.every((c: any) => {
              if (c.type === 'currency') return (currencyBalances[c.id] ?? 0) >= c.amount;
              return true;
            });
            const meetsLevel = profile && profile.keeperLevel >= r.requiredKeeperLevel;
            return (
              <div
                key={r.id}
                className={`card recipe-card ${selectedRecipe === r.id ? 'selected' : ''} ${!meetsLevel ? 'locked' : ''}`}
                onClick={() => meetsLevel ? setSelectedRecipe(r.id) : null}
              >
                <h3>{r.name}</h3>
                <p className="recipe-desc">{r.description}</p>
                <div className="recipe-details">
                  <span className={canAfford ? '' : 'insufficient'}>Cost: {recipeCost.length > 0 ? recipeCost.map((c: any) => `${c.amount} ${c.id.replace('soft_', '')}`).join(', ') : 'Free'}</span>
                  <span>Time: {r.timer?.duration >= 60 ? `${Math.round(r.timer.duration / 60)}m` : `${r.timer?.duration ?? 0}s`}</span>
                  {!meetsLevel && <span className="level-req">Requires Lvl {r.requiredKeeperLevel}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Entity Selection for Crafting */}
      {recipe && (
        <div className="section">
          <h2>Assign an Entity to craft "{recipe.name}"</h2>
          <div className="entity-select-grid">
            {idleEntities.map((entity: any) => (
              <div
                key={entity.id}
                className={`card entity-select-card ${selectedEntity === entity.id ? 'selected' : ''}`}
                onClick={() => setSelectedEntity(entity.id)}
              >
                <strong>{entity.name}</strong>
                <span>Lvl {entity.level}</span>
              </div>
            ))}
          </div>
          <button
            className="primary start-craft-btn"
            disabled={!selectedEntity}
            onClick={handleStart}
          >
            Start Crafting ({Array.isArray((recipe as any).cost) ? (recipe as any).cost.map((c: any) => `${c.amount} ${c.id.replace('soft_', '')}`).join(', ') : 'Free'})
          </button>
        </div>
      )}
    </div>
  );
}

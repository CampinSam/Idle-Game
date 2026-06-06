import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from '../adminApi';

interface NftCollection {
  id: string;
  name: string;
  chain: string;
  collectionId: string;
  entityDefinitionId: string | null;
  locationDefinitionId: string | null;
  mintMode: string;
  active: boolean;
  _count: { nftAssets: number };
}

type JobStatus = 'idle' | 'running' | 'done' | 'error';

interface ImportStatus {
  status: JobStatus;
  total: number;
  processed: number;
  upserted: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

interface RefreshStatus {
  status: JobStatus;
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

interface CollectionState {
  importStatus: ImportStatus | null;
  importLoading: boolean;
  importError: string | null;
  refreshStatus: RefreshStatus | null;
  refreshLoading: boolean;
  refreshError: string | null;
  instancesResult: { started: true; total: number } | null;
  instancesLoading: boolean;
  instancesError: string | null;
}

function emptyState(): CollectionState {
  return {
    importStatus: null,
    importLoading: false,
    importError: null,
    refreshStatus: null,
    refreshLoading: false,
    refreshError: null,
    instancesResult: null,
    instancesLoading: false,
    instancesError: null,
  };
}

function statusBadge(status: JobStatus) {
  const colors: Record<JobStatus, { bg: string; text: string }> = {
    idle: { bg: '#2a2a4a', text: '#8888aa' },
    running: { bg: '#1a3a2a', text: '#34d399' },
    done: { bg: '#1a2a3a', text: '#60a5fa' },
    error: { bg: '#3a1a1a', text: '#f87171' },
  };
  const c = colors[status];
  return (
    <span style={{
      background: c.bg, color: c.text, padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {status}
    </span>
  );
}

function progressBar(processed: number, total: number) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ background: '#1a1a3a', borderRadius: 4, height: 6, width: '100%' }}>
        <div style={{
          background: '#6366f1', borderRadius: 4, height: 6,
          width: `${pct}%`, transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#8888aa', marginTop: 2 }}>
        {processed} / {total} ({pct}%)
      </div>
    </div>
  );
}

export default function NftCollectionsPage() {
  const [collections, setCollections] = useState<NftCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, CollectionState>>({});
  const [seedResult, setSeedResult] = useState<{ skipped: boolean; inserted: number } | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cols = await adminApi.listNftCollections();
      setCollections(cols);
      setStates(prev => {
        const next: Record<string, CollectionState> = {};
        for (const c of cols) {
          next[c.id] = prev[c.id] ?? emptyState();
        }
        return next;
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      for (const t of Object.values(pollTimers.current)) clearInterval(t);
    };
  }, [load]);

  function patchState(id: string, patch: Partial<CollectionState>) {
    setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyState()), ...patch } }));
  }

  function startImportPoll(id: string) {
    if (pollTimers.current[`import_${id}`]) clearInterval(pollTimers.current[`import_${id}`]);
    pollTimers.current[`import_${id}`] = setInterval(async () => {
      try {
        const st = await adminApi.getImportCacheStatus(id);
        patchState(id, { importStatus: st });
        if (st.status !== 'running') {
          clearInterval(pollTimers.current[`import_${id}`]);
          delete pollTimers.current[`import_${id}`];
          load();
        }
      } catch {
        clearInterval(pollTimers.current[`import_${id}`]);
        delete pollTimers.current[`import_${id}`];
      }
    }, 2000);
  }

  function startRefreshPoll(id: string) {
    if (pollTimers.current[`refresh_${id}`]) clearInterval(pollTimers.current[`refresh_${id}`]);
    pollTimers.current[`refresh_${id}`] = setInterval(async () => {
      try {
        const st = await adminApi.getRefreshStatus(id);
        patchState(id, { refreshStatus: st });
        if (st.status !== 'running') {
          clearInterval(pollTimers.current[`refresh_${id}`]);
          delete pollTimers.current[`refresh_${id}`];
        }
      } catch {
        clearInterval(pollTimers.current[`refresh_${id}`]);
        delete pollTimers.current[`refresh_${id}`];
      }
    }, 2000);
  }

  async function handleImportCache(id: string) {
    patchState(id, { importLoading: true, importError: null, importStatus: null });
    try {
      await adminApi.importNftCollectionCache(id);
      const st = await adminApi.getImportCacheStatus(id);
      patchState(id, { importStatus: st, importLoading: false });
      if (st.status === 'running') startImportPoll(id);
    } catch (e: any) {
      patchState(id, { importError: e.message || 'Failed to start import', importLoading: false });
    }
  }

  async function handleCreateInstances(id: string) {
    patchState(id, { instancesLoading: true, instancesError: null, instancesResult: null });
    try {
      const result = await adminApi.createNftInstances(id);
      patchState(id, { instancesResult: result, instancesLoading: false });
      load();
    } catch (e: any) {
      patchState(id, { instancesError: e.message || 'Failed to create instances', instancesLoading: false });
    }
  }

  async function handleRefreshOwnership(id: string) {
    patchState(id, { refreshLoading: true, refreshError: null, refreshStatus: null });
    try {
      await adminApi.refreshNftOwnership(id);
      const st = await adminApi.getRefreshStatus(id);
      patchState(id, { refreshStatus: st, refreshLoading: false });
      if (st.status === 'running') startRefreshPoll(id);
    } catch (e: any) {
      patchState(id, { refreshError: e.message || 'Failed to start refresh', refreshLoading: false });
    }
  }

  async function handleSeed() {
    setSeedLoading(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const r = await adminApi.seedNftEntities();
      setSeedResult(r);
      load();
    } catch (e: any) {
      setSeedError(e.message || 'Seed failed');
    } finally {
      setSeedLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#8888aa', textAlign: 'center' }}>
        Loading NFT collections…
      </div>
    );
  }

  if (error) {
    return (
      <div className="av2-inline-msg error" style={{ margin: 32 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2f2' }}>NFT Collections</div>
          <div style={{ fontSize: 12, color: '#8888aa', marginTop: 2 }}>
            Manage collection cache imports and game entity creation
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {seedResult && (
            <span style={{ fontSize: 12, color: seedResult.skipped ? '#f59e0b' : '#34d399' }}>
              {seedResult.skipped
                ? `⚠ Seed skipped (entities already exist)`
                : `✓ Seeded ${seedResult.inserted} entities`}
            </span>
          )}
          {seedError && (
            <span style={{ fontSize: 12, color: '#f87171' }}>{seedError}</span>
          )}
          <button
            className="av2-btn-ghost"
            onClick={handleSeed}
            disabled={seedLoading}
            title="Seed NFT entities from the bundled JSON definition file. Only runs if no NFT entities exist yet."
          >
            {seedLoading ? 'Seeding…' : 'Seed from JSON'}
          </button>
          <button className="av2-btn-ghost" onClick={load}>↺ Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {collections.map(col => {
          const st = states[col.id] ?? emptyState();
          const isEntityBacked = !!col.entityDefinitionId;
          const hasCache = col._count.nftAssets > 0;

          return (
            <div key={col.id} className="av2-card" style={{ padding: 20, gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e2f2' }}>{col.name}</span>
                    {!col.active && (
                      <span style={{
                        background: '#3a1a1a', color: '#f87171', padding: '1px 6px',
                        borderRadius: 4, fontSize: 10, fontWeight: 700,
                      }}>INACTIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8888aa', marginTop: 3, fontFamily: 'monospace' }}>
                    {col.id}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#8888aa' }}>
                  <div>
                    <span style={{ color: '#b0b0d0' }}>{col.chain}</span>
                    {' · '}
                    <span style={{ color: '#6366f1' }}>{col.mintMode}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {isEntityBacked
                      ? <span title="Linked entity definition">entity: <span style={{ color: '#c084fc' }}>{col.entityDefinitionId}</span></span>
                      : <span title="Linked location definition">location: <span style={{ color: '#34d399' }}>{col.locationDefinitionId}</span></span>
                    }
                  </div>
                </div>
              </div>

              <div style={{
                background: '#12122a', borderRadius: 6, padding: '8px 12px',
                marginBottom: 14, display: 'flex', gap: 24, fontSize: 12,
              }}>
                <div>
                  <span style={{ color: '#8888aa' }}>Cached assets: </span>
                  <span style={{ color: hasCache ? '#60a5fa' : '#f87171', fontWeight: 700 }}>
                    {col._count.nftAssets}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#8888aa' }}>Collection ID: </span>
                  <span style={{ color: '#b0b0d0', fontFamily: 'monospace' }}>
                    {col.collectionId.length > 32
                      ? col.collectionId.slice(0, 32) + '…'
                      : col.collectionId}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: 11, color: '#8888aa', marginBottom: 4 }}>Step 1: Import cache from chain</div>
                    <button
                      className="av2-btn-primary"
                      onClick={() => handleImportCache(col.id)}
                      disabled={st.importLoading || st.importStatus?.status === 'running'}
                    >
                      {st.importLoading || st.importStatus?.status === 'running'
                        ? 'Importing…'
                        : hasCache ? 'Re-import Cache' : 'Import Cache'}
                    </button>
                  </div>

                  {isEntityBacked && (
                    <div style={{ flex: '0 0 auto' }}>
                      <div style={{ fontSize: 11, color: '#8888aa', marginBottom: 4 }}>Step 2: Create entity instances</div>
                      <button
                        className="av2-btn-primary"
                        onClick={() => handleCreateInstances(col.id)}
                        disabled={st.instancesLoading || !hasCache}
                        title={!hasCache ? 'Run Import Cache first to populate the asset cache' : undefined}
                      >
                        {st.instancesLoading ? 'Creating…' : 'Create Instances'}
                      </button>
                    </div>
                  )}

                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: 11, color: '#8888aa', marginBottom: 4 }}>Ownership: sync holders</div>
                    <button
                      className="av2-btn-ghost"
                      onClick={() => handleRefreshOwnership(col.id)}
                      disabled={st.refreshLoading || st.refreshStatus?.status === 'running' || !hasCache}
                      title={!hasCache ? 'Import cache first' : undefined}
                    >
                      {st.refreshLoading || st.refreshStatus?.status === 'running'
                        ? 'Refreshing…'
                        : 'Refresh Ownership'}
                    </button>
                  </div>
                </div>

                {st.importError && (
                  <div className="av2-inline-msg error">{st.importError}</div>
                )}
                {st.importStatus && (
                  <div style={{ background: '#0e0e20', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: '#8888aa' }}>Import cache:</span>
                      {statusBadge(st.importStatus.status)}
                    </div>
                    {progressBar(st.importStatus.processed, st.importStatus.total)}
                    {st.importStatus.status === 'done' && (
                      <div style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>
                        ✓ {st.importStatus.upserted} upserted
                        {st.importStatus.failed > 0 && (
                          <span style={{ color: '#f87171', marginLeft: 8 }}>
                            {st.importStatus.failed} failed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {st.instancesError && (
                  <div className="av2-inline-msg error">{st.instancesError}</div>
                )}
                {st.instancesResult && (
                  <div className="av2-inline-msg success">
                    ✓ Create instances started — processing {st.instancesResult.total} assets
                  </div>
                )}

                {st.refreshError && (
                  <div className="av2-inline-msg error">{st.refreshError}</div>
                )}
                {st.refreshStatus && (
                  <div style={{ background: '#0e0e20', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: '#8888aa' }}>Ownership refresh:</span>
                      {statusBadge(st.refreshStatus.status)}
                    </div>
                    {progressBar(st.refreshStatus.processed, st.refreshStatus.total)}
                    {st.refreshStatus.status === 'done' && (
                      <div style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>
                        ✓ {st.refreshStatus.updated} updated
                        {st.refreshStatus.failed > 0 && (
                          <span style={{ color: '#f87171', marginLeft: 8 }}>
                            {st.refreshStatus.failed} failed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

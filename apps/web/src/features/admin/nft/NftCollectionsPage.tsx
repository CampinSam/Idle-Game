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
  instanceCount: number;
  _count: { nftAssets: number };
}

type JobStatus = 'idle' | 'running' | 'done' | 'error';

interface JobStatusDetail {
  status: JobStatus;
  total: number;
  processed: number;
  upserted: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

interface RefreshStatusDetail {
  status: JobStatus;
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

interface CollectionState {
  importStatus: JobStatusDetail | null;
  importLoading: boolean;
  importError: string | null;
  instancesStatus: JobStatusDetail | null;
  instancesLoading: boolean;
  instancesError: string | null;
  refreshStatus: RefreshStatusDetail | null;
  refreshLoading: boolean;
  refreshError: string | null;
}

function emptyState(): CollectionState {
  return {
    importStatus: null,
    importLoading: false,
    importError: null,
    instancesStatus: null,
    instancesLoading: false,
    instancesError: null,
    refreshStatus: null,
    refreshLoading: false,
    refreshError: null,
  };
}

function statusBadge(status: JobStatus) {
  const colors: Record<JobStatus, { bg: string; text: string }> = {
    idle:    { bg: '#2a2a4a', text: '#8888aa' },
    running: { bg: '#1a3a2a', text: '#34d399' },
    done:    { bg: '#1a2a3a', text: '#60a5fa' },
    error:   { bg: '#3a1a1a', text: '#f87171' },
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

function ProgressBlock({
  label,
  status,
  extra,
}: {
  label: string;
  status: JobStatusDetail | RefreshStatusDetail;
  extra?: React.ReactNode;
}) {
  const pct = status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;
  return (
    <div style={{ background: '#0e0e20', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: '#8888aa' }}>{label}:</span>
        {statusBadge(status.status)}
      </div>
      <div style={{ marginTop: 4 }}>
        <div style={{ background: '#1a1a3a', borderRadius: 4, height: 6, width: '100%' }}>
          <div style={{
            background: '#6366f1', borderRadius: 4, height: 6,
            width: `${pct}%`, transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: 11, color: '#8888aa', marginTop: 2 }}>
          {status.processed} / {status.total} ({pct}%)
        </div>
      </div>
      {extra}
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
  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function patchState(id: string, patch: Partial<CollectionState>) {
    setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyState()), ...patch } }));
  }

  function startPoll(
    key: string,
    fetcher: () => Promise<any>,
    onTick: (data: any) => void,
    isDone: (data: any) => boolean,
    onDone?: () => void,
  ) {
    if (pollTimers.current[key]) clearTimeout(pollTimers.current[key]);

    const tick = async () => {
      try {
        const data = await fetcher();
        onTick(data);
        if (isDone(data)) {
          delete pollTimers.current[key];
          onDone?.();
          return;
        }
      } catch {
        delete pollTimers.current[key];
        return;
      }
      pollTimers.current[key] = setTimeout(tick, 2000);
    };

    pollTimers.current[key] = setTimeout(tick, 2000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cols = await adminApi.listNftCollections();
      setCollections(cols);
      setStates(prev => {
        const next: Record<string, CollectionState> = {};
        for (const c of cols) next[c.id] = prev[c.id] ?? emptyState();
        return next;
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load collections then probe all three job statuses per collection
  // and re-attach polling for any that are already running (survives navigation).
  useEffect(() => {
    let cancelled = false;

    async function init() {
      let cols: NftCollection[] = [];
      try {
        cols = await adminApi.listNftCollections();
        if (cancelled) return;
        setCollections(cols);
        setStates(prev => {
          const next: Record<string, CollectionState> = {};
          for (const c of cols) next[c.id] = prev[c.id] ?? emptyState();
          return next;
        });
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) { setError(e.message || 'Failed to load'); setLoading(false); }
        return;
      }

      // Probe all three job statuses in parallel and resume any running ones.
      await Promise.all(cols.map(async (col) => {
        try {
          const [importSt, instancesSt, refreshSt] = await Promise.all([
            adminApi.getImportCacheStatus(col.id),
            adminApi.getCreateInstancesStatus(col.id),
            adminApi.getRefreshStatus(col.id),
          ]);
          if (cancelled) return;

          patchState(col.id, {
            importStatus: importSt.status !== 'idle' ? importSt : null,
            instancesStatus: instancesSt.status !== 'idle' ? instancesSt : null,
            refreshStatus: refreshSt.status !== 'idle' ? refreshSt : null,
          });

          if (importSt.status === 'running') {
            startPoll(
              `import_${col.id}`,
              () => adminApi.getImportCacheStatus(col.id),
              st => patchState(col.id, { importStatus: st }),
              st => st.status !== 'running',
              load,
            );
          }
          if (instancesSt.status === 'running') {
            startPoll(
              `instances_${col.id}`,
              () => adminApi.getCreateInstancesStatus(col.id),
              st => patchState(col.id, { instancesStatus: st }),
              st => st.status !== 'running',
              load,
            );
          }
          if (refreshSt.status === 'running') {
            startPoll(
              `refresh_${col.id}`,
              () => adminApi.getRefreshStatus(col.id),
              st => patchState(col.id, { refreshStatus: st }),
              st => st.status !== 'running',
            );
          }
        } catch {
          // Status probe failure is non-fatal
        }
      }));
    }

    init();
    return () => {
      cancelled = true;
      for (const t of Object.values(pollTimers.current)) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImportCache(id: string) {
    patchState(id, { importLoading: true, importError: null, importStatus: null });
    try {
      await adminApi.importNftCollectionCache(id);
      const st = await adminApi.getImportCacheStatus(id);
      patchState(id, { importStatus: st, importLoading: false });
      if (st.status === 'running') {
        startPoll(
          `import_${id}`,
          () => adminApi.getImportCacheStatus(id),
          s => patchState(id, { importStatus: s }),
          s => s.status !== 'running',
          load,
        );
      }
    } catch (e: any) {
      patchState(id, { importError: e.message || 'Failed to start import', importLoading: false });
    }
  }

  async function handleCreateInstances(id: string) {
    patchState(id, { instancesLoading: true, instancesError: null, instancesStatus: null });
    try {
      await adminApi.createNftInstances(id);
      const st = await adminApi.getCreateInstancesStatus(id);
      patchState(id, { instancesStatus: st, instancesLoading: false });
      if (st.status === 'running') {
        startPoll(
          `instances_${id}`,
          () => adminApi.getCreateInstancesStatus(id),
          s => patchState(id, { instancesStatus: s }),
          s => s.status !== 'running',
          load,
        );
      }
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
      if (st.status === 'running') {
        startPoll(
          `refresh_${id}`,
          () => adminApi.getRefreshStatus(id),
          s => patchState(id, { refreshStatus: s }),
          s => s.status !== 'running',
        );
      }
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
    return <div style={{ padding: 32, color: '#8888aa', textAlign: 'center' }}>Loading NFT collections…</div>;
  }

  if (error) {
    return <div className="av2-inline-msg error" style={{ margin: 32 }}>{error}</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e2f2' }}>NFT Collections</div>
          <div style={{ fontSize: 12, color: '#8888aa', marginTop: 2 }}>
            Manage collection cache imports and game instance creation
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {seedResult && (
            <span style={{ fontSize: 12, color: seedResult.skipped ? '#f59e0b' : '#34d399' }}>
              {seedResult.skipped ? '⚠ Seed skipped (entities already exist)' : `✓ Seeded ${seedResult.inserted} entities`}
            </span>
          )}
          {seedError && <span style={{ fontSize: 12, color: '#f87171' }}>{seedError}</span>}
          <button
            className="av2-btn-ghost"
            onClick={handleSeed}
            disabled={seedLoading}
            title="Seed NFT entities from the bundled JSON file. Only runs if no NFT entities exist yet."
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
          const instanceLabel = isEntityBacked ? 'Entity instances' : 'Location instances';

          return (
            <div key={col.id} className="av2-card" style={{ padding: 20, gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e2f2' }}>{col.name}</span>
                    {!col.active && (
                      <span style={{ background: '#3a1a1a', color: '#f87171', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8888aa', marginTop: 3, fontFamily: 'monospace' }}>{col.id}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#8888aa' }}>
                  <div>
                    <span style={{ color: '#b0b0d0' }}>{col.chain}</span>
                    {' · '}
                    <span style={{ color: '#6366f1' }}>{col.mintMode}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {isEntityBacked
                      ? <span>entity: <span style={{ color: '#c084fc' }}>{col.entityDefinitionId}</span></span>
                      : <span>location: <span style={{ color: '#34d399' }}>{col.locationDefinitionId}</span></span>
                    }
                  </div>
                </div>
              </div>

              <div style={{
                background: '#12122a', borderRadius: 6, padding: '8px 12px',
                marginBottom: 14, display: 'flex', gap: 24, fontSize: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <span style={{ color: '#8888aa' }}>Cached assets: </span>
                  <span style={{ color: hasCache ? '#60a5fa' : '#f87171', fontWeight: 700 }}>
                    {col._count.nftAssets}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#8888aa' }}>{instanceLabel}: </span>
                  <span style={{ color: col.instanceCount > 0 ? '#34d399' : '#8888aa', fontWeight: 700 }}>
                    {col.instanceCount}
                  </span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ color: '#8888aa' }}>Policy: </span>
                  <span style={{ color: '#b0b0d0', fontFamily: 'monospace' }}>
                    {col.collectionId.length > 32 ? col.collectionId.slice(0, 32) + '…' : col.collectionId}
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

                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: 11, color: '#8888aa', marginBottom: 4 }}>
                      Step 2: Create {isEntityBacked ? 'character' : 'location'} instances
                    </div>
                    <button
                      className="av2-btn-primary"
                      onClick={() => handleCreateInstances(col.id)}
                      disabled={st.instancesLoading || st.instancesStatus?.status === 'running' || !hasCache}
                      title={!hasCache ? 'Run Import Cache first to populate the asset cache' : undefined}
                    >
                      {st.instancesLoading || st.instancesStatus?.status === 'running'
                        ? 'Creating…'
                        : 'Create Instances'}
                    </button>
                  </div>

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

                {st.importError && <div className="av2-inline-msg error">{st.importError}</div>}
                {st.importStatus && (
                  <ProgressBlock
                    label="Import cache"
                    status={st.importStatus}
                    extra={st.importStatus.status === 'done' && (
                      <div style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>
                        ✓ {st.importStatus.upserted} upserted
                        {st.importStatus.failed > 0 && (
                          <span style={{ color: '#f87171', marginLeft: 8 }}>{st.importStatus.failed} failed</span>
                        )}
                      </div>
                    )}
                  />
                )}

                {st.instancesError && <div className="av2-inline-msg error">{st.instancesError}</div>}
                {st.instancesStatus && (
                  <ProgressBlock
                    label={`Create ${isEntityBacked ? 'character' : 'location'} instances`}
                    status={st.instancesStatus}
                    extra={st.instancesStatus.status === 'done' && (
                      <div style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>
                        ✓ {st.instancesStatus.upserted} processed
                        {st.instancesStatus.failed > 0 && (
                          <span style={{ color: '#f87171', marginLeft: 8 }}>{st.instancesStatus.failed} failed</span>
                        )}
                      </div>
                    )}
                  />
                )}

                {st.refreshError && <div className="av2-inline-msg error">{st.refreshError}</div>}
                {st.refreshStatus && (
                  <ProgressBlock
                    label="Ownership refresh"
                    status={{ ...st.refreshStatus, upserted: st.refreshStatus.updated }}
                    extra={st.refreshStatus.status === 'done' && (
                      <div style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>
                        ✓ {st.refreshStatus.updated} updated
                        {st.refreshStatus.failed > 0 && (
                          <span style={{ color: '#f87171', marginLeft: 8 }}>{st.refreshStatus.failed} failed</span>
                        )}
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

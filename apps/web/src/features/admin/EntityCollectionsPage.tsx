import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from './adminApi';

type CollectionRow = {
  definitionId: string;
  definitionName: string;
  speciesId: string | null;
  totalCount: number;
  nftCount: number;
  claimedNftCount: number;
  avgLevel: number | null;
  jobStatus: JobStatus | null;
};

type JobStatus = {
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  updated: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

const CARD = "bg-[#0d0e1f] border border-[#1a1b35] rounded-[10px] p-4 mb-3";
const MSG_SUCCESS = "py-2 px-3 rounded-[6px] text-[12px] bg-[rgba(5,150,105,0.12)] border border-[rgba(5,150,105,0.3)] text-[#34d399] mt-2";
const MSG_ERROR = "py-2 px-3 rounded-[6px] text-[12px] bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] text-[#f87171] mt-2";

function progressPct(job: JobStatus): number {
  if (!job.total) return 0;
  return Math.min(100, Math.round((job.processed / job.total) * 100));
}

function JobStatusBadge({ job }: { job: JobStatus | null }) {
  if (!job) return null;
  const pct = progressPct(job);
  const color =
    job.status === 'running' ? '#a78bfa' :
    job.status === 'done' ? '#34d399' :
    '#f87171';

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>
          {job.status === 'running' && `Rebuilding… ${pct}%`}
          {job.status === 'done' && `Done — updated ${job.updated}, failed ${job.failed}`}
          {job.status === 'error' && `Error: ${job.error ?? 'unknown'}`}
        </span>
        <span style={{ fontSize: 10, color: '#3a3a6a' }}>
          {job.processed}/{job.total}
        </span>
      </div>
      {job.status === 'running' && (
        <div style={{ height: 4, background: '#1a1b35', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#7c3aed', transition: 'width 0.4s ease' }} />
        </div>
      )}
    </div>
  );
}

export default function EntityCollectionsPage() {
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; type: 'success' | 'error' }>>({});

  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getEntityCollections()
      .then((rows) => setCollections(rows as CollectionRow[]))
      .catch((e: any) => setError(e.message || 'Failed to load collections'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startPoll = useCallback((definitionId: string) => {
    if (pollRef.current[definitionId]) return;
    pollRef.current[definitionId] = setInterval(async () => {
      try {
        const job = await adminApi.getEntityCollectionJobStatus(definitionId);
        setCollections((prev) =>
          prev.map((c) =>
            c.definitionId === definitionId
              ? { ...c, jobStatus: job as JobStatus }
              : c,
          ),
        );
        if (job.status !== 'running') {
          clearInterval(pollRef.current[definitionId]);
          delete pollRef.current[definitionId];
          load();
        }
      } catch {}
    }, 1500);
  }, [load]);

  useEffect(() => {
    return () => {
      Object.values(pollRef.current).forEach(clearInterval);
    };
  }, []);

  const handleStartRebuild = async (definitionId: string) => {
    if (!window.confirm(
      `This will re-derive traits + stats + level for ALL entities in this collection from their stored seeds.\n\nThis cannot be undone. Proceed?`
    )) return;

    setStartingId(definitionId);
    setMsgs((prev) => { const n = { ...prev }; delete n[definitionId]; return n; });
    try {
      const result = await adminApi.startEntityCollectionRebuild(definitionId);
      setMsgs((prev) => ({ ...prev, [definitionId]: { text: `Rebuild started — ${result.total} entities queued`, type: 'success' } }));
      setCollections((prev) =>
        prev.map((c) =>
          c.definitionId === definitionId
            ? { ...c, jobStatus: { status: 'running', total: result.total, processed: 0, updated: 0, failed: 0 } }
            : c,
        ),
      );
      startPoll(definitionId);
    } catch (e: any) {
      setMsgs((prev) => ({ ...prev, [definitionId]: { text: e.message || 'Failed to start rebuild', type: 'error' } }));
    } finally {
      setStartingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-[60px] text-[#4a4a7a] text-[13px]">
        Loading collections…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className={MSG_ERROR}>{error}</div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[900px]">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#c0c0e8', marginBottom: 4 }}>Entity Collections</div>
        <div style={{ fontSize: 12, color: '#5a5a8a', lineHeight: 1.5 }}>
          Aggregate view of all entity definitions. Super-admins can trigger a full rebuild — this re-derives
          base traits, stats, and level from each entity's stored seed and NFT attributes.
        </div>
      </div>

      {collections.length === 0 && (
        <div className="flex items-center justify-center py-[40px] text-[#3a3a6a] text-[13px] italic">
          No entity definitions found.
        </div>
      )}

      {collections.map((col) => {
        const job = col.jobStatus;
        const isRunning = job?.status === 'running';
        const isStarting = startingId === col.definitionId;

        return (
          <div key={col.definitionId} className={CARD}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#c0c0e8' }}>
                    {col.definitionName}
                  </span>
                  {col.speciesId && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.25)',
                      color: '#8080c8', borderRadius: 4, padding: '1px 6px',
                    }}>
                      {col.speciesId}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#3a3a6a', marginTop: 2, fontFamily: 'monospace' }}>
                  {col.definitionId}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#5a5a8a' }}>Total: </span>
                    <span style={{ color: '#c0c0e8', fontWeight: 600 }}>{col.totalCount.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#5a5a8a' }}>NFT-backed: </span>
                    <span style={{ color: '#c0c0e8', fontWeight: 600 }}>{col.nftCount.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#5a5a8a' }}>Claimed: </span>
                    <span style={{ color: '#c0c0e8', fontWeight: 600 }}>{col.claimedNftCount.toLocaleString()}</span>
                  </div>
                  {col.avgLevel != null && (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: '#5a5a8a' }}>Avg Level: </span>
                      <span style={{ color: '#c0c0e8', fontWeight: 600 }}>{col.avgLevel.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleStartRebuild(col.definitionId)}
                disabled={isRunning || isStarting}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: isRunning || isStarting ? 'default' : 'pointer',
                  background: isRunning || isStarting ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.35)',
                  border: '1px solid rgba(124,58,237,0.5)', borderRadius: 6, color: '#c4b5fd',
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >
                {isStarting ? 'Starting…' : isRunning ? 'Running…' : '⚙ Rebuild All'}
              </button>
            </div>

            <JobStatusBadge job={job} />

            {msgs[col.definitionId] && (
              <div className={msgs[col.definitionId].type === 'success' ? MSG_SUCCESS : MSG_ERROR}>
                {msgs[col.definitionId].text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

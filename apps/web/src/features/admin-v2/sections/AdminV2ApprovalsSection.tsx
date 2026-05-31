import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

export default function AdminV2ApprovalsSection({ me }: Props) {
  const canApprove = me.role.permissionFlags.approve;

  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const data = await adminApi.listDrafts({ status: statusFilter, limit: 50 });
      setDrafts(data);
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to load drafts', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setActing(id);
    setMsg(null);
    try {
      await adminApi.approveDraft(id);
      setMsg({ text: 'Draft approved', type: 'success' });
      await load();
    } catch (e: any) {
      setMsg({ text: e.message || 'Approve failed', type: 'error' });
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    setActing(id);
    setMsg(null);
    try {
      await adminApi.rejectDraft(id, rejectComment || undefined);
      setMsg({ text: 'Draft rejected', type: 'success' });
      setRejectTarget(null);
      setRejectComment('');
      await load();
    } catch (e: any) {
      setMsg({ text: e.message || 'Reject failed', type: 'error' });
    } finally {
      setActing(null);
    }
  };

  if (!canApprove) {
    return (
      <div className="av2-access-denied">
        <div className="av2-access-denied-icon">🔒</div>
        <div>You don't have approval permissions.</div>
      </div>
    );
  }

  return (
    <div className="av2-section-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['pending', 'approved', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 12px',
                border: '1px solid',
                borderColor: statusFilter === s ? '#6c63ff' : '#1a1b35',
                borderRadius: 6,
                background: statusFilter === s ? 'rgba(108,99,255,0.18)' : 'none',
                color: statusFilter === s ? '#a89fff' : '#5a5a8a',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto', padding: '5px 12px', background: '#1a1b35', border: '1px solid #2a2b45', borderRadius: 6, color: '#8080b0', fontSize: 12, cursor: 'pointer' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {msg && (
        <div className={`av2-inline-msg ${msg.type}`} style={{ marginBottom: 14 }}>{msg.text}</div>
      )}

      {loading && <div className="av2-loading">Loading drafts…</div>}

      {!loading && drafts.length === 0 && (
        <div className="av2-empty">No {statusFilter} drafts.</div>
      )}

      <div className="av2-approvals-list">
        {drafts.map(draft => (
          <div key={draft.id} className="av2-draft-card">
            <div className="av2-draft-meta">
              <span className="av2-draft-table">{draft.tableName}</span>
              <span className="av2-draft-op">{draft.operation}</span>
              {draft.recordId && (
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#3a3a6a' }}>
                  {draft.recordId}
                </span>
              )}
              <span className="av2-draft-author">
                {draft.author?.username ?? draft.authorId} · {new Date(draft.createdAt).toLocaleDateString()}
              </span>
            </div>

            {draft.reviewComment && (
              <div style={{ fontSize: 12, color: '#5a5a8a', marginBottom: 8, fontStyle: 'italic' }}>
                "{draft.reviewComment}"
              </div>
            )}

            <div className="av2-draft-summary">
              {draft.operation === 'CREATE' && 'New record to be created'}
              {draft.operation === 'UPDATE' && `${Object.keys(draft.changes || {}).length} field(s) changed`}
              {draft.operation === 'DELETE' && 'Record to be deleted'}
            </div>

            {statusFilter === 'pending' && (
              <div>
                {rejectTarget === draft.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Reject reason (optional)"
                      value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)}
                      className="av2-search-input"
                      style={{ flex: 1, minWidth: 180 }}
                    />
                    <button
                      className="av2-btn-reject"
                      disabled={acting === draft.id}
                      onClick={() => handleReject(draft.id)}
                    >
                      {acting === draft.id ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                    <button
                      onClick={() => setRejectTarget(null)}
                      style={{ padding: '5px 10px', background: 'none', border: '1px solid #1a1b35', borderRadius: 6, color: '#5a5a8a', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="av2-draft-actions">
                    <button
                      className="av2-btn-approve"
                      disabled={acting === draft.id}
                      onClick={() => handleApprove(draft.id)}
                    >
                      {acting === draft.id ? 'Approving…' : '✓ Approve'}
                    </button>
                    <button
                      className="av2-btn-reject"
                      disabled={!!acting}
                      onClick={() => setRejectTarget(draft.id)}
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

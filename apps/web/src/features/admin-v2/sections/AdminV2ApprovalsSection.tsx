import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

const BTN_APPROVE = "py-[5px] px-[12px] bg-[rgba(5,150,105,0.15)] border border-[rgba(5,150,105,0.4)] rounded-[6px] text-[#34d399] text-[12px] font-semibold cursor-pointer transition-colors duration-[120ms] hover:bg-[rgba(5,150,105,0.25)] disabled:opacity-45 disabled:cursor-not-allowed";
const BTN_REJECT = "py-[5px] px-[12px] bg-[rgba(220,38,38,0.12)] border border-[rgba(220,38,38,0.3)] rounded-[6px] text-[#f87171] text-[12px] font-semibold cursor-pointer transition-colors duration-[120ms] hover:bg-[rgba(220,38,38,0.22)] disabled:opacity-45 disabled:cursor-not-allowed";

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
      <div className="flex flex-col items-center justify-center py-[60px] px-6 text-center text-[#4a4a7a]">
        <div className="text-[36px] mb-3 opacity-40">🔒</div>
        <div>You don't have approval permissions.</div>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-[1200px]">
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
        <div
          className={`py-2 px-3 rounded-[6px] text-[12px] mb-[14px] ${
            msg.type === 'success'
              ? 'bg-[rgba(5,150,105,0.12)] border border-[rgba(5,150,105,0.3)] text-[#34d399]'
              : 'bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] text-[#f87171]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading && <div className="flex items-center justify-center p-[60px] text-[#4a4a7a] text-[13px]">Loading drafts…</div>}

      {!loading && drafts.length === 0 && (
        <div className="flex items-center justify-center p-[40px] text-[#3a3a6a] text-[13px] italic">No {statusFilter} drafts.</div>
      )}

      <div className="flex flex-col gap-[10px]">
        {drafts.map(draft => (
          <div key={draft.id} className="bg-[#0d0e1f] border border-[#1a1b35] rounded-[10px] py-[14px] px-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[11px] font-bold tracking-[0.05em] bg-[rgba(108,99,255,0.15)] text-[#8080c8] border border-[rgba(108,99,255,0.25)] py-[2px] px-[6px] rounded">{draft.tableName}</span>
              <span className="text-[11px] font-semibold text-[#6060a0]">{draft.operation}</span>
              {draft.recordId && (
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#3a3a6a' }}>
                  {draft.recordId}
                </span>
              )}
              <span className="text-[11px] text-[#4a4a7a] ml-auto">
                {draft.author?.username ?? draft.authorId} · {new Date(draft.createdAt).toLocaleDateString()}
              </span>
            </div>

            {draft.reviewComment && (
              <div style={{ fontSize: 12, color: '#5a5a8a', marginBottom: 8, fontStyle: 'italic' }}>
                "{draft.reviewComment}"
              </div>
            )}

            <div className="text-[13px] text-[#8080a8] mb-[10px]">
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
                      className="flex-1 py-2 px-3 bg-[#080918] border border-[#1a1b35] rounded-[8px] text-[#d4d4f0] text-[13px] focus:outline-none focus:border-[#6c63ff]"
                      style={{ minWidth: 180 }}
                    />
                    <button
                      className={BTN_REJECT}
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
                  <div className="flex gap-2">
                    <button
                      className={BTN_APPROVE}
                      disabled={acting === draft.id}
                      onClick={() => handleApprove(draft.id)}
                    >
                      {acting === draft.id ? 'Approving…' : '✓ Approve'}
                    </button>
                    <button
                      className={BTN_REJECT}
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

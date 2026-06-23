import { useState } from 'react';
import { adminApi } from '../adminApi';
import { RefreshCw, Upload, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

type SnapshotResult = Record<string, { uploaded: boolean; count: number; error?: string }>;
type SeedResult = { tables: string | string[]; results: Record<string, { upserted: number; skipped: number; errors: number }> };

type OpState =
  | { status: 'idle' }
  | { status: 'running'; label: string }
  | { status: 'done'; label: string; snapshot?: SnapshotResult; seed?: SeedResult }
  | { status: 'error'; label: string; message: string };

export default function SeedManagementPage() {
  const [op, setOp] = useState<OpState>({ status: 'idle' });

  const runSnapshot = async () => {
    setOp({ status: 'running', label: 'Exporting snapshot to Object Storage…' });
    try {
      const result = await adminApi.createSeedSnapshot();
      setOp({ status: 'done', label: 'Snapshot exported', snapshot: result });
    } catch (err: any) {
      setOp({ status: 'error', label: 'Snapshot failed', message: err.message ?? String(err) });
    }
  };

  const runSeed = async () => {
    setOp({ status: 'running', label: 'Pulling seed from Object Storage and applying to DB…' });
    try {
      const result = await adminApi.runSeed();
      setOp({ status: 'done', label: 'Seed applied', seed: result });
    } catch (err: any) {
      setOp({ status: 'error', label: 'Seed failed', message: err.message ?? String(err) });
    }
  };

  const busy = op.status === 'running';

  return (
    <div className="p-6 max-w-2xl">
      <div className="text-[15px] font-bold text-[#d4d4f0] mb-1">Seed Management</div>
      <div className="text-[12px] text-[#5a5a8a] mb-6">
        Sync definition data between environments via shared Object Storage. Both dev and prod
        auto-apply the seed on startup — use these tools to manually push or pull.
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <ActionCard
          icon={<Upload size={16} />}
          title="Export Snapshot"
          description="Dump all definition tables from this environment's DB into Object Storage. Run this in production to make it the source of truth."
          buttonLabel="Export Snapshot"
          onClick={runSnapshot}
          disabled={busy}
          accent="#6c63ff"
        />
        <ActionCard
          icon={<Download size={16} />}
          title="Apply Seed"
          description="Pull the latest snapshot from Object Storage and upsert it into this environment's DB. Run this in dev after exporting from production."
          buttonLabel="Apply Seed"
          onClick={runSeed}
          disabled={busy}
          accent="#34d399"
        />
      </div>

      {op.status === 'running' && (
        <StatusBox color="blue">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          <span>{op.label}</span>
        </StatusBox>
      )}

      {op.status === 'error' && (
        <StatusBox color="red">
          <XCircle size={14} className="flex-shrink-0" />
          <div>
            <div className="font-semibold">{op.label}</div>
            <div className="text-[11px] opacity-80 mt-[2px]">{op.message}</div>
          </div>
        </StatusBox>
      )}

      {op.status === 'done' && op.snapshot && (
        <ResultTable
          title="Snapshot Results"
          rows={Object.entries(op.snapshot).map(([table, r]) => ({
            table,
            col1: r.uploaded ? `${r.count} rows` : '—',
            col1Label: 'Rows',
            col2: r.error ?? (r.uploaded ? 'OK' : 'skipped'),
            col2Label: 'Status',
            ok: r.uploaded && !r.error,
          }))}
        />
      )}

      {op.status === 'done' && op.seed && (
        <ResultTable
          title="Seed Results"
          rows={Object.entries(op.seed.results).map(([table, r]) => ({
            table,
            col1: `${r.upserted} upserted`,
            col1Label: 'Upserted',
            col2: r.errors > 0 ? `${r.errors} errors` : (r.skipped > 0 ? `${r.skipped} skipped` : 'OK'),
            col2Label: 'Status',
            ok: r.errors === 0,
          }))}
        />
      )}
    </div>
  );
}

function ActionCard({
  icon, title, description, buttonLabel, onClick, disabled, accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  disabled: boolean;
  accent: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-[10px] border border-[#1a1b35] bg-[#0a0b1c]">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center"
        style={{ background: `${accent}22`, color: accent }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#d4d4f0] mb-[3px]">{title}</div>
        <div className="text-[11px] text-[#5a5a8a] leading-[1.5]">{description}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex-shrink-0 py-[6px] px-4 rounded-[7px] text-[12px] font-semibold border-0 cursor-pointer transition-opacity duration-[120ms] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: accent }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function StatusBox({ color, children }: { color: 'blue' | 'red'; children: React.ReactNode }) {
  const styles = {
    blue: 'bg-[rgba(96,165,250,0.08)] border-[rgba(96,165,250,0.2)] text-[#93c5fd]',
    red: 'bg-[rgba(220,38,38,0.08)] border-[rgba(220,38,38,0.2)] text-[#f87171]',
  };
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-[8px] border text-[12px] ${styles[color]}`}>
      {children}
    </div>
  );
}

function ResultTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ table: string; col1: string; col1Label: string; col2: string; col2Label: string; ok: boolean }>;
}) {
  const hasErrors = rows.some(r => !r.ok);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        {hasErrors
          ? <AlertTriangle size={13} className="text-[#fbbf24]" />
          : <CheckCircle size={13} className="text-[#34d399]" />}
        <span className="text-[12px] font-semibold text-[#d4d4f0]">{title}</span>
      </div>
      <div className="rounded-[8px] border border-[#1a1b35] overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#1a1b35] bg-[#0a0b1c]">
              <th className="text-left px-3 py-[6px] text-[#4a4a7a] font-semibold uppercase tracking-[0.05em]">Table</th>
              <th className="text-right px-3 py-[6px] text-[#4a4a7a] font-semibold uppercase tracking-[0.05em]">{rows[0]?.col1Label}</th>
              <th className="text-right px-3 py-[6px] text-[#4a4a7a] font-semibold uppercase tracking-[0.05em]">{rows[0]?.col2Label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.table} className="border-b border-[#1a1b35] last:border-0">
                <td className="px-3 py-[5px] text-[#8080b0] font-mono">{r.table}</td>
                <td className="px-3 py-[5px] text-right text-[#6060a0]">{r.col1}</td>
                <td className={`px-3 py-[5px] text-right font-semibold ${r.ok ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{r.col2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

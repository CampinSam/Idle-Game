import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { adminApi } from '../../admin/adminApi';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

interface MetricValue {
  name: string;
  value: number | null;
  unit: string;
  label: string;
  description: string;
  status: 'green' | 'yellow' | 'red' | 'neutral';
  benchmark: string;
}

const STATUS_COLOR: Record<string, string> = {
  green: '#34d399',
  yellow: '#f59e0b',
  red: '#f87171',
  neutral: '#6060a0',
};

const STATUS_BG: Record<string, string> = {
  green: 'rgba(52, 211, 153, 0.08)',
  yellow: 'rgba(245, 158, 11, 0.08)',
  red: 'rgba(248, 113, 113, 0.08)',
  neutral: 'transparent',
};

const CHART_COLORS = ['#6c63ff', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#60a5fa'];

const DAY_OPTIONS = [7, 30, 90] as const;
type DayRange = typeof DAY_OPTIONS[number];

const METRIC_GROUPS = [
  {
    label: 'Engagement',
    names: ['dau', 'wau', 'mau', 'dau_mau_ratio', 'total_players'],
  },
  {
    label: 'Retention',
    names: ['d1_retention', 'd7_retention', 'd30_retention'],
  },
  {
    label: 'Participation',
    names: ['sessions_per_day', 'mission_participation_rate', 'completed_missions_24h'],
  },
  {
    label: 'Economy',
    names: ['arcanium_generated', 'arcanium_spent', 'essence_earned', 'essence_spent'],
  },
];

const CHARTS: Array<{ title: string; metrics: string[]; labels: Record<string, string> }> = [
  {
    title: 'Player Activity',
    metrics: ['dau', 'wau', 'mau'],
    labels: { dau: 'DAU', wau: 'WAU', mau: 'MAU' },
  },
  {
    title: 'Retention Rates (%)',
    metrics: ['d1_retention', 'd7_retention', 'd30_retention'],
    labels: { d1_retention: 'D1', d7_retention: 'D7', d30_retention: 'D30' },
  },
  {
    title: 'Arcanium (7-day)',
    metrics: ['arcanium_generated', 'arcanium_spent'],
    labels: { arcanium_generated: 'Generated', arcanium_spent: 'Spent' },
  },
  {
    title: 'Essence (7-day)',
    metrics: ['essence_earned', 'essence_spent'],
    labels: { essence_earned: 'Earned', essence_spent: 'Spent' },
  },
];

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === '%') return `${value}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function MetricCard({ metric }: { metric: MetricValue }) {
  const color = STATUS_COLOR[metric.status];
  const bg = STATUS_BG[metric.status];

  return (
    <div
      className="av2-card"
      style={{
        borderTop: `2px solid ${color}`,
        background: `linear-gradient(135deg, #0d0e1f 80%, ${bg})`,
      }}
      title={metric.description}
    >
      <div className="av2-card-title">{metric.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
          {formatValue(metric.value, metric.unit)}
        </div>
        {metric.unit !== '%' && metric.unit !== 'players' && metric.unit !== 'accounts' && metric.unit !== 'missions' && (
          <div style={{ fontSize: 11, color: '#4a4a7a' }}>{metric.unit}</div>
        )}
      </div>
      <div className="av2-card-sub" style={{ marginTop: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            marginRight: 5,
            verticalAlign: 'middle',
          }}
        />
        {metric.benchmark}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  metrics,
  labels,
  history,
  loading,
}: {
  title: string;
  metrics: string[];
  labels: Record<string, string>;
  history: Record<string, Array<{ date: string; value: number }>>;
  loading: boolean;
}) {
  const allDates = new Set<string>();
  for (const name of metrics) {
    for (const pt of (history[name] ?? [])) {
      allDates.add(pt.date);
    }
  }
  const sortedDates = Array.from(allDates).sort();
  const chartData = sortedDates.map(date => {
    const row: Record<string, any> = { date };
    for (const name of metrics) {
      const pt = history[name]?.find(p => p.date === date);
      row[name] = pt?.value ?? null;
    }
    return row;
  });

  return (
    <div className="av2-card">
      <div className="av2-card-title" style={{ marginBottom: 16 }}>
        <TrendingUp size={11} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
        {title}
      </div>
      {loading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 12 }}>
          Loading chart data…
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a6a', fontSize: 12, fontStyle: 'italic' }}>
          No historical data yet — use "Record Snapshot" to start collecting.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1b35" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#4a4a7a' }}
              tickFormatter={d => d.slice(5)}
            />
            <YAxis tick={{ fontSize: 10, fill: '#4a4a7a' }} width={36} />
            <Tooltip
              contentStyle={{ background: '#0d0e1f', border: '1px solid #1a1b35', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#d4d4f0' }}
              itemStyle={{ color: '#a0a0c8' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#6060a0', paddingTop: 8 }} />
            {metrics.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={labels[name] ?? name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function AdminV2MetricsSection({ me: _me }: Props) {
  const [metrics, setMetrics] = useState<MetricValue[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [history, setHistory] = useState<Record<string, Array<{ date: string; value: number }>>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dayRange, setDayRange] = useState<DayRange>(30);
  const [recordingSnapshot, setRecordingSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allHistoryMetrics = CHARTS.flatMap(c => c.metrics);

  const fetchMetrics = useCallback(() => {
    setLoadingMetrics(true);
    setError(null);
    adminApi.getGameHealthMetrics()
      .then(data => {
        setMetrics(data.metrics);
        setComputedAt(data.computedAt);
      })
      .catch(err => setError(err.message || 'Failed to load metrics'))
      .finally(() => setLoadingMetrics(false));
  }, []);

  const fetchHistory = useCallback(() => {
    setLoadingHistory(true);
    adminApi.getMetricHistory(allHistoryMetrics, dayRange)
      .then(setHistory)
      .catch(() => setHistory({}))
      .finally(() => setLoadingHistory(false));
  }, [dayRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRecordSnapshot = async () => {
    setRecordingSnapshot(true);
    setSnapshotMsg(null);
    try {
      await adminApi.recordMetricSnapshot();
      setSnapshotMsg('Snapshot recorded successfully.');
      fetchHistory();
    } catch (err: any) {
      setSnapshotMsg(err.message || 'Failed to record snapshot');
    } finally {
      setRecordingSnapshot(false);
    }
  };

  const metricMap = Object.fromEntries(metrics.map(m => [m.name, m]));

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#d4d4f0', margin: 0 }}>Game Health Metrics</h1>
          <p style={{ fontSize: 12, color: '#4a4a7a', margin: '3px 0 0' }}>
            {computedAt
              ? `Last computed: ${new Date(computedAt).toLocaleString()} · 5-min cache`
              : 'Loading…'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="av2-btn-ghost"
            onClick={fetchMetrics}
            disabled={loadingMetrics}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} style={{ transform: loadingMetrics ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
            Refresh
          </button>
          <button
            className="av2-btn-ghost"
            onClick={handleRecordSnapshot}
            disabled={recordingSnapshot}
          >
            {recordingSnapshot ? 'Recording…' : 'Record Snapshot'}
          </button>
        </div>
      </div>

      {error && (
        <div className="av2-inline-msg error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {snapshotMsg && (
        <div
          className="av2-inline-msg"
          style={{ marginBottom: 16, color: snapshotMsg.includes('success') ? '#34d399' : '#f87171' }}
        >
          {snapshotMsg}
        </div>
      )}

      {/* Snapshot Cards — grouped */}
      {METRIC_GROUPS.map(group => {
        const groupMetrics = group.names.map(n => metricMap[n]).filter(Boolean);
        if (groupMetrics.length === 0 && !loadingMetrics) return null;
        return (
          <div key={group.label} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3a3b5e', marginBottom: 10 }}>
              {group.label}
            </div>
            <div className="av2-dashboard-grid" style={{ padding: 0 }}>
              {loadingMetrics && groupMetrics.length === 0
                ? Array.from({ length: group.names.length }).map((_, i) => (
                  <div key={i} className="av2-card" style={{ height: 80, background: '#0d0e1f' }} />
                ))
                : groupMetrics.map(m => <MetricCard key={m.name} metric={m} />)
              }
            </div>
          </div>
        );
      })}

      {/* Time-series Charts */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3a3b5e' }}>
            Historical Trends
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {DAY_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDayRange(d)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 5,
                  border: '1px solid',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: dayRange === d ? 'rgba(108,99,255,0.2)' : 'transparent',
                  borderColor: dayRange === d ? 'rgba(108,99,255,0.5)' : '#1a1b35',
                  color: dayRange === d ? '#a89fff' : '#4a4a7a',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 16 }}>
          {CHARTS.map(chart => (
            <ChartPanel
              key={chart.title}
              title={chart.title}
              metrics={chart.metrics}
              labels={chart.labels}
              history={history}
              loading={loadingHistory}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

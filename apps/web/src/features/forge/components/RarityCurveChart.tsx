import { useMemo } from 'react';
import { qualityProbabilities } from '@derp/math';
import { QUALITY_COLOURS } from './forgeUtils';

const CL_MAX = 170;
const STEPS = 180;

interface Point {
  i: number;
  y: number;
  color: string;
}

interface ColorRun {
  iStart: number;
  iEnd: number;
  points: Point[];
  color: string;
}

function computePoints(centerOverrides: Partial<Record<string, number>>): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const cl = (i / STEPS) * CL_MAX;
    const probs = qualityProbabilities(cl, centerOverrides);
    const nonFail = probs.filter((p) => p.key !== 'failure');
    const dominant =
      nonFail.length > 0
        ? nonFail.reduce((a, b) => (a.probability >= b.probability ? a : b))
        : probs[0];
    const color = QUALITY_COLOURS[dominant?.key ?? 'common'] ?? '#94a3b8';
    pts.push({ i, y: dominant?.probability ?? 0, color });
  }
  return pts;
}

function buildRuns(pts: Point[]): ColorRun[] {
  const runs: ColorRun[] = [];
  let i = 0;
  while (i < pts.length) {
    const color = pts[i].color;
    let j = i;
    while (j < pts.length && pts[j].color === color) j++;
    runs.push({ iStart: i, iEnd: j - 1, points: pts.slice(i, j), color });
    i = j;
  }
  return runs;
}

interface RarityCurveChartProps {
  entityCl?: number | null;
  centerOverrides?: Partial<Record<string, number>>;
  className?: string;
}

export function RarityCurveChart({ entityCl, centerOverrides = {}, className }: RarityCurveChartProps) {
  const W = 240;
  const H = 80;
  const PAD_X = 1;
  const PAD_Y = 4;

  const { maxY, runs } = useMemo(() => {
    const pts = computePoints(centerOverrides);
    let m = 0;
    for (const p of pts) if (p.y > m) m = p.y;
    return { maxY: Math.max(m, 0.01), runs: buildRuns(pts) };
  }, [centerOverrides]);

  const xOf = (i: number) => PAD_X + (i / STEPS) * (W - 2 * PAD_X);
  const yOf = (v: number) => H - PAD_Y - (v / maxY) * (H - 2 * PAD_Y);

  const paths = useMemo(() =>
    runs
      .map((run) => {
        const pts = run.points;
        if (pts.length < 1) return null;
        const firstX = xOf(run.iStart);
        const lastX = xOf(run.iEnd);
        let d = `M ${firstX.toFixed(1)} ${H}`;
        for (const pt of pts) {
          d += ` L ${xOf(pt.i).toFixed(1)} ${yOf(pt.y).toFixed(1)}`;
        }
        d += ` L ${lastX.toFixed(1)} ${H} Z`;
        return { d, color: run.color };
      })
      .filter(Boolean) as Array<{ d: string; color: string }>,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [runs, maxY]);

  const hairX =
    entityCl != null
      ? PAD_X + (Math.min(Math.max(entityCl, 0), CL_MAX) / CL_MAX) * (W - 2 * PAD_X)
      : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%' }}
    >
      <rect width={W} height={H} fill="rgba(0,0,0,0.25)" rx="4" />
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} fillOpacity={0.75} />
      ))}
      {hairX != null && (
        <>
          <line
            x1={hairX.toFixed(1)}
            y1={PAD_Y}
            x2={hairX.toFixed(1)}
            y2={H - PAD_Y}
            stroke="white"
            strokeWidth={1.5}
            strokeOpacity={0.85}
            strokeDasharray="3 2"
          />
          <circle cx={hairX.toFixed(1)} cy={PAD_Y + 4} r={2.5} fill="white" fillOpacity={0.9} />
        </>
      )}
    </svg>
  );
}

import { useMemo } from 'react';
import { qualityProbabilities, QUALITY_TIERS } from '@derp/math';
import { QUALITY_COLOURS } from './forgeUtils';

const DEFAULT_CAP = 170;
const STEPS = 200;

interface Point {
  i: number;
  y: number;
  color: string;
}

interface ColorRun {
  iStart: number;
  iEnd: number;
  color: string;
}

/**
 * Build a color mapping for each quality tier key.
 * Tiers with no rewards in the recipe inherit the color of the nearest preceding defined tier.
 * If no preceding tier is defined, falls back to the tier's own default color.
 */
function buildColorMap(recipeTiers: Record<string, any> | null | undefined): Record<string, string> {
  const colorMap: Record<string, string> = {};
  let lastDefinedColor: string | null = null;

  for (const t of QUALITY_TIERS) {
    const tierDef = recipeTiers?.[t.key];
    const hasDef =
      tierDef != null &&
      typeof tierDef === 'object' &&
      (
        (Array.isArray(tierDef.rewards) && tierDef.rewards.length > 0) ||
        Object.keys(tierDef).some((k) => k !== 'clRequirement' && k !== 'rewards')
      );

    if (hasDef) {
      lastDefinedColor = QUALITY_COLOURS[t.key] ?? '#94a3b8';
    }
    colorMap[t.key] = lastDefinedColor ?? QUALITY_COLOURS[t.key] ?? '#94a3b8';
  }

  return colorMap;
}

function computePoints(
  cap: number,
  centerOverrides: Partial<Record<string, number>>,
  colorMap: Record<string, string>,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const cl = (i / STEPS) * cap;
    const probs = qualityProbabilities(cl, centerOverrides);
    const dominant = probs.reduce((a, b) => (a.probability >= b.probability ? a : b));
    const color = colorMap[dominant.key] ?? '#94a3b8';
    pts.push({ i, y: dominant.probability, color });
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
    runs.push({ iStart: i, iEnd: j - 1, color });
    i = j;
  }
  return runs;
}

export interface RarityCurveChartProps {
  recipeTiers?: Record<string, any> | null;
  entityCl?: number | null;
  centerOverrides?: Partial<Record<string, number>>;
  cap?: number;
  className?: string;
}

export function RarityCurveChart({
  recipeTiers,
  entityCl,
  centerOverrides = {},
  cap = DEFAULT_CAP,
  className,
}: RarityCurveChartProps) {
  const W = 240;
  const H = 100;
  const PAD_X = 1;
  const PAD_Y = 6;

  const colorMap = useMemo(() => buildColorMap(recipeTiers), [recipeTiers]);

  const { maxY, pts, runs } = useMemo(() => {
    const pts = computePoints(cap, centerOverrides, colorMap);
    let m = 0;
    for (const p of pts) if (p.y > m) m = p.y;
    return { maxY: Math.max(m, 0.01), pts, runs: buildRuns(pts) };
  }, [cap, centerOverrides, colorMap]);

  const xOf = (i: number) => PAD_X + (i / STEPS) * (W - 2 * PAD_X);
  const yOf = (v: number) => H - PAD_Y - (v / maxY) * (H - 2 * PAD_Y);

  // Full curve polygon for the clipPath mask — bottom-left → up along curve → bottom-right → close
  const clipPathD = useMemo(() => {
    let d = `M ${PAD_X.toFixed(1)} ${H}`;
    for (const pt of pts) {
      d += ` L ${xOf(pt.i).toFixed(1)} ${yOf(pt.y).toFixed(1)}`;
    }
    d += ` L ${(W - PAD_X).toFixed(1)} ${H} Z`;
    return d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, maxY]);

  const hairData = useMemo(() => {
    if (entityCl == null) return null;
    const clClamped = Math.min(Math.max(entityCl, 0), cap);
    const x = PAD_X + (clClamped / cap) * (W - 2 * PAD_X);
    const probs = qualityProbabilities(clClamped, centerOverrides);
    const dominant = probs.reduce((a, b) => (a.probability >= b.probability ? a : b));
    const y = yOf(dominant.probability);
    return { x, y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityCl, cap, centerOverrides, maxY]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
      preserveAspectRatio="none"
    >
      <defs>
        <clipPath id="forge-curve-mask">
          <path d={clipPathD} />
        </clipPath>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="rgba(0,0,0,0.25)" rx="4" />

      {/* Colour bands — each run is a rect clipped to the bell curve silhouette */}
      {runs.map((run, i) => {
        const x1 = xOf(run.iStart);
        const x2 = xOf(run.iEnd);
        return (
          <rect
            key={i}
            x={x1.toFixed(1)}
            y={PAD_Y}
            width={Math.max(1, x2 - x1).toFixed(1)}
            height={H - PAD_Y}
            fill={run.color}
            fillOpacity={0.8}
            clipPath="url(#forge-curve-mask)"
          />
        );
      })}

      {/* Hairline + dot at entity CL position */}
      {hairData && (
        <>
          <line
            x1={hairData.x.toFixed(1)}
            y1={PAD_Y}
            x2={hairData.x.toFixed(1)}
            y2={H - PAD_Y}
            stroke="white"
            strokeWidth={1.5}
            strokeOpacity={0.9}
            strokeDasharray="3 2"
          />
          <circle
            cx={hairData.x.toFixed(1)}
            cy={hairData.y.toFixed(1)}
            r={3}
            fill="white"
            fillOpacity={0.95}
          />
        </>
      )}
    </svg>
  );
}

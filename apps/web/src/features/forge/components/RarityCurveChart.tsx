import { useRef, useEffect, useState, useMemo } from 'react';
import { qualityProbabilities, QUALITY_TIERS } from '@derp/math';
import { QUALITY_COLOURS } from './forgeUtils';

const DEFAULT_CAP = 170;
const STEPS = 200;
const SIGMA = 22;
const ANIM_MS = 800;

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

function gaussianY(x: number, center: number): number {
  return Math.exp(-((x - center) ** 2) / (2 * SIGMA * SIGMA));
}

function computeBellPoints(
  cap: number,
  centerCl: number,
  amplitude: number,
  centerOverrides: Partial<Record<string, number>>,
  colorMap: Record<string, string>,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const cl = (i / STEPS) * cap;
    const y = gaussianY(cl, centerCl) * amplitude;
    const probs = qualityProbabilities(cl, centerOverrides);
    const dominant = probs.reduce((a, b) => (a.probability >= b.probability ? a : b));
    const color = colorMap[dominant.key] ?? '#94a3b8';
    pts.push({ i, y, color });
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
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

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const initialCl = entityCl ?? 0;
  const initialAmp = entityCl != null ? 1 : 0;

  const [displayedCl, setDisplayedCl] = useState<number>(initialCl);
  const [displayedAmplitude, setDisplayedAmplitude] = useState<number>(initialAmp);

  const animRef = useRef({
    raf: null as number | null,
    startTime: 0,
    fromCl: initialCl,
    toCl: initialCl,
    fromAmp: initialAmp,
    toAmp: initialAmp,
    currentCl: initialCl,
    currentAmp: initialAmp,
  });

  useEffect(() => {
    const targetCl = entityCl != null ? entityCl : animRef.current.currentCl;
    const targetAmp = entityCl != null ? 1 : 0;

    if (prefersReducedMotion) {
      if (animRef.current.raf !== null) {
        cancelAnimationFrame(animRef.current.raf);
        animRef.current.raf = null;
      }
      const snapCl = entityCl != null ? entityCl : animRef.current.currentCl;
      animRef.current.currentCl = snapCl;
      animRef.current.currentAmp = targetAmp;
      setDisplayedCl(snapCl);
      setDisplayedAmplitude(targetAmp);
      return;
    }

    if (animRef.current.raf !== null) {
      cancelAnimationFrame(animRef.current.raf);
      animRef.current.raf = null;
    }

    const fromCl = animRef.current.currentCl;
    const fromAmp = animRef.current.currentAmp;
    animRef.current.fromCl = fromCl;
    animRef.current.toCl = targetCl;
    animRef.current.fromAmp = fromAmp;
    animRef.current.toAmp = targetAmp;
    animRef.current.startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - animRef.current.startTime;
      const t = Math.min(elapsed / ANIM_MS, 1);
      const et = easeInOutCubic(t);
      const cl = lerp(animRef.current.fromCl, animRef.current.toCl, et);
      const amp = lerp(animRef.current.fromAmp, animRef.current.toAmp, et);
      animRef.current.currentCl = cl;
      animRef.current.currentAmp = amp;
      setDisplayedCl(cl);
      setDisplayedAmplitude(amp);
      if (t < 1) {
        animRef.current.raf = requestAnimationFrame(tick);
      } else {
        animRef.current.raf = null;
      }
    }

    animRef.current.raf = requestAnimationFrame(tick);

    return () => {
      if (animRef.current.raf !== null) {
        cancelAnimationFrame(animRef.current.raf);
        animRef.current.raf = null;
      }
    };
  }, [entityCl, prefersReducedMotion]);

  const colorMap = useMemo(() => buildColorMap(recipeTiers), [recipeTiers]);

  const { pts, runs } = useMemo(
    () => {
      const p = computeBellPoints(cap, displayedCl, displayedAmplitude, centerOverrides, colorMap);
      return { pts: p, runs: buildRuns(p) };
    },
    [cap, displayedCl, displayedAmplitude, centerOverrides, colorMap],
  );

  const xOf = (i: number) => PAD_X + (i / STEPS) * (W - 2 * PAD_X);
  const yOf = (v: number) => H - PAD_Y - v * (H - 2 * PAD_Y);

  const clipPathD = useMemo(() => {
    let d = `M ${PAD_X.toFixed(1)} ${H}`;
    for (const pt of pts) {
      d += ` L ${xOf(pt.i).toFixed(1)} ${yOf(pt.y).toFixed(1)}`;
    }
    d += ` L ${(W - PAD_X).toFixed(1)} ${H} Z`;
    return d;
  }, [pts]);

  const hairData = useMemo(() => {
    if (displayedAmplitude < 0.01) return null;
    const clClamped = Math.min(Math.max(displayedCl, 0), cap);
    const x = PAD_X + (clClamped / cap) * (W - 2 * PAD_X);
    const peakY = displayedAmplitude;
    const y = yOf(peakY);
    return { x, y };
  }, [displayedCl, displayedAmplitude, cap]);

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

      {/* Hairline + dot at entity CL position (travels with the animated peak) */}
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

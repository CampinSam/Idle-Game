import { STAT_DISPLAY } from '@derp/shared';

const STATS = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'] as const;
const STAT_LABELS: Record<string, string> = {
  ATK: 'ATK', DEF: 'DEF', SPD: 'SPD', FOC: 'FOC', LCK: 'LCK', VIT: 'VIT',
};

const TICK_LEVELS = [0.25, 0.5, 0.75, 1.0];

interface StatRadarChartProps {
  stats: Record<string, number>;
  /**
   * Optional equipped-stat overlay. When provided, the chart draws a second
   * polygon (gold) showing total stats with equipment, and per-axis "+N"
   * deltas next to the labels for stats that changed. The base polygon
   * (purple) continues to show unequipped values so the player can see what
   * each piece of gear contributes at a glance.
   */
  equippedStats?: Record<string, number>;
  size?: number;
  /**
   * Maximum value on each axis. When omitted the chart auto-scales to the
   * highest observed stat value (minimum ceiling: 10), so the polygon always
   * fills proportionally regardless of progression stage.
   */
  maxValue?: number;
  /** Animation progress 0→1. Scales all data points from the centre outward. */
  progress?: number;
}

function polarToCart(cx: number, cy: number, r: number, index: number): [number, number] {
  const angle = (index * 60 * Math.PI) / 180;
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

export default function StatRadarChart({ stats, equippedStats, size = 200, maxValue, progress = 1 }: StatRadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const labelR = size * 0.47;

  const statValues = STATS.map((s) => Math.max(0, stats[s] || 0));
  const equippedValues = equippedStats
    ? STATS.map((s) => Math.max(0, equippedStats[s] ?? statValues[STATS.indexOf(s)]))
    : null;
  const hasOverlay = !!equippedValues && equippedValues.some((v, i) => v !== statValues[i]);

  // Scale to the larger of base/equipped so neither polygon clips the ring.
  const scale = maxValue ?? Math.max(10, ...statValues, ...(equippedValues ?? []));

  const dataPoints = STATS.map((_, i) => {
    const ratio = Math.min(statValues[i] / scale, 1) * progress;
    return polarToCart(cx, cy, maxR * ratio, i);
  });
  const dataPoly = dataPoints.map(([x, y]) => `${x},${y}`).join(' ');

  const equippedPoints = equippedValues
    ? STATS.map((_, i) => {
        const ratio = Math.min(equippedValues[i] / scale, 1) * progress;
        return polarToCart(cx, cy, maxR * ratio, i);
      })
    : null;
  const equippedPoly = equippedPoints
    ? equippedPoints.map(([x, y]) => `${x},${y}`).join(' ')
    : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="stat-radar-chart"
    >
      {TICK_LEVELS.map((t) => {
        const pts = STATS.map((_, i) => {
          const [x, y] = polarToCart(cx, cy, maxR * t, i);
          return `${x},${y}`;
        }).join(' ');
        return (
          <polygon
            key={t}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        );
      })}

      {STATS.map((_, i) => {
        const [x, y] = polarToCart(cx, cy, maxR, i);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={x} y2={y}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        );
      })}

      <polygon
        points={dataPoly}
        fill={hasOverlay ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.35)'}
        stroke="#8B5CF6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray={hasOverlay ? '3 3' : undefined}
      />

      {!hasOverlay && dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#A78BFA" />
      ))}

      {hasOverlay && equippedPoints && (
        <>
          <polygon
            points={equippedPoly}
            fill="rgba(245,158,11,0.32)"
            stroke="#F59E0B"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          {equippedPoints.map(([x, y], i) => (
            <circle key={`eq-${i}`} cx={x} cy={y} r={3} fill="#FBBF24" />
          ))}
        </>
      )}

      {STATS.map((stat, i) => {
        const [lx, ly] = polarToCart(cx, cy, labelR, i);
        const color = STAT_DISPLAY[stat]?.color ?? '#fff';
        const baseValue = statValues[i];
        const equippedValue = equippedValues ? equippedValues[i] : baseValue;
        const delta = equippedValue - baseValue;
        const displayValue = hasOverlay ? equippedValue : baseValue;

        let anchor: 'middle' | 'start' | 'end' = 'middle';
        if (lx > cx + 4) anchor = 'start';
        else if (lx < cx - 4) anchor = 'end';

        return (
          <g key={stat}>
            <text
              x={lx}
              y={ly - 6}
              textAnchor={anchor}
              fontSize={size * 0.063}
              fontWeight="800"
              fill={color}
              fontFamily="inherit"
            >
              {STAT_LABELS[stat]}
            </text>
            <text
              x={lx}
              y={ly + 8}
              textAnchor={anchor}
              fontSize={size * 0.072}
              fontWeight="900"
              fill="white"
              fontFamily="inherit"
            >
              {displayValue}
            </text>
            {delta !== 0 && (
              <text
                x={lx}
                y={ly + 8 + size * 0.075}
                textAnchor={anchor}
                fontSize={size * 0.055}
                fontWeight="800"
                fill={delta > 0 ? '#FBBF24' : '#F87171'}
                fontFamily="inherit"
              >
                {delta > 0 ? `+${delta}` : delta}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

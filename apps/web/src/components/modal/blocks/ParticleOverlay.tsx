import { useEffect, useMemo, useState } from 'react';

export interface ParticlePreset {
  count: number;
  colors: string[];
  sizes: [number, number];
  spread: number;
  duration: number;
  durationJitter: number;
  delayMax: number;
}

/**
 * Registry of named particle presets.
 * Any FX value used in an fxMap can have a particle preset registered here.
 * RevealWrapper checks this registry automatically — no per-effect hardcoding needed.
 */
const PRESETS: Record<string, ParticlePreset> = {
  sparkle_gold: {
    count: 24,
    colors: ['#fbbf24', '#fcd34d', '#f59e0b', '#fef3c7', '#fff7ed', '#ffffff', '#fde68a'],
    sizes: [3, 8],
    spread: 90,
    duration: 850,
    durationJitter: 350,
    delayMax: 450,
  },
  sparkle_blue: {
    count: 20,
    colors: ['#60a5fa', '#93c5fd', '#3b82f6', '#bfdbfe', '#dbeafe', '#ffffff'],
    sizes: [3, 7],
    spread: 80,
    duration: 800,
    durationJitter: 300,
    delayMax: 400,
  },
  sparkle_purple: {
    count: 20,
    colors: ['#a78bfa', '#c4b5fd', '#8b5cf6', '#ede9fe', '#f5f3ff', '#ffffff'],
    sizes: [3, 7],
    spread: 80,
    duration: 800,
    durationJitter: 300,
    delayMax: 400,
  },
};

export function getParticlePreset(fx: string): ParticlePreset | undefined {
  return PRESETS[fx];
}

interface Particle {
  id: number;
  color: string;
  size: number;
  tx: number;
  ty: number;
  duration: number;
  delay: number;
}

interface Props {
  preset: ParticlePreset;
}

export default function ParticleOverlay({ preset }: Props) {
  const [mounted, setMounted] = useState(true);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: preset.count }, (_, i) => {
      const baseAngle = (Math.PI * 2 * i) / preset.count;
      const jitter = (Math.random() - 0.5) * 0.9;
      const angle = baseAngle + jitter;
      const dist = preset.spread * (0.35 + Math.random() * 0.65);
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - dist * 0.25;
      const size = preset.sizes[0] + Math.random() * (preset.sizes[1] - preset.sizes[0]);
      const color = preset.colors[Math.floor(Math.random() * preset.colors.length)];
      const duration = preset.duration + (Math.random() - 0.5) * 2 * preset.durationJitter;
      const delay = Math.random() * preset.delayMax;
      return { id: i, color, size, tx, ty, duration, delay };
    });
  }, [preset]);

  useEffect(() => {
    const maxMs =
      preset.duration + preset.durationJitter + preset.delayMax + 120;
    const t = setTimeout(() => setMounted(false), maxMs);
    return () => clearTimeout(t);
  }, [preset]);

  if (!mounted) return null;

  return (
    <span
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 10,
      }}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${Math.round(p.size * 1.8)}px ${p.color}`,
            ['--gm-ptx' as string]: `${p.tx}px`,
            ['--gm-pty' as string]: `${p.ty}px`,
            animationName: 'gm-particle-fly',
            animationDuration: `${Math.round(p.duration)}ms`,
            animationDelay: `${Math.round(p.delay)}ms`,
            animationTimingFunction: 'cubic-bezier(0.15, 0.85, 0.35, 1)',
            animationFillMode: 'both',
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

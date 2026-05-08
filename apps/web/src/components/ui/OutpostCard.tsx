import type { ReactNode, CSSProperties } from 'react';

type OutpostAccent = 'header' | 'production' | 'workers' | 'warehouse' | 'building' | 'add' | 'neutral';

interface OutpostCardProps {
  accent?: OutpostAccent;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const ACCENT_STRIPE: Record<OutpostAccent, string> = {
  header: 'rgba(139,92,246,0.6)',
  production: 'rgba(16,185,129,0.55)',
  workers: 'rgba(96,165,250,0.55)',
  warehouse: 'rgba(245,158,11,0.55)',
  building: 'rgba(167,139,250,0.5)',
  add: 'rgba(20,184,166,0.55)',
  neutral: 'rgba(139,92,246,0.55)',
};

export function OutpostCard({ accent = 'neutral', className = '', style, children }: OutpostCardProps) {
  const stripe = ACCENT_STRIPE[accent];
  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border border-[rgba(139,92,246,0.18)] p-3.5 transition-[border-color,transform] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:opacity-85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-16px_rgba(0,0,0,0.6)] ${className}`}
      style={{
        background: 'linear-gradient(180deg,#1f1858 0%,#15113c 100%)',
        ...style,
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-0.5 opacity-85 pointer-events-none"
        style={{ background: `linear-gradient(90deg,transparent 0%,${stripe} 50%,transparent 100%)` }}
      />
      {children}
    </div>
  );
}

const ACCENT_TITLE: Record<OutpostAccent, string> = {
  header: '#c4b5fd',
  production: '#86efac',
  workers: '#93c5fd',
  warehouse: '#fcd34d',
  building: '#c4b5fd',
  add: '#5eead4',
  neutral: '#c4b5fd',
};

interface OutpostCardTitleProps {
  accent?: OutpostAccent;
  className?: string;
  children: ReactNode;
}

export function OutpostCardTitle({ accent = 'neutral', className = '', children }: OutpostCardTitleProps) {
  return (
    <h3
      className={`font-cinzel text-[11px] font-extrabold tracking-[1.4px] uppercase m-0 mb-3 [text-shadow:0_0_12px_rgba(139,92,246,0.25)] ${className}`}
      style={{ color: ACCENT_TITLE[accent] }}
    >
      {children}
    </h3>
  );
}

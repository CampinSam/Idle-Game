import { CSSProperties, ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'forge';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  style?: CSSProperties;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-secondary text-text-secondary border-border',
  success: 'bg-[rgba(16,185,129,0.18)] text-[#6ee7b7] border-[rgba(16,185,129,0.45)]',
  warning: 'bg-[rgba(245,158,11,0.18)] text-[#fcd34d] border-[rgba(245,158,11,0.45)]',
  danger: 'bg-[rgba(239,68,68,0.15)] text-[#fca5a5] border-[rgba(239,68,68,0.45)]',
  info: 'bg-[rgba(58,123,213,0.18)] text-[#bfdbfe] border-[rgba(58,123,213,0.45)]',
  forge: 'bg-[rgba(15,12,38,0.55)] text-[#fed7aa] border-[rgba(254,215,170,0.55)]',
};

export function Badge({ children, tone = 'neutral', className = '', style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${TONES[tone]} ${className}`.trim()}
      style={style}
    >
      {children}
    </span>
  );
}

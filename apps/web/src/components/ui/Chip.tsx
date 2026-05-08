import { CSSProperties, ReactNode } from 'react';

interface ChipProps {
  children: ReactNode;
  tone?: 'neutral' | 'tier-1' | 'tier-2' | 'tier-3' | 'success';
  className?: string;
  style?: CSSProperties;
}

const TONES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'bg-[rgba(15,12,38,0.55)] border-[rgba(148,163,184,0.55)] text-[#e2e8f0]',
  'tier-1': 'bg-[rgba(15,12,38,0.55)] border-[rgba(148,163,184,0.55)] text-[#e2e8f0]',
  'tier-2': 'bg-[rgba(15,12,38,0.55)] border-[rgba(96,165,250,0.65)] text-[#bfdbfe] shadow-[0_0_8px_rgba(96,165,250,0.25)]',
  'tier-3': 'bg-[rgba(15,12,38,0.55)] border-[rgba(192,132,252,0.7)] text-[#e9d5ff] shadow-[0_0_10px_rgba(192,132,252,0.32)]',
  success: 'bg-[rgba(34,197,94,0.16)] border-[rgba(34,197,94,0.55)] text-[#bbf7d0]',
};

export function Chip({ children, tone = 'neutral', className = '', style }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.1em] ${TONES[tone]} ${className}`.trim()}
      style={style}
    >
      {children}
    </span>
  );
}

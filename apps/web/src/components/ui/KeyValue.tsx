import { ReactNode } from 'react';

interface KeyValueProps {
  label: ReactNode;
  value: ReactNode;
  layout?: 'stacked' | 'inline';
  className?: string;
}

export function KeyValue({ label, value, layout = 'stacked', className = '' }: KeyValueProps) {
  if (layout === 'inline') {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`.trim()}>
        <span className="text-[11px] text-text-secondary">{label}</span>
        <strong className="text-[14px] text-[#e2d9ff] font-bold">{value}</strong>
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`.trim()}>
      <span className="text-[11px] text-text-secondary">{label}</span>
      <strong className="text-base text-[#e2d9ff] font-bold">{value}</strong>
    </div>
  );
}

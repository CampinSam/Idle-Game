import { ReactNode } from 'react';

interface StatPillProps {
  icon?: ReactNode;
  label?: ReactNode;
  value: ReactNode;
  className?: string;
}

export function StatPill({ icon, label, value, className = '' }: StatPillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      {icon != null && <span className="text-[15px] leading-none">{icon}</span>}
      {label != null && <span className="text-[11px] text-text-secondary">{label}</span>}
      <span className="text-[14px] font-bold text-[#e2d9ff]">{value}</span>
    </span>
  );
}

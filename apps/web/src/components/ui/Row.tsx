import { CSSProperties, ReactNode } from 'react';

interface RowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  highlight?: boolean;
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className = '',
  style,
  highlight = false,
}: RowProps) {
  return (
    <div
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined, ...style }}
      className={`flex items-center gap-3 px-4 py-2.5 border-t border-[rgba(139,92,246,0.1)] ${highlight ? 'bg-[rgba(16,185,129,0.08)]' : ''} ${className}`.trim()}
    >
      {leading != null && <div className="flex-shrink-0">{leading}</div>}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-bold text-[#e2d9ff] capitalize whitespace-nowrap overflow-hidden text-ellipsis">
          {title}
        </span>
        {subtitle != null && <span className="text-[11px] text-text-secondary">{subtitle}</span>}
      </div>
      {trailing != null && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  );
}

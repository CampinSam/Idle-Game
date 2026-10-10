import { ReactNode } from 'react';

interface SectionHeaderProps {
  title: ReactNode;
  right?: ReactNode;
  as?: 'h2' | 'h3' | 'div';
  className?: string;
}

export function SectionHeader({ title, right, as = 'h2', className = '' }: SectionHeaderProps) {
  const Tag = as;
  return (
    <div className={`flex items-center justify-between mb-2 px-1 ${className}`.trim()}>
      <Tag className="text-[13px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd] font-cinzel">
        {title}
      </Tag>
      {right}
    </div>
  );
}

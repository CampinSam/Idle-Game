import { ReactNode } from 'react';

interface IconLabelProps {
  icon: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<NonNullable<IconLabelProps['size']>, string> = {
  sm: 'text-[11px] gap-1',
  md: 'text-[13px] gap-1.5',
  lg: 'text-[15px] gap-2',
};

export function IconLabel({ icon, children, size = 'md', className = '' }: IconLabelProps) {
  return (
    <span className={`inline-flex items-center ${SIZE[size]} ${className}`.trim()}>
      <span className="leading-none">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

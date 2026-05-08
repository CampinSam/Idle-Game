import { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  as?: 'div' | 'button';
}

export function Card({ children, className = '', style, onClick, as = 'div' }: CardProps) {
  const Tag = as;
  const base =
    'bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] rounded-[14px] overflow-hidden';
  return (
    <Tag onClick={onClick} className={`${base} ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

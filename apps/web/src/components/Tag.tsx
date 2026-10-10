import { CSSProperties, ReactNode } from 'react';
import { useTagDef } from '../hooks/useSyncSelectors';
import { VisualEffect } from './VisualEffect';

interface Props {
  tagKey: string;
  label?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  noEffect?: boolean;
  style?: CSSProperties;
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-1 px-2 py-[3px] text-[10px]',
  md: "gap-1.5 px-2.5 py-1 [font-size:var(--tag-font-size,11px)]",
  lg: 'gap-2 px-3.5 py-1.5 text-[13px]',
};

const BASE = "inline-flex items-center border rounded-full [font-family:'Exo_2',sans-serif] font-semibold tracking-[0.04em] uppercase leading-none whitespace-nowrap overflow-hidden";

export function Tag({ tagKey, label, icon, size = 'md', className, noEffect, style }: Props) {
  const def = useTagDef(tagKey);

  if (!def) {
    return (
      <span
        className={[
          BASE,
          sizeClasses[size],
          'bg-[rgba(80,30,30,0.5)] border-[rgba(255,80,80,0.4)] text-[#ffaaaa] normal-case tracking-normal italic',
          className,
        ].filter(Boolean).join(' ')}
        style={style}
        title={`Unknown tag: ${tagKey}`}
      >
        {icon}
        {label ?? tagKey}
      </span>
    );
  }

  const tagStyle: CSSProperties = {
    '--tag-bg': def.backgroundColor,
    '--tag-color': def.color,
    '--tag-border-color': def.borderColor,
    '--tag-opacity': def.opacity ?? 1,
    ...(def.fontSize ? { '--tag-font-size': def.fontSize } : {}),
    ...style,
  } as CSSProperties;

  const inner = (
    <span
      className={[
        BASE,
        sizeClasses[size],
        'bg-[var(--tag-bg,#2a2a3a)] border-[color:var(--tag-border-color,#3a3a4a)] text-[color:var(--tag-color,#ffffff)] [opacity:var(--tag-opacity,1)]',
        className,
      ].filter(Boolean).join(' ')}
      style={tagStyle}
    >
      {icon}
      {label ?? def.label}
    </span>
  );

  if (noEffect) return inner;

  const stack: string[] =
    Array.isArray((def as any).effectKeys) && (def as any).effectKeys.length > 0
      ? ((def as any).effectKeys as string[])
      : def.effectKey
        ? [def.effectKey]
        : [];

  if (stack.length === 0) return inner;

  return stack.reduceRight<ReactNode>(
    (children, key) => (
      <VisualEffect key={key} effectKey={key} shape="pill">
        {children}
      </VisualEffect>
    ),
    inner,
  );
}

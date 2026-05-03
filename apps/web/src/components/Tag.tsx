import { CSSProperties, ReactNode } from 'react';
import { useTagDef } from '../hooks/useSyncSelectors';
import { VisualEffect } from './VisualEffect';
import './Tag.css';

interface Props {
  /**
   * Stable key matching `TagDef.key` (e.g. "rarity-epic", "ach-tier-3",
   * "quest-completed"). When the key is unknown to the catalog we
   * still render — with an "unknown tag" style — so a missing seed
   * is loud-but-survivable instead of a silent empty span.
   */
  tagKey: string;
  /** Override the catalog-supplied label. Useful for dynamic counts ("3/5"). */
  label?: ReactNode;
  /** Optional leading icon (rendered before the label). */
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Skip the visual effect even if the def has one (e.g. in admin previews). */
  noEffect?: boolean;
  style?: CSSProperties;
}

/**
 * The single visual tag/badge/pill component. Reads its visual contract
 * (colors, opacity, optional effect) from the bootstrap-delivered
 * `tagDefs` catalog so changing how "epic" looks is a one-row admin
 * edit, not a CSS hunt across 14 components.
 *
 * Pairs with <VisualEffect> through `TagDef.effectKey`: an "epic" tag
 * and an "epic" item icon can share the *same* shimmer effect by both
 * pointing at the same VisualEffectDef.
 */
export function Tag({ tagKey, label, icon, size = 'md', className, noEffect, style }: Props) {
  const def = useTagDef(tagKey);

  // Catalog miss: render a visible placeholder. Don't hide silently —
  // an unstyled tag almost always means a typo or a missing seed and
  // we want that to surface in dev.
  if (!def) {
    return (
      <span
        className={`tag tag--${size} tag--unknown${className ? ` ${className}` : ''}`}
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
    <span className={`tag tag--${size}${className ? ` ${className}` : ''}`} style={tagStyle}>
      {icon}
      {label ?? def.label}
    </span>
  );

  if (noEffect || !def.effectKey) return inner;
  return <VisualEffect effectKey={def.effectKey}>{inner}</VisualEffect>;
}

import { CSSProperties, ReactNode } from 'react';
import { useVisualEffectDef } from '../hooks/useSyncSelectors';
import './VisualEffects.css';

interface Props {
  /**
   * Stable key matching `VisualEffectDef.key`. When omitted (or unknown
   * to the catalog) we render children unwrapped, so `<VisualEffect>`
   * is safe to use unconditionally — turning the effect on/off is a
   * data-only change in the admin tag editor.
   */
  effectKey?: string | null;
  /**
   * Optional override for the wrapping element. Defaults to <span> so
   * <VisualEffect> can be dropped into inline contexts (badges, icons,
   * text) without breaking flow. Use `'div'` when the parent needs
   * block layout.
   */
  as?: 'span' | 'div';
  /**
   * Tells the effect wrapper what silhouette its child has, so effects
   * that paint *on* the wrapper (shimmer, rainbow) clip to the right
   * shape and effects that emanate from it (glow box-shadow) follow
   * the right outline. Without this, the wrapper is a sharp rectangle
   * and effects bleed past rounded children. Defaults to `'none'`
   * (legacy pass-through behavior — wrapper has no radius).
   */
  shape?: 'pill' | 'circle' | 'square' | 'none';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Wraps any element with a reusable visual effect. The effect is a
 * `VisualEffectDef` (catalog seeded server-side, edited in the admin
 * Tag Editor → Effects tab) that maps a key to a CSS animation +
 * parameter set.
 *
 * Same effect can be applied to a tag pill *and* an item icon *and* an
 * entity portrait — the animation, color and duration come from one
 * place. Edit `VisualEffectDef.params.color` once and every consumer
 * updates because params are passed through as CSS custom properties.
 */
export function VisualEffect({ effectKey, as = 'span', shape = 'none', className, style, children }: Props) {
  const def = useVisualEffectDef(effectKey ?? undefined);

  if (!def || !effectKey) {
    return <>{children}</>;
  }

  const params = (def.params || {}) as Record<string, string | number>;
  const cssVars: Record<string, string> = {
    '--fx-duration': `${def.durationMs ?? 1500}ms`,
    '--fx-easing': def.easing ?? 'ease-in-out',
  };
  if (params.color != null) cssVars['--fx-color'] = String(params.color);
  if (params.intensity != null) cssVars['--fx-intensity'] = String(params.intensity);
  if (params.minOpacity != null) cssVars['--fx-min-opacity'] = String(params.minOpacity);
  if (params.maxScale != null) cssVars['--fx-max-scale'] = String(params.maxScale);

  // The CSS class is derived from the def's `cssAnimation` field which
  // matches a `.fx-<animationName>` rule in VisualEffects.css. New
  // animations require a frontend code change — by design (CSS keyframes
  // can't be safely user-authored).
  const shapeClass = shape !== 'none' ? ` fx-shape-${shape}` : '';
  const fxClass = `fx-host fx-${def.cssAnimation}${shapeClass}`;
  const Tag = as;

  return (
    <Tag className={`${fxClass}${className ? ` ${className}` : ''}`} style={{ ...cssVars, ...style } as CSSProperties}>
      {children}
    </Tag>
  );
}

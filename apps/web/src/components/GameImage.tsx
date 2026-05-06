import { useState, useCallback, CSSProperties } from 'react';
import {
  IMAGE_SPECS,
  IMAGE_FALLBACKS,
  type ImageCategory,
} from '../config/images';
import { resolveAssetUrl } from '../utils/iconResolver';
import './GameImage.css';

interface GameImageProps {
  src: string;
  category: ImageCategory;
  alt?: string;
  fallbackSrc?: string;
  /**
   * Optional low-cost stand-in (typically the same image at a smaller
   * variant that's already in the browser cache) shown immediately while
   * the main `src` loads. When provided, the shimmer skeleton is hidden
   * — the placeholder takes its place — and the main image crossfades
   * over the placeholder once it finishes loading. Falls back to the
   * skeleton if the placeholder itself fails to load.
   */
  placeholderSrc?: string;
  className?: string;
  style?: CSSProperties;
  rounded?: boolean;
  glow?: boolean;
  glowColor?: string;
  onClick?: () => void;
}

export function GameImage({
  src,
  category,
  alt = '',
  fallbackSrc,
  placeholderSrc,
  className = '',
  style,
  rounded = false,
  glow = false,
  glowColor,
  onClick,
}: GameImageProps) {
  const [mainLoaded, setMainLoaded] = useState(false);
  const [mainError, setMainError] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [placeholderError, setPlaceholderError] = useState(false);

  const spec = IMAGE_SPECS[category];
  const fallback = fallbackSrc || IMAGE_FALLBACKS[category];

  const placeholderHealthy = !!placeholderSrc && !placeholderError;

  const handleLoad = useCallback(() => setMainLoaded(true), []);
  const handleError = useCallback(() => setMainError(true), []);
  const handlePlaceholderLoad = useCallback(() => setPlaceholderLoaded(true), []);
  const handlePlaceholderError = useCallback(() => setPlaceholderError(true), []);

  // When the main image fails AND the placeholder is carrying the visual,
  // leave the broken `src` in place (it stays at opacity 0) — promoting
  // the fallback would cover the thumb the user just saw on the list.
  // When there's no usable placeholder, swap to the fallback so the
  // existing archetype-image fallback chain still kicks in.
  const useFallback = mainError && !placeholderHealthy;
  const imageSrc = (resolveAssetUrl(useFallback ? fallback : src) ?? fallback) as string;
  const resolvedPlaceholder = placeholderHealthy
    ? (resolveAssetUrl(placeholderSrc!) ?? placeholderSrc!)
    : null;

  // Crossfade gate: only promote the main img to opacity:1 when it
  // actually finished loading. If it errored while a healthy placeholder
  // exists, keep main hidden so the thumb stays visible.
  const mainVisible = mainLoaded && !(mainError && placeholderHealthy);

  // Skeleton only when neither layer has anything painted yet — preserves
  // the deep-link behavior (no cached thumb) of skeleton → full image.
  const showSkeleton = !mainLoaded && !placeholderLoaded;

  const classes = [
    'game-image',
    `game-image--${category}`,
    mainVisible ? 'game-image--loaded' : 'game-image--loading',
    rounded ? 'game-image--rounded' : '',
    glow ? 'game-image--glow' : '',
    onClick ? 'game-image--clickable' : '',
    className,
  ].filter(Boolean).join(' ');

  const combinedStyle: CSSProperties = {
    ...style,
    aspectRatio: `${spec.width} / ${spec.height}`,
    ...(glow && glowColor ? { '--glow-color': glowColor } as CSSProperties : {}),
  };

  return (
    <div className={classes} style={combinedStyle} onClick={onClick}>
      {showSkeleton && <div className="game-image__skeleton" />}
      {resolvedPlaceholder && (
        // Eager-load the placeholder so it paints from the browser cache on
        // the very first frame. Sits underneath the main img; once the main
        // image finishes loading and crossfades to opacity:1, this is
        // visually covered (we keep it mounted so a hard reload of the
        // detail page still shows it instead of falling back to skeleton).
        <img
          src={resolvedPlaceholder as string}
          alt=""
          aria-hidden="true"
          width={spec.width}
          height={spec.height}
          onLoad={handlePlaceholderLoad}
          onError={handlePlaceholderError}
          className="game-image__placeholder"
        />
      )}
      <img
        src={imageSrc}
        alt={alt}
        width={spec.width}
        height={spec.height}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        className="game-image__img"
      />
    </div>
  );
}

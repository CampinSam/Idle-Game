import { useState, useCallback, CSSProperties } from 'react';
import {
  IMAGE_SPECS,
  IMAGE_FALLBACKS,
  type ImageCategory,
} from '../config/images';
import { resolveAssetUrl } from '../utils/iconResolver';

interface GameImageProps {
  src: string;
  category: ImageCategory;
  alt?: string;
  fallbackSrc?: string;
  placeholderSrc?: string;
  className?: string;
  style?: CSSProperties;
  rounded?: boolean;
  glow?: boolean;
  glowColor?: string;
  onClick?: () => void;
  /**
   * When true the component skips the category's fixed aspect-ratio and lets
   * the image render at its own natural ratio (width: 100%, height: auto).
   * Use this for images whose source dimensions differ from the spec default
   * (e.g. square NFT artwork displayed in a region slot).
   */
  nativeRatio?: boolean;
}

const CATEGORY_RADIUS: Record<ImageCategory, string> = {
  entities: 'rounded-xl',
  items: 'rounded-lg',
  missions: 'rounded-xl',
  regions: 'rounded-xl',
  avatars: 'rounded-full',
  effects: 'rounded-md',
};

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
  nativeRatio = false,
}: GameImageProps) {
  const [mainLoaded, setMainLoaded] = useState(false);
  const [mainError, setMainError] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [placeholderError, setPlaceholderError] = useState(false);

  const spec = IMAGE_SPECS[category];
  const fallback = fallbackSrc || IMAGE_FALLBACKS[category];

  const placeholderHealthy = !!placeholderSrc && !placeholderError;

  const handleLoad = useCallback(() => setMainLoaded(true), []);
  const handleError = useCallback(() => {
    setMainError((prev) => {
      if (prev) setMainLoaded(true);
      return true;
    });
  }, []);
  const handlePlaceholderLoad = useCallback(() => setPlaceholderLoaded(true), []);
  const handlePlaceholderError = useCallback(() => setPlaceholderError(true), []);

  const useFallback = mainError && !placeholderHealthy;
  const imageSrc = (resolveAssetUrl(useFallback ? fallback : src) ?? fallback) as string;
  const resolvedPlaceholder = placeholderHealthy
    ? (resolveAssetUrl(placeholderSrc!) ?? placeholderSrc!)
    : null;

  const mainVisible = mainLoaded && !(mainError && placeholderHealthy);
  const showSkeleton = !mainLoaded && !placeholderLoaded;

  const radiusClass = rounded ? 'rounded-full' : CATEGORY_RADIUS[category] ?? '';
  const glowClass = glow ? 'shadow-[0_0_16px_2px_var(--glow-color,rgba(139,92,246,0.5))]' : '';
  const clickableClass = onClick ? 'cursor-pointer group' : '';

  const combinedStyle: CSSProperties = {
    ...style,
    ...(nativeRatio ? {} : { aspectRatio: `${spec.width} / ${spec.height}` }),
    ...(glow && glowColor ? { '--glow-color': glowColor } as CSSProperties : {}),
  };

  return (
    <div
      className={[
        'relative overflow-hidden inline-flex items-center justify-center w-full bg-[rgba(139,92,246,0.08)]',
        nativeRatio ? 'min-h-[40px]' : '',
        radiusClass,
        glowClass,
        clickableClass,
        className,
      ].filter(Boolean).join(' ')}
      style={combinedStyle}
      onClick={onClick}
    >
      {showSkeleton && (
        <div className="absolute inset-0 [background:linear-gradient(110deg,rgba(139,92,246,0.1)_30%,rgba(139,92,246,0.2)_50%,rgba(139,92,246,0.1)_70%)] [background-size:200%_100%] [animation:game-image-shimmer_1.5s_infinite]" />
      )}
      {resolvedPlaceholder && (
        <img
          src={resolvedPlaceholder as string}
          alt=""
          aria-hidden="true"
          width={spec.width}
          height={spec.height}
          onLoad={handlePlaceholderLoad}
          onError={handlePlaceholderError}
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
        />
      )}
      <img
        src={imageSrc}
        alt={alt}
        width={spec.width}
        height={nativeRatio ? undefined : spec.height}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        className={[
          nativeRatio
            ? 'w-full h-auto object-contain'
            : 'w-full h-full object-cover',
          'z-[1] relative transition-opacity duration-[150ms] ease-[ease]',
          mainVisible ? 'opacity-100' : 'opacity-0',
          onClick ? 'group-hover:scale-[1.03] group-hover:transition-transform group-hover:duration-200' : '',
        ].filter(Boolean).join(' ')}
      />
    </div>
  );
}

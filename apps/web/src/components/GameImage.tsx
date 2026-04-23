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
  className = '',
  style,
  rounded = false,
  glow = false,
  glowColor,
  onClick,
}: GameImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const spec = IMAGE_SPECS[category];
  const fallback = fallbackSrc || IMAGE_FALLBACKS[category];

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    if (!error) {
      setError(true);
      setLoaded(true);
    }
  }, [error]);

  const imageSrc = (resolveAssetUrl(error ? fallback : src) ?? fallback) as string;

  const classes = [
    'game-image',
    `game-image--${category}`,
    loaded ? 'game-image--loaded' : 'game-image--loading',
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
      {!loaded && <div className="game-image__skeleton" />}
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

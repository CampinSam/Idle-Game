import { DEFAULT_ICON_URL, resolveAssetUrl } from '../utils/iconResolver';

interface GameIconProps {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
}

export default function GameIcon({ src, alt = '', size = 18, className = '' }: GameIconProps) {
  const resolvedSrc = resolveAssetUrl(src) ?? DEFAULT_ICON_URL;
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={size}
      height={size}
      className={`game-icon ${className}`}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== window.location.origin + DEFAULT_ICON_URL) {
          img.src = DEFAULT_ICON_URL;
        }
      }}
      draggable={false}
    />
  );
}

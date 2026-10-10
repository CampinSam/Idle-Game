import type { AssetRef } from '@derp/shared';
import { DEFAULT_ICON_URL, resolveAssetUrl } from '../../utils/iconResolver';
import { CSSProperties } from 'react';

interface AssetImageProps {
  asset: AssetRef;
  style?: CSSProperties;
  className?: string;
}

export default function AssetImage({ asset, style, className }: AssetImageProps) {
  const src = resolveAssetUrl(asset.assetKey) ?? DEFAULT_ICON_URL;

  return (
    <img
      src={src}
      alt={asset.alt || ''}
      style={style}
      className={`game-icon ${className ?? ''}`.trim()}
      draggable={false}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== window.location.origin + DEFAULT_ICON_URL) {
          img.src = DEFAULT_ICON_URL;
        }
      }}
    />
  );
}

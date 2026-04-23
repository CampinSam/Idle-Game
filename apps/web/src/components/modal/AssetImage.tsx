import type { AssetRef } from '@derp/shared';
import { DEFAULT_ICON_URL, mediaUrl } from '../../utils/iconResolver';
import { CSSProperties } from 'react';

interface AssetImageProps {
  asset: AssetRef;
  style?: CSSProperties;
  className?: string;
}

export default function AssetImage({ asset, style, className }: AssetImageProps) {
  const src = mediaUrl(asset.assetKey);

  return (
    <img
      src={src}
      alt={asset.alt || ''}
      style={style}
      className={className}
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

import { getRegionDisplay } from '@derp/shared';
import { GameImage } from '../../../../../components/GameImage';
import { getLocationImagePath } from '../../../../../config/images';

interface OutpostHeroSectionProps {
  outpost: any;
}

export function OutpostHeroSection({ outpost }: OutpostHeroSectionProps) {
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;

  // The hero area is only 160 px tall — the 256 px thumb is indistinguishable
  // from the full image and is faster to load. We intentionally omit
  // placeholderSrc here so that a load error always surfaces the region
  // fallback cleanly rather than leaving the thumb visible indefinitely.
  const heroSrc = getLocationImagePath(outpost.nftImageUrl, regionImage, 'thumb');

  return (
    <div className="relative overflow-hidden rounded-xl [&_img]:w-full [&_img]:h-[160px] [&_img]:object-cover">
      <GameImage
        src={heroSrc}
        category="regions"
        alt={regionName}
        fallbackSrc={regionImage}
      />
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(21,17,60,0) 30%, rgba(21,17,60,0.82) 78%, #15113c 100%)',
        }}
      />
    </div>
  );
}

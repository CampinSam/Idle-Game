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

  const heroSrc = getLocationImagePath(outpost.nftImageUrl, regionImage, 'full');
  const thumbSrc = outpost.nftImageUrl
    ? getLocationImagePath(outpost.nftImageUrl, regionImage, 'thumb')
    : undefined;

  return (
    <div className="relative overflow-hidden rounded-xl [&_img]:w-full [&_img]:h-[160px] [&_img]:object-cover">
      <GameImage
        src={heroSrc}
        category="regions"
        alt={regionName}
        placeholderSrc={thumbSrc}
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

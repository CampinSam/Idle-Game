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

  return (
    <div className="relative overflow-hidden rounded-xl">
      <GameImage
        src={heroSrc}
        category="regions"
        alt={outpost.name || regionName}
        fallbackSrc={regionImage}
        nativeRatio
      />
    </div>
  );
}

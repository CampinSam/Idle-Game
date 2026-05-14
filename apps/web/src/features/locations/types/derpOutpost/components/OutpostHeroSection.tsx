import { getRegionDisplay } from '@derp/shared';

interface OutpostHeroSectionProps {
  outpost: any;
}

export function OutpostHeroSection({ outpost }: OutpostHeroSectionProps) {
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <img src={regionImage} alt={regionName} className="block w-full h-[160px] object-cover" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(21,17,60,0) 30%, rgba(21,17,60,0.82) 78%, #15113c 100%)',
        }}
      />
    </div>
  );
}

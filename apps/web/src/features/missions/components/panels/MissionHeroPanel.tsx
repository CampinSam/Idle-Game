import {
  bgImageCss,
  resolveDisplay,
} from '../missionUtils';

interface MissionHeroPanelProps {
  def: any;
  currentCat?: any;
  missionCategoryDefs: any[];
  onBack?: () => void;
}

export function MissionHeroPanel({ def, missionCategoryDefs }: MissionHeroPanelProps) {
  const display = resolveDisplay(def, missionCategoryDefs);

  return (
    <div
      className="relative w-full h-[185px] flex-shrink-0 bg-center bg-cover bg-no-repeat"
      style={{ backgroundImage: bgImageCss(display.backgroundImage) }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(15,10,40,0.2) 0%, rgba(15,10,40,0.55) 50%, rgba(15,10,40,0.92) 100%)' }}
      />
    </div>
  );
}

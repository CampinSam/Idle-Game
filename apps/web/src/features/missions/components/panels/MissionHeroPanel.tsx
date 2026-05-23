import { Badge } from '../../../../components/ui';
import {
  bgImageCss,
  displayCssVars,
  formatDuration,
  getCategoryIcon,
  resolveDisplay,
} from '../missionUtils';
import { getDifficultyDisplay } from '@derp/shared';

interface MissionHeroPanelProps {
  def: any;
  currentCat?: any;
  missionCategoryDefs: any[];
  onBack?: () => void;
}

export function MissionHeroPanel({ def, currentCat, missionCategoryDefs, onBack }: MissionHeroPanelProps) {
  const diffInfo = getDifficultyDisplay(def.difficulty);
  const display = resolveDisplay(def, missionCategoryDefs);
  const missionTags = def.tags || [];
  const duration = def.timer?.duration ?? 0;
  const heroCss = displayCssVars(display, { hero: true });
  const catIcon = currentCat ? getCategoryIcon(currentCat.name ?? '') : '';

  return (
    <div
      className="relative w-full h-[185px] flex-shrink-0 bg-center bg-cover bg-no-repeat px-4 pt-4 pb-3"
      style={{ backgroundImage: bgImageCss(display.backgroundImage) }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-black/45 text-white text-[12px] font-bold border border-white/15 backdrop-blur-sm hover:bg-black/60 cursor-pointer"
        >
          ← Back
        </button>
      )}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(15,10,40,0.2) 0%, rgba(15,10,40,0.55) 50%, rgba(15,10,40,0.92) 100%)' }}
      />
      <div className="relative z-10 mt-8">
        <h1
          className="m-0 font-cinzel text-[24px] font-black tracking-[0.04em] leading-tight text-white flex items-center gap-2 [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]"
          style={heroCss.titleStyle}
        >
          <span className="text-[28px]">{catIcon}</span>
          {def.name}
        </h1>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge tone="info" className="!border-[rgba(168,85,247,0.4)] !bg-[rgba(168,85,247,0.3)] !text-[#C084FC]">{diffInfo.tier}</Badge>
          <Badge tone="neutral" className="!border-transparent !text-white" style={{ background: diffInfo.color }}>{diffInfo.label}</Badge>
          <Badge tone="neutral" className="!bg-[rgba(0,0,0,0.35)] !text-white/80 !border-white/10">⏱ {formatDuration(duration)}</Badge>
          {missionTags.map((tag: any, i: number) => (
            <Badge key={i} tone="neutral" className="!border-transparent !text-white" style={{ background: tag.color || '#3B82F6' }}>
              {tag.text}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

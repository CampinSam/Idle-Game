interface BuildingDetailHeaderProps {
  outpostName: string;
  buildingName: string;
  /** Status badges to show in the subtitle row. */
  badges?: React.ReactNode;
  /** Called when the back arrow is pressed. */
  onBack: () => void;
  /** Called when the ‹ (previous) carousel arrow is pressed. */
  onPrev?: () => void;
  /** Called when the › (next) carousel arrow is pressed. */
  onNext?: () => void;
  /** Whether carousel arrows should be visible. */
  hasNav?: boolean;
}

export function BuildingDetailHeader({
  outpostName,
  buildingName,
  badges,
  onBack,
  onPrev,
  onNext,
  hasNav = false,
}: BuildingDetailHeaderProps) {
  return (
    <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10 flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-2">

        {/* Back button */}
        <button
          onClick={onBack}
          aria-label="Back to Outpost"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
        >
          ←
        </button>

        {/* Title + subtitle badges */}
        <div className="flex-1 min-w-0">
          {outpostName && (
            <p className="text-[10px] font-extrabold tracking-[0.13em] uppercase text-[#fcd34d] leading-none truncate m-0 mb-0.5">
              {outpostName}
            </p>
          )}
          <h1 className="text-sm font-bold tracking-wide text-text-primary truncate m-0 leading-tight">
            {buildingName.toUpperCase()}
          </h1>
          {badges && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {badges}
            </div>
          )}
        </div>

        {/* Carousel arrows */}
        {hasNav && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onPrev}
              aria-label="Previous"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            >
              ‹
            </button>
            <button
              onClick={onNext}
              aria-label="Next"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

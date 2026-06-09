import JobProgressBar from './JobProgressBar';

interface BuildingProgressBarProps {
  name: string;
  startTick: number;
  durationTicks: number;
  isUpgrade?: boolean;
  onComplete?: () => void;
  compact?: boolean;
}

export default function BuildingProgressBar({
  name,
  startTick,
  durationTicks,
  isUpgrade = false,
  onComplete,
  compact = false,
}: BuildingProgressBarProps) {
  const typeLabel = isUpgrade ? 'upgrade' : 'construction';
  const readyLabel = compact
    ? `${name} ${typeLabel} ready`
    : `Tap to complete ${typeLabel}!`;

  return (
    <JobProgressBar
      label={name}
      startTick={startTick}
      durationTicks={durationTicks}
      variant="pill"
      compact={compact}
      readyLabel={readyLabel}
      onAction={onComplete}
    />
  );
}

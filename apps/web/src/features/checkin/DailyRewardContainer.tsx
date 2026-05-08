import { useSyncCheckIns } from '../../hooks/useSyncSelectors';
import CheckInTrack from './CheckInTrack';

export default function DailyRewardContainer() {
  const checkins = useSyncCheckIns() as any[];

  if (checkins.length === 0) return null;

  return (
    <div className="flex flex-col gap-0">
      {checkins.map((instance) => (
        <CheckInTrack key={instance.checkInDefId} defId={instance.checkInDefId} />
      ))}
    </div>
  );
}

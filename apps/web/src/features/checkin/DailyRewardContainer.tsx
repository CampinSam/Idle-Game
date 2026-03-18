import { useSyncCheckIns } from '../../hooks/useSyncSelectors';
import CheckInTrack from './CheckInTrack';
import './CheckIn.css';

export default function DailyRewardContainer() {
  const checkins = useSyncCheckIns() as any[];

  if (checkins.length === 0) return null;

  return (
    <div className="checkin-container">
      {checkins.map((instance) => (
        <CheckInTrack key={instance.checkInDefId} defId={instance.checkInDefId} />
      ))}
    </div>
  );
}

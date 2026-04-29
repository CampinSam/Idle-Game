import type { LocationPageProps } from '../../registry';

export default function DefaultPage({ outpost }: LocationPageProps) {
  return (
    <div className="od-tab-content">
      <div className="od-card">
        <h3 className="od-card-title">LOCATION</h3>
        <div className="od-empty-tasks">
          No dedicated view for this location kind ({outpost.region || outpost.definitionId || 'unknown'}).
          Level {outpost.level}.
        </div>
      </div>
    </div>
  );
}

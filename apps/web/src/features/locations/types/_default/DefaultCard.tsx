import { useAppSelector } from '../../../../store';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import GameIcon from '../../../../components/GameIcon';
import {
  formatRate,
  formatAmount,
} from '../../../../utils/locationProduction';
import type { LocationCardProps } from '../../registry';

export default function DefaultCard({ outpost, onClick }: LocationCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const locationTimerMap = useLocationTimers();
  const timerData = locationTimerMap.get(outpost.id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  return (
    <div
      className="outpost-card-v2"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="outpost-card-top">
        <span className="outpost-region-name">{(outpost.region || 'LOCATION').toUpperCase()}</span>
        <span className="outpost-lv-badge">⭐ Lv. {outpost.level}</span>
      </div>
      <div className="outpost-card-stats">
        <div className="level-display">
          Level <strong>{outpost.level}</strong>
        </div>
      </div>
      <div className="outpost-storage-bars">
        {resourceSummaries.length > 0 ? (
          resourceSummaries.map((res) => {
            const pct = res.capacity > 0
              ? Math.min(100, (res.currentAmount / res.capacity) * 100)
              : 0;
            return (
              <div key={res.key} className="storage-bar-row">
                <div className="storage-bar-label">
                  <span className="storage-bar-icon">
                    <GameIcon
                      src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                      size={14}
                    />
                  </span>
                  <span className="storage-bar-name">
                    {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                  </span>
                  <span className="storage-bar-rate">
                    {res.netRatePerHour >= 0 ? '+' : ''}{formatRate(res.netRatePerHour)}/hr
                  </span>
                </div>
                <div className="storage-bar-track">
                  <div className="storage-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="storage-bar-amounts">
                  <span className="storage-current">{formatAmount(res.currentAmount)}</span>
                  <span className="storage-sep">/</span>
                  <span className="storage-cap">{formatAmount(res.capacity)}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="storage-empty">No generators active</div>
        )}
      </div>
    </div>
  );
}

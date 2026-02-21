import { useState } from 'react';
import { useCommand } from '../../hooks/useCommand';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import { formatDuration } from '../../utils/formatDuration';
import './FacilitiesTab.css';

interface UpgradeBuildingModalProps {
  building: any;
  outpostId: string;
  currencyDefs: any[];
  itemDefs: any[];
  currencyBalances: Record<string, number>;
  itemBalances: Record<string, number>;
  onClose: () => void;
  onUpgraded: () => void;
}

export default function UpgradeBuildingModal({
  building,
  outpostId,
  currencyDefs,
  itemDefs,
  currencyBalances,
  itemBalances,
  onClose,
  onUpgraded,
}: UpgradeBuildingModalProps) {
  const { execute } = useCommand();
  const [upgrading, setUpgrading] = useState(false);

  const currentLevel = building.level;
  const maxLevel = building.maxLevel ?? 50;
  const isMaxLevel = currentLevel >= maxLevel;

  const upgradeCosts = building.upgradeCosts || [];
  const timerDuration = building.upgradeTimer?.duration ?? 0;

  const costEntries = upgradeCosts.map((cost: any) => {
    const key = cost.id;
    const amount = cost.amount ?? 0;
    const isCurrency = cost.type === 'currency';
    const outputType = isCurrency ? 'CURRENCY' : 'ITEM';
    const icon = resolveIcon(outputType, key, currencyDefs, itemDefs);
    const name = resolveName(outputType, key, currencyDefs, itemDefs);
    const has = isCurrency ? (currencyBalances[key] ?? 0) : (itemBalances[key] ?? 0);
    const sufficient = has >= amount;
    return { key, icon, name, amount, sufficient };
  });

  const allCostsMet = costEntries.every((c: any) => c.sufficient);
  const canUpgrade = !isMaxLevel && allCostsMet && !upgrading;

  const handleUpgrade = async () => {
    if (!canUpgrade) return;
    setUpgrading(true);
    try {
      await execute('UpgradeBuilding', { locationId: outpostId, buildingId: building.id });
      onUpgraded();
    } catch (err: any) {
      alert('Upgrade failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="build-modal-overlay" onClick={onClose}>
      <div className="build-modal" onClick={(e) => e.stopPropagation()}>
        <div className="build-modal-header">
          <h2 className="build-modal-title">Upgrade {building.name}</h2>
          <button className="build-modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="build-modal-desc">
          {isMaxLevel
            ? `This building is at maximum level (${maxLevel}).`
            : `Level ${currentLevel} → Level ${currentLevel + 1}`}
        </p>

        {!isMaxLevel && (
          <>
            {building.category === 'GENERATOR' && (
              <>
                <div className="build-modal-section">
                  <h4 className="build-modal-label">PRODUCES</h4>
                  <div className="build-produces-row">
                    <span className="build-produces-icon">
                      <GameIcon src={resolveIcon(building.outputType, building.outputRefId, currencyDefs, itemDefs)} size={16} />
                    </span>
                    <span className="build-produces-name">
                      {resolveName(building.outputType, building.outputRefId, currencyDefs, itemDefs)}
                    </span>
                    <span className="build-produces-rate">+{building.resourcePerHour}/h</span>
                  </div>
                </div>
                <div className="build-modal-divider" />
              </>
            )}

            <div className="build-modal-section">
              <h4 className="build-modal-label">UPGRADE COST</h4>
              <div className="build-cost-compact">
                <div className="build-cost-time">🕐 {formatDuration(timerDuration)}</div>
                {costEntries.length > 0 && (
                  <div className="build-cost-resources">
                    {costEntries.map((c: any, i: number) => (
                      <span key={c.key} className={!c.sufficient ? 'insufficient' : ''}>
                        {i > 0 && ', '}<GameIcon src={c.icon} size={16} /> {c.amount} {c.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="build-modal-footer">
          <button className="build-cancel-btn" onClick={onClose}>Cancel</button>
          {!isMaxLevel && (
            <button
              className={`build-btn ${!canUpgrade ? 'disabled' : ''}`}
              onClick={handleUpgrade}
              disabled={!canUpgrade}
            >
              {upgrading ? 'Upgrading...' : 'Upgrade'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

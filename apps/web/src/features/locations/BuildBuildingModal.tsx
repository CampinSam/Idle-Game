import { useState } from 'react';
import { useCommand } from '../../hooks/useCommand';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import { formatDuration } from '../../utils/formatDuration';
import './FacilitiesTab.css';

interface BuildBuildingModalProps {
  def: any;
  outpostId: string;
  currencyDefs: any[];
  itemDefs: any[];
  currencyBalances: Record<string, number>;
  itemBalances: Record<string, number>;
  keeperLevel: number;
  onClose: () => void;
  onBuilt: () => void;
}

export default function BuildBuildingModal({
  def,
  outpostId,
  currencyDefs,
  itemDefs,
  currencyBalances,
  itemBalances,
  keeperLevel,
  onClose,
  onBuilt,
}: BuildBuildingModalProps) {
  const { execute } = useCommand();
  const [building, setBuilding] = useState(false);

  const requirements = def.requirements || [];
  const levelMap = def.rules?.level || {};
  const level1Config = levelMap['1'] || {};
  const constructionCost = level1Config.constructionCost || [];
  const timerDuration = level1Config.timer?.duration ?? 0;

  const filteredReqs = requirements.filter((req: any) => {
    if (req.type === 'keeper_level' && (req.value === undefined || req.value === null)) return false;
    return true;
  });

  const reqResults = filteredReqs.map((req: any) => {
    if (req.type === 'keeper_level') {
      return { label: `Keeper Level ${req.value}`, met: keeperLevel >= req.value };
    }
    if (req.type === 'flag') {
      return { label: `Flag: ${req.key}`, met: true };
    }
    return { label: `${req.type}: ${req.value || req.key || ''}`, met: true };
  });

  const costEntries = constructionCost.map((cost: any) => {
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

  const allReqsMet = reqResults.every((r: any) => r.met);
  const allCostsMet = costEntries.every((c: any) => c.sufficient);
  const canBuild = allReqsMet && allCostsMet && !building;

  const handleBuild = async () => {
    if (!canBuild) return;
    setBuilding(true);
    try {
      await execute('BuildBuilding', { locationId: outpostId, buildingDefId: def.id });
      onBuilt();
    } catch (err: any) {
      alert('Build failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="build-modal-overlay" onClick={onClose}>
      <div className="build-modal" onClick={(e) => e.stopPropagation()}>
        <div className="build-modal-header">
          <h2 className="build-modal-title">{def.name}</h2>
          <button className="build-modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="build-modal-desc">{def.description}</p>

        <div className="build-modal-section">
          <h4 className="build-modal-label">REQUIREMENTS</h4>
          <div className="build-req-list">
            {reqResults.length === 0 && (
              <div className="build-req-none">None</div>
            )}
            {reqResults.map((r: any, i: number) => (
              <div key={i} className={r.met ? 'build-req-met' : 'build-req-unmet'}>
                {r.met ? '✓' : '✗'} {r.label}
              </div>
            ))}
          </div>
        </div>

        <div className="build-modal-divider" />

        {def.category === 'GENERATOR' && (
          <>
            <div className="build-modal-section">
              <h4 className="build-modal-label">PRODUCES</h4>
              <div className="build-produces-row">
                <span className="build-produces-icon">
                  <GameIcon src={resolveIcon(def.outputType, def.outputRefId, currencyDefs, itemDefs)} size={16} />
                </span>
                <span className="build-produces-name">
                  {resolveName(def.outputType, def.outputRefId, currencyDefs, itemDefs)}
                </span>
                <span className="build-produces-rate">+{def.resourcePerHour}/h</span>
              </div>
            </div>
            <div className="build-modal-divider" />
          </>
        )}

        <div className="build-modal-section">
          <h4 className="build-modal-label">COST</h4>
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

        <div className="build-modal-footer">
          <button className="build-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className={`build-btn ${!canBuild ? 'disabled' : ''}`}
            onClick={handleBuild}
            disabled={!canBuild}
          >
            {building ? 'Building...' : 'Build'}
          </button>
        </div>
      </div>
    </div>
  );
}

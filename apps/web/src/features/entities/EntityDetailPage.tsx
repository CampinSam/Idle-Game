import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { EntityDetail } from './components';
import { PotionPickerModal, UsePotionFlowModal } from '../inventory/components';
import './EntityDetailPage.css';

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [potionPickerOpen, setPotionPickerOpen] = useState(false);
  const [usePotionState, setUsePotionState] = useState<{ potion: any } | null>(null);

  const entity = useAppSelector((s) => s.sync.entities[id ?? '']);

  const openPotionPicker = useCallback(() => setPotionPickerOpen(true), []);
  const closePotionPicker = useCallback(() => setPotionPickerOpen(false), []);
  const closeUsePotion = useCallback(() => setUsePotionState(null), []);

  const handlePickedPotion = useCallback((potion: any) => {
    setPotionPickerOpen(false);
    setUsePotionState({ potion });
  }, []);

  if (!entity) {
    return (
      <div className="entity-detail-page">
        <div className="entity-detail-page__loading">Entity not found.</div>
        <button className="entity-detail-page__back-link" onClick={() => navigate('/entities')}>Back to Entities</button>
      </div>
    );
  }

  return (
    <div className="entity-detail-page">
      <div className="entity-detail-page__header">
        <button className="entity-detail-page__back-btn" onClick={() => navigate('/entities')}>←</button>
        <h1 className="entity-detail-page__name">{entity.name}</h1>
        <div className="entity-detail-page__header-icons">
          <button className="entity-detail-page__icon-btn" style={{ background: '#F59E0B' }}>⚡</button>
          <button className="entity-detail-page__icon-btn" style={{ background: '#6B7280' }}>⚙️</button>
        </div>
      </div>
      <EntityDetail entity={entity} variant="full" onApplyPotion={openPotionPicker} />

      <PotionPickerModal
        isOpen={potionPickerOpen}
        entityId={entity.id}
        entityName={entity.name}
        onClose={closePotionPicker}
        onSelectPotion={handlePickedPotion}
      />

      <UsePotionFlowModal
        isOpen={!!usePotionState}
        potion={usePotionState?.potion ?? null}
        targetEntityId={entity.id}
        targetEntityName={entity.name}
        onClose={closeUsePotion}
      />
    </div>
  );
}

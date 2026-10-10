import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import EntityDetailContent from './EntityDetailContent';

export default function EntityDetailPage() {
  const { definition } = useScreenComposition('entities_detail');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <EntityDetailContent />;
}

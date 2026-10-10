import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import StoreContent from './StoreContent';

export default function StorePage() {
  const { definition } = useScreenComposition('store');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <StoreContent />;
}

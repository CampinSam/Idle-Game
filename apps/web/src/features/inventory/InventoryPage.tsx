import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import InventoryContent from './InventoryContent';

export default function InventoryPage() {
  const { definition } = useScreenComposition('inventory');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <InventoryContent />;
}

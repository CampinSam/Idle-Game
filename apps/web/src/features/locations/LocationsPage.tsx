import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import LocationsContent from './LocationsContent';

export default function LocationsPage() {
  const { definition } = useScreenComposition('locations');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <LocationsContent />;
}

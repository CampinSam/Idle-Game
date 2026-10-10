import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import LocationDetailContent from './LocationDetailContent';

export default function LocationDetailPage() {
  const { definition } = useScreenComposition('locations_detail');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <LocationDetailContent />;
}

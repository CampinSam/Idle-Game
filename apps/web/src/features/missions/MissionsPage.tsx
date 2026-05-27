import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import MissionsContent from './MissionsContent';

export default function MissionsPage() {
  const { definition } = useScreenComposition('missions');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <MissionsContent />;
}

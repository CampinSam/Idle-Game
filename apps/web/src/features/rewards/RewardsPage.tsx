import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import RewardsContent from './RewardsContent';

export default function RewardsPage() {
  const { definition } = useScreenComposition('rewards');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <RewardsContent />;
}

import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import AchievementsContent from './AchievementsContent';

export default function AchievementsPage() {
  const { definition } = useScreenComposition('achievements');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <AchievementsContent />;
}

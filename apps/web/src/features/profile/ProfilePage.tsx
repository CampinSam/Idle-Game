import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import ProfileContent from './ProfileContent';

export default function ProfilePage() {
  const { definition } = useScreenComposition('profile');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <ProfileContent />;
}

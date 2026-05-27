import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import SettingsContent from './SettingsContent';

export default function SettingsPage() {
  const { definition } = useScreenComposition('settings');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <SettingsContent />;
}

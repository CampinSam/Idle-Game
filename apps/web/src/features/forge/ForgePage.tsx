import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import ForgeContent from './ForgeContent';

export default function ForgePage() {
  const { definition } = useScreenComposition('forge');
  if (definition) return <ScreenCompositionRenderer definition={definition} />;
  return <ForgeContent />;
}

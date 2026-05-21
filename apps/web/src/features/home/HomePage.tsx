import React from 'react';
import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import HomePageV2 from './HomePageV2';

export default function HomePage() {
  const { definition } = useScreenComposition('home_screen');

  if (!definition) return <HomePageV2 />;

  return <ScreenCompositionRenderer definition={definition} />;
}

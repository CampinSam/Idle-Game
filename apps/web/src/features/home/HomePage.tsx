import React from 'react';
import { HomePageSkeleton } from '../../components/Skeleton';
import { useScreenComposition } from '../screens/useScreenComposition';
import { ScreenCompositionRenderer } from '../screens/ScreenCompositionRenderer';
import HomePageV2 from './HomePageV2';

export default function HomePage() {
  const { definition, loading } = useScreenComposition('home_screen');

  if (loading) return <HomePageSkeleton />;
  if (!definition) return <HomePageV2 />;

  return <ScreenCompositionRenderer definition={definition} />;
}

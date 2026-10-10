export type PerpFaction = 'genovault' | 'astro_schism' | 'kraashers';

export function getFaction(entity: any): PerpFaction | null {
  const faction = entity?.traits?.faction;
  if (!faction || typeof faction !== 'string') return null;
  const lower = faction.toLowerCase();
  if (lower === 'genovault') return 'genovault';
  if (lower === 'astro schism') return 'astro_schism';
  if (lower === 'kraashers') return 'kraashers';
  return null;
}

export function isLeader(entity: any): 'multiverse_leader' | 'leader' | null {
  const leader = entity?.traits?.leader;
  if (!leader || typeof leader !== 'string') return null;
  const lower = leader.toLowerCase();
  if (lower.includes('multiverse')) return 'multiverse_leader';
  if (lower === 'leader') return 'leader';
  return null;
}

export const JOB_TYPE_CONFIG: Record<string, { defTable: string; category: string; label: string; screen: string }> = {
  MissionJob: { defTable: 'missionDef', category: 'missions', label: 'Mission', screen: '/missions' },
  CraftingJob: { defTable: 'recipeDef', category: 'crafting', label: 'Crafting', screen: '/crafting' },
  BuildingJob: { defTable: 'buildingDef', category: 'buildings', label: 'Building', screen: '/locations' },
  DustingJob: { defTable: 'itemDefinition', category: 'inventory', label: 'Dusting', screen: '/inventory' },
};

export interface SelectionEntityContext {
  id?: string;
  entityType?: string;
  speciesId?: string;
  collectionId?: string;
  traits: Record<string, string>;
  stats: Record<string, number>;
  level?: number;
  rarity?: string;
  regionId?: string;
  locationTypes?: string[];
  buildingTags?: string[];
  missionTags?: string[];
}

export interface SelectionLocationContext {
  id?: string;
  regionId?: string | null;
  buildings: { buildingDefId: string; rooms?: { roomDefId: string }[] }[];
  rooms: { roomDefId: string }[];
  locationType?: string;
}

export interface SelectionBuildingContext {
  buildingDefId?: string;
  rooms: { roomDefId: string }[];
  tags?: string[];
}

export interface SelectionMissionContext {
  activityType?: string;
  missionType?: string;
  missionTags?: string[];
  regionId?: string;
  seasonId?: string;
  teamSize?: number;
}

export interface SelectionEventContext {
  type: string;
  key?: string;
  amount: number;
  data: Record<string, unknown>;
}

export interface SelectionContext {
  player: {
    keeperLevel: number;
    flags: Record<string, unknown>;
  };
  entities: SelectionEntityContext[];
  inventory: {
    currencies: Record<string, number>;
    items: Record<string, number>;
  };
  locations: SelectionLocationContext[];
  currentLocation?: SelectionLocationContext;
  parentBuilding?: SelectionBuildingContext;
  missionContext?: SelectionMissionContext;
  event?: SelectionEventContext;
}

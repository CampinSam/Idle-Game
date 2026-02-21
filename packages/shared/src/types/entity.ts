export interface EntityStats {
  ATK: number;
  DEF: number;
  SPD: number;
  FOC: number;
  LCK: number;
  VIT: number;
}

export type EntityArchetype =
  | 'Dave'
  | 'Astro'
  | 'Magician'
  | 'Ninja'
  | 'Redneck'
  | 'Stoner'
  | 'DJ'
  | 'Viking'
  | 'Monk'
  | 'Corpo'
  | 'Cyborg'
  | 'Buff'
  | 'MadScientist'
  | 'Deity';

export interface EntityTraits {
  head: EntityArchetype;
  ears: EntityArchetype;
  beak: EntityArchetype;
  eyes: EntityArchetype;
  body: EntityArchetype;
  back: EntityArchetype;
  tail: EntityArchetype;
}

export type EntityStatus = 'idle' | 'mission' | 'working' | 'injured';

export interface Entity {
  id: string;
  userId: string;
  nftAssetId?: string;
  name: string;
  level: number;
  xp: number;
  ascensionTier: number;
  stats: EntityStats;
  traits: EntityTraits;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntityDto {
  name: string;
}

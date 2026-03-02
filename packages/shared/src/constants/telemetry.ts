export const PlayerEventType = {
  MISSION_COMPLETE: 'mission_complete',
  CURRENCY_EARNED: 'currency_earned',
  ITEM_COLLECTED: 'item_collected',
  LOCATION_CLAIMED: 'location_claimed',
  ITEM_CRAFTED: 'item_crafted',
  BUILDING_BUILT: 'building_built',
  KEEPER_LEVEL_UP: 'keeper_level_up',
  ENTITY_LEVEL_UP: 'entity_level_up',
  GIFT_CLAIMED: 'gift_claimed',
  LOOTBOX_OPENED: 'lootbox_opened',
  CHECKIN_COMPLETED: 'checkin_completed',
} as const;

export type PlayerEventType = (typeof PlayerEventType)[keyof typeof PlayerEventType];

export interface PlayerEventData extends Record<string, unknown> {}

export interface TelemetryEvent {
  id: string;
  userId: string;
  eventType: PlayerEventType | string;
  key: string | null;
  amount: number;
  data: Record<string, unknown>;
  createdAt: Date;
}

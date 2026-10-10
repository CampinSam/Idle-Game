import type { RichSelection } from './rich-selection';

export const TELEMETRY_EVENT_TYPES = [
  'MISSION_START',
  'MISSION_SUCCESS',
  'MISSION_FAIL',
  'mission_complete',
  'checkin_completed',
  'crafting_completed',
  'lootbox_opened',
  'shop_purchase',
  'gift_claimed',
  'quest_claimed',
  'achievement_claimed',
  'location_xp_deposited',
  'location_level_up',
] as const;
export type TelemetryEventType = typeof TELEMETRY_EVENT_TYPES[number];

export interface TelemetrySubEventSpec {
  key: string;
  eventType: TelemetryEventType;
  filter: RichSelection | null;
}

export interface TelemetryDefDto {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  startDate?: string | null;
  endDate?: string | null;
  subEvents: TelemetrySubEventSpec[];
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryCountDto {
  subEventKey: string;
  count: string;
  lastIncrementedAt: string;
}

export interface TelemetryDefWithCountsDto extends TelemetryDefDto {
  counts: TelemetryCountDto[];
}

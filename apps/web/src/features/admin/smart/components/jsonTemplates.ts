export interface TemplateOption {
  label: string;
  description: string;
  color: string;
  template: () => Record<string, any>;
}

const SKY = '#38bdf8';
const EMERALD = '#34d399';
const ORANGE = '#fb923c';
const PINK = '#f472b6';
const PURPLE = '#a78bfa';
const AMBER = '#facc15';
const SLATE = '#94a3b8';

export const ARRAY_TEMPLATES: Record<string, TemplateOption[]> = {
  requirements: [
    { label: 'keeper_level', description: 'Player level gate', color: SKY, template: () => ({ type: 'keeper_level', operator: 'gte', value: 1 }) },
    { label: 'flag', description: 'Player flag check', color: SKY, template: () => ({ type: 'flag', key: '', operator: 'eq', value: true }) },
    { label: 'building', description: 'Has a building', color: SKY, template: () => ({ type: 'building', key: '', operator: 'exists' }) },
    { label: 'currency', description: 'Currency balance check', color: EMERALD, template: () => ({ type: 'currency', key: '', operator: 'gte', value: 0 }) },
    { label: 'item', description: 'Has an item', color: EMERALD, template: () => ({ type: 'item', key: '', operator: 'exists' }) },
    { label: 'trait', description: 'Entity trait check', color: EMERALD, template: () => ({ type: 'trait', key: '', operator: 'exists' }) },
  ],
  visibilityRequirements: [
    { label: 'keeper_level', description: 'Player level gate', color: SKY, template: () => ({ type: 'keeper_level', operator: 'gte', value: 1 }) },
    { label: 'flag', description: 'Player flag check', color: SKY, template: () => ({ type: 'flag', key: '', operator: 'eq', value: true }) },
    { label: 'building', description: 'Has a building', color: SKY, template: () => ({ type: 'building', key: '', operator: 'exists' }) },
    { label: 'currency', description: 'Currency balance check', color: EMERALD, template: () => ({ type: 'currency', key: '', operator: 'gte', value: 0 }) },
    { label: 'item', description: 'Has an item', color: EMERALD, template: () => ({ type: 'item', key: '', operator: 'exists' }) },
    { label: 'team_size', description: 'Team member count', color: EMERALD, template: () => ({ type: 'team_size', operator: 'gte', value: 1 }) },
    { label: 'trait', description: 'Entity trait check', color: EMERALD, template: () => ({ type: 'trait', key: '', operator: 'exists' }) },
  ],
  rewards: [
    { label: 'bundle', description: 'Probability bundle (nested outcomes)', color: PURPLE, template: () => ({ bundle: [], odds: 1 }) },
    { label: 'pick bundle', description: 'Pick N from bundle (weighted random selection)', color: PURPLE, template: () => ({ bundle: [], odds: 1, pickMin: 1, pickMax: 1 }) },
    { label: 'currency', description: 'Currency payout', color: ORANGE, template: () => ({ type: 'currency', key: '', min: 1, max: 10, odds: 1 }) },
    { label: 'item', description: 'Item drop', color: ORANGE, template: () => ({ type: 'item', key: '', min: 1, max: 1, odds: 0.5 }) },
    { label: 'entity_xp', description: 'XP for entities', color: ORANGE, template: () => ({ type: 'entity_xp', min: 10, max: 50 }) },
    { label: 'keeper_xp', description: 'XP for the keeper', color: ORANGE, template: () => ({ type: 'keeper_xp', min: 10, max: 50 }) },
    { label: 'flag', description: 'Set a player flag', color: PINK, template: () => ({ type: 'flag', operation: 'set', key: '', value: true }) },
    { label: 'text', description: 'Narrative text output', color: PINK, template: () => ({ type: 'text', message: '' }) },
    { label: 'emitEvent (gift ref)', description: 'Fire an event with a GiftDef reference', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { giftDefId: '' } } }) },
    { label: 'emitEvent (inline gift)', description: 'Fire an event with an inline gift definition', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { name: '', instant: true, rewardSpec: [] } } }) },
  ],
  bundle: [
    { label: 'bundle', description: 'Nested probability bundle', color: PURPLE, template: () => ({ bundle: [], odds: 1 }) },
    { label: 'pick bundle', description: 'Pick N from bundle (weighted random selection)', color: PURPLE, template: () => ({ bundle: [], odds: 1, pickMin: 1, pickMax: 1 }) },
    { label: 'currency', description: 'Currency payout', color: ORANGE, template: () => ({ type: 'currency', key: '', min: 1, max: 10, odds: 1 }) },
    { label: 'item', description: 'Item drop', color: ORANGE, template: () => ({ type: 'item', key: '', min: 1, max: 1, odds: 0.5 }) },
    { label: 'entity_xp', description: 'XP for entities', color: ORANGE, template: () => ({ type: 'entity_xp', min: 10, max: 50 }) },
    { label: 'keeper_xp', description: 'XP for the keeper', color: ORANGE, template: () => ({ type: 'keeper_xp', min: 10, max: 50 }) },
    { label: 'flag', description: 'Set a player flag', color: PINK, template: () => ({ type: 'flag', operation: 'set', key: '', value: true }) },
    { label: 'text', description: 'Narrative text output', color: PINK, template: () => ({ type: 'text', message: '' }) },
    { label: 'emitEvent (gift ref)', description: 'Fire an event with a GiftDef reference', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { giftDefId: '' } } }) },
    { label: 'emitEvent (inline gift)', description: 'Fire an event with an inline gift definition', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { name: '', instant: true, rewardSpec: [] } } }) },
  ],
  outcomePool: [
    { label: 'bundle', description: 'Probability bundle', color: PURPLE, template: () => ({ bundle: [], odds: 1 }) },
    { label: 'pick bundle', description: 'Pick N from bundle (weighted random selection)', color: PURPLE, template: () => ({ bundle: [], odds: 1, pickMin: 1, pickMax: 1 }) },
    { label: 'currency', description: 'Currency payout', color: ORANGE, template: () => ({ type: 'currency', key: '', min: 1, max: 10, odds: 1 }) },
    { label: 'item', description: 'Item drop', color: ORANGE, template: () => ({ type: 'item', key: '', min: 1, max: 1, odds: 0.5 }) },
    { label: 'entity_xp', description: 'Entity XP', color: ORANGE, template: () => ({ type: 'entity_xp', min: 10, max: 50 }) },
    { label: 'keeper_xp', description: 'Keeper XP', color: ORANGE, template: () => ({ type: 'keeper_xp', min: 10, max: 50 }) },
    { label: 'emitEvent (gift ref)', description: 'Fire an event with a GiftDef reference', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { giftDefId: '' } } }) },
    { label: 'emitEvent (inline gift)', description: 'Fire an event with an inline gift definition', color: SLATE, template: () => ({ type: 'emitEvent', defId: '', payload: { gift: { name: '', instant: true, rewardSpec: [] } } }) },
  ],
  cost: [
    { label: 'currency', description: 'Currency cost entry', color: EMERALD, template: () => ({ type: 'currency', id: '', amount: 1 }) },
    { label: 'item', description: 'Item cost entry', color: ORANGE, template: () => ({ type: 'item', id: '', amount: 1 }) },
  ],
  originalCost: [
    { label: 'currency', description: 'Original currency cost', color: EMERALD, template: () => ({ type: 'currency', id: '', amount: 1 }) },
    { label: 'item', description: 'Original item cost', color: ORANGE, template: () => ({ type: 'item', id: '', amount: 1 }) },
  ],
  contents: [
    { label: 'currency', description: 'Currency grant', color: EMERALD, template: () => ({ type: 'currency', id: '', amount: 1 }) },
    { label: 'item', description: 'Item grant', color: ORANGE, template: () => ({ type: 'item', id: '', amount: 1 }) },
    { label: 'entity', description: 'Entity grant', color: PURPLE, template: () => ({ type: 'entity', definitionId: '', amount: 1 }) },
  ],
  skip_cost: [
    { label: 'currency', description: 'Pay currency to skip', color: EMERALD, template: () => ({ type: 'currency', id: '', amount: 1 }) },
    { label: 'item', description: 'Spend item to skip', color: EMERALD, template: () => ({ type: 'item', id: '', amount: 1 }) },
  ],
  rewardPreview: [
    { label: 'currency', description: 'Currency reward preview', color: EMERALD, template: () => ({ type: 'currency', id: '', amount: 1 }) },
    { label: 'item', description: 'Item reward preview', color: ORANGE, template: () => ({ type: 'item', id: '', amount: 1 }) },
  ],
  effects: [
    { label: 'effect', description: 'Effect entry for consumable', color: PURPLE, template: () => ({ effectDefId: '', targetType: 'player' }) },
  ],
  passiveEffects: [
    { label: 'effect', description: 'Passive effect (applied while equipped)', color: PURPLE, template: () => ({ effectDefId: '', targetType: 'entity' }) },
  ],
  synergyEffectsArray: [
    { label: 'synergy_score_modifier', description: 'Adjust synergy score', color: PURPLE, template: () => ({ type: 'synergy_score_modifier', operation: 'flat_add', value: 1 }) },
    { label: 'stat_modifier', description: 'Modify an entity stat', color: AMBER, template: () => ({ type: 'stat_modifier', stat: '', operation: 'flat_add', value: 1 }) },
    { label: 'duration_modifier', description: 'Modify activity duration', color: ORANGE, template: () => ({ type: 'duration_modifier', activity: 'mission', operation: 'percent_add', value: -10 }) },
    { label: 'resource_yield_modifier', description: 'Modify resource yield', color: EMERALD, template: () => ({ type: 'resource_yield_modifier', resourceId: '', operation: 'percent_add', value: 10 }) },
    { label: 'immunity', description: 'Grant immunity to a status', color: PINK, template: () => ({ type: 'immunity', immuneTo: '' }) },
  ],
  body: [
    { label: 'richText', description: 'Formatted text block', color: AMBER, template: () => ({ type: 'richText', text: '' }) },
    { label: 'timer', description: 'Countdown timer display', color: AMBER, template: () => ({ type: 'timer', label: '' }) },
    { label: 'progress', description: 'Progress bar', color: AMBER, template: () => ({ type: 'progress', label: '', value: 0, max: 100 }) },
    { label: 'rewardsList', description: 'Reward pill list', color: AMBER, template: () => ({ type: 'rewardsList' }) },
    { label: 'giftReveal', description: 'Gift reveal animation', color: AMBER, template: () => ({ type: 'giftReveal' }) },
  ],
  objectives: [
    { label: 'objective', description: 'Quest objective', color: SLATE, template: () => ({ eventType: '', target: 1, description: '' }) },
  ],
  days: [
    { label: 'day (ref)', description: 'Daily check-in reward via GiftDef reference', color: SLATE, template: () => ({ day: 0, gift: { giftDefId: '' } }) },
    { label: 'day (inline)', description: 'Daily check-in reward with inline gift definition', color: SLATE, template: () => ({ day: 0, gift: { name: '', instant: true, rewardSpec: [] } }) },
  ],
};

export function resolveTemplates(path: string): TemplateOption[] | null {
  const segments = path.split('.').map(s => s.replace(/\[\d+\]$/, ''));
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg in ARRAY_TEMPLATES) {
      return ARRAY_TEMPLATES[seg];
    }
  }
  return null;
}

export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

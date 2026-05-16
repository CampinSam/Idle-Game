export const RARITY_TEXT_CLASS: Record<string, string> = {
  COMMON:    'text-rarity-common',
  UNCOMMON:  'text-rarity-uncommon',
  SCARE:     'text-rarity-scare',
  RARE:      'text-rarity-rare',
  EPIC:      'text-rarity-epic',
  MYTHIC:    'text-rarity-mythic',
  LEGENDARY: 'text-rarity-legendary',
  UNIQUE:    'text-rarity-unique',
};

export function rarityTextClass(rarity?: string): string {
  return RARITY_TEXT_CLASS[(rarity ?? 'COMMON').toUpperCase()] ?? RARITY_TEXT_CLASS.COMMON;
}

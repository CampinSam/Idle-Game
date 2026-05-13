export const RARITY_TEXT_CLASS: Record<string, string> = {
  COMMON:     'text-rarity-common',
  UNCOMMON:   'text-rarity-uncommon',
  SCARCE:     'text-rarity-scarce',
  ADVANCED:   'text-rarity-advanced',
  RARE:       'text-rarity-rare',
  ULTRA_RARE: 'text-rarity-ultra-rare',
  EPIC:       'text-rarity-epic',
  MYTHIC:     'text-rarity-mythic',
  LEGENDARY:  'text-rarity-legendary',
};

export function rarityTextClass(rarity?: string): string {
  return RARITY_TEXT_CLASS[(rarity ?? 'COMMON').toUpperCase()] ?? RARITY_TEXT_CLASS.COMMON;
}

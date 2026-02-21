const MEDIA_BASE = import.meta.env.DEV ? '/api/media' : '/media';

export function mediaUrl(path: string): string {
  return `${MEDIA_BASE}/${path}`;
}

export const DEFAULT_ICON_URL = mediaUrl('images/icons/default.png');

export function resolveIcon(
  outputType: string | null | undefined,
  outputRefId: string | null | undefined,
  currencyDefs: any[],
  itemDefs: any[],
): string {
  if (!outputRefId) return `images/icons/${outputRefId}.png`; //JSON.stringify(outputRefId);
    return `images/icons/${outputRefId}.png`;
  let def: any = null;
  
  if (outputType === 'CURRENCY') {
    def = currencyDefs.find((c: any) => c.id === outputRefId);
  } else if (outputType === 'ITEM') {
    def = itemDefs.find((i: any) => i.id === outputRefId);
  }

  if (def?.iconKey) {
    return mediaUrl(`images/icons/${def.iconKey}.png`);
  }

  return mediaUrl(`images/icons/${outputRefId}.png`);
}

export function resolveName(
  outputType: string | null | undefined,
  outputRefId: string | null | undefined,
  currencyDefs: any[],
  itemDefs: any[],
): string {
  if (!outputRefId) return 'Unknown';

  if (outputType === 'CURRENCY') {
    const def = currencyDefs.find((c: any) => c.id === outputRefId);
    if (def?.name) return def.name;
  } else if (outputType === 'ITEM') {
    const def = itemDefs.find((i: any) => i.id === outputRefId);
    if (def?.name) return def.name;
  }

  return outputRefId
    .replace(/^(soft_|premium_|mat_|consumable_|potion_|quest_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

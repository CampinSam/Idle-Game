const MEDIA_BASE = import.meta.env.DEV ? '/api/media' : '/media';

export function mediaUrl(path: string): string {
  return `${MEDIA_BASE}/${path}`;
}

export const DEFAULT_ICON_URL = mediaUrl('images/icons/default.png');

// Resolve an iconKey to a /media/* URL. Two conventions are supported:
//   - Bare names ("lucky_charm")     → images/icons/<name>.png  (seed data)
//   - Full media paths ("media/x.png") → mediaUrl(<key>) directly  (uploader)
function resolveIconKeyUrl(iconKey: string): string {
  if (iconKey.includes('/') || /\.[a-zA-Z0-9]+$/.test(iconKey)) {
    return mediaUrl(iconKey);
  }
  return mediaUrl(`images/icons/${iconKey}.png`);
}

export function resolveIcon(
  outputType: string | null | undefined,
  outputRefId: string | null | undefined,
  currencyDefs: any[],
  itemDefs: any[],
): string {
  if (!outputRefId) return DEFAULT_ICON_URL;

  let def: any = null;
  
  if (outputType === 'CURRENCY') {
    def = currencyDefs.find((c: any) => c.id === outputRefId);
  } else if (outputType === 'ITEM') {
    def = itemDefs.find((i: any) => i.id === outputRefId);
  }

  if (def?.iconKey) {
    return resolveIconKeyUrl(def.iconKey);
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

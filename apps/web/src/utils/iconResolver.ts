// One mental model for media: the value you save IS the path under the bucket.
//   "/images/foo.png"  → /media/images/foo.png            (bucket lookup)
//   "/audio/click.mp3" → /media/audio/click.mp3
//   "lucky_charm"      → /media/images/icons/lucky_charm.png  (icon shortcut)
//   "http(s)://..."    → returned unchanged
const MEDIA_BASE = '/media';

export function mediaUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${MEDIA_BASE}${clean}`;
}

export const DEFAULT_ICON_URL = `${MEDIA_BASE}/images/icons/default.png`;

export function resolveAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/media/') || trimmed.startsWith('/api/media/')) return trimmed;
  if (trimmed.startsWith('/')) return `${MEDIA_BASE}${trimmed}`;
  // Bare-name icon shortcut: only when value has no slash AND no extension
  if (!trimmed.includes('/') && !/\.[a-z0-9]{2,5}$/i.test(trimmed)) {
    return `${MEDIA_BASE}/images/icons/${trimmed}.png`;
  }
  // Anything else: treat as bucket-relative (e.g. "images/foo.png")
  return `${MEDIA_BASE}/${trimmed}`;
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
    return resolveAssetUrl(def.iconKey) ?? DEFAULT_ICON_URL;
  }

  return resolveAssetUrl(outputRefId) ?? DEFAULT_ICON_URL;
}

/**
 * Best-effort derivation of a representative icon source from a reward spec
 * shape (as used by GiftDef.rewardSpec, QuestDef.rewardSpec, etc.). Returns a
 * value suitable to pass to <GameIcon src={...} /> — typically a currency or
 * item id, or a bare iconKey shortcut. Returns null when nothing usable is
 * present (caller should fall back to its own default).
 *
 * Recognized shapes:
 *   { type: 'currency', key|currencyId }
 *   { type: 'item',     key|itemDefId }
 *   { type: 'entity',   definitionId|entityDefId }
 *   { type: 'bundle',   entries: RewardSpec[] }   → first entry's icon
 *   { iconKey }                                    → explicit override
 */
export function deriveIconFromRewardSpec(spec: any): string | null {
  if (!spec || typeof spec !== 'object') return null;
  if (typeof spec.iconKey === 'string' && spec.iconKey.trim()) return spec.iconKey;
  const type = spec.type;
  if (type === 'currency') return spec.key || spec.currencyId || null;
  if (type === 'item') return spec.key || spec.itemDefId || null;
  if (type === 'entity') return spec.definitionId || spec.entityDefId || spec.key || null;
  if (type === 'bundle' && Array.isArray(spec.entries)) {
    for (const e of spec.entries) {
      const sub = deriveIconFromRewardSpec(e);
      if (sub) return sub;
    }
  }
  // Last-ditch: any *Id field that smells like a reward target
  return spec.currencyId || spec.itemDefId || spec.definitionId || null;
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

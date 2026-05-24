export interface PropHint {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
}

export const BLOCK_PROP_HINTS: Record<string, Record<string, PropHint>> = {
  rich_text: {
    content: { type: 'string', description: 'Plain text paragraph content', required: true },
  },
  image: {
    assetKey: { type: 'string', description: 'Asset key to resolve the image (e.g. banner_season_3)', required: true },
    caption: { type: 'string', description: 'Optional caption text below the image' },
  },
  key_value_row: {
    label: { type: 'string', description: 'Left-side label text', required: true },
    value: { type: 'string', description: 'Right-side value text', required: true },
  },
  narrative_text: {
    text: { type: 'string', description: 'Static fallback text shown when SurfaceContext provides no dynamic narrative' },
  },
  divider: {},
};

export function getMissingBlockProps(blockType: string, block: Record<string, unknown>): string[] {
  const hints = BLOCK_PROP_HINTS[blockType] ?? {};
  return Object.entries(hints)
    .filter(([key, hint]) => {
      if (!hint.required) return false;
      const val = block[key];
      if (val === null || val === undefined || val === '') return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return false;
    })
    .map(([key]) => key);
}

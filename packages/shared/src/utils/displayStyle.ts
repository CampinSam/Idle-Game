import type {
  DisplayStyle,
  DisplayOverlayStyle,
  DisplayBackgroundStyle,
  DisplayTextStyle,
} from '../types/displayStyle';

function mergeSection<T extends object>(a?: T | null, b?: T | null): T | undefined {
  const aHas = a && Object.keys(a).length > 0;
  const bHas = b && Object.keys(b).length > 0;
  if (!aHas && !bHas) return undefined;
  return { ...(a || {}), ...(b || {}) } as T;
}

export function mergeDisplayStyles(
  base?: DisplayStyle | null,
  override?: DisplayStyle | null,
): DisplayStyle {
  const a = base || {};
  const b = override || {};
  const out: DisplayStyle = {};
  const overlay = mergeSection<DisplayOverlayStyle>(a.overlay, b.overlay);
  const background = mergeSection<DisplayBackgroundStyle>(a.background, b.background);
  const title = mergeSection<DisplayTextStyle>(a.title, b.title);
  const body = mergeSection<DisplayTextStyle>(a.body, b.body);
  if (overlay) out.overlay = overlay;
  if (background) out.background = background;
  if (title) out.title = title;
  if (body) out.body = body;
  return out;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function overlayToCss(overlay?: DisplayOverlayStyle | null): string | null {
  if (!overlay) return null;
  if (overlay.gradient && overlay.gradient.trim()) return overlay.gradient.trim();
  const hasColor = typeof overlay.color === 'string' && overlay.color.trim().length > 0;
  const hasOpacity = typeof overlay.opacity === 'number';
  if (!hasColor && !hasOpacity) return null;
  const color = (overlay.color || '#000000').trim();
  const opacity = typeof overlay.opacity === 'number'
    ? Math.max(0, Math.min(1, overlay.opacity))
    : 0.5;
  const rgb = hexToRgb(color);
  if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  return color;
}

export function textStyleToCss(text?: DisplayTextStyle | null): Record<string, string | number> {
  if (!text) return {};
  const out: Record<string, string | number> = {};
  if (text.fontFamily) out.fontFamily = text.fontFamily;
  if (text.fontWeight !== undefined && text.fontWeight !== '') out.fontWeight = text.fontWeight as any;
  if (text.fontSize) out.fontSize = text.fontSize;
  if (text.color) out.color = text.color;
  if (text.letterSpacing) out.letterSpacing = text.letterSpacing;
  if (text.textTransform) out.textTransform = text.textTransform;
  if (text.textShadow) out.textShadow = text.textShadow;
  if (text.lineHeight) out.lineHeight = text.lineHeight;
  return out;
}

import type { ModalSpecV1, ModalBlock, RichTextDoc, RichTextNode } from '@derp/shared';

export function getByPath(obj: any, dotPath: string): any {
  if (obj == null || !dotPath) return undefined;
  const parts = dotPath.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (part === 'length' && Array.isArray(cur)) return cur.length;
    const idx = Number(part);
    if (Array.isArray(cur) && !isNaN(idx)) {
      cur = cur[idx];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

export function resolveTokens(str: string, ctx: Record<string, any>): string {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
    const val = getByPath(ctx, path.trim());
    if (val === undefined || val === null) return _match;
    return String(val);
  });
}

function resolveRichTextNode(node: RichTextNode, ctx: Record<string, any>): RichTextNode {
  if (node.t === 'token') {
    const val = getByPath(ctx, node.key);
    if (val !== undefined && val !== null) {
      return { t: 'text', v: String(val) };
    }
    return node;
  }
  if (node.t === 'text') {
    return { t: 'text', v: resolveTokens(node.v, ctx) };
  }
  if (node.t === 'br') return node;
  if (node.t === 'link') {
    return { t: 'link', href: resolveTokens(node.href, ctx), c: node.c.map(c => resolveRichTextNode(c, ctx)) };
  }
  return { t: node.t, c: node.c.map(c => resolveRichTextNode(c, ctx)) } as RichTextNode;
}

function resolveRichTextDoc(doc: RichTextDoc, ctx: Record<string, any>): RichTextDoc {
  return doc.map(node => resolveRichTextNode(node, ctx));
}

function mapRewardItem(r: any): { name: string; qty?: number; assetKey?: string; rarity?: string; note?: string } {
  return {
    name: r.name || r.type || r.key || 'Reward',
    qty: r.qty ?? r.amount ?? 1,
    assetKey: r.assetKey || (r.key ? `icons/${r.key}` : undefined),
    rarity: r.rarity,
    note: r.note,
  };
}

function resolveBlock(block: ModalBlock, ctx: Record<string, any>): ModalBlock {
  const b = block as any;
  const fromPath: string | undefined = b.from;

  let resolved = { ...b };

  if (fromPath) {
    const data = getByPath(ctx, fromPath);
    if (data !== undefined && data !== null) {
      switch (block.type) {
        case 'rewardsList':
        case 'rewardsPreview':
          if (Array.isArray(data)) {
            resolved.items = data.map(mapRewardItem);
          }
          break;

        case 'metaRows':
          if (Array.isArray(data)) {
            resolved.rows = data.map((r: any) => ({
              label: String(r.label ?? ''),
              value: String(r.value ?? ''),
            }));
          } else if (typeof data === 'object') {
            resolved.rows = Object.entries(data).map(([k, v]) => ({
              label: k,
              value: String(v),
            }));
          }
          break;

        case 'inventoryDelta':
          if (Array.isArray(data)) {
            resolved.items = data.map((it: any) => ({
              name: it.name || 'Item',
              qtyDelta: it.qtyDelta ?? it.amount ?? 0,
              assetKey: it.assetKey,
            }));
          }
          break;

        case 'timer':
          if (typeof data === 'string') {
            resolved.endsAt = data;
          } else if (typeof data === 'object' && data.endsAt) {
            resolved.endsAt = data.endsAt;
            if (data.label) resolved.label = data.label;
          }
          break;

        case 'progress':
          if (typeof data === 'object') {
            if (data.current !== undefined) resolved.current = Number(data.current);
            if (data.max !== undefined) resolved.max = Number(data.max);
            if (data.label) resolved.label = data.label;
          }
          break;

        case 'richText':
          if (typeof data === 'string') {
            resolved.doc = [{ t: 'p', c: [{ t: 'text', v: data }] }];
          } else if (Array.isArray(data)) {
            resolved.doc = data;
          }
          break;

        case 'image':
          if (typeof data === 'object') {
            resolved.image = {
              assetKey: data.assetKey || data.url || '',
              alt: data.alt || data.caption || '',
            };
            if (data.caption) resolved.caption = data.caption;
          } else if (typeof data === 'string') {
            resolved.image = { assetKey: data };
          }
          break;

        case 'giftReveal':
          if (typeof data === 'object') {
            resolved.gift = { ...(resolved.gift || {}), ...data };
          }
          break;

        case 'error':
          if (typeof data === 'string') {
            resolved.message = data;
          } else if (typeof data === 'object' && data.message) {
            resolved.message = data.message;
          }
          break;
      }
    }
    delete resolved.from;
  }

  switch (resolved.type) {
    case 'richText':
      resolved.doc = resolveRichTextDoc(resolved.doc || [], ctx);
      break;
    case 'metaRows':
      if (Array.isArray(resolved.rows)) {
        resolved.rows = resolved.rows.map((r: any) => ({
          label: resolveTokens(String(r.label ?? ''), ctx),
          value: resolveTokens(String(r.value ?? ''), ctx),
        }));
      }
      break;
    case 'timer':
      if (resolved.label) resolved.label = resolveTokens(resolved.label, ctx);
      if (resolved.endsAt) resolved.endsAt = resolveTokens(resolved.endsAt, ctx);
      break;
    case 'progress':
      if (resolved.label) resolved.label = resolveTokens(resolved.label, ctx);
      break;
    case 'error':
      if (resolved.message) resolved.message = resolveTokens(resolved.message, ctx);
      break;
    case 'image':
      if (resolved.caption) resolved.caption = resolveTokens(resolved.caption, ctx);
      break;
    case 'giftReveal':
      if (resolved.gift?.title) resolved.gift.title = resolveTokens(resolved.gift.title, ctx);
      break;
    case 'rewardsList':
      if (resolved.title) resolved.title = resolveTokens(resolved.title, ctx);
      break;
  }

  return resolved as ModalBlock;
}

export function resolveSpec(spec: any, ctx: Record<string, any>): any {
  if (!spec || typeof spec !== 'object') return spec;
  if (!ctx || typeof ctx !== 'object') return spec;

  const resolved: any = { ...spec };

  if (resolved.header) {
    resolved.header = { ...resolved.header };
    if (resolved.header.title) resolved.header.title = resolveTokens(resolved.header.title, ctx);
    if (resolved.header.subtitle) resolved.header.subtitle = resolveTokens(resolved.header.subtitle, ctx);
  }

  if (Array.isArray(resolved.body)) {
    resolved.body = resolved.body.map((block: ModalBlock) => resolveBlock(block, ctx));
  }

  if (Array.isArray(resolved.buttons)) {
    resolved.buttons = resolved.buttons.map((btn: any) => ({
      ...btn,
      label: btn.label ? resolveTokens(btn.label, ctx) : btn.label,
    }));
  }

  return resolved;
}

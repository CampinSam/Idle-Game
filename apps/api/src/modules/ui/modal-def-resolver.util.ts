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

function resolveAllStrings(obj: any, ctx: Record<string, any>): any {
  if (obj == null) return obj;
  if (typeof obj === 'string') return resolveTokens(obj, ctx);
  if (Array.isArray(obj)) return obj.map(item => resolveAllStrings(item, ctx));
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = resolveAllStrings(obj[key], ctx);
    }
    return result;
  }
  return obj;
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
    assetKey: r.assetKey || r.key || undefined,
    rarity: r.rarity,
    note: r.note,
  };
}

function resolveBlock(block: ModalBlock, ctx: Record<string, any>): ModalBlock {
  const b = block as any;

  if (b.type === 'clickReveal') {
    const children: ModalBlock[] = Array.isArray(b.children) ? b.children : [];
    const resolvedChildren = children.map(child => resolveBlock(child, ctx));
    return {
      type: 'clickReveal',
      cover: typeof b.cover === 'string' ? resolveTokens(b.cover, ctx) : b.cover,
      coverImage: b.coverImage ? resolveAllStrings({ ...b.coverImage }, ctx) : undefined,
      tags: typeof b.tags === 'string' ? resolveTokens(b.tags, ctx) : b.tags,
      soundMap: typeof b.soundMap === 'string' ? resolveTokens(b.soundMap, ctx) : b.soundMap,
      fxMap: typeof b.fxMap === 'string' ? resolveTokens(b.fxMap, ctx) : b.fxMap,
      children: resolvedChildren,
    } as ModalBlock;
  }

  if (b.type === 'list') {
    const expr: string = typeof b.list === 'string' ? b.list : '';
    const trimmed = expr.trim();
    const m = /^\$\{([^}]+)\}$/.exec(trimmed);
    const path = m ? m[1].trim() : trimmed;
    const data = path ? getByPath(ctx, path) : undefined;
    const children: ModalBlock[] = Array.isArray(b.children) ? b.children : [];
    const out: ModalBlock[] = [];
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((item, index) => {
        const itemCtx = { ...ctx, item, index };
        for (const child of children) {
          out.push(resolveBlock(child, itemCtx));
        }
      });
    } else if (typeof b.emptyText === 'string' && b.emptyText.length > 0) {
      const emptyText = resolveTokens(b.emptyText, ctx);
      out.push({
        type: 'richText',
        doc: [{ t: 'p', c: [{ t: 'text', v: emptyText }] }],
      } as ModalBlock);
    }
    return { type: 'list', list: expr, children: out } as ModalBlock;
  }

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
            if (data.gift) {
              resolved.gift = { ...(resolved.gift || {}), ...data.gift };
            } else if (data.giftId || data.title) {
              resolved.gift = { ...(resolved.gift || {}), ...data };
            }
            if (Array.isArray(data.rewards)) {
              resolved.rewards = data.rewards.map(mapRewardItem);
            }
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
  }

  if ('from' in resolved) delete resolved.from;

  if (resolved.type === 'richText' && Array.isArray(resolved.doc)) {
    resolved.doc = resolveRichTextDoc(resolved.doc, ctx);
  } else {
    resolved = resolveAllStrings(resolved, ctx);
  }

  return resolved as ModalBlock;
}

export function resolveSpec(spec: ModalSpecV1, ctx: Record<string, any>): ModalSpecV1 {
  if (!spec || typeof spec !== 'object') return spec;
  if (!ctx || typeof ctx !== 'object') return spec;

  const resolved: ModalSpecV1 = { ...spec };

  if (resolved.header) {
    resolved.header = resolveAllStrings({ ...resolved.header }, ctx);
  }

  if (Array.isArray(resolved.body)) {
    resolved.body = resolved.body.map((block: ModalBlock) => resolveBlock(block, ctx));
  }

  if (Array.isArray(resolved.buttons)) {
    resolved.buttons = resolved.buttons.map((btn: any) => resolveAllStrings({ ...btn }, ctx));
  }

  return resolved;
}

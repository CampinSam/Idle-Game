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

function parseRandomArgs(argsStr: string): string[] {
  const results: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escaped = false;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    if (ch === ',') {
      results.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  const last = current.trim();
  if (last) results.push(last);

  return results;
}

const RANDOM_RE = /^random\((.+)\)$/;

function resolveToken(expr: string, ctx: Record<string, any>): string | undefined {
  const trimmed = expr.trim();

  const randomMatch = trimmed.match(RANDOM_RE);
  if (randomMatch) {
    const args = parseRandomArgs(randomMatch[1]);
    if (args.length === 0) return undefined;
    return args[Math.floor(Math.random() * args.length)];
  }

  const val = getByPath(ctx, trimmed);
  if (val === undefined || val === null) return undefined;
  return String(val);
}

export function resolveTokens(str: string, ctx: Record<string, any>): string {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const resolved = resolveToken(expr, ctx);
    return resolved !== undefined ? resolved : '';
  });
}

function coerceNumericString(val: string): string | number {
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

export function resolveAllTokens(obj: any, ctx: Record<string, any>): any {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    const resolved = resolveTokens(obj, ctx);
    if (resolved !== obj) {
      return coerceNumericString(resolved);
    }
    return obj;
  }

  if (Array.isArray(obj)) return obj.map(item => resolveAllTokens(item, ctx));

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = resolveAllTokens(obj[key], ctx);
    }
    return result;
  }

  return obj;
}

export function resolveRewardSpecContext(
  rewardSpec: any,
  contextData?: Record<string, any> | null,
): any {
  if (!contextData || typeof contextData !== 'object') return rewardSpec;
  if (!rewardSpec || typeof rewardSpec !== 'object') return rewardSpec;
  return resolveAllTokens(rewardSpec, contextData);
}

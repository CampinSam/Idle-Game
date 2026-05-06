const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

export function formatRateValue(value: number): string {
  const abs = Math.abs(value);
  if (!isFinite(abs)) return '0';
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1) return `${Math.round(abs)}`;
  if (abs > 0) return abs.toFixed(1);
  return '0';
}

export function formatCompact(value: number | string | bigint): string {
  let num = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!isFinite(num) || num === 0) return '0';

  const negative = num < 0;
  num = Math.abs(num);

  if (num < 1000) return (negative ? '-' : '') + Math.floor(num).toString();

  let tier = Math.min(Math.floor(Math.log10(num) / 3), SUFFIXES.length - 1);
  let scaled = num / Math.pow(10, tier * 3);

  let digits: number;
  if (scaled >= 100) {
    digits = 0;
  } else if (scaled >= 10) {
    digits = 1;
  } else {
    digits = 2;
  }

  const factor = Math.pow(10, digits);
  scaled = Math.floor(scaled * factor) / factor;

  if (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    tier++;
    scaled = Math.floor(num / Math.pow(10, tier * 3));
  }

  const formatted = digits > 0 ? scaled.toFixed(digits) : scaled.toString();

  return (negative ? '-' : '') + formatted + SUFFIXES[tier];
}

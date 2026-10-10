let _offset = 0;
let _initialised = false;

export function applyServerTime(serverTimeMs: number): void {
  if (!isFinite(serverTimeMs)) return;
  const raw = serverTimeMs - Date.now();
  _offset = _initialised ? Math.round(0.1 * _offset + 0.9 * raw) : raw;
  _initialised = true;
}

export function serverNow(): number {
  return Date.now() + _offset;
}

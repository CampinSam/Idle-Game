// Same prefix `services/api.ts` uses. Kept inline (not imported) because
// `api.ts` keeps it private and we don't want a cycle through that module
// from a low-level reporter.
const API_BASE = '/api';

interface ReportableError {
  message: string;
  stack?: string;
  componentStack?: string;
  fallbackTitle?: string;
  url?: string;
}

// Tight cap so the reporter itself can never become a runaway. Once
// hit, further errors in the same session are silently dropped client-side
// (the server-side throttler is the second line of defence).
const MAX_REPORTS_PER_SESSION = 25;
let reportsSent = 0;

// Skip a tight burst of identical errors that some libraries throw on
// every render — one stack per type per session is enough.
const seenStacks = new Set<string>();

function clip(value: string | undefined, max: number): string | undefined {
  if (value == null) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

export function reportClientError(err: ReportableError): void {
  try {
    if (reportsSent >= MAX_REPORTS_PER_SESSION) return;

    const fingerprint = `${err.message}::${(err.stack ?? '').slice(0, 200)}`;
    if (seenStacks.has(fingerprint)) return;
    seenStacks.add(fingerprint);
    reportsSent += 1;

    // Strip query/hash before sending so any session token, OAuth state,
    // or password-reset code present in the URL never leaves the browser.
    // Server-side does the same defensively.
    const rawUrl = err.url ?? window.location.href;
    const cleanUrl = rawUrl.split(/[?#]/)[0];

    const payload = {
      message: clip(err.message, 500) ?? 'unknown',
      stack: clip(err.stack, 8000),
      componentStack: clip(err.componentStack, 500),
      fallbackTitle: clip(err.fallbackTitle, 500),
      url: clip(cleanUrl, 2000),
      release: import.meta.env.VITE_BUILD_SHA as string | undefined,
    };

    // sendBeacon survives navigations / tab close so we capture errors that
    // happen during unload. Falls back to fetch when the API isn't on the
    // same origin (sendBeacon refuses cross-origin).
    const body = JSON.stringify(payload);
    const url = `${API_BASE}/v1/client-errors`;

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      } catch {
        // fall through to fetch
      }
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Reporter must never throw — the boundary is already handling a
      // user-facing error. Silent failure is the correct behavior here.
    });
  } catch {
    // ditto: never let the reporter raise
  }
}

let installed = false;

// Install global listeners exactly once. Safe to call from app bootstrap.
export function installGlobalErrorReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    reportClientError({
      message: event.message || 'window.onerror',
      stack: event.error?.stack,
      url: event.filename,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      typeof reason === 'string'
        ? reason
        : reason?.message || 'Unhandled promise rejection';
    reportClientError({
      message,
      stack: reason?.stack,
    });
  });
}

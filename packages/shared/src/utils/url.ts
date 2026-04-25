// Centralized URL safety check for any feature that accepts user/JSON-defined
// link URLs (rich-text links, modal CTAs, future link blocks, etc.).
//
// Allows http(s), mailto, tel, plus relative/anchor links. Rejects schemes
// that can execute code or read local resources (javascript, data, vbscript,
// file). Strips control characters that could be used to smuggle a scheme
// past the regex.
//
// Returns the sanitized URL, or an empty string if the input is unsafe or
// empty. Callers should treat an empty string as "drop the link".
export function sanitizeHref(raw: string): string {
  const noCtrl = (raw || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!noCtrl) return '';
  if (/^(javascript|data|vbscript|file):/i.test(noCtrl)) return '';
  return noCtrl;
}

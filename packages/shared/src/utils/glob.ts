/**
 * Converts a glob pattern to a RegExp for unlock key matching.
 *   *  — matches one path segment (no dots)
 *   ** — matches one or more path segments (crosses dots)
 *
 * Examples:
 *   "derps.buildings.*"  → /^derps\.buildings\.[^.]+$/
 *   "season.**"          → /^season\..+$/
 *   "foo.bar"            → /^foo\.bar$/  (exact match)
 */
export function globToRegex(pattern: string): RegExp {
  const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = pattern
    .split('**')
    .map(part => part.split('*').map(escape).join('[^.]+'))
    .join('.+');
  return new RegExp(`^${regexStr}$`);
}

export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*');
}

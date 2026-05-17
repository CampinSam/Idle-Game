import type { CSSProperties } from 'react';

/**
 * Shared editor contract.
 *
 * Every structured editor must:
 *  1. Accept `StructuredEditorProps<T>` (value + onChange).
 *  2. Export `validate(value: T | null | undefined): ValidationResult` — returns
 *     a map of field name → error string. Empty object means valid.
 *  3. Export `*ErrorCount(value): number` — used by `structuredFieldErrorCount`
 *     for the save-button error badge.
 *
 * Nesting: parent editors call child `validate()` and may pass errors down.
 * On save, editors emit plain objects via `onChange` — no serialization needed.
 */
export interface StructuredEditorProps<T> {
  value: T | null | undefined;
  onChange: (v: T) => void;
}

export type ValidationResult = Record<string, string>;

export const ERROR_BORDER_COLOR = '#ef4444';

export const errorTextStyle: CSSProperties = {
  color: '#ef4444',
  fontSize: 11,
  marginTop: 2,
};

export const errorWrapperStyle: CSSProperties = {
  outline: `1px solid ${ERROR_BORDER_COLOR}`,
  outlineOffset: 0,
  borderRadius: 4,
};

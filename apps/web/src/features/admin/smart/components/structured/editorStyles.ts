import type { CSSProperties } from 'react';

export const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

export const entryCardStyle: CSSProperties = {
  border: '1px solid #2a2a4e',
  borderRadius: 6,
  background: '#13132b',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

export const entryHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
};

export const inputStyle: CSSProperties = {
  padding: '5px 8px',
  background: '#0f0f2e',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#e0e0ff',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none',
};

export const numberInputStyle: CSSProperties = {
  ...inputStyle,
  width: 80,
};

export const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

export const labelStyle: CSSProperties = {
  fontSize: 11,
  color: '#888',
  fontWeight: 600,
};

export const fieldRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
};

export const iconButtonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#888',
  cursor: 'pointer',
  fontSize: 12,
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
  flexShrink: 0,
};

export const dangerIconButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  color: '#ef4444',
  borderColor: '#3a1e1e',
};

export const addButtonStyle: CSSProperties = {
  padding: '5px 10px',
  background: 'rgba(167,139,250,0.08)',
  border: '1px dashed #a78bfa',
  borderRadius: 4,
  color: '#a78bfa',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  fontWeight: 600,
  letterSpacing: '0.04em',
};

export const ghostButtonStyle: CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#888',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'inherit',
  letterSpacing: '0.04em',
};

export const fieldGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  flex: 1,
  minWidth: 120,
};

export const sectionStyle: CSSProperties = {
  border: '1px solid #2a2a4e',
  borderRadius: 6,
  background: '#0f0f2e',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

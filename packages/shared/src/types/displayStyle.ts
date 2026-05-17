export interface DisplayOverlayStyle {
  color?: string;
  opacity?: number;
  gradient?: string;
}

export interface DisplayBackgroundStyle {
  position?: string;
  size?: string;
  repeat?: string;
  attachment?: string;
}

export interface DisplayTextStyle {
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize?: string;
  color?: string;
  letterSpacing?: string;
  textTransform?: string;
  textShadow?: string;
  lineHeight?: string;
}

export interface DisplayButtonStateStyle {
  background?: string;
  color?: string;
  borderColor?: string;
  opacity?: number;
}

export interface DisplayInlineButtonsStyle {
  placement?: 'inline' | 'bottom';
  normal?: DisplayButtonStateStyle;
  requirementsNotMet?: DisplayButtonStateStyle;
  disabled?: DisplayButtonStateStyle;
}

export interface DisplayStyle {
  overlay?: DisplayOverlayStyle;
  background?: DisplayBackgroundStyle;
  title?: DisplayTextStyle;
  body?: DisplayTextStyle;
  inlineButtons?: DisplayInlineButtonsStyle;
  data?: { _mode?: string; [key: string]: unknown };
}

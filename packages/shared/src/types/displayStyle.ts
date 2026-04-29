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

export interface DisplayStyle {
  overlay?: DisplayOverlayStyle;
  background?: DisplayBackgroundStyle;
  title?: DisplayTextStyle;
  body?: DisplayTextStyle;
}

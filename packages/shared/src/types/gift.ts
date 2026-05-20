export interface InlineGiftDef {
  name: string;
  presentation?: Record<string, any>;
  claimRules?: Record<string, any>;
  rewardSpec?: any;
  instant?: boolean;
  modalDefId?: string;
}

export type GiftSpec = { giftDefId: string } | InlineGiftDef;

export function isGiftRef(spec: GiftSpec): spec is { giftDefId: string } {
  return typeof (spec as any).giftDefId === 'string';
}

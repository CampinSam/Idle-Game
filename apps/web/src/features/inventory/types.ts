import type { ReactNode } from 'react';

export type ItemListMode = 'display' | 'picker';

export type ItemUseCase = 'inventory' | 'potion-picker';

export interface ItemCardProps {
  item: any;
  selected?: boolean;
  disabled?: boolean;
  onClick?: (item: any) => void;
  className?: string;
}

export interface ItemDetailPanelProps {
  item: any;
  /** Action node(s) to render in the right-side actions slot. */
  actions?: ReactNode;
  className?: string;
}

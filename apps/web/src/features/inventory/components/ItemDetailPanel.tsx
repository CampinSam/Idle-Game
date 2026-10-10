import { getItemViews } from '../registry';
import type { ItemDetailPanelProps } from '../types';

export default function ItemDetailPanel(props: ItemDetailPanelProps) {
  const Panel = getItemViews(props.item).DetailPanel;
  return <Panel {...props} />;
}

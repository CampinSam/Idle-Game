import type { ModalBlock } from '@derp/shared';
import RichText from './RichText';
import TimerBlock from './TimerBlock';
import ProgressBlock from './ProgressBlock';
import RewardsListBlock from './RewardsListBlock';
import MetaRowsBlock from './MetaRowsBlock';
import InventoryDeltaBlock from './InventoryDeltaBlock';
import GiftRevealBlock from './GiftRevealBlock';
import AssetImage from '../AssetImage';

export default function BlockRenderer({ block }: { block: ModalBlock }) {
  switch (block.type) {
    case 'richText':
      return <RichText doc={block.doc} />;

    case 'divider':
      return <div className="gm-divider" />;

    case 'image':
      return (
        <div className="gm-image-block">
          <AssetImage asset={block.image} style={{ width: '100%', borderRadius: 12 }} />
          {block.caption && <div className="gm-image-caption">{block.caption}</div>}
        </div>
      );

    case 'metaRows':
      return <MetaRowsBlock rows={block.rows} />;

    case 'timer':
      return <TimerBlock endsAt={block.endsAt} label={block.label} />;

    case 'progress':
      return <ProgressBlock current={block.current} max={block.max} label={block.label} />;

    case 'rewardsPreview':
      return <RewardsListBlock items={block.items} title="Preview" compact />;

    case 'rewardsList':
      return <RewardsListBlock items={block.items} title={block.title ?? 'Rewards'} />;

    case 'inventoryDelta':
      return <InventoryDeltaBlock items={block.items} />;

    case 'giftReveal':
      return <GiftRevealBlock {...block} />;

    case 'list':
      return (
        <>
          {block.children.map((child, idx) => (
            <BlockRenderer key={idx} block={child} />
          ))}
        </>
      );

    case 'error':
      return <div className="gm-error-block">{block.message}</div>;

    default: {
      const _never: never = block;
      return null;
    }
  }
}

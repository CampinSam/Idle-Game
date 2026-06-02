import type { ModalBlock } from '@derp/shared';
import { useModalRefresh } from '../../../context/ModalRefreshContext';
import RichText from './RichText';
import TimerBlock from './TimerBlock';
import ProgressBlock from './ProgressBlock';
import RewardsListBlock from './RewardsListBlock';
import MetaRowsBlock from './MetaRowsBlock';
import InventoryDeltaBlock from './InventoryDeltaBlock';
import GiftRevealBlock from './GiftRevealBlock';
import ClickRevealBlock from './ClickRevealBlock';
import CharacterEventsBlock from './CharacterEventsBlock';
import EntityRosterBlock from './EntityRosterBlock';
import AssetImage from '../AssetImage';

export default function BlockRenderer({ block }: { block: ModalBlock }) {
  const onTimerExpire = useModalRefresh();

  switch (block.type) {
    case 'richText':
      return <RichText doc={block.doc} />;

    case 'divider':
      return <div className="gm-divider" />;

    case 'image': {
      const d = block.display;
      const align = d?.align ?? 'center';
      const sizing = d?.sizing ?? 'stretch';
      const rawWidth = d?.width;
      const borderRadius = d?.borderRadius ?? 12;
      const isStretch = sizing === 'stretch';
      const imgWidth =
        sizing === 'percent' && rawWidth ? `${rawWidth}%`
        : sizing === 'px' && rawWidth ? `${rawWidth}px`
        : '100%';
      const justifyContent =
        align === 'left' ? 'flex-start'
        : align === 'right' ? 'flex-end'
        : 'center';
      return (
        <div
          className={`gm-image-block${isStretch ? ' gm-image-block--stretch' : ''}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: isStretch ? 'stretch' : justifyContent === 'flex-start' ? 'flex-start' : justifyContent === 'flex-end' ? 'flex-end' : 'center' }}
        >
          <AssetImage asset={block.image} style={{ width: imgWidth, borderRadius: isStretch ? 0 : borderRadius, display: 'block' }} />
          {block.caption && <div className="gm-image-caption" style={{ textAlign: align }}>{block.caption}</div>}
        </div>
      );
    }

    case 'metaRows':
      return <MetaRowsBlock rows={block.rows} />;

    case 'timer':
      return <TimerBlock endsAt={block.endsAt} label={block.label} onExpire={onTimerExpire ?? undefined} />;

    case 'progress':
      return <ProgressBlock current={block.current} max={block.max} label={block.label} startsAt={block.startsAt} endsAt={block.endsAt} />;

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

    case 'clickReveal':
      return (
        <ClickRevealBlock
          cover={block.cover}
          coverImage={block.coverImage}
          tags={block.tags}
          soundMap={block.soundMap}
          fxMap={block.fxMap}
          children={block.children}
        />
      );

    case 'characterEvents':
      return <CharacterEventsBlock items={block.items} />;

    case 'entityRoster':
      return <EntityRosterBlock block={block} />;

    case 'error':
      return <div className="gm-error-block">{block.message}</div>;

    default: {
      const _never: never = block;
      return null;
    }
  }
}

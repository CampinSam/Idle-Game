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
import QuantityInputBlock from './QuantityInputBlock';
import MissionPhasesBlock from './MissionPhasesBlock';
import RevealWrapper from './RevealWrapper';
import AssetImage from '../AssetImage';

export default function BlockRenderer({ block }: { block: ModalBlock }) {
  const onTimerExpire = useModalRefresh();

  switch (block.type) {
    case 'richText':
      return <RichText doc={block.doc} />;

    case 'divider':
      return <div className="gm-divider" />;

    case 'image': {
      if (!block.image || !block.image.assetKey) return null;
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
          <AssetImage asset={block.image} style={{ width: imgWidth, borderRadius: isStretch ? 0 : borderRadius, display: 'block', maxWidth: 'none', maxHeight: 'none' }} />
          {block.caption && <div className="gm-image-caption" style={{ textAlign: align }}>{block.caption}</div>}
        </div>
      );
    }

    case 'metaRows':
      return <MetaRowsBlock rows={block.rows} revealOptions={block.revealOptions} />;

    case 'timer':
      return (
        <TimerBlock
          startTick={block.startTick}
          durationTicks={block.durationTicks}
          endsAt={block.endsAt}
          wallClock={block.wallClock}
          label={block.label}
          onExpire={onTimerExpire ?? undefined}
        />
      );

    case 'progress':
      return (
        <ProgressBlock
          startTick={block.startTick}
          durationTicks={block.durationTicks}
          current={block.current}
          max={block.max}
          label={block.label}
          startsAt={block.startsAt}
          endsAt={block.endsAt}
        />
      );

    case 'rewardsPreview':
      return <RewardsListBlock items={block.items} title="Preview" compact revealOptions={block.revealOptions} />;

    case 'rewardsList':
      return <RewardsListBlock items={block.items} title={block.title ?? 'Rewards'} revealOptions={block.revealOptions} />;

    case 'inventoryDelta':
      return <InventoryDeltaBlock items={block.items} revealOptions={block.revealOptions} />;

    case 'giftReveal':
      return <GiftRevealBlock {...block} />;

    case 'list':
      return (
        <>
          {block.children.map((child, idx) => {
            if (block.revealOptions) {
              return (
                <RevealWrapper
                  key={idx}
                  cover={block.revealOptions.cover}
                  coverImage={block.revealOptions.coverImage}
                  tags={block.revealOptions.tags}
                  soundMap={block.revealOptions.soundMap}
                  fxMap={block.revealOptions.fxMap}
                >
                  <BlockRenderer block={child} />
                </RevealWrapper>
              );
            }
            return <BlockRenderer key={idx} block={child} />;
          })}
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
      return <CharacterEventsBlock items={block.items} revealOptions={block.revealOptions} />;

    case 'entityRoster':
      return <EntityRosterBlock block={block} />;

    case 'mission_phases':
      return <MissionPhasesBlock block={block} />;

    case 'error':
      return <div className="gm-error-block">{block.message}</div>;

    case 'quantityInput':
      return <QuantityInputBlock block={block} />;

    default: {
      const _never: never = block;
      return null;
    }
  }
}

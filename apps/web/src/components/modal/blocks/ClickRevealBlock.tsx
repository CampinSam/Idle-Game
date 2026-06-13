import type { ModalBlock, AssetRef } from '@derp/shared';
import BlockRenderer from './BlockRenderer';
import RevealWrapper from './RevealWrapper';

interface Props {
  cover?: string;
  coverImage?: AssetRef;
  tags?: string;
  soundMap?: string;
  fxMap?: string;
  children: ModalBlock[];
}

export default function ClickRevealBlock({ cover, coverImage, tags, soundMap, fxMap, children }: Props) {
  return (
    <RevealWrapper cover={cover} coverImage={coverImage} tags={tags} soundMap={soundMap} fxMap={fxMap}>
      <div className="gm-reveal-children">
        {children.map((child, idx) => (
          <BlockRenderer key={idx} block={child} />
        ))}
      </div>
    </RevealWrapper>
  );
}

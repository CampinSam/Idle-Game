import { useState, useMemo } from 'react';
import type { ModalBlock, AssetRef } from '@derp/shared';
import { parseTagMap, lookupTagMap, splitTags } from '@derp/shared';
import BlockRenderer from './BlockRenderer';
import AssetImage from '../AssetImage';
import { audioEngine } from '../../../services/AudioEngine';

interface Props {
  cover?: string;
  coverImage?: AssetRef;
  tags?: string;
  soundMap?: string;
  fxMap?: string;
  children: ModalBlock[];
}

export default function ClickRevealBlock({ cover, coverImage, tags, soundMap, fxMap, children }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [fxClass, setFxClass] = useState<string>('');

  const tagList = useMemo(() => splitTags(tags), [tags]);
  const soundPairs = useMemo(() => parseTagMap(soundMap), [soundMap]);
  const fxPairs = useMemo(() => parseTagMap(fxMap), [fxMap]);

  const handleClick = () => {
    if (revealed) return;
    const sound = lookupTagMap(soundPairs, tagList);
    if (sound) {
      try { audioEngine.play(sound); } catch {}
    }
    const fx = lookupTagMap(fxPairs, tagList);
    if (fx) {
      setFxClass(`gm-reveal-fx-${fx}`);
    }
    setRevealed(true);
  };

  if (!revealed) {
    return (
      <button
        type="button"
        className="gm-reveal-cover"
        onClick={handleClick}
        aria-label={cover || 'Tap to reveal'}
      >
        {coverImage && coverImage.assetKey ? (
          <AssetImage asset={coverImage} style={{ maxWidth: '100%', borderRadius: 12 }} />
        ) : (
          <span className="gm-reveal-cover-label">{cover || 'Tap to reveal'}</span>
        )}
      </button>
    );
  }

  return (
    <div className={`gm-reveal-content ${fxClass}`}>
      {children.map((child, idx) => (
        <BlockRenderer key={idx} block={child} />
      ))}
    </div>
  );
}

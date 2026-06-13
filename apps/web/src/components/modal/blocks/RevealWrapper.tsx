import { useState, useMemo, type ReactNode } from 'react';
import type { AssetRef } from '@derp/shared';
import { parseTagMap, lookupTagMap, splitTags } from '@derp/shared';
import AssetImage from '../AssetImage';
import { audioEngine } from '../../../services/AudioEngine';

interface RevealWrapperProps {
  cover?: string;
  coverImage?: AssetRef;
  /** Already-resolved tag string for this item (tagsFrom resolution is done by the parent). */
  tags?: string;
  soundMap?: string;
  fxMap?: string;
  children: ReactNode;
}

/**
 * Wraps any content in a tap-to-reveal cover mechanic.
 * Sound and FX are driven by the resolved `tags` string — the parent list
 * renderer is responsible for resolving tagsFrom into a per-item tag before
 * passing it here.
 */
export default function RevealWrapper({ cover, coverImage, tags, soundMap, fxMap, children }: RevealWrapperProps) {
  const [revealed, setRevealed] = useState(false);
  const [fxClass, setFxClass] = useState('');

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
    if (fx) setFxClass(`gm-reveal-fx-${fx}`);
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
      {children}
    </div>
  );
}

/**
 * Resolve a per-item tag from a dot-path into the item's data object.
 * Returns the resolved string, or undefined when the path yields nothing.
 */
export function getItemTag(item: unknown, tagsFrom: string | undefined): string | undefined {
  if (!tagsFrom || item == null || typeof item !== 'object') return undefined;
  const parts = tagsFrom.split('.');
  let cur: unknown = item;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur != null ? String(cur) : undefined;
}

import { useNavigate } from 'react-router-dom';
import './HomescreenToggle.css';

export const HOME_VARIANT_KEY = 'homescreenVariant';
export type HomeVariant = 'v1' | 'v2';

export function readHomeVariant(): HomeVariant {
  try {
    return localStorage.getItem(HOME_VARIANT_KEY) === 'v2' ? 'v2' : 'v1';
  } catch {
    return 'v1';
  }
}

function writeHomeVariant(v: HomeVariant) {
  try { localStorage.setItem(HOME_VARIANT_KEY, v); } catch { /* ignore */ }
}

interface Props {
  current: HomeVariant;
}

/**
 * Small pill that lets the player flip between the original homescreen
 * (`/`) and the mockup-inspired alternate (`/home/v2`). The choice is
 * persisted to localStorage so the player keeps landing on the screen
 * they prefer when the bottom-nav HOME button is tapped.
 */
export function HomescreenToggle({ current }: Props) {
  const navigate = useNavigate();

  const handleSelect = (target: HomeVariant) => {
    if (target === current) return;
    writeHomeVariant(target);
    navigate(target === 'v1' ? '/' : '/home/v2');
  };

  return (
    <div className="hs-toggle" role="tablist" aria-label="Homescreen variant">
      <button
        type="button"
        role="tab"
        aria-selected={current === 'v1'}
        className={`hs-toggle__pill ${current === 'v1' ? 'hs-toggle__pill--active' : ''}`}
        onClick={() => handleSelect('v1')}
      >
        Classic
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === 'v2'}
        className={`hs-toggle__pill ${current === 'v2' ? 'hs-toggle__pill--active' : ''}`}
        onClick={() => handleSelect('v2')}
      >
        Idle
      </button>
    </div>
  );
}

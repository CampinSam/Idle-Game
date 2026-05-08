import { audioEngine } from './AudioEngine';

/**
 * Maps CSS class names found on a clicked button (or any element with
 * role="button") to a UI sound action key. The first rule whose class is
 * present wins. If nothing matches, the default `ui.button_click` is used.
 *
 * Buttons can override the picked key with `data-sfx="ui.something"` or opt
 * out entirely with `data-no-sfx`. Disabled buttons never play.
 */
const VARIANT_RULES: Array<{ classes: string[]; key: string }> = [
  {
    classes: ['gm-btn-danger', 'btn-delete', 'btn-danger', 'admin-danger', 'me-block-remove'],
    key: 'ui.button_danger',
  },
  {
    classes: [
      'gm-btn-primary',
      'btn-save',
      'btn-primary',
      'forge-collect-btn',
      'unlock-btn',
      'store-price-btn',
      'me-add-btn',
    ],
    key: 'ui.button_primary',
  },
  {
    classes: ['gm-btn-ghost'],
    key: 'ui.button_ghost',
  },
  {
    classes: [
      'gm-close-btn',
      'top-bar-bell',
      'top-bar-avatar-btn',
      'icon-btn',
      'me-block-toggle',
      'me-helphint-btn',
    ],
    key: 'ui.icon_button',
  },
  {
    classes: ['tab-btn', 'me-tab', 'bnav-link'],
    key: 'ui.tab_switch',
  },
];

let installed = false;
const handledEvents = new WeakSet<Event>();

function pickKey(btn: Element): string {
  const explicit = btn.getAttribute('data-sfx');
  if (explicit) return explicit;
  for (const rule of VARIANT_RULES) {
    for (const cls of rule.classes) {
      if (btn.classList.contains(cls)) return rule.key;
    }
  }
  return 'ui.button_click';
}

function handleClick(e: MouseEvent) {
  // Coalesce any stray repeat dispatches of the SAME event (capture + bubble,
  // synthetic re-dispatch, etc.) without suppressing genuinely separate clicks
  // on different buttons that happen close together.
  if (handledEvents.has(e)) return;
  handledEvents.add(e);

  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('button, [role="button"]');
  if (!btn) return;
  if (btn.hasAttribute('data-no-sfx')) return;
  if ((btn as HTMLButtonElement).disabled) return;
  if (btn.getAttribute('aria-disabled') === 'true') return;

  try {
    audioEngine.play(pickKey(btn));
  } catch {}
}

/**
 * Install a single capture-phase document click listener that automatically
 * plays the appropriate `ui.*` SFX for every button click in the app. Safe
 * to call more than once; only the first call wires up the listener.
 */
export function installButtonSfx() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', handleClick, true);
}

import type { ReactNode } from 'react';

export type BlockGroup = 'Content' | 'Lists' | 'Status' | 'Reveal' | 'Layout' | 'Errors';

export const BLOCK_GROUP_ORDER: BlockGroup[] = [
  'Content',
  'Lists',
  'Status',
  'Reveal',
  'Layout',
  'Errors',
];

export interface BlockMeta {
  friendlyName: string;
  description: string;
  group: BlockGroup;
  color: string;
  fromHint: string;
  fromShape: string;
  preview: () => ReactNode;
}

export const BLOCK_META: Record<string, BlockMeta> = {
  richText: {
    friendlyName: 'Rich Text',
    description: 'Formatted prose with headings, lists, links, code, and inline tokens.',
    group: 'Content',
    color: '#818cf8',
    fromHint: 'e.g. results.message',
    fromShape: 'string  →  becomes a single paragraph\narray   →  used directly as RichTextDoc',
    preview: () => (
      <div className="me-prev-richtext">
        <div className="me-prev-rt-h">Heading</div>
        <div className="me-prev-rt-p">Body text with <b>bold</b>.</div>
      </div>
    ),
  },
  divider: {
    friendlyName: 'Divider',
    description: 'Thin horizontal rule between sections. No fields.',
    group: 'Layout',
    color: '#64748b',
    fromHint: '',
    fromShape: '',
    preview: () => <div className="me-prev-divider" />,
  },
  image: {
    friendlyName: 'Image',
    description: 'Inline image with optional caption.',
    group: 'Content',
    color: '#22d3ee',
    fromHint: 'e.g. results.image',
    fromShape: 'string  →  treated as assetKey\nobject  →  { assetKey, alt?, caption? }',
    preview: () => <div className="me-prev-image"><span>🖼</span></div>,
  },
  metaRows: {
    friendlyName: 'Meta Rows',
    description: 'Label / value pairs for stats, attributes, or summaries.',
    group: 'Content',
    color: '#a78bfa',
    fromHint: 'e.g. results.stats',
    fromShape: 'array of { label, value }\nor object → keys become labels',
    preview: () => (
      <div className="me-prev-meta">
        <div className="me-prev-meta-row"><span>Label</span><span>Value</span></div>
        <div className="me-prev-meta-row"><span>Score</span><span>1,250</span></div>
      </div>
    ),
  },
  timer: {
    friendlyName: 'Timer',
    description: 'Live countdown to an ISO timestamp.',
    group: 'Status',
    color: '#fb923c',
    fromHint: 'e.g. timer.endsAt',
    fromShape: 'string ISO date\nor object { endsAt, label? }',
    preview: () => (
      <div className="me-prev-timer">
        <span className="me-prev-timer-label">ENDS IN</span>
        <span className="me-prev-timer-val">12:34</span>
      </div>
    ),
  },
  progress: {
    friendlyName: 'Progress Bar',
    description: 'Fill-meter showing current / max as a percentage.',
    group: 'Status',
    color: '#34d399',
    fromHint: 'e.g. timer.progress',
    fromShape: 'object { current, max, label? }',
    preview: () => (
      <div className="me-prev-progress">
        <div className="me-prev-progress-fill" />
        <span>62%</span>
      </div>
    ),
  },
  rewardsPreview: {
    friendlyName: 'Rewards (Compact)',
    description: 'Tiny compact rewards strip used in announcements.',
    group: 'Lists',
    color: '#fbbf24',
    fromHint: 'e.g. results.rewards',
    fromShape: 'array of { name, qty?, assetKey?, rarity? }',
    preview: () => (
      <div className="me-prev-rewards-compact">
        <span>🪙</span><span>×5</span>
        <span>💎</span><span>×1</span>
      </div>
    ),
  },
  rewardsList: {
    friendlyName: 'Rewards List',
    description: 'Full reward cards with rarity styling — best for completion screens.',
    group: 'Lists',
    color: '#fbbf24',
    fromHint: 'e.g. results.rewards',
    fromShape: 'array of { name, qty?, assetKey?, rarity? }',
    preview: () => (
      <div className="me-prev-rewards-list">
        <div className="me-prev-reward-card">🪙 Coin <b>×5</b></div>
        <div className="me-prev-reward-card">💎 Gem <b>×1</b></div>
      </div>
    ),
  },
  inventoryDelta: {
    friendlyName: 'Inventory Delta',
    description: 'Items gained or lost (+5 / -2) with colored deltas.',
    group: 'Lists',
    color: '#f472b6',
    fromHint: 'e.g. results.delta',
    fromShape: 'array of { name, qtyDelta, assetKey? }',
    preview: () => (
      <div className="me-prev-delta">
        <div>Wood <span className="me-prev-pos">+12</span></div>
        <div>Stone <span className="me-prev-neg">−3</span></div>
      </div>
    ),
  },
  giftReveal: {
    friendlyName: 'Gift Reveal',
    description: 'Centered gift card with optional reward grid below.',
    group: 'Reveal',
    color: '#f59e0b',
    fromHint: 'e.g. gift',
    fromShape: 'object { gift?, giftId?, title?, rewards? }',
    preview: () => (
      <div className="me-prev-gift">
        <span className="me-prev-gift-icon">🎁</span>
        <span className="me-prev-gift-title">A Gift!</span>
      </div>
    ),
  },
  error: {
    friendlyName: 'Error Message',
    description: 'Red error banner for failure messages.',
    group: 'Errors',
    color: '#ef4444',
    fromHint: 'e.g. results.errorMessage',
    fromShape: 'string\nor object { message }',
    preview: () => <div className="me-prev-error">⚠ Something went wrong.</div>,
  },
};

// ─── Action metadata ─────────────────────────────────────────────────────────

export interface ActionMeta {
  friendlyName: string;
  description: string;
  fields: { name: string; required?: boolean; hint?: string }[];
}

export const ACTION_META: Record<string, ActionMeta> = {
  CLOSE_MODAL: { friendlyName: 'Close Modal', description: 'Dismiss this modal. No side effects.', fields: [] },
  NAVIGATE: { friendlyName: 'Navigate', description: 'Send the player to a route in the app.', fields: [{ name: 'route', required: true, hint: 'e.g. /missions or /shop' }] },
  ACK_NOTIFICATION: { friendlyName: 'Acknowledge Notification', description: 'Mark a notification as read on the server.', fields: [{ name: 'notificationId', required: true, hint: 'often ${notificationId}' }] },
  COMPLETE_JOB: { friendlyName: 'Complete Job', description: 'Mark a long-running job as complete and claim its results.', fields: [{ name: 'jobId', required: true, hint: 'often ${jobId}' }] },
  CLAIM_GIFT: { friendlyName: 'Claim Gift', description: 'Claim a pending gift by ID.', fields: [{ name: 'giftId', required: true, hint: 'often ${gift.giftId}' }] },
  OPEN_INVENTORY: { friendlyName: 'Open Inventory', description: 'Navigate to the player inventory.', fields: [] },
  OPEN_MISSIONS: { friendlyName: 'Open Missions', description: 'Navigate to the missions list.', fields: [] },
  OPEN_CRAFTING: { friendlyName: 'Open Crafting', description: 'Navigate to the crafting screen.', fields: [] },
  REPEAT_MISSION: { friendlyName: 'Repeat Mission', description: 'Re-run the last mission with the same defId / entities.', fields: [{ name: 'defId', required: true }, { name: 'entityIds', hint: 'comma-separated' }] },
  CRAFT_AGAIN: { friendlyName: 'Craft Again', description: 'Run the same recipe again.', fields: [{ name: 'recipeDefId', required: true }] },
  API_CALL: { friendlyName: 'API Call', description: 'Send a custom command to the server. Use for advanced flows.', fields: [{ name: 'apiKey', required: true }, { name: 'payload', hint: 'JSON body' }] },
  BUILD_BUILDING: { friendlyName: 'Build Building', description: 'Construct a building at a location.', fields: [{ name: 'locationId', required: true }, { name: 'buildingDefId', required: true }] },
  UPGRADE_BUILDING: { friendlyName: 'Upgrade Building', description: 'Upgrade an existing building instance.', fields: [{ name: 'locationId', required: true }, { name: 'buildingId', required: true }] },
  SHOP_PURCHASE: { friendlyName: 'Shop Purchase', description: 'Buy a shop item by definition ID.', fields: [{ name: 'shopItemDefId', required: true }] },
  PRESTIGE: { friendlyName: 'Prestige', description: 'Trigger the prestige reset flow.', fields: [] },
};

// ─── Common static token paths (always shown in scripting help) ──────────────

export const COMMON_TOKEN_PATHS: { path: string; note: string }[] = [
  { path: 'defId', note: 'The triggering definition id (mission, job, gift…).' },
  { path: 'jobId', note: 'The job id, when the modal is launched from a job result.' },
  { path: 'notificationId', note: 'The notification that opened this modal.' },
  { path: 'data.*', note: 'Anything from the originating job/notification "data" payload.' },
  { path: 'results.*', note: 'Anything from a completed job\'s "results" payload.' },
  { path: 'results.rewards', note: 'Reward array — wire to a Rewards block via "from".' },
  { path: 'results.message', note: 'Server-supplied message string.' },
  { path: 'results.errorMessage', note: 'Server-supplied error string.' },
  { path: 'context.*', note: 'Custom context fields injected by the dispatcher.' },
  { path: 'gift', note: 'Gift object, when the modal is shown for a gift.' },
];

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
      <div>
        <div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 12 }}>Heading</div>
        <div style={{ color: '#94a3b8', fontSize: 11 }}>Body text with <b>bold</b>.</div>
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
    preview: () => <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.2)' }} />,
  },
  image: {
    friendlyName: 'Image',
    description: 'Inline image with optional caption.',
    group: 'Content',
    color: '#22d3ee',
    fromHint: 'e.g. results.image',
    fromShape: 'string  →  treated as assetKey\nobject  →  { assetKey, alt?, caption? }',
    preview: () => <div style={{ fontSize: 22, width: '100%', textAlign: 'center' }}><span>🖼</span></div>,
  },
  metaRows: {
    friendlyName: 'Meta Rows',
    description: 'Label / value pairs for stats, attributes, or summaries.',
    group: 'Content',
    color: '#a78bfa',
    fromHint: 'e.g. results.stats',
    fromShape: 'array of { label, value }\nor object → keys become labels',
    preview: () => (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: '#64748b' }}>Label</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>Value</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: '#64748b' }}>Score</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>1,250</span>
        </div>
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
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '4px 8px' }}>
        <span style={{ color: '#94a3b8', fontSize: 9, letterSpacing: '0.1em' }}>ENDS IN</span>
        <span style={{ color: '#a78bfa', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>12:34</span>
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
      <div style={{ position: 'relative', width: '100%', height: 18, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, right: '38%', background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }} />
        <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 800, color: '#fff' }}>62%</span>
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
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#fbbf24' }}>
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
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 6px', fontSize: 10 }}>🪙 Coin <b>×5</b></div>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 6px', fontSize: 10 }}>💎 Gem <b>×1</b></div>
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
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#cbd5e1' }}>
        <div>Wood <span style={{ color: '#34d399', fontWeight: 800 }}>+12</span></div>
        <div>Stone <span style={{ color: '#f87171', fontWeight: 800 }}>−3</span></div>
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
      <div style={{ width: '100%', textAlign: 'center' }}>
        <span style={{ display: 'block', fontSize: 22 }}>🎁</span>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#fbbf24' }}>A Gift!</span>
      </div>
    ),
  },
  list: {
    friendlyName: 'List (loop)',
    description: 'Renders its child blocks once per item in a source array. Inside, use ${item} and ${index}.',
    group: 'Lists',
    color: '#60a5fa',
    fromHint: 'use the "list" field instead of "from"',
    fromShape: 'list: ${path.to.array}\n→ children render N times with ${item}, ${index}',
    preview: () => (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: '#64748b' }}>${'{item.name}'}</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>×{'${item.qty}'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: '#64748b' }}>(repeats)</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>…</span>
        </div>
      </div>
    ),
  },
  clickReveal: {
    friendlyName: 'Click Reveal',
    description: 'Hides children behind a tap-to-reveal cover. Optional tags drive per-item sound and visual effect via "tag=value" maps.',
    group: 'Reveal',
    color: '#c084fc',
    fromHint: 'use Tags + Sound/FX maps instead of "from"',
    fromShape: 'tags: "${item.rarity}"\nsoundMap: "legendary=sfx.x, *=sfx.y"\nfxMap: "rare=burst, *=shimmer"',
    preview: () => (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', fontSize: 10, color: '#c084fc' }}>
        <span>👆 Tap to reveal</span>
      </div>
    ),
  },
  entityRoster: {
    friendlyName: 'Entity Roster',
    description: 'Grid of entity cards showing portrait, level, and mission outcome (XP gained, level-up, injury).',
    group: 'Lists',
    color: '#38bdf8',
    fromHint: 'e.g. team  or  entityOutcomes',
    fromShape: 'array of { id, name, level, portraitKey?, outcome?: { injured, xpGained, levelBefore, levelAfter } }',
    preview: () => (
      <div style={{ width: '100%', display: 'flex', gap: 4 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ flex: 1, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 5, padding: '4px 6px', textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>👤</div>
            <div style={{ color: '#e2e8f0', fontWeight: 700 }}>Lv{i + 3}</div>
          </div>
        ))}
      </div>
    ),
  },
  characterEvents: {
    friendlyName: 'Character Events',
    description: 'Inline badges for level-up and injury events that occurred during a mission.',
    group: 'Lists',
    color: '#a3e635',
    fromHint: 'e.g. results.characterEvents',
    fromShape: 'array of { type: "level_up"|"injured", entityName, newLevel? }',
    preview: () => (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#cbd5e1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#fbbf24' }}>⬆</span><span>Hero leveled up to 5!</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#f87171' }}>💔</span><span>Ranger was injured.</span>
        </div>
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
    preview: () => <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '3px 6px', color: '#fca5a5', fontSize: 10, width: '100%' }}>⚠ Something went wrong.</div>,
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
  NEXT_PAGE: { friendlyName: 'Next Page', description: 'Advance to the next page of this modal. Handled client-side — no server call.', fields: [] },
  PREV_PAGE: { friendlyName: 'Previous Page', description: 'Go back to the previous page of this modal. Handled client-side — no server call.', fields: [] },
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
  { path: 'results.characterEvents', note: 'Level-up / injury events — wire to a Character Events block via "from".' },
  { path: 'context.*', note: 'Custom context fields injected by the dispatcher.' },
  { path: 'gift', note: 'Gift object, when the modal is shown for a gift.' },
  { path: 'team', note: 'Entity roster for active missions — wire to an Entity Roster block via "from".' },
  { path: 'entityOutcomes', note: 'Per-entity results for completed missions — wire to an Entity Roster block via "from".' },
  { path: 'rewardItems', note: 'Pre-processed reward list for completed missions — wire to a Rewards List block via "from".' },
  { path: 'narrativeDoc', note: 'Rich text narrative for completed missions — wire to a Rich Text block via "from".' },
  { path: 'timerInfo', note: 'Timer/progress data for active missions — wire to Timer or Progress bar block via "from".' },
  { path: 'job.id', note: 'The job ID — use in COMPLETE_JOB or SKIP actions.' },
  { path: 'job.defId', note: 'The job definition ID — use in REPEAT_MISSION action.' },
  { path: 'job.team', note: 'Array of entity IDs — use as entityIds in REPEAT_MISSION action.' },
  { path: 'def.name', note: 'The definition name — use as a subtitle token e.g. ${def.name}.' },
];

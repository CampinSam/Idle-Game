import type { ReactNode } from 'react';

export type ComponentGroup =
  | 'Core HUD'
  | 'Daily / Events'
  | 'Missions'
  | 'Crafting'
  | 'Store'
  | 'Progress'
  | 'News'
  | 'Entities'
  | 'Inventory'
  | 'Utility';

export const COMPONENT_GROUP_ORDER: ComponentGroup[] = [
  'Core HUD', 'Daily / Events', 'Missions', 'Crafting',
  'Store', 'Progress', 'News', 'Entities', 'Inventory', 'Utility',
];

export interface ComponentMeta {
  friendlyName: string;
  description: string;
  group: ComponentGroup;
  color: string;
  preview: () => ReactNode;
}

// ─── Shared preview primitives ────────────────────────────────────────────────

const P = {
  wrap: (children: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 4px' }}>
      {children}
    </div>
  ),
  bar: (w: string, color = '#818cf8') => (
    <div style={{ height: 8, borderRadius: 4, background: color, width: w, opacity: 0.7 }} />
  ),
  shimmer: () => (
    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', width: '100%' }} />
  ),
  card: (children: ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '5px 7px', ...style }}>
      {children}
    </div>
  ),
  pill: (color: string) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 7px' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.8 }} />
      <div style={{ width: 22, height: 6, borderRadius: 3, background: color, opacity: 0.5 }} />
    </div>
  ),
  label: (text: string, color = '#aaa') => (
    <span style={{ fontSize: 9, color, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>{text}</span>
  ),
  stubOverlay: () => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', borderRadius: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#fb923c', letterSpacing: '0.08em' }}>STUB</span>
    </div>
  ),
};

// ─── Component metadata ───────────────────────────────────────────────────────

export const COMPONENT_META: Record<string, ComponentMeta> = {

  // ── Core HUD ──────────────────────────────────────────────────────────────

  ResourceSummaryBar: {
    friendlyName: 'Resource Summary Bar',
    description: 'Scrollable row of player currencies with icons and values. Appears at the top of most screens.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => P.wrap(
      <div style={{ display: 'flex', gap: 5 }}>
        {['#818cf8', '#fbbf24', '#34d399', '#f472b6'].map((c, i) => (
          <div key={i}>{P.pill(c)}</div>
        ))}
      </div>
    ),
  },

  SeasonBanner: {
    friendlyName: 'Season Banner',
    description: 'Full-width hero banner displaying the current season name, number, and artwork.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => (
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', borderRadius: 6, padding: '10px 8px', textAlign: 'center' }}>
        {P.label('Season 1 · The Frozen Age', '#a5b4fc')}
      </div>
    ),
  },

  BannerCarousel: {
    friendlyName: 'Banner Carousel',
    description: 'Auto-scrolling carousel of promotional banners for events, store offers, and announcements.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => P.wrap(
      <>
        <div style={{ height: 36, background: 'linear-gradient(90deg, #1e1b4b, #4c1d95)', borderRadius: 6 }} />
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {[true, false, false].map((active, i) => (
            <div key={i} style={{ width: active ? 14 : 6, height: 4, borderRadius: 2, background: active ? '#818cf8' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      </>
    ),
  },

  QuickStatusCards: {
    friendlyName: 'Quick Status Cards',
    description: 'Grid of 2–4 compact stat cards showing active jobs, entity count, outpost status, and similar at-a-glance info.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {['Birds', 'Jobs', 'Outposts', 'Quests'].map(label => (
          P.card(
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {P.label(label)}
              <div style={{ width: 20, height: 10, borderRadius: 3, background: '#818cf855' }} />
            </div>
          )
        ))}
      </div>
    ),
  },

  GlobalBuffsSection: {
    friendlyName: 'Global Buffs',
    description: 'Lists active world buffs and their remaining durations. Auto-sourced from game state.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => P.wrap(
      <>
        {P.label('Active Buffs')}
        {[['⚡ Speed Boost', '#34d399'], ['🛡 Defense Up', '#60a5fa']].map(([name, color]) => (
          <div key={String(name)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#e0e0ff' }}>{String(name)}</span>
            {P.bar('40%', String(color))}
          </div>
        ))}
      </>
    ),
  },

  // ── Daily / Events ─────────────────────────────────────────────────────────

  DailyQuestPanel: {
    friendlyName: 'Daily Quest Panel',
    description: 'Shows today\'s active quests with completion progress bars. Sourced from game state.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.wrap(
      <>
        {P.label('Daily Quest')}
        {P.bar('65%', '#fb923c')}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: '#aaa' }}>Gather 10 Wood</span>
          <span style={{ fontSize: 9, color: '#fb923c' }}>6/10</span>
        </div>
      </>
    ),
  },

  DailyCheckInCard: {
    friendlyName: 'Daily Check-In',
    description: 'Shows a 7-day check-in track with claimed/unclaimed states. Tap to claim today\'s reward.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.wrap(
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        {[true, true, true, false, false, false, false].map((done, i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: '50%',
            background: done ? '#fb923c' : 'rgba(255,255,255,0.08)',
            border: i === 3 ? '2px solid #fb923c' : '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {done && <span style={{ fontSize: 8 }}>✓</span>}
          </div>
        ))}
      </div>
    ),
  },

  EventCountdownCard: {
    friendlyName: 'Event Countdown',
    description: 'Large countdown timer to an event end date. Requires `endsAt` (ISO 8601) prop.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => (
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        {P.label('Event Ends In', '#fb923c')}
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fb923c', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>12:34:56</div>
      </div>
    ),
  },

  EventCarousel: {
    friendlyName: 'Event Carousel',
    description: 'Horizontal scrolling list of active event cards with artwork and labels. Auto-sourced.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.wrap(
      <div style={{ display: 'flex', gap: 5 }}>
        {['#7c3aed', '#b45309', '#065f46'].map((c, i) => (
          <div key={i} style={{ flex: '0 0 52px', height: 36, background: c, borderRadius: 6, opacity: 0.7 }} />
        ))}
      </div>
    ),
  },

  EventCardList: {
    friendlyName: 'Event Card List',
    description: 'Vertical list of event cards. Stub — renders placeholder in current build.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {[1, 2].map(i => P.card(<div key={i} style={{ height: 18, opacity: 0.4 }} />))}
        {P.stubOverlay()}
      </div>
    ),
  },

  SeasonBossPanel: {
    friendlyName: 'Season Boss Panel',
    description: 'Displays the season boss artwork, HP bar, and engage CTA. Stub — placeholder in current build.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => (
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
        <span style={{ fontSize: 22 }}>👹</span>
        <div style={{ marginTop: 4 }}>{P.bar('45%', '#ef4444')}</div>
        {P.stubOverlay()}
      </div>
    ),
  },

  SeasonProgressCard: {
    friendlyName: 'Season Progress',
    description: 'Shows overall season XP progression, level, and time remaining. Auto-sourced from game state.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.wrap(
      <>
        {P.label('Season Progress')}
        {P.bar('38%', '#fb923c')}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: '#aaa' }}>Lv 12</span>
          <span style={{ fontSize: 9, color: '#aaa' }}>3 800 / 10 000 XP</span>
        </div>
      </>
    ),
  },

  // ── Missions ───────────────────────────────────────────────────────────────

  MissionFeaturedCard: {
    friendlyName: 'Mission Featured Card',
    description: 'Full-width card for the most prominent available mission with artwork and CTA. Auto-sourced.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => (
      <div style={{ background: 'linear-gradient(135deg, #2d1b69, #4c1d95)', borderRadius: 7, padding: '10px 8px' }}>
        {P.label('Featured Mission', '#a78bfa')}
        <div style={{ marginTop: 4, height: 8, borderRadius: 3, background: '#a78bfa55', width: '70%' }} />
      </div>
    ),
  },

  ActiveMissionList: {
    friendlyName: 'Active Mission List',
    description: 'List of missions currently in progress with countdowns and entity avatars. Auto-sourced.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => P.wrap(
      <>
        {[['70%'], ['40%'], ['90%']].map(([w], i) => (
          P.card(
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#a78bfa44', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>{P.bar(w, '#a78bfa')}</div>
            </div>
          )
        ))}
      </>
    ),
  },

  MissionCategoryRail: {
    friendlyName: 'Mission Category Rail',
    description: 'Horizontal scrollable rail of mission category chips. Stub in current build.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['Combat', 'Gather', 'Explore'].map(label => (
            <div key={label} style={{ background: '#a78bfa22', border: '1px solid #a78bfa44', borderRadius: 20, padding: '3px 8px' }}>
              <span style={{ fontSize: 8, color: '#c4b5fd' }}>{label}</span>
            </div>
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  // ── Crafting ───────────────────────────────────────────────────────────────

  CraftingWorkshopsCard: {
    friendlyName: 'Crafting Workshops',
    description: 'Shows available workshop slots and active crafting jobs. Auto-sourced from game state.',
    group: 'Crafting',
    color: '#34d399',
    preview: () => P.wrap(
      <>
        {P.label('Workshops')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[true, true, false].map((active, i) => (
            <div key={i} style={{ height: 28, borderRadius: 5, background: active ? '#34d39922' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? '#34d39944' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11 }}>{active ? '⚒' : '+'}</span>
            </div>
          ))}
        </div>
      </>
    ),
  },

  CraftingQueuePreview: {
    friendlyName: 'Crafting Queue Preview',
    description: 'Compact list of queued recipe jobs with timers. Stub in current build.',
    group: 'Crafting',
    color: '#34d399',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {[1, 2].map(i => P.card(
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#34d39944' }} />
            {P.bar('60%', '#34d399')}
          </div>
        ))}
        {P.stubOverlay()}
      </div>
    ),
  },

  RecipeCategoryRail: {
    friendlyName: 'Recipe Category Rail',
    description: 'Horizontal scrollable chips for filtering recipe categories. Stub in current build.',
    group: 'Crafting',
    color: '#34d399',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['Tools', 'Food', 'Armor'].map(label => (
            <div key={label} style={{ background: '#34d39922', border: '1px solid #34d39944', borderRadius: 20, padding: '3px 8px' }}>
              <span style={{ fontSize: 8, color: '#6ee7b7' }}>{label}</span>
            </div>
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  // ── Store ──────────────────────────────────────────────────────────────────

  StoreOfferCard: {
    friendlyName: 'Store Offer Card',
    description: 'Single featured store offer card with artwork, name, price, and buy CTA. Stub.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => (
      <div style={{ position: 'relative' }}>
        {P.card(
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fbbf2422', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎁</div>
            <div style={{ flex: 1 }}>
              {P.bar('70%', '#fbbf24')}
              <div style={{ marginTop: 3 }}>{P.bar('40%', '#fbbf2466')}</div>
            </div>
          </div>
        )}
        {P.stubOverlay()}
      </div>
    ),
  },

  StoreOfferCarousel: {
    friendlyName: 'Store Offer Carousel',
    description: 'Horizontal scrollable carousel of store offer cards. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: '0 0 44px', height: 44, background: '#fbbf2415', border: '1px solid #fbbf2433', borderRadius: 7 }} />
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  StoreItemGrid: {
    friendlyName: 'Store Item Grid',
    description: 'Grid of purchasable store items with icons and prices. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ height: 28, borderRadius: 5, background: '#fbbf2415', border: '1px solid #fbbf2433' }} />
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  StoreItemRail: {
    friendlyName: 'Store Item Rail',
    description: 'Horizontal scrollable rail of store items. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: '0 0 36px', height: 36, background: '#fbbf2415', border: '1px solid #fbbf2433', borderRadius: 6 }} />
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  FeaturedShopRail: {
    friendlyName: 'Featured Shop Rail',
    description: 'Curated horizontal rail highlighting featured shop items. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {P.label('Featured')}
        <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ flex: '0 0 60px', height: 36, background: 'linear-gradient(135deg, #78350f, #92400e)', borderRadius: 7, opacity: 0.6 }} />
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  GemPackGrid: {
    friendlyName: 'Gem Pack Grid',
    description: 'Grid of gem bundle purchase options with price tiers. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {['💎 80', '💎 500', '💎 1 200', '💎 2 500'].map(label => (
            <div key={label} style={{ background: '#fbbf2415', border: '1px solid #fbbf2433', borderRadius: 6, padding: '4px 6px' }}>
              <span style={{ fontSize: 9, color: '#fbbf24' }}>{label}</span>
            </div>
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  WalletPromptCard: {
    friendlyName: 'Wallet Prompt',
    description: 'Encourages wallet connection with a message and CTA button. Hidden once wallet is linked.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.card(
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>👛</span>
        <div style={{ flex: 1 }}>
          {P.bar('80%', '#fbbf24')}
          <div style={{ marginTop: 3, height: 14, borderRadius: 3, background: '#fbbf2433', width: '50%' }} />
        </div>
      </div>
    ),
  },

  NFTCapacityInfoCard: {
    friendlyName: 'NFT Capacity Info',
    description: 'Shows how many NFT entity slots the player has used vs. their cap. Stub in current build.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {P.label('NFT Capacity')}
        {P.bar('30%', '#fbbf24')}
        <span style={{ fontSize: 9, color: '#aaa' }}>3 / 10 slots</span>
        {P.stubOverlay()}
      </div>
    ),
  },

  // ── Progress ───────────────────────────────────────────────────────────────

  BattlePassProgress: {
    friendlyName: 'Battle Pass Progress',
    description: 'Shows current battle pass tier, XP bar, and next reward preview. Stub in current build.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {P.label('Battle Pass')}
        {P.bar('55%', '#60a5fa')}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: '#aaa' }}>Tier 7</span>
          <span style={{ fontSize: 9, color: '#60a5fa' }}>550 / 1000</span>
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  BattlePassTierList: {
    friendlyName: 'Battle Pass Tier List',
    description: 'Full scrollable list of all battle pass reward tiers. Stub in current build.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {[1, 2, 3].map(i => P.card(
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: '#60a5fa22' }} />
            {P.bar('60%', '#60a5fa')}
          </div>
        ))}
        {P.stubOverlay()}
      </div>
    ),
  },

  TelemetryCard: {
    friendlyName: 'Telemetry Card',
    description: 'Displays a live metric from a telemetry definition. Requires `telemetryDefId` prop.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <>
        {P.label('Metrics')}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 28 }}>
          {[0.4, 0.7, 0.5, 1.0, 0.65, 0.85].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: '#60a5fa', borderRadius: '2px 2px 0 0', opacity: 0.6 + h * 0.3 }} />
          ))}
        </div>
      </>
    ),
  },

  OutpostReadyList: {
    friendlyName: 'Outpost Ready List',
    description: 'Lists outposts with completed production ready to collect. Stub in current build.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {[1, 2].map(i => P.card(
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10 }}>🏭</span>
            {P.bar('75%', '#60a5fa')}
          </div>
        ))}
        {P.stubOverlay()}
      </div>
    ),
  },

  OutpostSummaryCards: {
    friendlyName: 'Outpost Summary Cards',
    description: 'Compact summary cards for each outpost showing production rate and status. Stub.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 24, borderRadius: 5, background: '#60a5fa15', border: '1px solid #60a5fa33' }} />
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  InventoryCategoryGrid: {
    friendlyName: 'Inventory Category Grid',
    description: 'Grid of item category shortcuts linking to filtered inventory views. Stub.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {['⚔️', '🛡', '🧪', '🌿', '💎', '📦'].map((icon, i) => (
            <div key={i} style={{ height: 28, borderRadius: 5, background: '#60a5fa15', border: '1px solid #60a5fa33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{icon}</div>
          ))}
        </div>
        {P.stubOverlay()}
      </div>
    ),
  },

  // ── News ───────────────────────────────────────────────────────────────────

  NewsCard: {
    friendlyName: 'News Card',
    description: 'Single news item card with headline, timestamp, and optional image. Stub.',
    group: 'News',
    color: '#f472b6',
    preview: () => (
      <div style={{ position: 'relative' }}>
        {P.card(
          <>
            <div style={{ height: 20, borderRadius: 4, background: '#f472b622', marginBottom: 5 }} />
            {P.bar('60%', '#f472b6')}
            <div style={{ marginTop: 3, fontSize: 8, color: '#aaa' }}>2 hours ago</div>
          </>
        )}
        {P.stubOverlay()}
      </div>
    ),
  },

  AnnouncementFeed: {
    friendlyName: 'Announcement Feed',
    description: 'Vertically stacked list of game announcements. Stub in current build.',
    group: 'News',
    color: '#f472b6',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {[1, 2].map(i => P.card(
          <div key={i}>
            {P.bar('80%', '#f472b6')}
            <div style={{ marginTop: 3 }}>{P.bar('50%', '#f472b644')}</div>
          </div>
        ))}
        {P.stubOverlay()}
      </div>
    ),
  },

  PatchNotesCard: {
    friendlyName: 'Patch Notes',
    description: 'Displays free-form patch notes text with a version label. Requires `notes` prop.',
    group: 'News',
    color: '#f472b6',
    preview: () => P.card(
      <>
        {P.label('v1.4.2 — Patch Notes', '#f472b6')}
        <div style={{ marginTop: 5 }}>
          {P.shimmer()}
          <div style={{ marginTop: 3 }}>{P.shimmer()}</div>
          <div style={{ marginTop: 3 }}>{P.bar('60%')}</div>
        </div>
      </>
    ),
  },

  FeaturedBirdCard: {
    friendlyName: 'Featured Bird Card',
    description: 'Spotlight card for a specific entity/bird with artwork. Stub in current build.',
    group: 'News',
    color: '#f472b6',
    preview: () => (
      <div style={{ position: 'relative' }}>
        {P.card(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🦜</div>
            <div style={{ flex: 1 }}>
              {P.bar('70%', '#f472b6')}
              <div style={{ marginTop: 3 }}>{P.bar('45%', '#f472b644')}</div>
            </div>
          </div>
        )}
        {P.stubOverlay()}
      </div>
    ),
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  EmptyStateCard: {
    friendlyName: 'Empty State',
    description: 'Centred placeholder shown when a section has no content. Requires `message` prop.',
    group: 'Utility',
    color: '#64748b',
    preview: () => (
      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
        <div style={{ fontSize: 18, color: '#475569', marginBottom: 4 }}>—</div>
        {P.label('Nothing here yet', '#64748b')}
      </div>
    ),
  },

  HelpTipCard: {
    friendlyName: 'Help Tip',
    description: 'Info card with an emoji icon, optional title, and body text. Requires `message` prop.',
    group: 'Utility',
    color: '#64748b',
    preview: () => P.card(
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14 }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          {P.bar('55%', '#94a3b8')}
          <div style={{ marginTop: 3 }}>{P.shimmer()}</div>
        </div>
      </div>
    ),
  },

  CTAButtonGroup: {
    friendlyName: 'CTA Button Group',
    description: 'One or more action buttons. Requires a `buttons` array prop.',
    group: 'Utility',
    color: '#64748b',
    preview: () => P.wrap(
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, height: 22, borderRadius: 5, background: '#818cf8', opacity: 0.6 }} />
        <div style={{ flex: 1, height: 22, borderRadius: 5, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
      </div>
    ),
  },

  SkeletonCard: {
    friendlyName: 'Skeleton Card',
    description: 'Shimmer placeholder shown while data loads. Optional `rows` prop controls line count.',
    group: 'Utility',
    color: '#64748b',
    preview: () => P.wrap(
      <>
        {P.shimmer()}
        {P.shimmer()}
        {P.bar('60%')}
      </>
    ),
  },

  EntityRoster: {
    friendlyName: 'Entity Roster',
    description: 'Full entity browsing list with search, filter, and sort controls. Reads all entity data from the sync store. Use with vertical_feed layout on the /entities screen.',
    group: 'Entities',
    color: '#10b981',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
          <div style={{ flex: 1, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div style={{ width: 60, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
          {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'].map((c, i) => (
            <div key={i} style={{ height: 38, borderRadius: 6, background: `${c}22`, border: `1px solid ${c}44` }} />
          ))}
        </div>
      </>
    ),
  },

  InventoryItemBrowser: {
    friendlyName: 'Inventory Item Browser',
    description: 'Full inventory screen — item grid with category tabs, search, rarity/sort filters, detail panel, and equip/use/open action flows. All data from sync store. Use with pass_through layout on the /inventory screen.',
    group: 'Inventory',
    color: '#10b981',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {['All', 'Gear', 'Consumables', 'Materials'].map((label, i) => (
            <div key={i} style={{ flex: i === 0 ? 0 : 1, padding: '3px 6px', borderRadius: 20, background: i === 0 ? '#10b98122' : 'rgba(255,255,255,0.05)', border: `1px solid ${i === 0 ? '#10b98144' : 'rgba(255,255,255,0.08)'}` }}>
              <span style={{ fontSize: 7, color: i === 0 ? '#6ee7b7' : '#888' }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3 }}>
          {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#f472b6', '#34d399'].map((c, i) => (
            <div key={i} style={{ height: 30, borderRadius: 5, background: `${c}22`, border: `1px solid ${c}44` }} />
          ))}
        </div>
      </>
    ),
  },

  EntityDetailView: {
    friendlyName: 'Entity Detail View',
    description: 'Full entity detail panel including header, stats, and equipment. Optionally pin a specific entity via the entityId prop; otherwise previews the first entity in the sync store. Use with pass_through layout on the /entities/:id screen.',
    group: 'Entities',
    color: '#10b981',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <div style={{ width: 24, height: 24, borderRadius: 5, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(139,92,246,0.3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 7, borderRadius: 3, background: '#10b98155', width: '70%' }} />
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '40%', marginTop: 3 }} />
          </div>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
        </div>
        {P.shimmer()}
        {P.shimmer()}
        {P.bar('80%')}
      </>
    ),
  },
};

// ─── Component classification sets ────────────────────────────────────────────

/** Components that have no configurable props — all data from sync store or none needed. */
export const NO_PROPS_COMPONENTS = new Set([
  'BannerCarousel', 'SeasonBanner', 'GlobalBuffsSection', 'CraftingWorkshopsCard',
  'QuickStatusCards', 'DailyQuestPanel', 'MissionFeaturedCard', 'ActiveMissionList',
  'SeasonProgressCard', 'EntityRoster', 'InventoryItemBrowser',
]);

/** Stub-only components — render a placeholder in dev, nothing in production. */
export const STUB_COMPONENTS = new Set([
  'FeaturedBirdCard', 'StoreOfferCard', 'StoreOfferCarousel', 'StoreItemGrid',
  'StoreItemRail', 'FeaturedShopRail', 'GemPackGrid', 'BattlePassProgress',
  'BattlePassTierList', 'EventCarousel', 'EventCardList', 'SeasonBossPanel',
  'NewsCard', 'AnnouncementFeed', 'MissionCategoryRail', 'CraftingQueuePreview',
  'RecipeCategoryRail', 'OutpostReadyList', 'OutpostSummaryCards',
  'InventoryCategoryGrid', 'NFTCapacityInfoCard',
]);

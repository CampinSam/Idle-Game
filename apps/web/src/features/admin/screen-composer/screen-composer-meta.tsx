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
  | 'Outposts'
  | 'Utility';

export const COMPONENT_GROUP_ORDER: ComponentGroup[] = [
  'Core HUD', 'Daily / Events', 'Missions', 'Crafting',
  'Store', 'Progress', 'News', 'Entities', 'Inventory', 'Outposts', 'Utility',
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
    description: 'Auto-scrolling carousel of promotional banners for events, store offers, and announcements. Content sourced from the /api/ui/home-banners endpoint.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => P.wrap(
      <>
        <div style={{ height: 40, background: 'linear-gradient(120deg, #1e1b4b 0%, #4c1d95 60%, #7c3aed 100%)', borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.5)', width: '65%', marginBottom: 4 }} />
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.25)', width: '40%' }} />
          </div>
          <div style={{ width: 22, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 7, color: '#fff', fontWeight: 700 }}>GO</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          {[true, false, false, false].map((active, i) => (
            <div key={i} style={{ width: active ? 14 : 5, height: 4, borderRadius: 2, background: active ? '#818cf8' : 'rgba(255,255,255,0.15)' }} />
          ))}
        </div>
      </>
    ),
  },

  QuickStatusCards: {
    friendlyName: 'Quick Status Cards',
    description: 'Grid of 3 compact stat cards showing entity count, outpost count, and active mission jobs.',
    group: 'Core HUD',
    color: '#818cf8',
    preview: () => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        {[['🪶', 'Entities', '4'], ['🏠', 'Outposts', '2'], ['🗺️', 'Missions', '3']].map(([icon, label, val]) => (
          P.card(
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11 }}>{icon}</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#e0e0ff' }}>{val}</span>
              {P.label(label)}
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
    description: 'Tap-to-claim card with a gift emoji, subtitle text, and a CLAIM button. Configurable via props.',
    group: 'Daily / Events',
    color: '#fb923c',
    preview: () => P.card(
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🎁</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {P.label('Daily Check-In', '#fb923c')}
          <div style={{ marginTop: 3 }}>{P.bar('80%', 'rgba(255,255,255,0.15)')}</div>
        </div>
        <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 5, padding: '3px 7px' }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: '#1a1640' }}>CLAIM</span>
        </div>
      </div>,
      { border: '1px solid rgba(251,146,60,0.25)' }
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
    description: 'Card with mission name, description, tier badge, active-job count, and "GO TO MISSIONS" CTA. Optional missionDefId prop pins a specific mission.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => P.wrap(
      <>
        {P.label('🗺️ Featured Mission', '#a78bfa')}
        {P.bar('65%', '#a78bfa')}
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', width: '85%', marginTop: 2 }} />
        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
          <div style={{ background: '#a78bfa22', border: '1px solid #a78bfa44', borderRadius: 20, padding: '2px 7px' }}>
            <span style={{ fontSize: 7, color: '#c4b5fd' }}>⭐ Tier 2</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '2px 7px' }}>
            <span style={{ fontSize: 7, color: '#aaa' }}>⏳ 3 Active</span>
          </div>
        </div>
        <div style={{ marginTop: 5, height: 18, borderRadius: 5, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>GO TO MISSIONS</span>
        </div>
      </>
    ),
  },

  ActiveMissionList: {
    friendlyName: 'Active Mission List',
    description: 'List of active mission jobs with mission name rows. Shows empty-state with "START MISSION" CTA when idle. Optional limit prop controls max rows shown.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => P.wrap(
      <>
        {P.label('🗺️ Active Missions', '#a78bfa')}
        {[['Raid the Outpost', '70%'], ['Gather Resources', '50%'], ['Explore the Ruins', '85%']].map(([name, w], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <span style={{ fontSize: 9 }}>🗺️</span>
            {P.bar(w, '#a78bfa')}
          </div>
        ))}
      </>
    ),
  },

  MissionBrowser: {
    friendlyName: 'Mission Browser',
    description: 'Full missions screen — category grid, mission list, activity panel, and mission builder flow. All data from sync store and game slice. Use with pass_through layout on the /missions screen.',
    group: 'Missions',
    color: '#a78bfa',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {[['⚔️','Combat',true],['🌿','Gather',false],['🗺','Explore',false],['💰','Trade',false]].map(([icon, label, active]) => (
            <div key={String(label)} style={{ flex: 1, padding: '3px 2px', borderRadius: 6, background: active ? '#a78bfa22' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? '#a78bfa55' : 'rgba(255,255,255,0.08)'}`, textAlign: 'center' }}>
              <div style={{ fontSize: 9 }}>{String(icon)}</div>
              <div style={{ fontSize: 6, color: active ? '#c4b5fd' : '#666', marginTop: 1 }}>{String(label)}</div>
            </div>
          ))}
        </div>
        {[['Raid the Outpost','⭐ Tier 2'],['Gathering Run','⭐ Tier 1']].map(([name, tier], i) => (
          P.card(
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ height: 6, borderRadius: 3, background: '#a78bfa66', width: 60, marginBottom: 3 }} />
                <span style={{ fontSize: 7, color: '#c4b5fd' }}>{String(tier)}</span>
              </div>
              <div style={{ width: 24, height: 14, borderRadius: 4, background: '#7c3aed55', border: '1px solid #7c3aed88', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 6, color: '#e0e0ff', fontWeight: 700 }}>GO</span>
              </div>
            </div>,
            { border: `1px solid #a78bfa33` }
          )
        ))}
      </>
    ),
  },

  MissionCategoryRail: {
    friendlyName: 'Mission Category Rail',
    description: 'Horizontal scrollable rail of mission category chips sourced from game definitions.',
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
    description: 'Compact list of active crafting jobs with recipe names and live countdown timers.',
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
        
      </div>
    ),
  },

  RecipeCategoryRail: {
    friendlyName: 'Recipe Category Rail',
    description: 'Horizontal scrollable chips for filtering recipes by category, derived from crafting recipe definitions.',
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
        
      </div>
    ),
  },

  // ── Store ──────────────────────────────────────────────────────────────────

  StoreOfferCard: {
    friendlyName: 'Store Offer Card',
    description: 'Single featured store offer card with name, badge, and CTA. Fetches live shop data.',
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
        
      </div>
    ),
  },

  StoreOfferCarousel: {
    friendlyName: 'Store Offer Carousel',
    description: 'Horizontal scrollable carousel of store offer cards. Fetches live shop data.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: '0 0 44px', height: 44, background: '#fbbf2415', border: '1px solid #fbbf2433', borderRadius: 7 }} />
          ))}
        </div>
        
      </div>
    ),
  },

  StoreItemGrid: {
    friendlyName: 'Store Item Grid',
    description: 'Grid of purchasable store items. Fetches live shop data; filterable by tab.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ height: 28, borderRadius: 5, background: '#fbbf2415', border: '1px solid #fbbf2433' }} />
          ))}
        </div>
        
      </div>
    ),
  },

  StoreItemRail: {
    friendlyName: 'Store Item Rail',
    description: 'Horizontal scrollable rail of store items. Fetches live shop data; filterable by tab.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: '0 0 36px', height: 36, background: '#fbbf2415', border: '1px solid #fbbf2433', borderRadius: 6 }} />
          ))}
        </div>
        
      </div>
    ),
  },

  FeaturedShopRail: {
    friendlyName: 'Featured Shop Rail',
    description: 'Curated horizontal rail of badged or time-limited shop items. Fetches live shop data.',
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
        
      </div>
    ),
  },

  GemPackGrid: {
    friendlyName: 'Gem Pack Grid',
    description: 'Grid of gem bundle purchase options. Fetches live gem pack data from the admin gem pack definitions.',
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
    description: 'Shows how many NFT entity slots the player has used vs. their cap. Live data from the sync store.',
    group: 'Store',
    color: '#fbbf24',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        {P.label('NFT Capacity')}
        {P.bar('30%', '#fbbf24')}
        <span style={{ fontSize: 9, color: '#aaa' }}>3 / 10 slots</span>
        
      </div>
    ),
  },

  // ── Progress ───────────────────────────────────────────────────────────────

  BattlePassProgress: {
    friendlyName: 'Battle Pass Progress',
    description: 'Shows current battle pass tier, XP bar, and next reward preview. Configured via props.',
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
        
      </div>
    ),
  },

  BattlePassTierList: {
    friendlyName: 'Battle Pass Tier List',
    description: 'Full scrollable list of all battle pass reward tiers. Configured via props.',
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

  SettingsBrowser: {
    friendlyName: 'Settings',
    description: 'Full settings page — audio bus volume sliders, linked wallet management (EVM/Cardano), NFT resync, and password/security tab. All data from Redux auth + audioEngine. Use with pass_through layout on the /settings screen.',
    group: 'Utility',
    color: '#94a3b8',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {['🎵 Audio','🔗 Wallet','🔒 Security'].map((t, i) => (
            <div key={i} style={{ flex: 1, fontSize: 7, textAlign: 'center', padding: '3px 0', borderRadius: 4, background: i === 0 ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#c4b5fd' : 'rgba(255,255,255,0.4)', borderBottom: i === 0 ? '2px solid #7c3aed' : '2px solid transparent' }}>{t}</div>
          ))}
        </div>
        {['Music','SFX','UI','Ambient'].map((l, i) => (
          <div key={l} style={{ display: 'grid', gridTemplateColumns: '10px 28px 1fr 12px', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 8 }}>{'🎵💥🔔🌿'[i]}</div>
            <div style={{ fontSize: 7, color: '#b8b8ff' }}>{l}</div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${[80,60,70,40][i]}%`, background: '#818cf8', borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 7, color: '#666', textAlign: 'right' }}>{[80,60,70,40][i]}</div>
          </div>
        ))}
      </>
    ),
  },

  StoreBrowser: {
    friendlyName: 'Store',
    description: 'Full in-game store — featured items, gem packs (Stripe + crypto), currency/bundle/item tabs, Derp Pass banner, and payment modals. All data fetched client-side. Use with pass_through layout on the /store screen.',
    group: 'Store',
    color: '#22c55e',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
          {[['💎 Gems',true],['📦 Bundles',false],['🎁 Items',false]].map(([label, active]) => (
            <div key={String(label)} style={{ flex: 1, padding: '3px 0', borderRadius: 6, background: active ? '#22c55e22' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? '#22c55e55' : 'rgba(255,255,255,0.08)'}`, textAlign: 'center' }}>
              <span style={{ fontSize: 7, color: active ? '#86efac' : '#666' }}>{String(label)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 3 }}>
          {[['💎','80','#22c55e'],['💎💎','200','#3b82f6'],['💎💎💎','500','#a78bfa']].map(([icon, amount, color]) => (
            P.card(
              <div key={String(amount)} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10 }}>{String(icon)}</div>
                <div style={{ fontSize: 7, color: String(color), fontWeight: 700, marginTop: 2 }}>{String(amount)}</div>
                <div style={{ marginTop: 3, height: 11, borderRadius: 4, background: `${String(color)}33`, border: `1px solid ${String(color)}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 6, color: String(color), fontWeight: 700 }}>BUY</span>
                </div>
              </div>,
              { border: `1px solid ${String(color)}33` }
            )
          ))}
        </div>
        {P.card(
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))', borderRadius: 5, padding: '4px 6px' }}>
            <span style={{ fontSize: 12 }}>⭐</span>
            <div style={{ flex: 1 }}>
              <div style={{ height: 5, borderRadius: 3, background: '#fbbf2466', width: '55%', marginBottom: 3 }} />
              <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.15)', width: '35%' }} />
            </div>
            <div style={{ fontSize: 7, color: '#fbbf24', fontWeight: 700, border: '1px solid rgba(251,191,36,0.4)', padding: '2px 5px', borderRadius: 4 }}>GET</div>
          </div>,
          { border: '1px solid rgba(251,191,36,0.2)' }
        )}
      </>
    ),
  },

  AchievementsBrowser: {
    friendlyName: 'Achievements',
    description: 'Full achievements page — progress bar, sorted achievement cards (completed, active, not started, claimed). All data from sync store. Use with pass_through layout on the /achievements screen.',
    group: 'Progress',
    color: '#ffd76a',
    preview: () => P.wrap(
      <>
        {P.card(
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10 }}>🏆</div>
            <div style={{ flex: 1 }}>{P.bar('60%', '#ffd76a')}</div>
            <div style={{ fontSize: 8, color: '#ffd76a' }}>60%</div>
          </div>,
          { border: '1px solid rgba(255,215,0,0.2)' }
        )}
        {[0,1,2].map(i => P.card(
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? '#22c55e' : i === 1 ? '#818cf8' : 'rgba(255,255,255,0.15)' }} />
            {P.bar(i === 0 ? '80%' : i === 1 ? '55%' : '40%', i === 0 ? '#22c55e' : '#818cf8')}
          </div>
        ))}
      </>
    ),
  },

  ProfileBrowser: {
    friendlyName: 'Profile',
    description: 'Player profile page — avatar initials, username/email, keeper level badge, member-since date. All data from Redux auth state. Use with pass_through layout on the /profile screen.',
    group: 'Utility',
    color: '#c4b5fd',
    preview: () => P.wrap(
      <>
        {P.card(
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#6D28D9,#4C1D95)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#e2d9ff', fontWeight: 700 }}>KP</div>
            <div style={{ flex: 1 }}>
              {P.bar('65%', '#c4b5fd')}
              <div style={{ marginTop: 3 }}>{P.bar('35%', '#818cf8')}</div>
            </div>
          </div>,
          { border: '1px solid rgba(139,92,246,0.2)' }
        )}
        {['Username','Email','Level','Since'].map(l => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{l}</div>
            {P.bar('30%', '#c4b5fd')}
          </div>
        ))}
      </>
    ),
  },

  RewardsBrowser: {
    friendlyName: 'Rewards',
    description: 'Rewards hub — daily check-in calendar, pending gift claim list, and active quest list. All data from sync store. Use with pass_through layout on the /rewards screen.',
    group: 'Daily / Events',
    color: '#a78bfa',
    preview: () => P.wrap(
      <>
        {P.label('📅 Daily Check-In', '#a78bfa')}
        {P.card(
          <div style={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>
            {[true, true, true, false, false, false, false].map((done, i) => (
              <div key={i} style={{ flex: 1, height: 14, borderRadius: 3, background: done ? '#a78bfa55' : 'rgba(255,255,255,0.05)', border: `1px solid ${i === 3 ? '#a78bfa' : 'rgba(167,139,250,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {done && <span style={{ fontSize: 7 }}>✓</span>}
              </div>
            ))}
          </div>,
          { border: '1px solid rgba(139,92,246,0.25)' }
        )}
        {P.label('🎁 Gifts', '#22c55e')}
        {P.card(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10 }}>🎁</span>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', width: 40 }} />
            </div>
            <div style={{ fontSize: 7, color: '#22c55e', fontWeight: 700, border: '1px solid rgba(34,197,94,0.4)', padding: '2px 5px', borderRadius: 4 }}>CLAIM</div>
          </div>,
          { border: '1px solid rgba(34,197,94,0.2)' }
        )}
      </>
    ),
  },

  ForgeBrowser: {
    friendlyName: 'Forge / Workshop',
    description: 'Full crafting workshop page — recipe picker, entity selector, live outcome preview, active jobs list, and swipe navigation between building pages. Resolves workshop by URL :id param. Use with pass_through layout on the /locations/:id/workshop screen.',
    group: 'Outposts',
    color: '#f59e0b',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ height: 7, borderRadius: 3, background: '#f59e0b55', width: '50%' }} />
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ height: 14, width: 28, borderRadius: 4, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }} />
            <div style={{ height: 14, width: 32, borderRadius: 4, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
          {P.card(<div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚗️</div>)}
          {P.card(<div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#34d399' }}>100%</div>)}
        </div>
        {P.card(<div style={{ height: 12 }} />)}
      </>
    ),
  },

  LocationDetailBrowser: {
    friendlyName: 'Location Detail',
    description: 'Full outpost detail page — resolves the outpost by URL :id param and renders its type-specific Page component (DerpOutpost, default, etc.). Use with pass_through layout on the /locations/:id screen.',
    group: 'Outposts',
    color: '#60a5fa',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🏠</div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 7, borderRadius: 3, background: '#60a5fa55', width: '65%' }} />
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '40%', marginTop: 3 }} />
          </div>
        </div>
        {[1, 2, 3].map(i => P.card(<div key={i} style={{ height: 14, opacity: 0.4 }} />))}
      </>
    ),
  },

  LocationBrowser: {
    friendlyName: 'Location Browser',
    description: 'Full outposts/locations screen — slot counter, primary outpost card, and secondary outpost list. All data from sync store. Use with pass_through layout on the /locations screen.',
    group: 'Outposts',
    color: '#60a5fa',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Outpost Slots</span>
          <div style={{ padding: '2px 7px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)' }}>
            <span style={{ fontSize: 8, color: '#c4b5fd', fontWeight: 700 }}>2 / 4</span>
          </div>
        </div>
        <div style={{ height: 32, borderRadius: 7, background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: '1px solid rgba(139,92,246,0.3)', marginBottom: 4 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {['#60a5fa', '#818cf8'].map((c, i) => (
            <div key={i} style={{ height: 26, borderRadius: 5, background: `${c}22`, border: `1px solid ${c}44` }} />
          ))}
        </div>
      </>
    ),
  },

  OutpostReadyList: {
    friendlyName: 'Outpost Ready List',
    description: 'Lists outposts with production ready to collect. Live data from the sync store.',
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
        
      </div>
    ),
  },

  OutpostSummaryCards: {
    friendlyName: 'Outpost Summary Cards',
    description: 'Compact summary cards for each outpost showing name and status. Live data from the sync store.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 24, borderRadius: 5, background: '#60a5fa15', border: '1px solid #60a5fa33' }} />
          ))}
        </div>
        
      </div>
    ),
  },

  InventoryCategoryGrid: {
    friendlyName: 'Inventory Category Grid',
    description: 'Grid of item category shortcuts linking to filtered inventory views. Live data from sync store.',
    group: 'Progress',
    color: '#60a5fa',
    preview: () => P.wrap(
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {['⚔️', '🛡', '🧪', '🌿', '💎', '📦'].map((icon, i) => (
            <div key={i} style={{ height: 28, borderRadius: 5, background: '#60a5fa15', border: '1px solid #60a5fa33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{icon}</div>
          ))}
        </div>
        
      </div>
    ),
  },

  // ── News ───────────────────────────────────────────────────────────────────

  NewsCard: {
    friendlyName: 'News Card',
    description: 'Single news item card with headline, optional image, body, tag, and CTA. Configured via props.',
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
        
      </div>
    ),
  },

  AnnouncementFeed: {
    friendlyName: 'Announcement Feed',
    description: 'Vertically stacked list of game announcements. Configured via an items array prop.',
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
    description: 'Spotlight card for a specific entity with name, level, and status. Optional entityId prop pins a specific entity.',
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
    description: 'Full entity browsing list with search, filter (All/Idle/Busy/Injured), and sort controls. Reads all entity data from the sync store. Use with vertical_feed layout on the /entities screen.',
    group: 'Entities',
    color: '#10b981',
    preview: () => P.wrap(
      <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
          <div style={{ flex: 1, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div style={{ width: 36, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div style={{ width: 42, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
          {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'].map((c, i) => (
            <div key={i} style={{ height: 44, borderRadius: 7, background: `${c}18`, border: `1px solid ${c}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🪶</div>
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
        <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
          {[['All',true],['⚔️ Gear',false],['🧪',false],['🌿',false]].map(([label, active]) => (
            <div key={String(label)} style={{ flex: 1, padding: '2px 4px', borderRadius: 20, background: active ? '#10b98122' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? '#10b98155' : 'rgba(255,255,255,0.08)'}`, textAlign: 'center' }}>
              <span style={{ fontSize: 7, color: active ? '#6ee7b7' : '#666' }}>{String(label)}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 3 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3 }}>
          {['#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#3b82f6','#f472b6','#34d399'].map((c, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 5, background: `${c}22`, border: `1px solid ${c}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>⚔️</div>
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
  'BannerCarousel', 'SeasonBanner',
  'EntityRoster', 'InventoryItemBrowser', 'MissionBrowser',
  'LocationBrowser', 'LocationDetailBrowser', 'ForgeBrowser', 'StoreBrowser',
  'AchievementsBrowser', 'ProfileBrowser', 'RewardsBrowser', 'SettingsBrowser',
  'InventoryCategoryGrid', 'NFTCapacityInfoCard',
]);

/** Stub-only components — render a placeholder in dev, nothing in production. */
export const STUB_COMPONENTS = new Set<string>();

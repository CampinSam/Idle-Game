import { Component, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import { api } from '../../../services/api';
import { ScreenCompositionRenderer } from '../../screens/ScreenCompositionRenderer';
import ContentDocumentDataEditor from '../smart/components/structured/ContentDocumentDataEditor';
import { getMissingBlockProps } from '../smart/components/structured/blockPropHints';
import SectionPicker from './SectionPicker';
import { NO_PROPS_COMPONENTS, STUB_COMPONENTS } from './screen-composer-meta';
import {
  inputStyle,
  selectStyle,
  labelStyle,
  fieldGroupStyle,
  entryCardStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
} from '../smart/components/structured/editorStyles';
import '../admin.css';

const DEV_ADMIN_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';

// ─── Component registry ───────────────────────────────────────────────────────

const SCREEN_COMPONENT_KEYS = [
  'ResourceSummaryBar', 'SeasonBanner', 'BannerCarousel', 'QuickStatusCards',
  'DailyQuestPanel', 'GlobalBuffsSection', 'CraftingWorkshopsCard',
  'MissionFeaturedCard', 'ActiveMissionList', 'EmptyStateCard', 'HelpTipCard',
  'CTAButtonGroup', 'SkeletonCard', 'DailyCheckInCard', 'FeaturedBirdCard',
  'StoreOfferCard', 'StoreOfferCarousel', 'StoreItemGrid', 'StoreItemRail',
  'FeaturedShopRail', 'GemPackGrid', 'BattlePassProgress', 'BattlePassTierList',
  'EventCarousel', 'EventCardList', 'SeasonBossPanel', 'NewsCard',
  'AnnouncementFeed', 'MissionCategoryRail', 'CraftingQueuePreview',
  'RecipeCategoryRail', 'OutpostReadyList', 'OutpostSummaryCards',
  'InventoryCategoryGrid', 'WalletPromptCard', 'NFTCapacityInfoCard',
  'PatchNotesCard', 'SeasonProgressCard', 'EventCountdownCard', 'TelemetryCard',
  'EntityRoster', 'EntityDetailView', 'InventoryItemBrowser', 'MissionBrowser',
  'LocationBrowser', 'LocationDetailBrowser', 'ForgeBrowser', 'StoreBrowser',
  'AchievementsBrowser', 'ProfileBrowser', 'RewardsBrowser', 'SettingsBrowser',
];

const LAYOUT_TYPES: { value: string; label: string }[] = [
  { value: 'vertical_feed',   label: 'vertical_feed' },
  { value: 'tabbed_feed',     label: 'tabbed_feed' },
  { value: 'hero_stack',      label: 'hero_stack' },
  { value: 'grid_feed',       label: 'grid_feed' },
  { value: 'carousel_feed',   label: 'carousel_feed' },
  { value: 'fixed_structure', label: 'fixed_structure' },
  { value: 'modal_stack',     label: 'modal_stack' },
  { value: 'pass_through',    label: 'pass_through (component manages own scroll)' },
  { value: 'grid',            label: '* grid (stub → vertical_feed)' },
  { value: 'split_panel',     label: '* split_panel (stub → vertical_feed)' },
  { value: 'wizard',          label: '* wizard (stub → vertical_feed)' },
];

const DEF_TYPES = ['screen_composition', 'content_document'] as const;
type DefType = typeof DEF_TYPES[number];

// ─── Prop schema hints (from render-blocks.md) ────────────────────────────────

interface PropHint {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum' | 'entityPicker' | 'missionDefPicker' | 'recipeDefPicker' | 'locationDefPicker' | 'storeItemPicker';
  description?: string;
  required?: boolean;
  options?: string[];
}

const COMPONENT_PROP_HINTS: Record<string, Record<string, PropHint>> = {
  ResourceSummaryBar: {
    maxItems: { type: 'number', description: 'Max currencies shown (default: 4)' },
  },
  MissionFeaturedCard: {
    missionDefId: { type: 'missionDefPicker', description: 'Pin a specific mission definition ID to feature. Leave blank to auto-show a summary of all active mission jobs.' },
  },
  ActiveMissionList: {
    limit: { type: 'number', description: 'Max active missions to display (default: 5). Use to keep the list compact on smaller screens.' },
  },
  EmptyStateCard: {
    message: { type: 'string', description: 'Text shown in the empty state', required: true },
    actionKey: { type: 'string', description: 'Action key emitted when button tapped (omit to hide button)' },
    actionLabel: { type: 'string', description: 'Button label text (default: "OK")' },
  },
  HelpTipCard: {
    icon: { type: 'string', description: 'Emoji shown as lead icon (default: "ℹ️")' },
    title: { type: 'string', description: 'Bold title above message' },
    message: { type: 'string', description: 'Body text of the tip', required: true },
  },
  CTAButtonGroup: {
    buttons: {
      type: 'array',
      description: 'Array of { actionKey: string, label: string, style?: "primary"|"secondary" }',
      required: true,
    },
  },
  SkeletonCard: {
    rows: { type: 'number', description: 'Number of shimmer lines to render (default: 3)' },
  },
  DailyCheckInCard: {
    subtitle: { type: 'string', description: 'Secondary text below the title (default: "Come back each day for rewards!")' },
    actionKey: { type: 'string', description: 'Action key emitted on tap. Card is non-interactive if omitted.' },
    actionLabel: { type: 'string', description: 'Label for the action button (default: "CLAIM")' },
  },
  PatchNotesCard: {
    version: { type: 'string', description: 'Version string displayed below the title (e.g. "1.4.2")' },
    notes: { type: 'string', description: 'Free-form patch notes text rendered with whitespace preserved', required: true },
  },
  WalletPromptCard: {
    message: { type: 'string', description: 'Body text (default: "Link your wallet to unlock NFT features.")' },
    actionKey: { type: 'string', description: 'Action key emitted on button tap (default: "connect_wallet")' },
  },
  EventCountdownCard: {
    endsAt: { type: 'string', description: 'UTC ISO 8601 timestamp when the event ends (e.g. "2026-12-31T23:59:59Z")', required: true },
    title: { type: 'string', description: 'Card header text (default: "⏰ EVENT")' },
    actionKey: { type: 'string', description: 'Action key for CTA button. Button hidden if omitted.' },
    actionLabel: { type: 'string', description: 'CTA button label (default: "JOIN")' },
  },
  EntityDetailView: {
    entityId: { type: 'entityPicker', description: 'Entity ID to pin for preview. When omitted the admin preview shows the first entity in the sync store.' },
  },
  TelemetryCard: {
    telemetryDefId: { type: 'string', description: 'ID of the telemetry definition to fetch', required: true },
    displayType: {
      type: 'enum',
      options: ['number', 'progress_bar', 'comparison', 'leaderboard'],
      description: 'How the metric data is visualised (default: "number")',
    },
    title: { type: 'string', description: 'Card title. Falls back to definition name then "📊 METRICS".' },
    metricKey: { type: 'string', description: 'Which sub-event key to display (for number and progress_bar modes)' },
    target: { type: 'number', description: 'Goal value for progress_bar mode' },
    pollIntervalSeconds: { type: 'number', description: 'How often to re-fetch in seconds (default: 30, min: 5)' },
    entries: {
      type: 'array',
      description: 'Display overrides per sub-event key: [{ key, label, icon?, color? }]',
    },
  },
  SeasonProgressCard: {
    title: { type: 'string', description: 'Override the card header (default: season name from sync store, e.g. "🌟 SEASON ONE")' },
  },
  CraftingWorkshopsCard: {
    title: { type: 'string', description: 'Card header text (default: "⚒️ THE FORGE")' },
    path: { type: 'string', description: 'Navigation path for the "GO TO WORKSHOPS" button (default: "/crafting")' },
  },
  GlobalBuffsSection: {
    maxItems: { type: 'number', description: 'Max number of active global buffs to show (default: all). Surplus count shown as "+N more".' },
  },
  QuickStatusCards: {
    showEntities: { type: 'boolean', description: 'Show the Entities quick-status card (default: true)' },
    showOutposts: { type: 'boolean', description: 'Show the Outposts quick-status card (default: true)' },
    showMissions: { type: 'boolean', description: 'Show the Missions quick-status card (default: true)' },
  },
  DailyQuestPanel: {
    title: { type: 'string', description: 'Panel header text (default: "📋 DAILY QUESTS")' },
    quests: {
      type: 'array',
      description: 'Static quest entries to display: [{ title: string, description?: string, completed?: boolean }]. Shows placeholder text when omitted.',
    },
  },
  FeaturedBirdCard: {
    entityId: { type: 'entityPicker', description: 'Pin a specific entity by ID. Falls back to the first entity in the sync store.' },
    title: { type: 'string', description: 'Card header text (default: "🦜 FEATURED BIRD")' },
    actionKey: { type: 'string', description: 'If set, fires this action key on click instead of navigating to the entity detail page.' },
  },
  MissionCategoryRail: {
    maxItems: { type: 'number', description: 'Max number of category chips to show. Shows all when omitted.' },
    path: { type: 'string', description: 'Navigation path for the "All" chip and per-category links (default: "/missions").' },
  },
  CraftingQueuePreview: {
    title: { type: 'string', description: 'Card header text (default: "⚒️ CRAFTING QUEUE")' },
    limit: { type: 'number', description: 'Max number of active crafting jobs to show (default: 5).' },
    recipeDefId: { type: 'recipeDefPicker', description: 'Filter the queue to jobs for a specific recipe definition ID. Shows all recipes when omitted.' },
  },
  RecipeCategoryRail: {
    maxItems: { type: 'number', description: 'Max number of category chips to show. Shows all when omitted.' },
    path: { type: 'string', description: 'Navigation path for category links (default: "/crafting").' },
  },
  OutpostReadyList: {
    title: { type: 'string', description: 'Card header text (default: "📦 READY TO COLLECT")' },
    limit: { type: 'number', description: 'Max number of outposts to show (default: 5).' },
    locationId: { type: 'locationDefPicker', description: 'Pin to a specific location ID. Shows outposts from all locations when omitted.' },
  },
  OutpostSummaryCards: {
    title: { type: 'string', description: 'Card header text (default: "🏠 MY OUTPOSTS")' },
    limit: { type: 'number', description: 'Max number of outpost cards to show (default: 6).' },
    columns: { type: 'number', description: 'Grid columns: 1 (single column) or 2 (default two-column grid).' },
    locationId: { type: 'locationDefPicker', description: 'Pin to a specific location ID. Shows all locations when omitted.' },
  },
  StoreOfferCard: {
    title: { type: 'string', description: 'Card header text (default: "🔥 FEATURED OFFER")' },
    offerId: { type: 'storeItemPicker', description: 'Store Item ID to pin a specific offer (leave blank for auto — shows first featured/badged item).' },
  },
  StoreOfferCarousel: {
    title: { type: 'string', description: 'Optional section header above the carousel.' },
    limit: { type: 'number', description: 'Max number of cards in the carousel (default: 4).' },
  },
  StoreItemGrid: {
    title: { type: 'string', description: 'Optional section header above the grid.' },
    tab: { type: 'string', description: 'Filter by tab: featured | bundles | items | currency (default: featured).' },
    limit: { type: 'number', description: 'Max number of grid cells (default: 6).' },
    columns: { type: 'number', description: 'Grid columns: 3 (default) or 2.' },
  },
  StoreItemRail: {
    title: { type: 'string', description: 'Optional section header above the rail.' },
    tab: { type: 'string', description: 'Filter by tab: featured | bundles | items | currency (default: featured).' },
    limit: { type: 'number', description: 'Max number of items in the rail (default: 6).' },
  },
  FeaturedShopRail: {
    title: { type: 'string', description: 'Section header (default: "⭐ FEATURED")' },
    limit: { type: 'number', description: 'Max number of featured items shown (default: 3).' },
  },
  GemPackGrid: {
    title: { type: 'string', description: 'Card header text (default: "💎 GEM PACKS")' },
    limit: { type: 'number', description: 'Max number of gem pack tiles shown (default: show all).' },
  },
  NewsCard: {
    headline: { type: 'string', description: 'News headline text (required — shows a placeholder when absent).', required: true },
    body: { type: 'string', description: 'Optional body / summary text shown below the headline.' },
    timestamp: { type: 'string', description: 'Optional display timestamp shown at the bottom (e.g. "2h ago", "May 28, 2026").' },
    emoji: { type: 'string', description: 'Leading emoji icon (default: "📰").' },
    href: { type: 'string', description: 'Navigation path for the "READ MORE" link (default: "/rewards"). Always shown.' },
  },
  AnnouncementFeed: {
    title: { type: 'string', description: 'Feed header text (default: "📢 ANNOUNCEMENTS")' },
    entries: {
      type: 'array',
      description: 'Announcements to display: [{ headline: string, body?: string, emoji?: string }]. Shows empty state when absent.',
      required: true,
    },
    limit: { type: 'number', description: 'Max number of entries to show. Shows all when omitted.' },
  },
  BattlePassProgress: {
    tierLabel: { type: 'string', description: 'Current tier display text, e.g. "Tier 7". Shows a "coming soon" card when absent.', required: true },
    currentXP: { type: 'number', description: 'Current XP within the tier (default: 0).' },
    maxXP: { type: 'number', description: 'XP needed to reach the next tier (default: 1000).' },
    nextRewardEmoji: { type: 'string', description: 'Emoji shown as the next reward preview, e.g. "⚔️".' },
    href: { type: 'string', description: 'Navigation path for the "VIEW BATTLE PASS" CTA (default: "/store").' },
  },
  BattlePassTierList: {
    title: { type: 'string', description: 'Card header text (default: "🎖️ BATTLE PASS TIERS")' },
    tiers: {
      type: 'array',
      description: 'Tier rows: [{ tier: number, label: string, reward: string, unlocked: boolean }]. Shows empty state when absent.',
      required: true,
    },
    limit: { type: 'number', description: 'Max number of tier rows to show. Shows all when omitted.' },
  },
  EventCarousel: {
    title: { type: 'string', description: 'Optional section header above the carousel.' },
    events: {
      type: 'array',
      description: 'Event cards: [{ title: string, emoji: string, endsAt?: string (ISO 8601), href?: string }]. Shows "No active events" when absent.',
      required: true,
    },
    limit: { type: 'number', description: 'Max number of event cards in the carousel (default: 4).' },
  },
  EventCardList: {
    title: { type: 'string', description: 'Section header (default: "🎪 EVENTS")' },
    events: {
      type: 'array',
      description: 'Event cards: [{ title: string, emoji: string, description?: string, endsAt?: string, href?: string }]. Shows "No events running." when absent.',
      required: true,
    },
    limit: { type: 'number', description: 'Max number of event cards. Shows all when omitted.' },
  },
  SeasonBossPanel: {
    bossName: { type: 'string', description: 'Boss display name (required — shows "Season Boss coming soon" when absent).', required: true },
    bossEmoji: { type: 'string', description: 'Large emoji displayed as boss art (default: "👹").' },
    hpCurrent: { type: 'number', description: 'Current boss HP used to fill the progress bar (default: 0).' },
    hpMax: { type: 'number', description: 'Maximum boss HP (default: 1).' },
    href: { type: 'string', description: 'Navigation path for the ENGAGE button (default: "/").' },
  },
};

// ─── Prop validation helpers ──────────────────────────────────────────────────

function getMissingRequiredProps(componentKey: string, props: Record<string, unknown>): string[] {
  const hints = COMPONENT_PROP_HINTS[componentKey] ?? {};
  return Object.entries(hints)
    .filter(([key, hint]) => {
      if (!hint.required) return false;
      if (!(key in props)) return true;
      const val = props[key];
      if (val === null || val === undefined || val === '') return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return false;
    })
    .map(([key]) => key);
}

// ─── Small shared UI ──────────────────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span style={{
      padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase' as const,
      background: isActive ? 'rgba(76,175,80,0.15)' : 'rgba(100,100,140,0.15)',
      color: isActive ? '#4caf50' : '#888',
      border: `1px solid ${isActive ? 'rgba(76,175,80,0.3)' : 'rgba(100,100,140,0.25)'}`,
    }}>
      {isActive ? 'live' : 'draft'}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isScreen = type === 'screen_composition';
  return (
    <span style={{
      padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
      background: isScreen ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.12)',
      color: isScreen ? '#a78bfa' : '#60a5fa',
      border: `1px solid ${isScreen ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.25)'}`,
    }}>
      {isScreen ? 'screen' : 'content'}
    </span>
  );
}

function Msg({ msg }: { msg: { text: string; type: 'success' | 'error' } | null }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.85rem',
      background: msg.type === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,107,0.15)',
      color: msg.type === 'success' ? '#4caf50' : '#ff6b6b',
      border: `1px solid ${msg.type === 'success' ? 'rgba(76,175,80,0.3)' : 'rgba(255,107,107,0.3)'}`,
    }}>{msg.text}</div>
  );
}

// ─── Entity ID picker ─────────────────────────────────────────────────────────

function EntityIdPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchEntities = useCallback((q: string) => {
    setLoading(true);
    setError('');
    adminApi.listEntities(q || undefined, 50)
      .then(rows => { setOptions(rows); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load entities'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchEntities(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, fetchEntities]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.id === value);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="entity id"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...inputStyle,
            width: 'auto', padding: '0 8px', flexShrink: 0,
            cursor: 'pointer', fontSize: 10, color: open ? '#a78bfa' : '#6b7280',
            borderColor: open ? 'rgba(139,92,246,0.4)' : undefined,
          }}
          title="Pick entity"
        >
          {open ? '▲ pick' : '▼ pick'}
        </button>
      </div>

      {value && selected && (
        <div style={{ fontSize: 10, color: '#10b981', fontStyle: 'italic', paddingLeft: 2 }}>
          ✓ {selected.name}
        </div>
      )}
      {value && !selected && options.length > 0 && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', paddingLeft: 2 }}>
          ⚠ ID not found in current results — it may still be valid
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#0f0f1e', border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 6, padding: 6, maxHeight: 220, overflow: 'hidden',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search by name…"
            autoFocus
            style={{ ...inputStyle, width: '100%', fontSize: 11, boxSizing: 'border-box' as const }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 10 }}>{error}</div>}
          {loading && <div style={{ color: '#555', fontSize: 10, padding: '4px 2px' }}>Loading…</div>}
          <div style={{ overflowY: 'auto' as const, flex: 1 }}>
            {!loading && options.length === 0 && (
              <div style={{ color: '#555', fontSize: 10, padding: '4px 2px', fontStyle: 'italic' }}>
                No entities found
              </div>
            )}
            {options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left' as const,
                  padding: '4px 6px', background: opt.id === value ? 'rgba(139,92,246,0.15)' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  color: opt.id === value ? '#a78bfa' : '#c4b5fd',
                  fontSize: 11, fontFamily: 'inherit',
                }}
                title={opt.id}
              >
                <span style={{ fontWeight: 600 }}>{opt.name}</span>
                <span style={{ color: '#555', marginLeft: 6, fontSize: 9, fontFamily: 'monospace' }}>{opt.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mission definition picker ────────────────────────────────────────────────

function MissionDefPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [allDefs, setAllDefs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const loadDefs = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError('');
    adminApi.list('mission_defs')
      .then((defs: any[]) => {
        setAllDefs(defs.map((d: any) => ({ id: d.id, name: d.name ?? d.id })));
        setLoading(false);
      })
      .catch((e: any) => {
        fetchedRef.current = false;
        setError(e.message || 'Failed to load mission definitions');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (value) loadDefs();
  }, [value, loadDefs]);

  useEffect(() => {
    if (open) loadDefs();
  }, [open, loadDefs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? allDefs.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) || d.id.toLowerCase().includes(query.toLowerCase()))
    : allDefs;

  const selected = allDefs.find(d => d.id === value);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="mission def id"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...inputStyle,
            width: 'auto', padding: '0 8px', flexShrink: 0,
            cursor: 'pointer', fontSize: 10, color: open ? '#34d399' : '#6b7280',
            borderColor: open ? 'rgba(52,211,153,0.4)' : undefined,
          }}
          title="Pick mission definition"
        >
          {open ? '▲ pick' : '▼ pick'}
        </button>
      </div>

      {value && selected && (
        <div style={{ fontSize: 10, color: '#10b981', fontStyle: 'italic', paddingLeft: 2 }}>
          ✓ {selected.name}
        </div>
      )}
      {value && !selected && allDefs.length > 0 && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', paddingLeft: 2 }}>
          ⚠ ID not found in current results — it may still be valid
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#0f0f1e', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 6, padding: 6, maxHeight: 220, overflow: 'hidden',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search by name or id…"
            autoFocus
            style={{ ...inputStyle, width: '100%', fontSize: 11, boxSizing: 'border-box' as const }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 10 }}>{error}</div>}
          {loading && <div style={{ color: '#555', fontSize: 10, padding: '4px 2px' }}>Loading…</div>}
          <div style={{ overflowY: 'auto' as const, flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ color: '#555', fontSize: 10, padding: '4px 2px', fontStyle: 'italic' }}>
                No mission definitions found
              </div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left' as const,
                  padding: '4px 6px', background: opt.id === value ? 'rgba(52,211,153,0.15)' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  color: opt.id === value ? '#34d399' : '#6ee7b7',
                  fontSize: 11, fontFamily: 'inherit',
                }}
                title={opt.id}
              >
                <span style={{ fontWeight: 600 }}>{opt.name}</span>
                <span style={{ color: '#555', marginLeft: 6, fontSize: 9, fontFamily: 'monospace' }}>{opt.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recipe definition picker ─────────────────────────────────────────────────

function RecipeDefPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [allDefs, setAllDefs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const loadDefs = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError('');
    api.getCraftingRecipes()
      .then((defs: any[]) => {
        setAllDefs(defs.map((d: any) => ({ id: d.id, name: d.name ?? d.outputItemDefId ?? d.id })));
        setLoading(false);
      })
      .catch((e: any) => {
        fetchedRef.current = false;
        setError(e.message || 'Failed to load crafting recipes');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (value) loadDefs();
  }, [value, loadDefs]);

  useEffect(() => {
    if (open) loadDefs();
  }, [open, loadDefs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? allDefs.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) || d.id.toLowerCase().includes(query.toLowerCase()))
    : allDefs;

  const selected = allDefs.find(d => d.id === value);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="recipe def id"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...inputStyle,
            width: 'auto', padding: '0 8px', flexShrink: 0,
            cursor: 'pointer', fontSize: 10, color: open ? '#34d399' : '#6b7280',
            borderColor: open ? 'rgba(52,211,153,0.4)' : undefined,
          }}
          title="Pick recipe definition"
        >
          {open ? '▲ pick' : '▼ pick'}
        </button>
      </div>

      {value && selected && (
        <div style={{ fontSize: 10, color: '#10b981', fontStyle: 'italic', paddingLeft: 2 }}>
          ✓ {selected.name}
        </div>
      )}
      {value && !selected && allDefs.length > 0 && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', paddingLeft: 2 }}>
          ⚠ ID not found in current results — it may still be valid
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#0f0f1e', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 6, padding: 6, maxHeight: 220, overflow: 'hidden',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search by name or id…"
            autoFocus
            style={{ ...inputStyle, width: '100%', fontSize: 11, boxSizing: 'border-box' as const }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 10 }}>{error}</div>}
          {loading && <div style={{ color: '#555', fontSize: 10, padding: '4px 2px' }}>Loading…</div>}
          <div style={{ overflowY: 'auto' as const, flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ color: '#555', fontSize: 10, padding: '4px 2px', fontStyle: 'italic' }}>
                No crafting recipes found
              </div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left' as const,
                  padding: '4px 6px', background: opt.id === value ? 'rgba(52,211,153,0.15)' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  color: opt.id === value ? '#34d399' : '#6ee7b7',
                  fontSize: 11, fontFamily: 'inherit',
                }}
                title={opt.id}
              >
                <span style={{ fontWeight: 600 }}>{opt.name}</span>
                <span style={{ color: '#555', marginLeft: 6, fontSize: 9, fontFamily: 'monospace' }}>{opt.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Location definition picker ───────────────────────────────────────────────

function LocationDefPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [allDefs, setAllDefs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const loadDefs = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError('');
    api.getLocations()
      .then((defs: any[]) => {
        setAllDefs(defs.map((d: any) => ({ id: d.id, name: d.name ?? d.id })));
        setLoading(false);
      })
      .catch((e: any) => {
        fetchedRef.current = false;
        setError(e.message || 'Failed to load locations');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (value) loadDefs();
  }, [value, loadDefs]);

  useEffect(() => {
    if (open) loadDefs();
  }, [open, loadDefs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? allDefs.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) || d.id.toLowerCase().includes(query.toLowerCase()))
    : allDefs;

  const selected = allDefs.find(d => d.id === value);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="location id"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...inputStyle,
            width: 'auto', padding: '0 8px', flexShrink: 0,
            cursor: 'pointer', fontSize: 10, color: open ? '#34d399' : '#6b7280',
            borderColor: open ? 'rgba(52,211,153,0.4)' : undefined,
          }}
          title="Pick location"
        >
          {open ? '▲ pick' : '▼ pick'}
        </button>
      </div>

      {value && selected && (
        <div style={{ fontSize: 10, color: '#10b981', fontStyle: 'italic', paddingLeft: 2 }}>
          ✓ {selected.name}
        </div>
      )}
      {value && !selected && allDefs.length > 0 && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', paddingLeft: 2 }}>
          ⚠ ID not found in current results — it may still be valid
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#0f0f1e', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 6, padding: 6, maxHeight: 220, overflow: 'hidden',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search by name or id…"
            autoFocus
            style={{ ...inputStyle, width: '100%', fontSize: 11, boxSizing: 'border-box' as const }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 10 }}>{error}</div>}
          {loading && <div style={{ color: '#555', fontSize: 10, padding: '4px 2px' }}>Loading…</div>}
          <div style={{ overflowY: 'auto' as const, flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ color: '#555', fontSize: 10, padding: '4px 2px', fontStyle: 'italic' }}>
                No locations found
              </div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left' as const,
                  padding: '4px 6px', background: opt.id === value ? 'rgba(52,211,153,0.15)' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  color: opt.id === value ? '#34d399' : '#6ee7b7',
                  fontSize: 11, fontFamily: 'inherit',
                }}
                title={opt.id}
              >
                <span style={{ fontWeight: 600 }}>{opt.name}</span>
                <span style={{ color: '#555', marginLeft: 6, fontSize: 9, fontFamily: 'monospace' }}>{opt.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Store item picker ────────────────────────────────────────────────────────

function StoreItemPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [allItems, setAllItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const loadItems = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError('');
    api.getShopItems()
      .then((items: any[]) => {
        setAllItems(items.map((d: any) => ({ id: d.id, name: d.name ?? d.id })));
        setLoading(false);
      })
      .catch((e: any) => {
        fetchedRef.current = false;
        setError(e.message || 'Failed to load store items');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (value) loadItems();
  }, [value, loadItems]);

  useEffect(() => {
    if (open) loadItems();
  }, [open, loadItems]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query
    ? allItems.filter(d => d.name.toLowerCase().includes(query.toLowerCase()) || d.id.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  const selected = allItems.find(d => d.id === value);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="store item id"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...inputStyle,
            width: 'auto', padding: '0 8px', flexShrink: 0,
            cursor: 'pointer', fontSize: 10, color: open ? '#34d399' : '#6b7280',
            borderColor: open ? 'rgba(52,211,153,0.4)' : undefined,
          }}
          title="Pick store item"
        >
          {open ? '▲ pick' : '▼ pick'}
        </button>
      </div>

      {value && selected && (
        <div style={{ fontSize: 10, color: '#10b981', fontStyle: 'italic', paddingLeft: 2 }}>
          ✓ {selected.name}
        </div>
      )}
      {value && !selected && allItems.length > 0 && !loading && (
        <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', paddingLeft: 2 }}>
          ⚠ ID not found in current results — it may still be valid
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#0f0f1e', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 6, padding: 6, maxHeight: 220, overflow: 'hidden',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search by name or id…"
            autoFocus
            style={{ ...inputStyle, width: '100%', fontSize: 11, boxSizing: 'border-box' as const }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 10 }}>{error}</div>}
          {loading && <div style={{ color: '#555', fontSize: 10, padding: '4px 2px' }}>Loading…</div>}
          <div style={{ overflowY: 'auto' as const, flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ color: '#555', fontSize: 10, padding: '4px 2px', fontStyle: 'italic' }}>
                No store items found
              </div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left' as const,
                  padding: '4px 6px', background: opt.id === value ? 'rgba(52,211,153,0.15)' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  color: opt.id === value ? '#34d399' : '#6ee7b7',
                  fontSize: 11, fontFamily: 'inherit',
                }}
                title={opt.id}
              >
                <span style={{ fontWeight: 600 }}>{opt.name}</span>
                <span style={{ color: '#555', marginLeft: 6, fontSize: 9, fontFamily: 'monospace' }}>{opt.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Structured props editor ──────────────────────────────────────────────────

type PropType = 'string' | 'number' | 'boolean' | 'json';

function detectPropType(val: unknown): PropType {
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';
  if (val !== null && (typeof val === 'object' || Array.isArray(val))) return 'json';
  return 'string';
}

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
  textTransform: 'uppercase', border: '1px solid',
  borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
  background: active ? 'rgba(139,92,246,0.18)' : 'transparent',
  color: active ? '#a78bfa' : '#555',
  borderColor: active ? 'rgba(139,92,246,0.4)' : '#2a2a4e',
});

function StructuredFieldsEditor({
  props,
  hints,
  onChange,
  highlightKeys = [],
}: {
  props: Record<string, unknown>;
  hints: Record<string, PropHint>;
  onChange: (p: Record<string, unknown>) => void;
  highlightKeys?: string[];
}) {
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [jsonTexts, setJsonTexts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<PropType>('string');
  const [showAdd, setShowAdd] = useState(false);

  const entries = Object.entries(props);
  const suggestedKeys = Object.keys(hints).filter(k => !(k in props));

  const updateProp = (key: string, val: unknown) => onChange({ ...props, [key]: val });
  const removeProp = (key: string) => {
    const next = { ...props };
    delete next[key];
    onChange(next);
  };

  const getJsonText = (key: string, val: unknown) => {
    if (jsonTexts[key] !== undefined) return jsonTexts[key];
    return JSON.stringify(val, null, 2);
  };

  const handleJsonChange = (key: string, text: string) => {
    setJsonTexts(t => ({ ...t, [key]: text }));
    try {
      const parsed = JSON.parse(text);
      setJsonErrors(e => { const n = { ...e }; delete n[key]; return n; });
      updateProp(key, parsed);
    } catch {
      setJsonErrors(e => ({ ...e, [key]: 'Invalid JSON' }));
    }
  };

  const addProp = () => {
    if (!newKey.trim()) return;
    const defaultVal = newType === 'number' ? 0 : newType === 'boolean' ? false : newType === 'json' ? [] : '';
    onChange({ ...props, [newKey.trim()]: defaultVal });
    setNewKey('');
    setShowAdd(false);
  };

  const addHintedProp = (key: string, hint: PropHint) => {
    const defaultVal = hint.type === 'number' ? 0 : hint.type === 'boolean' ? false
      : hint.type === 'array' ? [] : hint.type === 'object' ? {} : hint.type === 'enum' ? (hint.options?.[0] ?? '') : '';
    onChange({ ...props, [key]: defaultVal });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.length === 0 && (
        <div style={{ color: '#555', fontSize: 12, fontStyle: 'italic' }}>No props set — add one below or use the suggested fields.</div>
      )}

      {entries.map(([key, val]) => {
        const hint = hints[key];
        const ptype = hint?.type === 'enum' ? 'enum'
          : hint?.type === 'entityPicker' ? 'entityPicker'
          : hint?.type === 'missionDefPicker' ? 'missionDefPicker'
          : hint?.type === 'recipeDefPicker' ? 'recipeDefPicker'
          : hint?.type === 'locationDefPicker' ? 'locationDefPicker'
          : hint?.type === 'storeItemPicker' ? 'storeItemPicker'
          : hint?.type === 'array' || hint?.type === 'object' ? 'json'
          : detectPropType(val);
        const isMissing = highlightKeys.includes(key);
        return (
          <div key={key} className={isMissing ? 'prop-missing-highlight' : undefined} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 110, maxWidth: 140, flexShrink: 0 }}>
              <span style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={key}>
                {key}{hint?.required ? <span style={{ color: '#f87171' }}> *</span> : null}
              </span>
              {hint?.description && (
                <span style={{ fontSize: 9, color: '#555', lineHeight: 1.3, marginTop: 1 }}>{hint.description}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {ptype === 'entityPicker' ? (
                <EntityIdPicker
                  value={String(val ?? '')}
                  onChange={v => updateProp(key, v)}
                />
              ) : ptype === 'missionDefPicker' ? (
                <MissionDefPicker
                  value={String(val ?? '')}
                  onChange={v => updateProp(key, v)}
                />
              ) : ptype === 'recipeDefPicker' ? (
                <RecipeDefPicker
                  value={String(val ?? '')}
                  onChange={v => updateProp(key, v)}
                />
              ) : ptype === 'locationDefPicker' ? (
                <LocationDefPicker
                  value={String(val ?? '')}
                  onChange={v => updateProp(key, v)}
                />
              ) : ptype === 'storeItemPicker' ? (
                <StoreItemPicker
                  value={String(val ?? '')}
                  onChange={v => updateProp(key, v)}
                />
              ) : ptype === 'enum' ? (
                <select
                  value={String(val ?? '')}
                  onChange={e => updateProp(key, e.target.value)}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  {hint.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : ptype === 'boolean' ? (
                <select
                  value={String(val)}
                  onChange={e => updateProp(key, e.target.value === 'true')}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : ptype === 'number' ? (
                <input
                  type="number"
                  value={String(val)}
                  onChange={e => updateProp(key, Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%' }}
                />
              ) : ptype === 'json' ? (
                <div>
                  <textarea
                    value={getJsonText(key, val)}
                    onChange={e => handleJsonChange(key, e.target.value)}
                    rows={3}
                    style={{
                      ...inputStyle, width: '100%', resize: 'vertical' as const,
                      fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' as const,
                      color: jsonErrors[key] ? '#ff6b6b' : '#a0e0a0',
                    }}
                  />
                  {jsonErrors[key] && <span style={{ color: '#ff6b6b', fontSize: 10 }}>{jsonErrors[key]}</span>}
                </div>
              ) : (
                <input
                  type="text"
                  value={String(val ?? '')}
                  onChange={e => updateProp(key, e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                />
              )}
            </div>
            <button
              type="button"
              style={{ ...dangerIconButtonStyle, marginTop: 2, flexShrink: 0 }}
              onClick={() => removeProp(key)}
              title="Remove prop"
            >×</button>
          </div>
        );
      })}

      {suggestedKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: '#444', alignSelf: 'center' }}>add:</span>
          {suggestedKeys.map(k => {
            const h = hints[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => addHintedProp(k, h)}
                title={h?.description}
                style={{
                  padding: '2px 8px', border: `1px dashed ${h?.required ? '#7f2424' : '#4b5563'}`,
                  borderRadius: 4, background: 'transparent',
                  color: h?.required ? '#f87171' : '#6b7280',
                  cursor: 'pointer', fontSize: 10, fontFamily: 'inherit',
                }}
              >+ {k}{h?.required ? '*' : ''}</button>
            );
          })}
        </div>
      )}

      {showAdd ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addProp(); if (e.key === 'Escape') setShowAdd(false); }}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="propKey"
            autoFocus
          />
          <select value={newType} onChange={e => setNewType(e.target.value as PropType)} style={{ ...selectStyle, width: 90 }}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="json">JSON</option>
          </select>
          <button type="button" style={{ ...iconButtonStyle, color: '#4caf50', borderColor: '#1e3a1e' }} onClick={addProp}>+</button>
          <button type="button" style={iconButtonStyle} onClick={() => setShowAdd(false)}>×</button>
        </div>
      ) : (
        <button type="button" style={{ ...addButtonStyle, alignSelf: 'flex-start' }} onClick={() => setShowAdd(true)}>
          + Add prop
        </button>
      )}
    </div>
  );
}

function PropsEditor({
  props,
  onChange,
  componentKey,
  highlightKeys = [],
}: {
  props: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  componentKey: string;
  highlightKeys?: string[];
}) {
  const isKnown = SCREEN_COMPONENT_KEYS.includes(componentKey);
  const isNoProps = NO_PROPS_COMPONENTS.has(componentKey);
  const isStub = STUB_COMPONENTS.has(componentKey);
  const hints = COMPONENT_PROP_HINTS[componentKey] ?? {};
  const hasHints = Object.keys(hints).length > 0;

  const [tab, setTab] = useState<'structured' | 'raw'>('structured');
  const [rawText, setRawText] = useState(() => JSON.stringify(props, null, 2));
  const [rawError, setRawError] = useState('');
  const prevKey = useRef(componentKey);

  useEffect(() => {
    if (prevKey.current !== componentKey) {
      prevKey.current = componentKey;
      setTab('structured');
      setRawText(JSON.stringify(props, null, 2));
      setRawError('');
    }
  }, [componentKey, props]);

  const handleTabChange = (next: 'structured' | 'raw') => {
    if (next === 'raw') {
      setRawText(JSON.stringify(props, null, 2));
      setRawError('');
    }
    setTab(next);
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setRawError('Must be a JSON object {}');
        return;
      }
      setRawError('');
      onChange(parsed as Record<string, unknown>);
    } catch {
      setRawError('Invalid JSON');
    }
  };

  const rawJsonPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        value={rawText}
        onChange={e => handleRawChange(e.target.value)}
        rows={8}
        style={{
          ...inputStyle, width: '100%', resize: 'vertical' as const,
          fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' as const,
          color: rawError ? '#ff6b6b' : '#a0e0a0',
        }}
      />
      {rawError && <span style={{ color: '#ff6b6b', fontSize: 10 }}>{rawError}</span>}
    </div>
  );

  // Unknown / custom component key — raw JSON only (no structured tab)
  if (!isKnown) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 10, color: '#6b7280', background: 'rgba(100,100,140,0.06)',
          border: '1px solid rgba(100,100,140,0.2)', borderRadius: 4, padding: '5px 10px',
        }}>
          Custom component key — no schema available. Edit props as raw JSON.
        </div>
        {rawJsonPanel}
      </div>
    );
  }

  // No configurable props — notice in structured view; raw JSON tab still accessible
  const noPropsNotice = isNoProps ? (
    <div style={{
      fontSize: 11, color: '#6b7280', background: 'rgba(100,100,140,0.06)',
      border: '1px solid rgba(100,100,140,0.2)', borderRadius: 5, padding: '7px 12px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 13 }}>🔒</span>
      <span>No configurable props — this component reads all data from the sync store.</span>
    </div>
  ) : isStub ? (
    <div style={{
      fontSize: 11, color: '#78716c', background: 'rgba(120,113,108,0.06)',
      border: '1px dashed rgba(120,113,108,0.3)', borderRadius: 5, padding: '7px 12px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 13 }}>🚧</span>
      <span>Stub component — renders a dev-mode placeholder; no props in production.</span>
    </div>
  ) : null;

  // Known component — structured editor + raw JSON tab (notice replaces fields for no-props/stub)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Schema reference banner (structured tab only, components with hints) */}
      {hasHints && tab === 'structured' && (
        <div style={{
          fontSize: 10, color: '#888', background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.15)', borderRadius: 5, padding: '5px 10px',
          lineHeight: 1.6,
        }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>{componentKey} props:</span>
          {Object.entries(hints).map(([k, h]) => (
            <span key={k} style={{ marginLeft: 8 }}>
              <code style={{ color: h.required ? '#f87171' : '#c4b5fd', fontSize: 10 }}>{k}</code>
              <span style={{ color: '#555' }}>:{h.type}{h.required ? '*' : ''}</span>
              {h.type === 'enum' && h.options && (
                <span style={{ color: '#4b5563' }}> ({h.options.join('|')})</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" style={tabBtnStyle(tab === 'structured')} onClick={() => handleTabChange('structured')}>
          Structured
        </button>
        <button type="button" style={tabBtnStyle(tab === 'raw')} onClick={() => handleTabChange('raw')}>
          Raw JSON
        </button>
      </div>

      {tab === 'raw' ? rawJsonPanel : (
        noPropsNotice ?? <StructuredFieldsEditor props={props} hints={hints} onChange={onChange} highlightKeys={highlightKeys} />
      )}
    </div>
  );
}

// ─── Section editor ───────────────────────────────────────────────────────────

function newSection(idx: number) {
  return { id: `section_${idx + 1}`, component: 'HelpTipCard', priority: (idx + 1) * 10, props: {} };
}

function SectionEditor({
  sections,
  onChange,
  sectionErrors = new Map(),
}: {
  sections: any[];
  onChange: (s: any[]) => void;
  sectionErrors?: Map<number, string[]>;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) => setExpanded(prev => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });

  const expand = (i: number) => setExpanded(prev => new Set([...prev, i]));

  const update = (idx: number, patch: any) => {
    onChange(sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const updateComponent = (idx: number, newComponent: string) => {
    const section = sections[idx];
    const currentProps = section?.props ?? {};
    update(idx, { component: newComponent });
    const missing = getMissingRequiredProps(newComponent, currentProps);
    if (missing.length > 0) {
      expand(idx);
    }
  };

  const addMissingRequiredProps = (idx: number) => {
    const section = sections[idx];
    const hints = COMPONENT_PROP_HINTS[section.component] ?? {};
    const currentProps = section?.props ?? {};
    const missing = getMissingRequiredProps(section.component, currentProps);
    if (missing.length === 0) return;
    const added = { ...currentProps };
    for (const key of missing) {
      const hint = hints[key];
      if (!hint) continue;
      added[key] = hint.type === 'number' ? 0
        : hint.type === 'boolean' ? false
        : hint.type === 'array' ? []
        : hint.type === 'object' ? {}
        : hint.type === 'enum' ? (hint.options?.[0] ?? '')
        : '';
    }
    onChange(sections.map((s, i) => i === idx ? { ...s, props: added } : s));
    expand(idx);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  const remove = (idx: number) => {
    setExpanded(prev => {
      const s = new Set<number>();
      prev.forEach(i => { if (i !== idx) s.add(i > idx ? i - 1 : i); });
      return s;
    });
    onChange(sections.filter((_, i) => i !== idx));
  };

  const [pickerOpen, setPickerOpen] = useState(false);

  const add = () => setPickerOpen(true);

  const handlePick = (key: string) => {
    const idx = sections.length;
    const s = { ...newSection(idx), component: key };
    setExpanded(prev => new Set([...prev, idx]));
    onChange([...sections, s]);
    setPickerOpen(false);
  };

  // Rule that is deterministically false: keeper level is always >= 1, never < 0.
  // When user is null, the path resolves to undefined and less_than returns false.
  const ADMIN_HIDDEN_VISIBILITY = { any: [{ path: 'user.keeperLevel', operator: 'less_than', value: -1 }] };

  const isHidden = (section: any) => {
    const v = section.visibility;
    return (
      v?.any?.length === 1 &&
      v.any[0].path === 'user.keeperLevel' &&
      v.any[0].operator === 'less_than' &&
      v.any[0].value < 0
    );
  };

  const toggleVisibility = (idx: number, section: any) => {
    if (isHidden(section)) {
      const next = { ...section };
      delete next.visibility;
      onChange(sections.map((s, i) => i === idx ? next : s));
    } else {
      update(idx, { visibility: ADMIN_HIDDEN_VISIBILITY });
    }
  };

  const CUSTOM_SENTINEL = '__custom__';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
        Sections ({sections.length})
      </div>

      {sections.map((section, idx) => {
        const isOpen = expanded.has(idx);
        const isCustom = !SCREEN_COMPONENT_KEYS.includes(section.component) && section.component;
        const hidden = isHidden(section);
        const missingProps = sectionErrors.get(idx) ?? [];
        const hasError = missingProps.length > 0;

        return (
          <div key={idx} style={{
            ...entryCardStyle,
            opacity: hidden ? 0.55 : 1,
            border: hasError
              ? '1px solid rgba(248,113,113,0.6)'
              : hidden ? '1px dashed #3a3a5e' : '1px solid #2a2a4e',
            boxShadow: hasError ? '0 0 0 1px rgba(248,113,113,0.15)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              <button
                type="button"
                onClick={() => toggle(idx)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: '0 2px', flexShrink: 0 }}
              >
                {isOpen ? '▼' : '▶'}
              </button>
              <span style={{ ...labelStyle, color: '#a78bfa', minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: '1 1 60px' }}>
                {section.component || '—'}
              </span>
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{section.id}</span>
              <span style={{ fontSize: 10, color: '#444' }}>p:{section.priority}</span>
              {hasError && (
                <>
                  <span
                    title={`Missing required props: ${missingProps.join(', ')}`}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(248,113,113,0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(248,113,113,0.3)',
                      cursor: 'default',
                      flexShrink: 0,
                    }}
                  >
                    missing: {missingProps.join(', ')}
                  </span>
                  {!isOpen && (
                    <button
                      type="button"
                      title={`Add missing required props: ${missingProps.join(', ')}`}
                      onClick={e => { e.stopPropagation(); addMissingRequiredProps(idx); }}
                      style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                        padding: '1px 6px', borderRadius: 3,
                        background: 'rgba(248,113,113,0.12)',
                        color: '#f87171',
                        border: '1px solid rgba(248,113,113,0.5)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                      }}
                    >
                      ⚡ Add missing
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                title={hidden ? 'Section hidden — click to show' : 'Click to hide section'}
                onClick={() => toggleVisibility(idx, section)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: hidden ? '#555' : '#a78bfa', padding: '0 2px', flexShrink: 0,
                }}
              >{hidden ? '👁️‍🗨️' : '👁️'}</button>
              <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
                <button type="button" style={iconButtonStyle} disabled={idx === 0} onClick={() => move(idx, idx - 1)} title="Move up">↑</button>
                <button type="button" style={iconButtonStyle} disabled={idx === sections.length - 1} onClick={() => move(idx, idx + 1)} title="Move down">↓</button>
                <button type="button" style={dangerIconButtonStyle} onClick={() => remove(idx)} title="Remove">×</button>
              </div>
            </div>

            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px solid #1a1a3e' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <div style={{ ...fieldGroupStyle, flex: '2 1 140px' }}>
                    <span style={labelStyle}>id</span>
                    <input type="text" value={section.id ?? ''} onChange={e => update(idx, { id: e.target.value })} style={{ ...inputStyle, width: '100%' }} placeholder="section_id" />
                  </div>
                  <div style={{ ...fieldGroupStyle, flex: '3 1 180px' }}>
                    <span style={labelStyle}>component</span>
                    {isCustom ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="text" value={section.component ?? ''} onChange={e => updateComponent(idx, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <button type="button" style={{ ...iconButtonStyle, fontSize: 9, padding: '0 5px', width: 'auto' }} onClick={() => updateComponent(idx, SCREEN_COMPONENT_KEYS[0])}>list</button>
                      </div>
                    ) : (
                      <select
                        value={section.component || ''}
                        onChange={e => {
                          if (e.target.value === CUSTOM_SENTINEL) update(idx, { component: '' });
                          else updateComponent(idx, e.target.value);
                        }}
                        style={{ ...selectStyle, width: '100%' }}
                      >
                        {SCREEN_COMPONENT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                        <option value={CUSTOM_SENTINEL}>— custom key —</option>
                      </select>
                    )}
                  </div>
                  <div style={{ ...fieldGroupStyle, flex: '0 0 76px' }}>
                    <span style={labelStyle}>priority</span>
                    <input type="number" value={section.priority ?? 0} onChange={e => update(idx, { priority: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' }} />
                    <span style={{ fontSize: 9, color: '#555', marginTop: 2, lineHeight: 1.3 }}>Lower = rendered first</span>
                  </div>
                  <div style={{ ...fieldGroupStyle, flex: '1 1 120px' }}>
                    <span style={labelStyle}>slot</span>
                    <input
                      type="text"
                      value={section.slot ?? ''}
                      onChange={e => update(idx, { slot: e.target.value || undefined })}
                      style={{ ...inputStyle, width: '100%' }}
                      placeholder="— none —"
                    />
                    <span style={{ fontSize: 9, color: '#555', marginTop: 2, lineHeight: 1.3 }}>
                      Layout-specific placement key. tabbed_feed: tab id · hero_stack: &quot;hero&quot; · grid_feed: &quot;header&quot;/&quot;footer&quot;/&quot;full&quot; · fixed_structure: &quot;header&quot;/&quot;main&quot;/&quot;footer&quot;. Leave blank for vertical / pass-through layouts.
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ ...labelStyle, display: 'block', marginBottom: 5 }}>props</span>
                  <PropsEditor
                    props={section.props ?? {}}
                    onChange={p => update(idx, { props: p })}
                    componentKey={section.component}
                    highlightKeys={missingProps}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" style={addButtonStyle} onClick={add}>+ Add Section</button>
      <SectionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
    </div>
  );
}

// ─── Renderer error boundary ──────────────────────────────────────────────────

class RendererErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; msg: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, msg: err.message };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[ScreenComposer preview]', err.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, color: '#f87171', fontSize: 12, fontFamily: 'monospace', background: '#0a0a1a', borderRadius: 6 }}>
          Preview error: {this.state.msg}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Preview panel ────────────────────────────────────────────────────────────

type PreviewMode = 'phone' | 'tablet' | 'full';

const PREVIEW_MODES: { mode: PreviewMode; label: string; icon: string; maxWidth: number | null }[] = [
  { mode: 'phone',  label: 'Phone',  icon: '📱', maxWidth: 390  },
  { mode: 'tablet', label: 'Tablet', icon: '🗒️', maxWidth: 768  },
  { mode: 'full',   label: 'Full',   icon: '🖥️', maxWidth: null },
];

function PreviewPanel({ draftRow, type, data }: { draftRow: any; type: string; data: any }) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('phone');

  if (type !== 'screen_composition') {
    const blocks = data?.blocks ?? [];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Content Preview ({blocks.length} blocks)
        </div>
        {blocks.map((block: any, i: number) => (
          <div key={i} style={{ background: '#13132b', border: '1px solid #2a2a4e', borderRadius: 5, padding: '6px 10px' }}>
            <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>{block.type}</span>
            {block.text && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(block.text).slice(0, 80)}</div>}
            {block.content && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(block.content).slice(0, 80)}</div>}
          </div>
        ))}
        {blocks.length === 0 && <div style={{ color: '#444', fontSize: 12, fontStyle: 'italic' }}>No blocks</div>}
      </div>
    );
  }

  const activeDef = PREVIEW_MODES.find(m => m.mode === previewMode)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, flex: 1 }}>
          Live Preview <span style={{ fontSize: 9, color: '#555', fontWeight: 400, textTransform: 'none' as const }}>(debounced · admin-mode)</span>
        </div>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 3 }}>
          {PREVIEW_MODES.map(({ mode, label, icon, maxWidth }) => (
            <button
              key={mode}
              type="button"
              title={`${label}${maxWidth ? ` (${maxWidth}px)` : ''}`}
              onClick={() => setPreviewMode(mode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 5,
                border: previewMode === mode ? '1px solid #a78bfa' : '1px solid #2a2a4e',
                background: previewMode === mode ? 'rgba(167,139,250,0.15)' : 'transparent',
                color: previewMode === mode ? '#a78bfa' : '#555',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 11 }}>{icon}</span>
              {label}
              {maxWidth && <span style={{ fontSize: 9, opacity: 0.7 }}>{maxWidth}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll container */}
      <div style={{
        flex: 1,
        minHeight: 200,
        overflowY: 'auto',
        background: '#060614',
        borderRadius: 10,
        border: '1px solid #1a1a3e',
        display: 'flex',
        justifyContent: previewMode === 'full' ? 'stretch' : 'center',
        padding: previewMode === 'full' ? 0 : '12px 8px',
      }}>
        {/* Device frame */}
        <div style={{
          width: '100%',
          maxWidth: activeDef.maxWidth ?? undefined,
          flex: previewMode === 'full' ? 1 : undefined,
          background: '#080818',
          borderRadius: previewMode === 'phone' ? 20 : previewMode === 'tablet' ? 14 : 10,
          border: previewMode === 'full'
            ? '1px solid #2a2a4e'
            : previewMode === 'phone'
              ? '3px solid #2e2e52'
              : '2px solid #2a2a4e',
          boxShadow: previewMode !== 'full' ? '0 0 0 1px #13132b, 0 8px 32px rgba(0,0,0,0.5)' : undefined,
          overflow: 'hidden',
          position: 'relative' as const,
        }}>
          {/* Phone top notch bar */}
          {previewMode === 'phone' && (
            <div style={{
              height: 20,
              background: '#111128',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid #1e1e3a',
              flexShrink: 0,
            }}>
              <div style={{ width: 48, height: 6, borderRadius: 3, background: '#1e1e3a' }} />
            </div>
          )}
          <div style={{ padding: '0 0 8px' }}>
            <RendererErrorBoundary key={draftRow.key + '/' + draftRow.version}>
              <ScreenCompositionRenderer definition={draftRow} />
            </RendererErrorBoundary>
          </div>
          {/* Phone bottom home bar */}
          {previewMode === 'phone' && (
            <div style={{
              height: 16,
              background: '#111128',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: '1px solid #1e1e3a',
            }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2a2a4e' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Layout editor ────────────────────────────────────────────────────────────

function LayoutEditor({ layout, onChange }: { layout: any; onChange: (l: any) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>layoutType</span>
        <select value={layout?.layoutType ?? 'vertical_feed'} onChange={e => onChange({ ...(layout ?? {}), layoutType: e.target.value })} style={selectStyle}>
          {LAYOUT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>scroll</span>
        <select value={layout?.scroll !== false ? 'true' : 'false'} onChange={e => onChange({ ...(layout ?? {}), scroll: e.target.value === 'true' })} style={{ ...selectStyle, width: 80 }}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>maxWidth</span>
        <select value={layout?.maxWidth ?? ''} onChange={e => onChange({ ...(layout ?? {}), maxWidth: e.target.value || undefined })} style={{ ...selectStyle, width: 140 }}>
          <option value="">— none —</option>
          <option value="mobile_full">mobile_full</option>
          <option value="content">content</option>
          <option value="wide">wide</option>
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>gap</span>
        <select value={layout?.gap ?? ''} onChange={e => onChange({ ...(layout ?? {}), gap: e.target.value || undefined })} style={{ ...selectStyle, width: 100 }}>
          <option value="">— none —</option>
          <option value="none">none</option>
          <option value="tight">tight</option>
          <option value="standard">standard</option>
          <option value="loose">loose</option>
        </select>
      </div>
    </div>
  );
}

// ─── Main definition editor ───────────────────────────────────────────────────

function DefinitionEditor({
  def,
  allDefs,
  onSaved,
}: {
  def: any | null;
  allDefs: any[];
  onSaved: (updated: any) => void;
}) {
  const isNew = !def || !def.id;

  const [form, setForm] = useState<{ type: DefType; key: string; version: string; startsAt: string; endsAt: string; }>({
    type: (def?.type as DefType) ?? 'screen_composition',
    key: def?.key ?? '',
    version: String(def?.version ?? 1),
    startsAt: def?.startsAt ? def.startsAt.slice(0, 16) : '',
    endsAt: def?.endsAt ? def.endsAt.slice(0, 16) : '',
  });

  const [data, setData] = useState<any>(() => {
    if (def?.data) return def.data;
    if (form.type === 'screen_composition') {
      return { sections: [], layout: { layoutType: 'vertical_feed', scroll: true } };
    }
    return { blocks: [] };
  });

  const [jsonMode, setJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);

  // Debounced draft for the live preview (400 ms)
  const [debouncedData, setDebouncedData] = useState(data);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedData(data), 400);
    return () => clearTimeout(debounceTimer.current);
  }, [data]);

  const draftRow = useMemo(() => ({
    id: def?.id || 'preview-draft',
    type: form.type,
    key: form.key || 'preview',
    version: Number(form.version) || 0,
    isActive: false,
    data: debouncedData,
    startsAt: null,
    endsAt: null,
  }), [def?.id, form.type, form.key, form.version, debouncedData]);

  const switchToJson = () => { setRawJson(JSON.stringify(data, null, 2)); setJsonError(''); setJsonMode(true); };
  const switchToVisual = () => {
    if (rawJson) {
      try { setData(JSON.parse(rawJson)); setJsonError(''); }
      catch { setJsonError('Invalid JSON — fix before switching'); return; }
    }
    setJsonMode(false);
  };
  const handleRawJsonChange = (text: string) => {
    setRawJson(text);
    try { setData(JSON.parse(text)); setJsonError(''); }
    catch { setJsonError('Invalid JSON'); }
  };

  const buildPayload = () => ({
    type: form.type,
    key: form.key.trim(),
    version: Number(form.version),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    data,
  });

  const validate = () => {
    if (!form.key.trim()) return 'Key is required';
    if (!form.version || isNaN(Number(form.version))) return 'Version must be a number';
    if (form.type === 'screen_composition') {
      const allSections: any[] = Array.isArray(data?.sections) ? data.sections : [];
      for (const section of allSections) {
        const missing = getMissingRequiredProps(section.component, section.props ?? {});
        if (missing.length > 0) {
          return `Section "${section.id || section.component}" is missing required props: ${missing.join(', ')}`;
        }
      }
    }
    if (form.type === 'content_document') {
      const allBlocks: any[] = Array.isArray(data?.blocks) ? data.blocks : [];
      for (let i = 0; i < allBlocks.length; i++) {
        const block = allBlocks[i];
        if (!block || typeof block !== 'object') continue;
        const missing = getMissingBlockProps(block.type ?? '', block as Record<string, unknown>);
        if (missing.length > 0) {
          return `Block ${i + 1} (${block.type}) is missing required fields: ${missing.join(', ')}`;
        }
      }
    }
    if (!isNew) return null;
    const clash = allDefs.find(d => d.type === form.type && d.key === form.key.trim() && d.version === Number(form.version));
    if (clash) return `Version ${form.version} already exists for key "${form.key}"`;
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setMsg({ text: err, type: 'error' }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = buildPayload();
      const saved = isNew
        ? await adminApi.createGameDefinition(payload)
        : await adminApi.updateGameDefinition(def.id, payload);
      setMsg({ text: isNew ? 'Created successfully' : 'Saved successfully', type: 'success' });
      onSaved(saved);
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally { setSaving(false); }
  };

  const isScreenComp = form.type === 'screen_composition';
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];
  const layout = data?.layout ?? { layoutType: 'vertical_feed', scroll: true };

  const sectionValidationErrors = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!isScreenComp) return map;
    sections.forEach((section, idx) => {
      const missing = getMissingRequiredProps(section.component, section.props ?? {});
      if (missing.length > 0) map.set(idx, missing);
    });
    return map;
  }, [sections, isScreenComp]);

  const hasSectionErrors = sectionValidationErrors.size > 0;

  const blockValidationErrors = useMemo(() => {
    const map = new Map<number, string[]>();
    if (isScreenComp) return map;
    const blocks: any[] = Array.isArray(data?.blocks) ? data.blocks : [];
    blocks.forEach((block: any, idx: number) => {
      if (!block || typeof block !== 'object') return;
      const missing = getMissingBlockProps(block.type ?? '', block as Record<string, unknown>);
      if (missing.length > 0) map.set(idx, missing);
    });
    return map;
  }, [data?.blocks, isScreenComp]);

  const hasBlockErrors = blockValidationErrors.size > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' as const }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#e0e0ff' }}>
          {isNew ? 'New Definition' : (
            <span>
              <span style={{ color: '#888', fontWeight: 400 }}>{def.type === 'screen_composition' ? 'screen' : 'content'} / </span>
              {def.key}
              <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>v{def.version}</span>
              <span style={{ marginLeft: 8 }}><StatusBadge isActive={def.isActive} /></span>
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {!jsonMode && (
            <button
              onClick={() => setPreviewVisible(v => !v)}
              title={previewVisible ? 'Hide preview panel' : 'Show preview panel'}
              style={{
                padding: '0.35rem 0.75rem', border: '1px solid #2a2a4e', borderRadius: 5,
                background: previewVisible ? 'rgba(167,139,250,0.10)' : 'transparent',
                color: previewVisible ? '#a78bfa' : '#555',
                cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              {previewVisible ? '⊟ Preview' : '⊞ Preview'}
            </button>
          )}
          <button
            onClick={() => jsonMode ? switchToVisual() : switchToJson()}
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #555', borderRadius: 5, background: jsonMode ? 'rgba(167,139,250,0.12)' : 'transparent', color: jsonMode ? '#a78bfa' : '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {jsonMode ? '← Visual' : 'JSON ↓'}
          </button>
          <button
            onClick={save}
            disabled={saving || hasSectionErrors || hasBlockErrors}
            title={
              hasSectionErrors
                ? `Fix ${sectionValidationErrors.size} section(s) with missing required props before saving`
                : hasBlockErrors
                ? `Fix ${blockValidationErrors.size} block(s) with missing required fields before saving`
                : undefined
            }
            className="btn-save"
            style={{
              padding: '0.35rem 1rem', fontSize: '0.85rem',
              opacity: (hasSectionErrors || hasBlockErrors) ? 0.5 : 1,
              cursor: (hasSectionErrors || hasBlockErrors) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving
              ? 'Saving…'
              : hasSectionErrors
              ? `Save (${sectionValidationErrors.size} error${sectionValidationErrors.size > 1 ? 's' : ''})`
              : hasBlockErrors
              ? `Save (${blockValidationErrors.size} error${blockValidationErrors.size > 1 ? 's' : ''})`
              : 'Save'}
          </button>
        </div>
      </div>

      <Msg msg={msg} />

      <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem 1rem' }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Metadata</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>type</span>
            <select
              value={form.type}
              onChange={e => {
                const t = e.target.value as DefType;
                setForm(f => ({ ...f, type: t }));
                setData(t === 'screen_composition' ? { sections: [], layout: { layoutType: 'vertical_feed', scroll: true } } : { blocks: [] });
              }}
              disabled={!isNew}
              style={{ ...selectStyle, opacity: isNew ? 1 : 0.5 }}
            >
              {DEF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ ...fieldGroupStyle, flex: '2 1 160px' }}>
            <span style={labelStyle}>key</span>
            <input type="text" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} disabled={!isNew} style={{ ...inputStyle, width: '100%', opacity: isNew ? 1 : 0.5 }} placeholder="home_screen" />
          </div>
          <div style={{ ...fieldGroupStyle, flex: '0 0 70px' }}>
            <span style={labelStyle}>version</span>
            <input type="number" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} style={{ ...inputStyle, width: '100%' }} min="1" />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>startsAt</span>
            <input type="datetime-local" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>endsAt</span>
            <input type="datetime-local" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>
      </div>

      {jsonMode ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Raw JSON (data)</div>
          <textarea
            value={rawJson}
            onChange={e => handleRawJsonChange(e.target.value)}
            rows={22}
            style={{ ...inputStyle, flex: 1, resize: 'vertical' as const, fontFamily: 'monospace', fontSize: 12, color: jsonError ? '#ff6b6b' : '#a0e0a0', boxSizing: 'border-box' as const }}
          />
          {jsonError && <span style={{ color: '#ff6b6b', fontSize: 12 }}>{jsonError}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: previewVisible ? '0 0 55%' : '1 1 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {isScreenComp && (
              <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Layout</div>
                <LayoutEditor layout={layout} onChange={l => setData((d: any) => ({ ...d, layout: l }))} />
              </div>
            )}
            <div style={{ background: '#16213e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem' }}>
              {isScreenComp ? (
                <SectionEditor
                  sections={sections}
                  onChange={s => setData((d: any) => ({ ...d, sections: s }))}
                  sectionErrors={sectionValidationErrors}
                />
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 10 }}>Content Blocks</div>
                  <ContentDocumentDataEditor value={data} onChange={setData} blockErrors={blockValidationErrors} />
                </>
              )}
            </div>
          </div>
          {previewVisible && (
            <div style={{ flex: '0 0 42%', overflowY: 'auto', minWidth: 0 }}>
              <div style={{ background: '#12122a', border: '1px solid #2a2a4e', borderRadius: 8, padding: '0.75rem', height: '100%' }}>
                <PreviewPanel draftRow={draftRow} type={form.type} data={data} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin login ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(getAdminKey() || DEV_ADMIN_KEY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const doLogin = useCallback(async (loginKey: string) => {
    setLoading(true); setError(''); setAdminKey(loginKey);
    try { await adminApi.getTables(); onLogin(); }
    catch { setError('Invalid admin key'); }
    finally { setLoading(false); }
  }, [onLogin]);

  useEffect(() => {
    if (import.meta.env.DEV && DEV_ADMIN_KEY && !autoSubmitted.current) {
      autoSubmitted.current = true;
      doLogin(DEV_ADMIN_KEY);
    }
  }, [doLogin]);

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={e => { e.preventDefault(); doLogin(key); }}>
        <h1>Derp Universe Admin</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Screen Composer</p>
        <input type="password" placeholder="Admin Key" value={key} onChange={e => setKey(e.target.value)} autoFocus />
        <button type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Enter'}</button>
        {error && <div className="admin-error">{error}</div>}
      </form>
    </div>
  );
}

// ─── Main composer ────────────────────────────────────────────────────────────

function ScreenComposer() {
  const [defs, setDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | DefType | 'entities'>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dupeSource, setDupeSource] = useState<any | null>(null);
  const [globalMsg, setGlobalMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await adminApi.list('gameDefinition');
      setDefs(all);
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: any) => {
    setDefs(prev => {
      const idx = prev.findIndex(d => d.id === updated.id);
      return idx >= 0
        ? prev.map((d, i) => i === idx ? updated : d)
        : [...prev, updated];
    });
    setSelected(updated);
    setShowNew(false);
    setDupeSource(null);
  };

  const handlePublish = async (def: any) => {
    if (!confirm(`Publish version ${def.version} of "${def.key}"? All other active versions for this key will be deactivated.`)) return;
    setActionLoading(def.id);
    setGlobalMsg(null);
    try {
      await adminApi.publishGameDefinition(def.key, def.version, def.type);
      await load();
      setGlobalMsg({ text: `v${def.version} of "${def.key}" is now live`, type: 'success' });
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setActionLoading(null); }
  };

  const handleRollback = async (def: any) => {
    if (!confirm(`Rollback to v${def.version} of "${def.key}"?`)) return;
    setActionLoading(def.id);
    setGlobalMsg(null);
    try {
      await adminApi.rollbackGameDefinition(def.key, def.version, def.type);
      await load();
      setGlobalMsg({ text: `Rolled back to v${def.version} of "${def.key}"`, type: 'success' });
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    } finally { setActionLoading(null); }
  };

  const handleDuplicate = (def: any) => {
    const sameKey = defs.filter(d => d.type === def.type && d.key === def.key);
    const maxVersion = Math.max(...sameKey.map(d => d.version));
    setDupeSource({ ...def, version: maxVersion + 1, isActive: false, id: undefined });
    setSelected(null);
    setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this definition? This cannot be undone.')) return;
    try {
      await adminApi.deleteGameDefinition(id);
      setDefs(prev => prev.filter(d => d.id !== id));
      if (selected?.id === id) { setSelected(null); setShowNew(false); setDupeSource(null); }
    } catch (e: any) {
      setGlobalMsg({ text: e.message, type: 'error' });
    }
  };

  const filtered = useMemo(() => defs.filter(d => {
    if (filterType === 'entities') {
      if (!d.key.toLowerCase().includes('entit')) return false;
    } else if (filterType !== 'all' && d.type !== filterType) {
      return false;
    }
    if (search && !d.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [defs, filterType, search]);

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach(d => {
      const k = `${d.type}::${d.key}`;
      if (!map[k]) map[k] = [];
      map[k].push(d);
    });
    return Object.entries(map).map(([, items]) => ({
      key: items[0].key,
      type: items[0].type,
      versions: items.sort((a, b) => b.version - a.version),
    }));
  }, [filtered]);

  const activeEditor = dupeSource ? dupeSource : selected;
  const showEditor = showNew || !!activeEditor;

  const createNewBlank = () => { setSelected(null); setDupeSource(null); setShowNew(true); };

  return (
    <div className="admin-panel">
      <div className="admin-sidebar" style={{ minWidth: 240, maxWidth: 280 }}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Screen Composer</h2>
            <a href="/admin" style={{ fontSize: '0.75rem', color: '#888', textDecoration: 'none' }}>← Admin</a>
          </div>
          <button className="btn-save" style={{ width: '100%', padding: '0.4rem', fontSize: '0.82rem' }} onClick={createNewBlank}>
            + New Definition
          </button>
          <input type="text" placeholder="Filter by key…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
            {(['all', 'screen_composition', 'content_document', 'entities'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  flex: '1 1 auto', padding: '0.22rem 0', border: '1px solid',
                  borderRadius: 4,
                  background: filterType === t
                    ? t === 'entities' ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.15)'
                    : 'transparent',
                  color: filterType === t
                    ? t === 'entities' ? '#10b981' : '#a78bfa'
                    : '#666',
                  borderColor: filterType === t
                    ? t === 'entities' ? 'rgba(16,185,129,0.4)' : 'rgba(139,92,246,0.3)'
                    : '#2a2a4e',
                  cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em',
                }}
              >
                {t === 'all' ? 'All' : t === 'screen_composition' ? 'Screen' : t === 'content_document' ? 'Content' : '🪶 Entity'}
              </button>
            ))}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0.4rem 0', overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ color: '#666', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>Loading…</div>}
          {!loading && groups.length === 0 && (
            <div style={{ color: '#555', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>No definitions found</div>
          )}
          {groups.map(({ key, type, versions }) => (
            <div key={`${type}::${key}`} style={{ borderBottom: '1px solid #1a1a3e' }}>
              <div style={{ padding: '0.45rem 0.8rem 0.2rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <TypeBadge type={type} />
                <span style={{ fontSize: '0.78rem', color: '#e0e0ff', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {key}
                </span>
              </div>
              {versions.map(v => {
                const isActive = actionLoading === v.id;
                return (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0.25rem 0.8rem 0.25rem 1.4rem',
                      background: (selected?.id === v.id || dupeSource?.id === v.id) ? 'rgba(139,92,246,0.12)' : 'transparent',
                      borderLeft: (selected?.id === v.id || dupeSource?.id === v.id) ? '2px solid #7c3aed' : '2px solid transparent',
                    }}
                  >
                    <span
                      onClick={() => { setSelected(v); setDupeSource(null); setShowNew(false); }}
                      style={{ flex: 1, fontSize: '0.78rem', color: '#888', cursor: 'pointer' }}
                    >v{v.version}</span>
                    <StatusBadge isActive={v.isActive} />
                    {!v.isActive && (
                      <button
                        onClick={() => handlePublish(v)}
                        disabled={isActive}
                        title="Publish this version"
                        style={{ background: 'none', border: 'none', color: '#4caf50', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: isActive ? 0.5 : 1 }}
                      >↑</button>
                    )}
                    {v.isActive && (
                      <button
                        onClick={() => handleRollback(v)}
                        disabled={isActive}
                        title="Rollback (republish) this version"
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: isActive ? 0.5 : 1 }}
                      >↩</button>
                    )}
                    <button
                      onClick={() => handleDuplicate(v)}
                      title="Duplicate as new version"
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
                    >⎘</button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 1px', lineHeight: 1 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <button onClick={load} style={{ margin: '0.5rem', padding: '0.3rem', border: '1px solid #2a2a4e', borderRadius: 5, background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '0.72rem' }}>
          ↺ Refresh
        </button>
      </div>

      <div className="admin-content" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {globalMsg && <div style={{ marginBottom: 12 }}><Msg msg={globalMsg} /></div>}
        {showEditor ? (
          <DefinitionEditor
            key={showNew ? 'new' : dupeSource ? `dupe-${dupeSource.key}-${dupeSource.version}` : selected?.id}
            def={showNew ? null : dupeSource ?? selected}
            allDefs={defs}
            onSaved={handleSaved}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14, color: '#444' }}>
            <div style={{ fontSize: '2.5rem' }}>🎛️</div>
            <div style={{ fontSize: '0.9rem' }}>Select a definition to edit, or create a new one</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function ScreenComposerPage() {
  const [authed, setAuthed] = useState(!!getAdminKey());
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <ScreenComposer />;
}

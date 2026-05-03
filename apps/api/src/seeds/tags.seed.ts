import { Logger } from '@nestjs/common';

const logger = new Logger('TagsSeed');

/**
 * Canonical visual tag + effect catalog.
 *
 * Tag keys are namespaced (`rarity-*`, `ach-tier-*`, `ach-status-*`,
 * `quest-*`, `entity-status-*`, plus a few system tags). Frontend
 * `<Tag tagKey="rarity-epic">` looks up by key — keep these stable.
 *
 * Effects are reusable across tags AND any other surface that wraps
 * itself in <VisualEffect> (item icons, entity portraits…). Two tags
 * pointing at the same effect key share one underlying animation
 * config — change the color in the admin Tag Editor once and both
 * the "epic" tag and the "epic" item icon glow update together.
 *
 * Upserts are idempotent: editing a row in the admin Tag Editor wins
 * over a re-seed because we only `create` if the row is missing
 * (mirrors `BootstrapService.seedEffectDefinitions`).
 */

const VISUAL_EFFECTS = [
  {
    id: 'fx_shimmer_gold',
    key: 'shimmer-gold',
    name: 'Gold Shimmer',
    description: 'Diagonal gold sweep — used on legendary items and ach tags.',
    cssAnimation: 'shimmer',
    durationMs: 2400,
    easing: 'ease-in-out',
    params: { color: 'rgba(255, 215, 0, 0.55)' },
    sortOrder: 10,
  },
  {
    id: 'fx_shimmer_purple',
    key: 'shimmer-purple',
    name: 'Purple Shimmer',
    description: 'Used on epic-tier rewards and permanent-bonus indicators.',
    cssAnimation: 'shimmer',
    durationMs: 2800,
    easing: 'ease-in-out',
    params: { color: 'rgba(186, 104, 255, 0.45)' },
    sortOrder: 20,
  },
  {
    id: 'fx_pulse_soft',
    key: 'pulse-soft',
    name: 'Soft Pulse',
    description: 'Subtle attention pulse for "ready to claim" states.',
    cssAnimation: 'pulse',
    durationMs: 1600,
    easing: 'ease-in-out',
    params: { minOpacity: 0.7, maxScale: 1.05 },
    sortOrder: 30,
  },
  {
    id: 'fx_glow_gold',
    key: 'glow-gold',
    name: 'Gold Glow',
    description: 'Box-shadow halo. Used on legendary items + permanent achievement bonuses.',
    cssAnimation: 'glow',
    durationMs: 2200,
    easing: 'ease-in-out',
    params: { color: '#ffd700' },
    sortOrder: 40,
  },
  {
    id: 'fx_glow_cyan',
    key: 'glow-cyan',
    name: 'Cyan Glow',
    description: 'Cool variant for "rare" and "new" indicators.',
    cssAnimation: 'glow',
    durationMs: 2400,
    easing: 'ease-in-out',
    params: { color: '#4dd2ff' },
    sortOrder: 50,
  },
  {
    id: 'fx_shake_soft',
    key: 'shake-soft',
    name: 'Soft Shake',
    description: 'Gentle attention shake for urgent / limited offers.',
    cssAnimation: 'shake',
    durationMs: 800,
    easing: 'ease-in-out',
    params: {},
    sortOrder: 60,
  },
  {
    id: 'fx_bounce_call',
    key: 'bounce-call',
    name: 'Call-to-action Bounce',
    description: 'Bounce loop — used on "claim now" tags.',
    cssAnimation: 'bounce',
    durationMs: 1400,
    easing: 'cubic-bezier(0.28, 0.84, 0.42, 1)',
    params: {},
    sortOrder: 70,
  },
  {
    id: 'fx_rainbow_perfect',
    key: 'rainbow-perfect',
    name: 'Perfect Rainbow',
    description: 'Animated rainbow gradient — reserved for "perfect" / mythic tier.',
    cssAnimation: 'rainbow',
    durationMs: 4000,
    easing: 'linear',
    params: {},
    sortOrder: 80,
  },
];

const TAGS = [
  // ─── Item rarity (9 tiers, mirrors the existing rarity color palette
  // in DefaultItemCard.css; effect added on the top end). ───
  { id: 'tag_rarity_common',     key: 'rarity-common',     label: 'Common',     category: 'rarity', color: '#cccccc', backgroundColor: '#2a2a3a', borderColor: '#3a3a4a', sortOrder: 10 },
  { id: 'tag_rarity_uncommon',   key: 'rarity-uncommon',   label: 'Uncommon',   category: 'rarity', color: '#5cdc8c', backgroundColor: '#1a3a2a', borderColor: '#2a5a3a', sortOrder: 20 },
  { id: 'tag_rarity_scarce',     key: 'rarity-scarce',     label: 'Scarce',     category: 'rarity', color: '#7cc8ff', backgroundColor: '#1a2a3a', borderColor: '#2a4a6a', sortOrder: 30 },
  { id: 'tag_rarity_advanced',   key: 'rarity-advanced',   label: 'Advanced',   category: 'rarity', color: '#a888ff', backgroundColor: '#2a2a4a', borderColor: '#3a3a6a', sortOrder: 40 },
  { id: 'tag_rarity_rare',       key: 'rarity-rare',       label: 'Rare',       category: 'rarity', color: '#b888ff', backgroundColor: '#2a2050', borderColor: '#3a306a', effectKey: 'glow-cyan', sortOrder: 50 },
  { id: 'tag_rarity_ultra_rare', key: 'rarity-ultra-rare', label: 'Ultra Rare', category: 'rarity', color: '#e88ce0', backgroundColor: '#3a1a4a', borderColor: '#5a2a6a', effectKey: 'shimmer-purple', sortOrder: 60 },
  { id: 'tag_rarity_epic',       key: 'rarity-epic',       label: 'Epic',       category: 'rarity', color: '#ff8c8c', backgroundColor: '#3a1a1a', borderColor: '#6a2a2a', effectKey: 'shimmer-purple', sortOrder: 70 },
  { id: 'tag_rarity_mythic',     key: 'rarity-mythic',     label: 'Mythic',     category: 'rarity', color: '#ffcc4d', backgroundColor: '#3a2a0a', borderColor: '#6a4a1a', effectKey: 'shimmer-gold',   sortOrder: 80 },
  { id: 'tag_rarity_legendary',  key: 'rarity-legendary',  label: 'Legendary',  category: 'rarity', color: '#ffe14d', backgroundColor: '#3a2a00', borderColor: '#6a4a00', effectKey: 'glow-gold',      sortOrder: 90 },

  // ─── Achievement tiers ───
  { id: 'tag_ach_tier_1', key: 'ach-tier-1', label: 'Bronze',   category: 'ach-tier', color: '#cd7f32', backgroundColor: '#3a2010', borderColor: '#6a4020', sortOrder: 10 },
  { id: 'tag_ach_tier_2', key: 'ach-tier-2', label: 'Silver',   category: 'ach-tier', color: '#c0c0c0', backgroundColor: '#2a2a30', borderColor: '#5a5a60', sortOrder: 20 },
  { id: 'tag_ach_tier_3', key: 'ach-tier-3', label: 'Gold',     category: 'ach-tier', color: '#ffd700', backgroundColor: '#3a2a00', borderColor: '#6a4a00', effectKey: 'glow-gold',     sortOrder: 30 },
  { id: 'tag_ach_tier_4', key: 'ach-tier-4', label: 'Platinum', category: 'ach-tier', color: '#e5e4e2', backgroundColor: '#2a2a3a', borderColor: '#6a6a8a', effectKey: 'shimmer-gold',  sortOrder: 40 },
  { id: 'tag_ach_tier_5', key: 'ach-tier-5', label: 'Diamond',  category: 'ach-tier', color: '#b9f2ff', backgroundColor: '#1a2a3a', borderColor: '#4a8aaa', effectKey: 'rainbow-perfect', sortOrder: 50 },

  // ─── Achievement status ───
  { id: 'tag_ach_active',    key: 'ach-status-active',    label: 'In Progress', category: 'ach-status', color: '#cccccc', backgroundColor: '#2a2a3a', borderColor: '#3a3a4a', sortOrder: 10 },
  { id: 'tag_ach_completed', key: 'ach-status-completed', label: 'Ready!',      category: 'ach-status', color: '#5cdc8c', backgroundColor: '#1a3a2a', borderColor: '#3a8a5a', effectKey: 'pulse-soft', sortOrder: 20 },
  { id: 'tag_ach_claimed',   key: 'ach-status-claimed',   label: 'Unlocked',    category: 'ach-status', color: '#a888ff', backgroundColor: '#2a2050', borderColor: '#5a3aaa', sortOrder: 30 },

  // ─── Quest status ───
  { id: 'tag_quest_active',    key: 'quest-active',    label: 'In Progress', category: 'quest-status', color: '#cccccc', backgroundColor: '#2a2a3a', borderColor: '#3a3a4a', sortOrder: 10 },
  { id: 'tag_quest_completed', key: 'quest-completed', label: 'Complete',    category: 'quest-status', color: '#5cdc8c', backgroundColor: '#1a3a2a', borderColor: '#3a8a5a', effectKey: 'pulse-soft', sortOrder: 20 },
  { id: 'tag_quest_claimed',   key: 'quest-claimed',   label: 'Claimed',     category: 'quest-status', color: '#888899', backgroundColor: '#1a1a25', borderColor: '#2a2a35', sortOrder: 30 },

  // ─── Entity status ───
  { id: 'tag_entity_idle',     key: 'entity-status-idle',     label: 'Idle',     category: 'entity-status', color: '#9aa0a6', backgroundColor: '#2a2a3a', borderColor: '#3a3a4a', sortOrder: 10 },
  { id: 'tag_entity_mission',  key: 'entity-status-mission',  label: 'Mission',  category: 'entity-status', color: '#ffd166', backgroundColor: '#3a2a10', borderColor: '#6a4a20', sortOrder: 20 },
  { id: 'tag_entity_working',  key: 'entity-status-working',  label: 'Working',  category: 'entity-status', color: '#7cc8ff', backgroundColor: '#1a2a3a', borderColor: '#2a4a6a', sortOrder: 30 },
  { id: 'tag_entity_injured',  key: 'entity-status-injured',  label: 'Injured',  category: 'entity-status', color: '#ff8c8c', backgroundColor: '#3a1a1a', borderColor: '#6a2a2a', effectKey: 'shake-soft', sortOrder: 40 },

  // ─── System / generic ───
  { id: 'tag_permanent_bonus', key: 'permanent-bonus', label: 'Permanent',     category: 'system', color: '#ffd700', backgroundColor: '#2a1a3a', borderColor: '#5a3a8a', effectKey: 'glow-gold',  sortOrder: 10 },
  { id: 'tag_new',             key: 'new',             label: 'New',           category: 'system', color: '#ffffff', backgroundColor: '#1a4a3a', borderColor: '#3a8a6a', effectKey: 'pulse-soft', sortOrder: 20 },
  { id: 'tag_limited',         key: 'limited',         label: 'Limited',       category: 'system', color: '#ff8c8c', backgroundColor: '#3a1a1a', borderColor: '#6a2a2a', effectKey: 'shake-soft', sortOrder: 30 },
  { id: 'tag_perfect',         key: 'perfect',         label: '★ Perfect',     category: 'system', color: '#ffffff', backgroundColor: '#2a1a3a', borderColor: '#8a4aff', effectKey: 'rainbow-perfect', sortOrder: 40 },
];

export async function seedTags(prisma: any): Promise<void> {
  let createdEffects = 0;
  for (const fx of VISUAL_EFFECTS) {
    const existing = await prisma.visualEffectDef.findUnique({ where: { key: fx.key } });
    if (!existing) {
      await prisma.visualEffectDef.create({ data: { ...fx, enabled: true } });
      createdEffects++;
    }
  }

  let createdTags = 0;
  for (const t of TAGS) {
    const existing = await prisma.tagDef.findUnique({ where: { key: t.key } });
    if (!existing) {
      await prisma.tagDef.create({
        data: {
          opacity: 1.0,
          enabled: true,
          ...t,
        },
      });
      createdTags++;
    }
  }

  if (createdEffects || createdTags) {
    logger.log(`Seeded ${createdEffects} visual effects and ${createdTags} tags`);
  }
}

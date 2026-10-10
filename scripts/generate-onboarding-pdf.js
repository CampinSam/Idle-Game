const PDFDocument = require('/tmp/node_modules/pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'derp-universe-onboarding.pdf');
const doc = new PDFDocument({
  size: 'A4',
  margin: 52,
  info: { Title: 'Derp Universe — Content Creator & Admin Onboarding', Author: 'Derp Universe' },
  autoFirstPage: false,
});
doc.pipe(fs.createWriteStream(OUT));

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:        '#0d0d1e',
  card:      '#12122a',
  accent:    '#a78bfa',
  accentDim: '#6d28d9',
  gold:      '#f59e0b',
  teal:      '#14b8a6',
  pink:      '#ec4899',
  text:      '#e0e0ff',
  muted:     '#8888aa',
  white:     '#ffffff',
  tableHead: '#1a1a3e',
  tableRow1: '#111128',
  tableRow2: '#0f0f24',
  border:    '#2a2a4e',
  admin:     '#f97316',
};

const W  = 491;   // usable width (A4 595 - 2*52)
const L  = 52;    // left margin
const PH = 841.89; // A4 page height
const BOTTOM_GUARD = 70;

// ── Page management ───────────────────────────────────────────────────────────
function newPage() {
  doc.addPage({ size: 'A4', margin: 52 });
  filledRect(0, 0, 595.28, PH, C.bg);
  doc.y = 52;
}

function guardSpace(needed) {
  if (doc.y + needed > PH - BOTTOM_GUARD) newPage();
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function filledRect(x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}
function roundedRect(x, y, w, h, r, color) {
  doc.save().roundedRect(x, y, w, h, r).fill(color).restore();
}

// ── Typography ────────────────────────────────────────────────────────────────
function h1(text) {
  guardSpace(36);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(22)
     .text(text, L, doc.y, { width: W });
  doc.moveDown(0.4);
}

function h2(text, color = C.accent) {
  guardSpace(52);
  const y = doc.y + 14;
  roundedRect(L, y, W, 26, 4, C.tableHead);
  doc.save().rect(L, y, 4, 26).fill(color).restore();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10.5)
     .text(text.toUpperCase(), L + 13, y + 7, { width: W - 20, characterSpacing: 0.5 });
  doc.y = y + 26 + 10;
}

function h3(text, color = C.accent) {
  guardSpace(22);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10.5)
     .text(text, L, doc.y, { width: W });
  doc.moveDown(0.2);
}

function body(text, indent = 0) {
  const needed = doc.heightOfString(text, { width: W - indent, fontSize: 9.5 }) + 8;
  guardSpace(needed);
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5)
     .text(text, L + indent, doc.y, { width: W - indent, lineGap: 1.5 });
  doc.moveDown(0.35);
}

function bullet(text, indent = 10, color = C.accent) {
  const needed = doc.heightOfString(text, { width: W - indent - 14, fontSize: 9.5 }) + 6;
  guardSpace(needed);
  const y = doc.y;
  doc.fillColor(color).font('Helvetica').fontSize(9.5)
     .text('•', L + indent, y, { width: 10 });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5)
     .text(text, L + indent + 14, y, { width: W - indent - 14, lineGap: 1.5 });
  doc.moveDown(0.2);
}

// Admin callout box
function adminNote(text) {
  const innerW = W - 20;
  const textH = doc.heightOfString(text, { width: innerW - 20, fontSize: 9 });
  const boxH = textH + 18;
  guardSpace(boxH + 8);
  const y = doc.y;
  roundedRect(L, y, W, boxH, 4, C.admin + '18');
  doc.save().rect(L, y, 3, boxH).fill(C.admin).restore();
  doc.fillColor(C.admin).font('Helvetica-Bold').fontSize(8)
     .text('ADMIN / CONTENT NOTE', L + 10, y + 5, { width: innerW - 10 });
  doc.fillColor(C.text).font('Helvetica').fontSize(9)
     .text(text, L + 10, y + 17, { width: innerW, lineGap: 1.5 });
  doc.y = y + boxH + 10;
}

// ── Table renderer (dynamic row heights) ─────────────────────────────────────
function table(headers, rows, colWidths) {
  const FS      = 8.5;
  const HPAD    = 8;
  const VPAD    = 5;
  const headH   = 22;
  const totalW  = colWidths.reduce((a, b) => a + b, 0);

  // Pre-calculate row heights
  const rowHeights = rows.map(row =>
    Math.max(
      ...row.map((cell, ci) => {
        const h = doc.heightOfString(cell, { width: colWidths[ci] - HPAD - 4, fontSize: FS });
        return h + VPAD * 2;
      }),
      20  // minimum row height
    )
  );

  // Render header — guard space
  guardSpace(headH + rowHeights.slice(0, 2).reduce((a, b) => a + b, 0));
  let tx = L;
  let ty = doc.y;

  filledRect(tx, ty, totalW, headH, C.tableHead);
  doc.save().rect(tx, ty, totalW, headH).stroke(C.border).restore();
  let cx = tx;
  headers.forEach((h, i) => {
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(FS)
       .text(h, cx + HPAD / 2, ty + 6, { width: colWidths[i] - HPAD, lineBreak: false });
    cx += colWidths[i];
  });
  ty += headH;

  rows.forEach((row, ri) => {
    const rh = rowHeights[ri];
    if (ty + rh > PH - BOTTOM_GUARD) {
      newPage();
      ty = doc.y;
      // Re-render header on new page
      filledRect(L, ty, totalW, headH, C.tableHead);
      doc.save().rect(L, ty, totalW, headH).stroke(C.border).restore();
      cx = L;
      headers.forEach((hdr, i) => {
        doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(FS)
           .text(hdr, cx + HPAD / 2, ty + 6, { width: colWidths[i] - HPAD, lineBreak: false });
        cx += colWidths[i];
      });
      ty += headH;
    }

    filledRect(L, ty, totalW, rh, ri % 2 === 0 ? C.tableRow1 : C.tableRow2);
    doc.save().rect(L, ty, totalW, rh).stroke(C.border).restore();
    cx = L;
    row.forEach((cell, ci) => {
      const isFirst = ci === 0;
      doc.fillColor(isFirst ? C.accent : C.text)
         .font(isFirst ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(FS)
         .text(cell, cx + HPAD / 2, ty + VPAD, { width: colWidths[ci] - HPAD - 2, lineGap: 1 });
      cx += colWidths[ci];
    });
    ty += rh;
  });

  doc.y = ty + 12;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 1: COVER
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

// Rainbow top bar
['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'].forEach((c, i) =>
  filledRect(0, i * 4, 595.28, 4, c)
);

doc.y = 120;
doc.fillColor(C.muted).font('Helvetica').fontSize(9.5)
   .text('CONTENT CREATOR & ADMIN ONBOARDING', { align: 'center', characterSpacing: 2.5, width: 595.28 });
doc.moveDown(0.7);
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(38)
   .text('Derp Universe', { align: 'center', width: 595.28 });
doc.moveDown(0.3);
doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(17)
   .text('Systems & Features Reference', { align: 'center', width: 595.28 });

doc.moveDown(1.4);
filledRect(L + 50, doc.y, W - 100, 1, C.border);
doc.moveDown(1.4);

doc.fillColor(C.text).font('Helvetica').fontSize(10.5)
   .text(
     'This document gives you a working understanding of every major system in Derp Universe — what it does, how it is configured, and how the pieces fit together.',
     L + 30, doc.y, { width: W - 60, align: 'center', lineGap: 3 }
   );
doc.moveDown(0.9);
doc.fillColor(C.muted).font('Helvetica').fontSize(9.5)
   .text(
     'Oriented for content creators, game designers, and admins.\nFor deep API field references, see admin-schemas.md and content-creator-guide.md.',
     L + 30, doc.y, { width: W - 60, align: 'center', lineGap: 3 }
   );

// Bottom bar
filledRect(0, PH - 36, 595.28, 36, C.tableHead);
doc.fillColor(C.muted).font('Helvetica').fontSize(8)
   .text('Derp Universe  ·  Content Creator & Admin Onboarding  ·  Internal Reference', 0, PH - 22, { align: 'center', width: 595.28 });

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 2: GAME OVERVIEW + ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Game Overview');
body(
  'Derp Universe is a persistent idle strategy RPG. Players manage a roster of characters (Entities), send them on timed Missions to earn rewards, and station them as workers in Outposts that produce resources around the clock. All game logic runs server-side — there is no local state that can be manipulated.'
);
body(
  'The game is structured around seasons. Each season layers new missions, quests, and cosmetics on top of the persistent world. Core account progress (entities, keeper level, hard currencies) carries forward between seasons; seasonal currencies and rewards do not.'
);

h2('Core Design Principles', C.accentDim);
[
  ['Sweat equity, not pay-to-win', 'Progression rewards consistent play. Premium spending expands convenience and cosmetics, never raw power.'],
  ['Server-authoritative', 'Every timer, reward roll, and stat calculation happens on the server. Clients display results only.'],
  ['Data-driven content', 'Missions, outposts, quests, effects, and store items are all defined through admin tables — no deploys required for content changes.'],
  ['NFTs unlock capacity', 'NFT ownership expands the number of entities and active outpost slots, not stat ceilings or time-gate bypasses.'],
].forEach(([title, desc]) => {
  guardSpace(30);
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9.5).text('→ ' + title, L, doc.y, { continued: true, width: W });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text('  ' + desc, { width: W });
  doc.moveDown(0.3);
});

h2('Entities — Your Characters', C.teal);
body(
  'Entities are the playable characters. Each has a name, rarity, level (1–50), tier (T1–T5), and six core stats. They can be assigned to missions, placed as workers in outposts, or equipped with gear that modifies their stats. Entity definitions live in the EntityDefinition admin table.'
);

h3('The Six Core Stats', C.teal);
doc.moveDown(0.1);
table(
  ['Stat', 'Full Name', 'Mission Power Weight', 'Secondary Effects'],
  [
    ['ATK', 'Attack',   '40%', 'Primary driver of combat effectiveness'],
    ['DEF', 'Defense',  '30%', 'Reduces injury chance on mission failure'],
    ['SPD', 'Speed',    '20%', 'Shortens mission timers; increases outpost throughput'],
    ['FOC', 'Focus',    '10%', 'Increases production rate; decreases resource consumption in outposts'],
    ['LCK', 'Luck',      '5%', 'Improves loot rarity rolls and crafting critical outcomes'],
    ['VIT', 'Vitality',  '5%', 'Shortens injury recovery; reduces MP penalty while injured'],
  ],
  [38, 68, 130, 255]
);

body(
  'Mission Power (MP) formula:\n' +
  '    MP = (ATK × 0.4) + (DEF × 0.3) + (SPD × 0.2) + (FOC × 0.1) + (LCK × 0.05) + (VIT × 0.05)\n\n' +
  'Success Chance = MP ÷ (MP + Difficulty)   — unclamped, ranges from 0 to 1.'
);

adminNote(
  'Entity types, stat gain per level, tier thresholds, equipment slot definitions, and progression curves (geometric or table-based) are all configured in the EntityDefinition admin table. Stat gains are specified per-tier in the statGain config block.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 3: MISSIONS
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Missions');
body(
  'Missions are the primary engagement loop. A player assigns idle entities to a mission, waits for the tick-based timer to complete, and collects tiered rewards. Mission definitions (MissionDef) control everything: duration, difficulty, reward tables, team size, eligibility rules, and phase structure.'
);

h2('Mission Types', C.gold);
table(
  ['Type', 'Description', 'Key Config Notes'],
  [
    ['Standard',   'Single phase, fixed duration, one outcome roll.', 'Most common. Set timer, difficulty, and outcome tiers in MissionDef.'],
    ['Expedition', 'Multi-phase: team advances through sequential stages. Injuries carry between phases.', 'Set phases array with per-phase rewards. Supports per_phase, final_bundle, or hybrid reward modes.'],
    ['Scavenging', 'Resource-gathering focused. FOC and LCK scale rewards.', 'Configure outcome tiers to skew toward material drops.'],
    ['Boss',       'High-difficulty encounter, typically gated by keeper/entity level.', 'Set a high difficulty value and required minLevel or keeperLevel on the MissionDef.'],
  ],
  [75, 200, 216]
);

h2('Outcome Tiers', C.gold);
body(
  'Every mission has an ordered set of outcome tiers. The server rolls against each tier threshold starting from the best, working down. The first tier whose threshold is met (given the team\'s success chance) determines the reward bundle granted.'
);
table(
  ['Tier', 'Typical Use', 'Reward Guidance'],
  [
    ['Legendary', 'Best possible result, rare', 'Rare/unique items, large currency grants, exclusive cosmetics'],
    ['Epic',      'Strong success',             'High-value materials, gear, premium bundles'],
    ['Rare',      'Good outcome',               'Useful materials and mid-tier currency amounts'],
    ['Uncommon',  'Average success',            'Standard farming yields — the most common "win"'],
    ['Common',    'Marginal success',           'Minimal reward; confirms mission was a net positive'],
    ['Failure',   'Mission failed',             'No reward or consolation item; may trigger injury roll'],
  ],
  [72, 150, 269]
);

adminNote(
  'Each tier is a RewardBundle defined inline on the MissionDef. Bundles can contain currencies, items, lootbox keys, or XP. Multi-phase expeditions can emit rewards per-phase, only at the final phase, or as a hybrid. The per_phase mode is useful for expeditions where partial completion should still feel meaningful.'
);

h2('Timers & SPD', C.gold);
body(
  'A mission\'s base duration is set in ticks on the MissionDef (timer field). The team\'s aggregated SPD stat applies a Pythagorean reduction to the timer — higher team speed = shorter wait. Player-scoped effects with type MISSION_TIMER_SPEED stack on top of this reduction. Active synergy rules may also apply a duration multiplier.'
);

h2('Injuries', C.pink);
body(
  'When a mission fails, each entity on the team has an individual injury probability calculated from their DEF stat. An injured entity is locked out of all assignments for a duration determined by their VIT. There is no permanent damage — VIT investment directly shortens downtime.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 4: OUTPOSTS & LOCATIONS
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Outposts & Locations');
body(
  'Outposts (Locations) are the idle engine of the game. Workers assigned to an outpost generate resources automatically every tick, even when the player is offline. Everything about an outpost\'s behaviour — what it produces, what it consumes, its storage caps, and how it levels up — is defined in the LocationDefinition admin table.'
);

h2('Outpost Lifecycle', C.teal);
[
  ['Unlock',         'A player activates an outpost slot (limited by Keeper Level and land NFT count). Base outpost capacity grows with Keeper Level.'],
  ['Assign workers', 'Idle entities are slotted into worker positions. FOC and SPD stats scale throughput.'],
  ['Build',          'Constructing buildings inside an outpost unlocks new production chains or utility effects. Building slots are unlocked per level.'],
  ['Level up',       'Players deposit resources to earn Outpost XP. Each level up may unlock more worker slots, new buildings, and increased storage.'],
  ['Collect',        'Resources accumulate in per-outpost storage. Players manually collect them to their wallet, or buildings can auto-process them.'],
].forEach(([title, desc]) => {
  guardSpace(28);
  doc.fillColor(C.teal).font('Helvetica-Bold').fontSize(9.5).text(title + ': ', L, doc.y, { continued: true, width: W });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text(desc, { width: W - 80 });
  doc.moveDown(0.25);
});

h2('Production Formula', C.teal);
body('Output per tick = Base Rate × Building Multiplier × Worker Multiplier × Effect Multiplier × Threat Penalty');
body(
  'Worker multiplier uses FOC and SPD:\n' +
  '    productionMult = 1.0 + 0.005 × (ΣFOC + ΣSPD)  (production)\n' +
  '    consumptionMult = 1.0 + 0.005 × max(0, ΣSPD − ΣFOC)  (consumption)\n\n' +
  'High SPD with low FOC teams produce quickly but also consume inputs faster — outpost design should account for this balance.'
);

h2('Threat & Corruption', C.pink);
body(
  'Threat accumulates on outpost locations over time or through specific game events. Production penalties kick in at threat > 20 and scale linearly to a 50% penalty cap at maximum threat. Admins can modify or reset threat directly via the admin panel.'
);

h2('Regions', C.teal);
body(
  'Locations and missions are grouped into Regions (RegionDefinition). Regions provide the context for synergy rules and can gate content behind keeper level thresholds. Region-specific synergy bonuses activate when a team meets the composition requirements defined in a SynergyRule that targets that region.'
);

adminNote(
  'LocationDefinition fields control: slot unlock requirements, worker slot counts per level, building slot layout, XP curve, storage caps per resource, base production/consumption rates per building type, and the threat model. BuildingDef and RoomDef define the buildings that can be constructed inside a location. All of these are editable without a code deploy.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 5: ECONOMY
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Economy');

h2('Currencies', C.gold);
body('All balances use a BigInt ledger. Every credit and debit is recorded with an idempotency key — double-grants are structurally impossible. Currency types:');
table(
  ['Type', 'Typical Source', 'Typical Use', 'Admin Key Notes'],
  [
    ['Soft',     'Missions, outpost production, quests, check-ins', 'Crafting, outpost upgrades, general progression', 'type: SOFT on CurrencyDef'],
    ['Hard',     'Harder missions, achievements, events', 'Gated upgrades, premium recipes', 'type: HARD'],
    ['Premium',  'Store purchase (Stripe / ADA / EVM)', 'Timer skips, cosmetics, premium bundles', 'type: PREMIUM — grant via store only'],
    ['Seasonal', 'Season pass, seasonal quests', 'Season-exclusive rewards', 'type: SEASONAL — expires end of season'],
    ['Event',    'Limited-time events', 'Event store exclusives', 'type: EVENT'],
    ['Crypto',   'On-chain ADA / CNT / EVM deposit', 'Premium content, direct commerce', 'type: CRYPTO — handled by crypto module'],
  ],
  [58, 140, 140, 153]
);

h2('Items & Inventory', C.gold);
table(
  ['Item Type', 'Description', 'Key Config'],
  [
    ['Material',     'Raw resources from outposts or missions. Stackable.',                    'stackable: true, used as recipe inputs'],
    ['Consumable',   'Single-use. Applies a temporary effect or grants resources instantly.', 'effectSpec defines what activates on use'],
    ['Gear',         'Equippable to an entity slot. Grants stat modifiers.',                   'stats map defines per-stat bonuses; slot field targets the equipment slot'],
    ['Lootbox',      'Sealed drop. Opens to grant a weighted random reward.',                  'rewardBundles array with weight per tier'],
    ['Gift Package', 'Bundled reward pending player claim.',                                   'Created via GiftDef; expires per expiresAt'],
  ],
  [80, 220, 191]
);

h2('Crafting & Recipes', C.gold);
body(
  'Recipes (RecipeDef) define a transformation: a set of input costs (currencies and/or items), a timer, and one or more outcome tiers. Crafting runs as a background Job on the server. Multiple crafts can be queued simultaneously. LCK stat and active effects can shift the outcome toward a higher tier.'
);
adminNote(
  'RecipeDef fields: inputs (cost array), timer (ticks), outcomes (tiered RewardBundle array), luck sensitivity (whether LCK shifts tier probabilities), and any level or item requirements. Recipes appear in the Crafting UI automatically once defined.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 6: QUESTS, CHECK-INS & TELEMETRY
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Quests, Check-ins & Telemetry');

h2('How Quests Work — the Telemetry Pipeline', C.accent);
body(
  'Quest progress is driven entirely by the Telemetry system. When any game action occurs (mission completed, item crafted, outpost leveled, etc.), the relevant service emits a telemetry event. The Quest service subscribes to that stream and increments matching objectives automatically. Players never need to "report" progress manually.'
);

h3('The flow end-to-end:', C.accent);
[
  'Player performs an action → server emits a PlayerEvent (eventType + metadata)',
  'TelemetryService fans the event to all registered subscribers',
  'QuestService checks active QuestInstances: does this event match an objective\'s eventType?',
  'SelectionResolverService evaluates any filter on the objective (e.g. "only missions in region Frozen Wastes")',
  'If it matches, the objective\'s current count increments. If all objectives are complete, the quest is flagged as claimable.',
  'Player claims reward → RewardBundle is granted; QuestInstance marked claimed.',
].forEach((step, i) => {
  guardSpace(22);
  const y = doc.y;
  roundedRect(L, y, 18, 16, 3, C.accentDim + '55');
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(8).text(String(i + 1), L + 5, y + 4, { width: 12, align: 'center' });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text(step, L + 24, y + 3, { width: W - 24 });
  doc.moveDown(0.2);
});

h2('Quest Cadences', C.accent);
table(
  ['Cadence', 'Reset Schedule', 'Notes'],
  [
    ['Daily',       'UTC midnight each day',  'Short objectives. Auto-reset creates a new QuestInstance on next qualifying event after the window rolls over.'],
    ['Weekly',      'Monday 00:00 UTC',       'Larger objectives spanning multiple play sessions.'],
    ['One-off',     'Never resets',           'Story gates, onboarding tutorials, permanent unlocks.'],
    ['Achievement', 'Never resets',           'Lifetime milestone. Grants permanentEffectSpec on claim — typically a permanent stat buff or slot unlock.'],
  ],
  [70, 120, 301]
);

h2('TelemetryDef — Custom Aggregation', C.accent);
body(
  'TelemetryDef lets you define named counters that aggregate specific event streams without writing code. Each TelemetryDef specifies a set of subEvents: an eventType plus an optional SelectionRule filter, and a key to store the running total under. Counts persist in the TelemetryCount table and can be queried via the admin panel.'
);
adminNote(
  'Use TelemetryDef when you want a persistent aggregate you can reference later (e.g. "total legendary missions completed by all players this season"). For quest objectives, the SelectionRule filter on the objective itself is usually sufficient without a separate TelemetryDef.'
);

h2('Check-ins', C.teal);
body(
  'Check-in tracks (CheckInDef) are daily/weekly reward ladders. Each entry in the track defines the reward bundle for that day/week. Streak mechanics are built in — missing a day can break or demote the streak depending on the track config. Rewards are issued as GiftInstances to avoid inventory spam.'
);
adminNote(
  'CheckInDef fields: cadence (daily/weekly), streak behaviour (reset vs. demote on miss), reward array (one RewardBundle per step), max streak length, and whether the track loops after completion.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 7: EFFECTS, POWERS & GLOBAL POWERS
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Effects, Powers & Global Powers');
body(
  'The effects system is the universal modifier layer. Any numeric value in the game — a stat, a timer multiplier, a production rate — can be altered by an active effect. Effects are defined in EffectDef, instantiated on players/entities/locations by game events, and resolved at the point of use.'
);

h2('EffectDef — The Modifier Blueprint', C.pink);
table(
  ['Field', 'What It Controls'],
  [
    ['category',        'What system the effect targets: STAT_BOOST, MISSION_TIMER_SPEED, PRODUCTION_RATE, CURRENCY_RATE, etc.'],
    ['targetType',      'Scope: PLAYER, ENTITY, LOCATION, or GLOBAL'],
    ['valueMode',       'How the value is applied: FLAT (add N), PERCENT (+N%), MULTIPLIER (×N), or BPS (basis points, N/10000)'],
    ['durationModel',   'TIMED (expires after N ticks), PERMANENT (never expires), or CONDITIONAL (clears on a trigger event)'],
    ['stackingRule',    'MAX (keep highest), ADDITIVE (sum all), REPLACE (newest wins), or NONE (one instance only)'],
    ['statKey',         'For STAT_BOOST effects: which stat (ATK/DEF/SPD/FOC/LCK/VIT) is modified'],
  ],
  [130, 361]
);

h2('PowerDef — Ability Blueprints', C.pink);
body(
  'Powers are higher-level ability definitions that wrap one or more effects. A PowerDef describes what an ability does — its scope, its stackMode, and its underlying effectSpecs — while a GlobalActivePower (or a player/entity activation event) represents a live instance of that power currently running in the world.'
);

h2('Global Powers — Server-Wide Buffs', C.admin);
body(
  'Global Powers (GlobalActivePower) are admin-controlled boosts that apply to every player simultaneously. They are the primary tool for live-ops events — double XP weekends, production boosts, limited-time bonuses. There is a dedicated admin panel for managing them.'
);
table(
  ['Power Kind', 'How It Works', 'Example Use'],
  [
    ['Effect-backed', 'References an EffectDef. Applies that effect globally to all matching players/entities/locations via a selection scope.', '"+25% Soft currency production for 48 h" during a weekend event'],
    ['Tick Speed Boost', 'No EffectDef. Directly modifies the global tick rate interval. Speeds up or slows the entire game clock for all players.', '"2× speed event" — all timers run at double pace for 6 hours'],
  ],
  [100, 210, 181]
);
body(
  'Global powers can be scheduled (startTime in the future) or activated immediately. Only one instance of a given EffectDef can be active at a time (non-stacking rule). When a power starts or ends, a real-time broadcast updates every connected client\'s UI instantly.'
);
adminNote(
  'Create and manage Global Powers via Admin → System → Global Powers. You can schedule future activations, override effect values per-instance (effectOverrides), and set precise startTime/endTime. The system auto-expires powers at their endTime without manual intervention.'
);

h2('Visual Effects & Tags', C.teal);
body(
  'VisualEffectDef defines CSS animations that can be attached to Tag chips (TagDef). Tags are labels applied to entities, items, or UI elements (e.g. "Rare", "Limited"). Tags carry colour, border, and an optional visual effect for animated flair. Both are managed in the admin content editor.'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 8: STORE, GIFTS, NFTs & SEASONS
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Store, Gifts, NFTs & Seasons');

h2('The Store', C.gold);
body(
  'The player-facing store is built entirely from admin-defined tables. ShopTabDef defines the tab strip (e.g. Bundles, Gems, Currency). ShopSectionDef adds headings within tabs. ShopItemDef defines each purchasable item — its cost, contents, badge, image, and optional time-window.'
);
table(
  ['Table', 'Controls'],
  [
    ['ShopTabDef',     'Tab labels, ordering, layout style (grid-2, grid-3, featured), and type (items vs. gem packs)'],
    ['ShopSectionDef', 'Section headings within a tab. Items reference a section by sectionId.'],
    ['ShopItemDef',    'Each store card: cost (currencies/items), contents (what player receives), badge label, image, displayOrder, and optional availableFrom / limitedUntil timestamps'],
    ['GemPackDef',     'Stripe-linked premium gem bundles. ID is the Stripe product ID. Gem amounts and prices managed here.'],
    ['ShopHeroDef',    'Hero banner carousel at the top of the store. Promotional images and CTAs.'],
  ],
  [110, 381]
);
adminNote(
  'Items with a limitedUntil timestamp automatically show a live countdown on the store card and are suppressed from the catalog after expiry — no manual intervention needed. Items with availableFrom are hidden until the scheduled time.'
);

h2('Gifts', C.accent);
body(
  'Gifts are reward bundles that arrive in the player\'s Gifts inbox rather than directly in inventory. They remain pending until claimed, then their contents are granted atomically. Admins can bulk-grant gifts to players via the admin panel. Gifts expire per the expiresAt field on the GiftInstance.'
);

h2('NFT Integration', C.accentDim);
body(
  'Derp Universe supports on-chain NFT ownership on Cardano and EVM-compatible chains (Ethereum, Base, Polygon). Wallet verification runs on login and periodically in the background. Matching NFTs unlock in-game benefits as defined in NftCollectionDef.'
);
table(
  ['NFT Category', 'What It Unlocks', 'Notes'],
  [
    ['Character NFT', 'No entity roster cap — character NFTs contribute to team depth and variety, not a hard slot limit.', 'Each collection maps entity types to specific NFT token policies.'],
    ['Land NFT',      'Each land NFT unlocks one additional simultaneous active outpost slot. Base slots are set by Keeper Level.', 'Total active outposts = Keeper Level base + land NFT count.'],
  ],
  [110, 210, 171]
);
body('No NFT type increases stat values, reduces time gates, or provides exclusive access to core gameplay loops. The game is fully playable without any NFTs.');
adminNote(
  'NftCollectionDef fields: chain (CARDANO/EVM), policy ID or contract address, ecosystem/collection name, entity type mapping, and whether the collection grants character or land benefits. New collections can be registered without a code deploy.'
);

h2('Seasons', C.gold);
body(
  'Each season has a key, a name, a start/end date, and a freeform config block. Seasonal quests, currencies, and cosmetics are scoped to the season. When a season ends, seasonal currencies are retired; core progression (keeper level, entities, hard currencies) persists. The Season admin table manages scheduling and status transitions (scheduled → active → ended).'
);

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 9: SYNERGIES, SELECTION RULES & CONTENT WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

h1('Synergies, Selection Rules & Content Workflow');

h2('Synergy Rules', C.teal);
body(
  'SynergyRules define bonus multipliers triggered by specific team compositions. When a player assembles a mission team that matches a rule\'s criteria (e.g. "3 entities with the Ice tag in the Frozen Wastes region"), the corresponding bonus applies to mission duration, power, or rewards. Rules are evaluated server-side at mission start.'
);
adminNote(
  'SynergyRule fields: scope (region, mission category, or global), required composition (entity types, tags, count thresholds), bonus type (DURATION_REDUCTION, POWER_BOOST, REWARD_MULTIPLIER), and bonus value. Rules are live as soon as they are saved — no restart needed.'
);

h2('Selection Rules', C.teal);
body(
  'SelectionRules are reusable filter expressions used throughout the system — quest objectives, telemetry filters, synergy conditions, and effect target scopes all reference SelectionRules. A rule is a tree of conditions evaluated against a context object (the event or entity being checked).'
);
table(
  ['Used By', 'Purpose'],
  [
    ['Quest objectives',    'Filters which events count toward progress (e.g. "mission_complete where missionId = boss_dragon")'],
    ['TelemetryDef',        'Scopes which events increment a specific aggregate counter'],
    ['SynergyRule',         'Determines which team compositions qualify for a bonus'],
    ['EffectDef target',    'Scopes which entities or locations a global/player effect applies to'],
    ['Admin selection eval', 'Admin panel has a live selection rule evaluator for testing rules before publishing'],
  ],
  [140, 351]
);

h2('Content Creation Workflow', C.admin);
body(
  'All game content lives in the admin Content Editor. Changes take effect immediately — no server restarts or code deploys required for content-only changes. The recommended workflow:'
);
[
  'Draft in the admin editor (new records start as drafts requiring approval in non-superadmin mode).',
  'Use the live Selection Rule evaluator (Admin → System → Selection Rules → Evaluate) to test quest filters before publishing.',
  'For new mission types: create the MissionDef, configure outcome tiers with test-appropriate rewards, then run a test session to verify timers and drop rates.',
  'For new quests: ensure the relevant telemetry eventType exists in the codebase before setting up the QuestDef objective. Unknown eventTypes produce no progress.',
  'For seasonal content: create the Season record first, then link seasonal quests, currencies, and banners to it by seasonId/key.',
  'Review the content-creator-guide.md for full field references and admin-schemas.md for API-level detail.',
].forEach((step, i) => {
  guardSpace(28);
  const y = doc.y;
  roundedRect(L, y, 18, 16, 3, C.admin + '44');
  doc.fillColor(C.admin).font('Helvetica-Bold').fontSize(8).text(String(i + 1), L + 5, y + 4, { width: 12, align: 'center' });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text(step, L + 24, y + 3, { width: W - 24, lineGap: 1.5 });
  doc.moveDown(0.2);
});

h2('Admin Table Quick Reference', C.admin);
table(
  ['Area', 'Key Admin Tables'],
  [
    ['Entities & Gear',    'EntityDefinition, ItemDef, EffectDef, PowerDef, TagDef, VisualEffectDef'],
    ['Missions',           'MissionDef, MissionCategoryDef, SynergyRule, SelectionRuleDef'],
    ['Outposts',           'LocationDefinition, RegionDefinition, BuildingDef, RoomDef'],
    ['Economy',            'Currency, RecipeDef, LootboxDef, BundleDef, GiftDef'],
    ['Player Engagement',  'QuestDef, CheckInDef, TelemetryDef, HomeBannerDef'],
    ['Store & Payments',   'ShopTabDef, ShopSectionDef, ShopItemDef, GemPackDef, ShopHeroDef'],
    ['Live-Ops',           'GlobalActivePower (via admin panel), EventDefinition, Season'],
    ['System',             'GameDefinition, GameConstant, SystemIconDef, DefaultModalDef, DisplayDef'],
    ['NFTs',               'NftCollectionDef'],
  ],
  [140, 351]
);

// ═══════════════════════════════════════════════════════════════════════════════
// BACK COVER
// ═══════════════════════════════════════════════════════════════════════════════
newPage();

['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'].forEach((c, i) =>
  filledRect(0, PH - 24 + (i - 5) * 4, 595.28, 4, c)
);

doc.y = 190;
doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(14)
   .text('Reference Documents', { align: 'center', width: 595.28 });
doc.moveDown(0.9);

const refDocs = [
  ['content-creator-guide.md', 'Complete field-by-field reference for every definition table. The canonical guide for authors.'],
  ['admin-schemas.md',          'API-level documentation for all admin endpoints, request/response shapes, and enum values.'],
  ['definition-schemas.json',   'Machine-readable JSON Schema for all definition types. Useful for tooling and validation.'],
  ['render-blocks.md',          'Full vocabulary for modal and screen blocks — every block type, its fields, and visual examples.'],
];
refDocs.forEach(([title, desc]) => {
  guardSpace(30);
  const y = doc.y;
  roundedRect(L + 40, y, W - 80, 26, 4, C.tableHead);
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9).text(title, L + 52, y + 4, { width: W - 110 });
  doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(desc, L + 52, y + 15, { width: W - 110 });
  doc.y = y + 32;
  doc.moveDown(0.1);
});

doc.moveDown(1.2);
filledRect(L + 60, doc.y, W - 120, 1, C.border);
doc.moveDown(1);
doc.fillColor(C.muted).font('Helvetica').fontSize(9)
   .text('Derp Universe  ·  Content Creator & Admin Onboarding  ·  Internal Reference', { align: 'center', width: 595.28 });

doc.end();
console.log('PDF written to', OUT);

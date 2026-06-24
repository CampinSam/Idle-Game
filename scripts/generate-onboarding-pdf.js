const PDFDocument = require('/tmp/node_modules/pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'derp-universe-onboarding.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 52, info: { Title: 'Derp Universe — Player Onboarding Guide', Author: 'Derp Universe' } });
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
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const W = doc.page.width  - 104;   // usable width
const L = 52;                       // left margin

function filledRect(x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function roundedRect(x, y, w, h, r, color) {
  doc.save().roundedRect(x, y, w, h, r).fill(color).restore();
}

function sectionDivider(label, color = C.accent) {
  const y = doc.y + 18;
  roundedRect(L, y, W, 28, 4, C.tableHead);
  doc.rect(L, y, 4, 28).fill(color);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(11)
     .text(label.toUpperCase(), L + 14, y + 8, { width: W - 20 });
  doc.moveDown(0.15);
}

function h1(text) {
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(22).text(text, { align: 'left' });
  doc.moveDown(0.4);
}

function h2(text, color = C.accent) {
  doc.moveDown(0.5);
  sectionDivider(text, color);
  doc.moveDown(0.6);
}

function h3(text, color = C.accent) {
  doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(text);
  doc.moveDown(0.2);
}

function body(text, indent = 0) {
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5)
     .text(text, L + indent, doc.y, { width: W - indent });
  doc.moveDown(0.3);
}

function bullet(text, indent = 10, color = C.accent) {
  const y = doc.y;
  doc.fillColor(color).font('Helvetica').fontSize(9.5).text('•', L + indent, y, { width: 10, continued: false });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5)
     .text(text, L + indent + 12, y, { width: W - indent - 12 });
}

function tag(label, color) {
  const tw = doc.widthOfString(label, { fontSize: 8 }) + 12;
  const tx = doc.x;
  const ty = doc.y;
  roundedRect(tx, ty, tw, 16, 3, color + '33');
  doc.rect(tx, ty, 2, 16).fill(color);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(label, tx + 6, ty + 4, { width: tw - 8, continued: false });
  doc.x = tx + tw + 6;
  doc.y = ty;
}

// ── Table renderer ────────────────────────────────────────────────────────────
function table(headers, rows, colWidths) {
  const rowH    = 18;
  const headH   = 20;
  const totalW  = colWidths.reduce((a, b) => a + b, 0);
  let   tx      = L;
  let   ty      = doc.y;

  // Header
  filledRect(tx, ty, totalW, headH, C.tableHead);
  doc.rect(tx, ty, totalW, headH).stroke(C.border);
  let cx = tx;
  headers.forEach((h, i) => {
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(8.5)
       .text(h, cx + 5, ty + 6, { width: colWidths[i] - 8 });
    cx += colWidths[i];
  });

  ty += headH;
  rows.forEach((row, ri) => {
    // page break guard
    if (ty + rowH > doc.page.height - 72) {
      doc.addPage();
      ty = doc.y = 52;
    }
    filledRect(tx, ty, totalW, rowH, ri % 2 === 0 ? C.tableRow1 : C.tableRow2);
    doc.rect(tx, ty, totalW, rowH).stroke(C.border);
    cx = tx;
    row.forEach((cell, ci) => {
      const isFirst = ci === 0;
      doc.fillColor(isFirst ? C.accent : C.text)
         .font(isFirst ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(8.5)
         .text(cell, cx + 5, ty + 5, { width: colWidths[ci] - 8 });
      cx += colWidths[ci];
    });
    ty += rowH;
  });

  doc.y = ty + 10;
}

// ── PAGE 1: COVER ─────────────────────────────────────────────────────────────
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

// Decorative gradient bar at top
for (let i = 0; i < 6; i++) {
  const colors = ['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'];
  filledRect(0, i * 4, doc.page.width, 4, colors[i]);
}

doc.y = 130;
doc.fillColor(C.muted).font('Helvetica').fontSize(10).text('PLAYER ONBOARDING GUIDE', { align: 'center', characterSpacing: 3 });
doc.moveDown(0.6);
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(36).text('Derp Universe', { align: 'center' });
doc.moveDown(0.3);
doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(16).text('Getting Started', { align: 'center' });

// Decorative divider
doc.moveDown(1.2);
filledRect(L + 60, doc.y, W - 120, 1, C.border);
doc.moveDown(1.2);

// Quick intro paragraph on cover
doc.fillColor(C.text).font('Helvetica').fontSize(10.5)
   .text(
     'Derp Universe is a season-based idle strategy RPG. You build a team of unique characters, send them on missions, manage outposts that produce resources around the clock, and grow in power over time — all at your own pace.',
     L + 40, doc.y, { width: W - 80, align: 'center' }
   );

doc.moveDown(1);
doc.fillColor(C.muted).font('Helvetica').fontSize(10.5)
   .text(
     'This guide covers the core concepts you need to play. No prior experience required.',
     L + 40, doc.y, { width: W - 80, align: 'center' }
   );

// Bottom bar
filledRect(0, doc.page.height - 36, doc.page.width, 36, C.tableHead);
doc.fillColor(C.muted).font('Helvetica').fontSize(8)
   .text('Derp Universe  ·  Player Onboarding Guide  ·  Confidential — Not for Distribution', 0, doc.page.height - 22, { align: 'center', width: doc.page.width });

// ── PAGE 2: What Is Derp Universe? + Entities ─────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('What Is Derp Universe?');
body(
  'Derp Universe is a persistent idle RPG where you manage a growing roster of characters (called Entities), assign them to missions and outposts, and accumulate resources and power across seasons. The game runs continuously — your outposts keep producing and your missions keep ticking even when you\'re offline.'
);
body(
  'Everything is server-authoritative, meaning the game\'s results and timers are computed on the server, not your device. There is no way to manipulate outcomes locally, and no "pay-to-win" shortcut. NFTs (if you own them) unlock extra character and outpost slots but never increase stat ceilings or let you skip time gates.'
);

h2('Core Philosophy', C.accentDim);
const philosophyItems = [
  ['Sweat equity over pay-to-win', 'Progression comes from playing consistently, not spending more.'],
  ['Idle-first design',            'The game works for you while you\'re away. Check in, assign tasks, collect rewards.'],
  ['Persistent world',             'The game world continues across seasons; your account history carries forward.'],
  ['NFTs unlock capacity',         'Owning NFT characters or land gives you more slots to play with — not a stats advantage.'],
];
philosophyItems.forEach(([title, desc]) => {
  doc.moveDown(0.1);
  h3('→ ' + title);
  body(desc, 10);
});

h2('Entities — Your Characters', C.teal);
body(
  'Entities are your playable characters. Each entity has a name, a rarity, a level (1–50), and six core stats. You earn entities through NFT ownership or in-game unlocks. They can be assigned to missions, placed as workers in outposts, or equipped with gear.'
);

doc.moveDown(0.3);
h3('The Six Core Stats', C.teal);
doc.moveDown(0.2);

table(
  ['Stat', 'Full Name', 'Primary Role', 'Secondary Effects'],
  [
    ['ATK', 'Attack',    'Mission Power (40%)',  'Highest contributor to combat effectiveness'],
    ['DEF', 'Defense',   'Mission Power (30%)',  'Reduces injury chance on mission failure'],
    ['SPD', 'Speed',     'Mission Power (20%)',  'Shortens mission timers; boosts outpost throughput'],
    ['FOC', 'Focus',     'Mission Power (10%)',  'Increases production, decreases consumption in outposts'],
    ['LCK', 'Luck',      'Mission Power (5%)',   'Improves loot rarity rolls and critical success chance'],
    ['VIT', 'Vitality',  'Mission Power (5%)',   'Reduces injury recovery time; lowers injured-state MP penalty'],
  ],
  [40, 70, 150, 175]
);

body(
  'Mission Power (MP) is a single number that represents how effective your team is on a mission. It is calculated as:\n' +
  '     MP = (ATK × 0.4) + (DEF × 0.3) + (SPD × 0.2) + (FOC × 0.1) + (LCK × 0.05) + (VIT × 0.05)'
);

body('A mission\'s Success Chance is then: MP ÷ (MP + Difficulty), clamped between 5% and 95%.');

h3('Leveling & Tiers', C.teal);
body(
  'Entities gain stats as they level from 1 to 50. Beyond level progression, entities can advance through Tiers (T1–T5), which represent a deeper form of growth. Tier advancement unlocks Mastery options that let you specialise a character\'s role.'
);

// ── PAGE 3: Missions ──────────────────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('Missions');
body(
  'Missions are the core activity loop. You form a team of entities, commit them for a set duration, and collect rewards when they return. Missions run on ticks — the server advances the game world at a fixed interval, so timers are accurate and fair for all players.'
);

h2('Mission Basics', C.gold);
[
  ['Start a mission', 'Pick a mission, assign 1–4 idle entities, and confirm. Those entities are locked for the duration.'],
  ['Wait it out',     'The timer counts down in real time. Your entities continue working even while you\'re offline.'],
  ['Collect rewards', 'When the mission completes, claim your rewards. Entities return to idle status.'],
  ['Active mission cap', 'Your Keeper Level (account-level progression) determines how many missions you can run simultaneously.'],
].forEach(([title, desc]) => {
  h3('  ' + title, C.gold);
  body(desc, 14);
});

h2('Mission Types', C.gold);
table(
  ['Type', 'Description', 'Notes'],
  [
    ['Standard',    'Fixed duration, single outcome roll at the end.',          'Most common type. Good for consistent resource farming.'],
    ['Expedition',  'Multi-phase: team progresses through sequential stages.',  'Injuries and penalties persist across phases. Higher risk, higher reward.'],
    ['Scavenging',  'Resource-gathering focused missions.',                     'Rewards scale with FOC and LCK stats.'],
    ['Boss',        'High-difficulty single encounters.',                       'Require strong, well-built teams. Often gated by level.'],
  ],
  [80, 200, 155]
);

h2('Mission Timers & SPD', C.gold);
body(
  'Base mission duration is defined by the mission design. Your team\'s SPD stat (aggregated across all assigned entities) can shorten this — faster teams complete missions sooner. Certain player effects (buffs) can also reduce mission timers.'
);

h2('Outcomes & Rewards', C.gold);
body(
  'Every mission has tiered outcomes: Failure, Common, Uncommon, Rare, Epic, and Legendary. Your team\'s Mission Power vs. the mission\'s difficulty determines whether you succeed, and a random roll within the success range determines which tier of reward you earn.'
);
body(
  'Rewards can include currencies, items, lootboxes, XP for your entities, or rare materials. Multi-phase expeditions can issue rewards at each phase, at the end, or a combination of both.'
);

h2('Injuries', C.pink);
body(
  'If a mission fails, an entity might get injured. An injured entity is temporarily unavailable for new assignments. DEF reduces the chance of injury, and VIT shortens recovery time. Injuries are part of the risk/reward tradeoff of harder missions — there is no permanent damage.'
);

// ── PAGE 4: Outposts ─────────────────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('Outposts & Locations');
body(
  'Outposts (also called Locations) are the idle heart of the game. While missions require active decisions, outposts generate resources passively as long as you have workers assigned. They operate 24/7.'
);

h2('How Outposts Work', C.teal);
[
  ['Assign workers',    'Place idle entities into outpost worker slots. More workers = faster production.'],
  ['Build structures',  'Construct buildings inside an outpost to unlock new production chains or utility bonuses.'],
  ['Level up',          'Deposit resources to earn Outpost XP. Higher outpost levels unlock more worker slots and better buildings.'],
  ['Collect produce',   'Resources accumulate in outpost storage. Collect them to move them into your wallet.'],
].forEach(([title, desc]) => {
  h3('  ' + title, C.teal);
  body(desc, 14);
});

h2('Production Formula', C.teal);
body(
  'An outpost\'s output per tick is roughly:\n' +
  '     Output = Base Rate × Building Multiplier × Worker Multiplier × Effect Multiplier × Threat Penalty'
);
body(
  'Worker stats matter here: FOC and SPD directly scale throughput. FOC also reduces consumption (so your inputs go further). High SPD with low FOC means you produce and burn resources quickly — balance matters.'
);

h2('Threat & Corruption', C.pink);
body(
  'Outpost locations can accumulate "threat" over time if neglected or through certain game events. Threat levels above 20 apply production penalties, scaling up to a 50% penalty at maximum threat. Managing threat is part of running an efficient outpost.'
);

h2('Regions', C.teal);
body(
  'Outposts and missions are tied to Regions — distinct areas of the game world (e.g. "Frozen Wastes"). Regions can unlock region-specific synergy bonuses when you meet certain team composition requirements, and gated content becomes available as your Keeper Level grows.'
);

// ── PAGE 5: Economy & Currencies ─────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('Economy & Currencies');
body(
  'Derp Universe has a layered currency system. Different currencies are earned through different activities, ensuring that every system of the game has a purpose and that no single resource dominates everything.'
);

h2('Currency Types', C.gold);
table(
  ['Type', 'How You Earn It', 'Primary Use'],
  [
    ['Soft',      'Missions, outpost production, quests, daily check-ins.',  'Crafting, outpost upgrades, general progression.'],
    ['Hard',      'Harder missions, achievements, special events.',           'Gated upgrades, premium crafting recipes.'],
    ['Premium',   'Store purchase or rare in-game rewards.',                 'Skip timers, exclusive cosmetics, premium bundles.'],
    ['Seasonal',  'Season pass and seasonal quest rewards.',                 'Season-exclusive content and rewards.'],
    ['Event',     'Limited-time events.',                                    'Event store and exclusive items.'],
  ],
  [60, 180, 195]
);

body('All balances are tracked server-side with ledger-level precision. There is no local caching of your wallet — what you see is always the server\'s authoritative value.');

h2('Items & Inventory', C.gold);
body('Items come in several categories:');
[
  ['Material',     'Raw resources gathered from outposts or missions. Used primarily in crafting recipes.'],
  ['Consumable',   'Single-use items that apply temporary effects or instantly grant resources.'],
  ['Gear',         'Equippable items that grant stat bonuses to a specific entity. Slotted into equipment slots defined per entity type.'],
  ['Lootbox',      'Sealed rewards — open them to receive a random prize from a weighted table.'],
  ['Gift Package', 'Special bundles sent as gifts. Claimed from your Gifts tab.'],
].forEach(([title, desc]) => {
  bullet(`${title}: ${desc}`);
  doc.moveDown(0.15);
});

h2('Crafting', C.gold);
body(
  'Recipes let you convert materials (and sometimes currencies) into more valuable items or gear. Crafting takes time and runs as a background job — you can queue crafts and check back later. Your LCK stat can influence the outcome tier of a craft, potentially yielding a higher-quality result.'
);

// ── PAGE 6: Major Features ───────────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('Major Features');

h2('Daily Check-ins', C.accent);
body(
  'Log in each day to claim your daily reward. Check-in tracks have a streak mechanic — consecutive daily logins unlock better rewards. Weekly tracks run alongside daily ones, offering milestone rewards for sustained engagement. Rewards are issued as gift packages to keep your inventory tidy.'
);

h2('Quests & Achievements', C.accent);
body(
  'Quests come in three cadences:'
);
[
  ['Daily',        'Reset each UTC day. Short, achievable goals that reward consistent play.'],
  ['Weekly',       'Reset each UTC week. Larger objectives that require planning across multiple sessions.'],
  ['Achievements', 'Lifetime one-shot challenges. Once unlocked, they grant permanent bonuses (stat buffs, extra slots, cosmetics) that stay with your account forever.'],
].forEach(([title, desc]) => {
  bullet(`${title}: ${desc}`);
  doc.moveDown(0.15);
});
doc.moveDown(0.2);
body('Quest progress is tracked automatically — complete the action, then claim the reward from the Quests tab.');

h2('The Store', C.gold);
body(
  'The in-game store offers bundles, cosmetics, and premium currency packs. Limited-time offers appear with countdown timers. Payments are processed via Stripe (card) or on-chain (ADA / EVM crypto). Nothing in the store increases your stat ceiling or bypasses the game\'s time gates.'
);

h2('Effects & Powers', C.pink);
body(
  'Effects are time-limited or permanent modifiers that influence stats, timers, or production rates. They can come from missions, quests, consumables, or achievements. Powers are broader ability blueprints — think of them as talents that can be activated at the account, entity, or location level. Active effects are always shown in your character or outpost details.'
);

h2('Gifts', C.accent);
body(
  'Gifts are reward bundles that can be sent to you by the game (event rewards, admin grants, achievement milestones) or received from other players. They sit in a pending state until you claim them, at which point their contents go directly into your inventory or wallet.'
);

h2('Seasons', C.gold);
body(
  'The game operates on a seasonal cadence. Each season introduces new content — missions, locations, cosmetics, and a seasonal quest track. Seasonal currencies and rewards are specific to that season. When a season ends, your core account progress (entities, keeper level, hard currencies) carries forward into the next season.'
);

h2('Keeper Level', C.accent);
body(
  'Your Keeper Level is your global account progression metric. It is separate from individual entity levels and increases as you hit major milestones. A higher Keeper Level unlocks:'
);
[
  'More simultaneous active missions',
  'More active outpost slots',
  'Higher energy and currency caps',
  'Access to higher-tier content and regions',
].forEach(item => {
  bullet(item);
  doc.moveDown(0.1);
});

// ── PAGE 7: NFTs & Tips ───────────────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

h1('NFT Integration');
body(
  'Derp Universe supports on-chain NFT ownership on Cardano and EVM-compatible chains (Ethereum, Base, Polygon). NFT ownership is verified on login — your wallet is checked against registered collections, and matching NFTs automatically unlock their corresponding in-game benefits.'
);
body('NFT collections map to two categories:');
[
  ['Character NFTs', 'Each character NFT unlocks one additional entity slot. Your base roster is available without any NFTs — character NFTs simply expand your team size.'],
  ['Land NFTs',      'Each land NFT unlocks one additional outpost slot. More outposts means more passive production running in parallel.'],
].forEach(([title, desc]) => {
  h3(title, C.accent);
  body(desc, 10);
});
body('There are no NFTs that increase stat values, reduce cooldowns beyond defined caps, or give exclusive access to gameplay systems. The game is fully playable without NFTs.');

h2('Quick-Start Tips', C.teal);
[
  'Start with Daily Check-ins — log in every day and claim your streak rewards. They add up quickly.',
  'Assign your best entities to missions, and put your lower-stat ones to work in outposts where FOC and SPD matter most.',
  'Check outpost storage regularly. Full storage means wasted production.',
  'Always have at least one mission running — even a short easy mission is better than idle entities.',
  'Claim quests before they reset. Daily quests expire at UTC midnight.',
  'Gear up your mission team. Equipped stats are the fastest way to boost Mission Power early.',
  'Don\'t neglect VIT and DEF on your primary mission runners — injuries lock entities out of action.',
  'Season quests are time-limited. Prioritise them if you want the seasonal cosmetics and rewards.',
].forEach((tip, i) => {
  doc.moveDown(0.1);
  const y   = doc.y;
  roundedRect(L, y, 20, 16, 3, C.accentDim + '55');
  doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(8).text(String(i + 1), L + 6, y + 4, { width: 14, align: 'center' });
  doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text(tip, L + 26, y + 3, { width: W - 26 });
  doc.moveDown(0.15);
});

// ── BACK COVER ────────────────────────────────────────────────────────────────
doc.addPage();
filledRect(0, 0, doc.page.width, doc.page.height, C.bg);

for (let i = 0; i < 6; i++) {
  const colors = ['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'];
  filledRect(0, doc.page.height - 24 + i * 4, doc.page.width, 4, colors[5 - i]);
}

doc.y = 200;
doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(13)
   .text('Ready to Play?', { align: 'center' });
doc.moveDown(0.8);
doc.fillColor(C.muted).font('Helvetica').fontSize(10)
   .text('That\'s everything you need to get started.\nOpen the app, claim your first daily check-in, and send your first team on a mission.', { align: 'center', width: doc.page.width - 104, lineGap: 4 });
doc.moveDown(1.5);
filledRect(L + 60, doc.y, W - 120, 1, C.border);
doc.moveDown(1);
doc.fillColor(C.muted).font('Helvetica').fontSize(9)
   .text('For deeper game mechanics, quest design references, and content creation, see the\nContent Creator Guide alongside this document.', { align: 'center', width: doc.page.width - 104 });

doc.end();
console.log('PDF written to', OUT);

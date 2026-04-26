import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  // Test 1: bundleDef rows visible via prisma client
  const all = await (prisma as any).bundleDef.findMany();
  console.log('TEST 1 — BundleDefs in DB:', all.map((b: any) => b.id));

  // Test 2: simulate expandBundleRefs logic
  const items = [
    { type: 'bundle_ref', bundleDefId: 'bundle_starter_pack' },
    { type: 'bundle_ref', bundleDefId: 'bundle_pick_one_currency', pickMin: 2, pickMax: 2 },
    { bundle: [{ type: 'bundle_ref', bundleDefId: 'bundle_starter_pack' }], odds: 50 },
  ];

  // collect ids
  const ids = new Set<string>();
  const collect = (arr: any[]) => {
    for (const e of arr) {
      if (e?.type === 'bundle_ref') ids.add(e.bundleDefId);
      else if (Array.isArray(e?.bundle)) collect(e.bundle);
    }
  };
  collect(items);

  const rows = await (prisma as any).bundleDef.findMany({ where: { id: { in: Array.from(ids) } } });
  const defs = new Map(rows.map((r: any) => [r.id, r]));
  console.log('TEST 2 — Loaded defs:', Array.from(defs.keys()));

  const expand = (arr: any[], stack: Set<string> = new Set()): any[] =>
    arr.map((item) => {
      if (item?.type === 'bundle_ref') {
        const def: any = defs.get(item.bundleDefId);
        if (!def || !def.enabled) return { bundle: [], requirements: item.requirements };
        if (stack.has(item.bundleDefId)) return { bundle: [] };
        const next = new Set(stack); next.add(item.bundleDefId);
        const result: any = { bundle: expand(def.bundle ?? [], next) };
        const odds = item.odds ?? def.odds; if (odds != null) result.odds = odds;
        const pmin = item.pickMin ?? def.pickMin; if (pmin != null) result.pickMin = pmin;
        const pmax = item.pickMax ?? def.pickMax; if (pmax != null) result.pickMax = pmax;
        return result;
      }
      if (Array.isArray(item?.bundle)) return { ...item, bundle: expand(item.bundle, stack) };
      return item;
    });

  const expanded = expand(items);
  console.log('TEST 3 — Expansion result:');
  console.log(JSON.stringify(expanded, null, 2));

  // Test 4: missing ref
  const missing = expand([{ type: 'bundle_ref', bundleDefId: 'does_not_exist' }]);
  console.log('TEST 4 — Missing ref (should be empty bundle):', JSON.stringify(missing));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

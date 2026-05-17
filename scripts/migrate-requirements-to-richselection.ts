/**
 * migrate-requirements-to-richselection.ts
 *
 * One-shot migration: converts all legacy Requirement[] / requirementsBlock
 * JSON values stored in game-definition rows into RichSelection objects.
 *
 * Affected tables & fields:
 *   MissionDef         requirements, visibilityRequirements
 *   MissionCategoryDef requirements, visibilityRequirements
 *   RecipeDef          requirements, visibilityRequirements
 *   BuildingDef        requirements, visibilityRequirements
 *   RoomDef            requirements, visibilityRequirements
 *   ItemDef            requirements, visibilityRequirements
 *   QuestDef           requirements
 *
 * Run:
 *   pnpm ts-node -r tsconfig-paths/register scripts/migrate-requirements-to-richselection.ts
 *
 * Options (env vars):
 *   DRY_RUN=1   Log what would change without writing to the DB.
 *   TABLE=Foo   Only migrate the named table.
 */

import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_TABLE = process.env.TABLE ?? null;

const client = new PrismaClient();

type RichSelection = {
  op: 'AND' | 'OR' | 'NOT';
  rules: Array<RichSelection | RichSelectionRule>;
};

type RichSelectionRule = {
  scope: string;
  field: string;
  aggregate?: string;
  operator: string;
  value?: unknown;
  label?: string;
};

type LegacyRequirement = {
  type: string;
  key?: string;
  ids?: string[];
  value?: unknown;
  operator?: string;
  [k: string]: unknown;
};

function isLegacyArray(v: unknown): v is LegacyRequirement[] {
  return Array.isArray(v) && v.every(x => typeof x === 'object' && x !== null && 'type' in x);
}

function isRichSelection(v: unknown): v is RichSelection {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'op' in v &&
    'rules' in v &&
    Array.isArray((v as RichSelection).rules)
  );
}

function convertOne(item: LegacyRequirement): RichSelection | RichSelectionRule | null {
  const rawOp = (item.operator as string) ?? (item.type === 'flag' ? 'eq' : 'gte');
  const rssOp = rawOp === 'dne' ? 'not_exists' : rawOp;

  switch (item.type) {
    case 'keeper_level':
      return { scope: 'player', field: 'keeperLevel', operator: rssOp, value: item.value };

    case 'flag':
      return {
        scope: 'player',
        field: `flags.${item.key ?? ''}`,
        operator: rssOp,
        value: rawOp === 'exists' || rawOp === 'dne' ? undefined : item.value,
      };

    case 'has_building':
    case 'parent_has_building': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      if (ids.length === 1) {
        return { scope: 'location', field: `buildings.${ids[0]}`, aggregate: 'any', operator: 'eq', value: 1 };
      }
      return { op: 'OR', rules: ids.map(id => ({ scope: 'location', field: `buildings.${id}`, aggregate: 'any', operator: 'eq', value: 1 })) };
    }

    case 'has_room': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      if (ids.length === 1) {
        return { scope: 'location', field: `rooms.${ids[0]}`, aggregate: 'any', operator: 'eq', value: 1 };
      }
      return { op: 'OR', rules: ids.map(id => ({ scope: 'location', field: `rooms.${id}`, aggregate: 'any', operator: 'eq', value: 1 })) };
    }

    case 'parent_has_room': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      if (ids.length === 1) {
        return { scope: 'building', field: `rooms.${ids[0]}`, operator: 'eq', value: 1 };
      }
      return { op: 'OR', rules: ids.map(id => ({ scope: 'building', field: `rooms.${id}`, operator: 'eq', value: 1 })) };
    }

    case 'in_region': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      return { scope: 'location', field: 'regionId', aggregate: 'any', operator: 'in', value: ids };
    }

    case 'team_size': {
      const sz_op = (item.operator ?? 'gte') as string;
      return { scope: 'context', field: 'teamSize', operator: sz_op, value: item.value };
    }

    default:
      return {
        scope: 'player',
        field: `${item.type}.${item.key ?? ''}`,
        operator: rssOp,
        value: item.value,
        label: `Migrated legacy: ${item.type}`,
      };
  }
}

function convertLegacyArray(items: LegacyRequirement[]): RichSelection {
  const rules: Array<RichSelection | RichSelectionRule> = [];
  for (const item of items) {
    const r = convertOne(item);
    if (r !== null) rules.push(r);
  }
  return { op: 'AND', rules };
}

function migrateField(value: unknown): { converted: boolean; result: unknown } {
  if (!value) return { converted: false, result: value };
  if (isRichSelection(value)) return { converted: false, result: value };
  if (isLegacyArray(value)) {
    return { converted: true, result: convertLegacyArray(value) };
  }
  if (Array.isArray(value) && value.length === 0) {
    return { converted: false, result: null };
  }
  console.warn('  ⚠ Unknown field shape — skipping:', JSON.stringify(value).slice(0, 80));
  return { converted: false, result: value };
}

interface TableConfig {
  model: string;
  fields: string[];
  findMany: () => Promise<Array<{ id: string; [k: string]: unknown }>>;
  update: (id: string, data: Record<string, unknown>) => Promise<void>;
}

function makeTable(
  model: string,
  fields: string[],
  prismaDelegate: { findMany: (args?: any) => Promise<any[]>; update: (args: any) => Promise<any> },
): TableConfig {
  return {
    model,
    fields,
    findMany: () => prismaDelegate.findMany({ select: Object.fromEntries([['id', true], ...fields.map(f => [f, true])]) }),
    update: (id, data) => prismaDelegate.update({ where: { id }, data }),
  };
}

async function run() {
  console.log(`\nRequirements → RichSelection migration${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const reqFields = ['requirements', 'visibilityRequirements'];

  const tables: TableConfig[] = [
    makeTable('MissionDef',         reqFields,               (client as any).missionDef),
    makeTable('MissionCategoryDef', reqFields,               (client as any).missionCategoryDef),
    makeTable('RecipeDef',          reqFields,               (client as any).recipeDef),
    makeTable('BuildingDef',        reqFields,               (client as any).buildingDef),
    makeTable('RoomDef',            reqFields,               (client as any).roomDef),
    makeTable('ItemDef',            reqFields,               (client as any).itemDef),
    makeTable('QuestDef',           ['requirements'],        (client as any).questDef),
  ];

  let totalRows = 0;
  let totalUpdated = 0;

  for (const table of tables) {
    if (ONLY_TABLE && table.model !== ONLY_TABLE) continue;

    console.log(`\n── ${table.model}`);
    const rows = await table.findMany();
    console.log(`   ${rows.length} rows`);

    for (const row of rows) {
      const update: Record<string, unknown> = {};

      for (const field of table.fields) {
        const { converted, result } = migrateField(row[field]);
        if (converted) {
          update[field] = result;
          console.log(`   ✓ ${row.id}  ${field}  legacy[${(row[field] as any[]).length}] → RichSelection(${(result as RichSelection).rules.length} rules)`);
        }
      }

      if (Object.keys(update).length > 0) {
        totalUpdated++;
        if (!DRY_RUN) {
          await table.update(row.id as string, update);
        }
      }
      totalRows++;
    }
  }

  console.log(`\nDone — ${totalRows} rows scanned, ${totalUpdated} updated${DRY_RUN ? ' (dry-run, no writes)' : ''}\n`);
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => client.$disconnect());

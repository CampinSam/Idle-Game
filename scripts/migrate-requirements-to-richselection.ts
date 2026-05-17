/**
 * migrate-requirements-to-richselection.ts
 *
 * One-shot migration: converts all legacy Requirement[] / SynergySelector /
 * SynergyRuleContext JSON values into RichSelection objects.
 *
 * Affected tables & fields:
 *   MissionDef              requirements, visibilityRequirements
 *   MissionCategoryDef      requirements, visibilityRequirements
 *   RecipeDef               requirements, visibilityRequirements
 *   BuildingDef             requirements, visibilityRequirements
 *   RoomDef                 requirements, visibilityRequirements
 *   ItemDef                 requirements, visibilityRequirements
 *   QuestDef                requirements
 *   LocationDefinition      requirements, visibilityRequirements
 *   SynergyRule             sourceSelector, targetSelector, context
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

type SynergySelector = Record<string, unknown>;
type SynergyRuleContext = Record<string, unknown>;

// ─── RichSelection detection ───────────────────────────────────────────────

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

function isLegacyRequirementArray(v: unknown): v is LegacyRequirement[] {
  return Array.isArray(v) && v.every(x => typeof x === 'object' && x !== null && 'type' in x);
}

function isEmptySelectorOrContext(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
  return Object.keys(v).length === 0;
}

// ─── Requirement[] → RichSelection ─────────────────────────────────────────

function convertRequirement(item: LegacyRequirement): RichSelection | RichSelectionRule | null {
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

    case 'has_building': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      if (ids.length === 1) {
        return { scope: 'location', field: `buildings.${ids[0]}`, aggregate: 'any', operator: 'eq', value: 1 };
      }
      return { op: 'OR', rules: ids.map(id => ({ scope: 'location', field: `buildings.${id}`, aggregate: 'any', operator: 'eq', value: 1 })) };
    }

    case 'parent_has_building': {
      const ids = Array.isArray(item.ids) ? item.ids : [];
      if (ids.length === 0) return null;
      if (ids.length === 1) {
        return { scope: 'currentLocation', field: `buildings.${ids[0]}`, operator: 'eq', value: 1 };
      }
      return { op: 'OR', rules: ids.map(id => ({ scope: 'currentLocation', field: `buildings.${id}`, operator: 'eq', value: 1 })) };
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
      return { scope: 'context', field: 'teamSize', operator: rawOp, value: item.value };
    }

    case 'trait': {
      const key = item.key ?? '';
      const value = typeof item.value === 'number' ? item.value : 1;
      return { scope: 'entity', field: `traits.${key}`, aggregate: 'sum', operator: rssOp, value };
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
    const r = convertRequirement(item);
    if (r !== null) rules.push(r);
  }
  return { op: 'AND', rules };
}

function migrateRequirementField(value: unknown): { converted: boolean; result: unknown } {
  if (!value) return { converted: false, result: null };
  if (isRichSelection(value)) return { converted: false, result: value };
  if (isLegacyRequirementArray(value)) {
    return { converted: true, result: convertLegacyArray(value) };
  }
  if (Array.isArray(value) && value.length === 0) {
    return { converted: false, result: null };
  }
  console.warn('  ⚠ Unknown field shape — skipping:', JSON.stringify(value).slice(0, 80));
  return { converted: false, result: value };
}

// ─── SynergySelector → RichSelection ───────────────────────────────────────

function selectorToRichSelection(selector: SynergySelector): RichSelection | null {
  type R = RichSelection | RichSelectionRule;
  const rules: R[] = [];

  if ((selector.entityTypes as string[])?.length) {
    rules.push({ scope: 'entity', field: 'entityType', aggregate: 'any', operator: 'in', value: selector.entityTypes });
  }
  if ((selector.speciesIds as string[])?.length) {
    rules.push({ scope: 'entity', field: 'speciesId', aggregate: 'any', operator: 'in', value: selector.speciesIds });
  }
  if ((selector.collections as string[])?.length) {
    rules.push({ scope: 'entity', field: 'collectionId', aggregate: 'any', operator: 'in', value: selector.collections });
  }
  if ((selector.entityIds as string[])?.length) {
    rules.push({ scope: 'entity', field: 'id', aggregate: 'any', operator: 'in', value: selector.entityIds });
  }
  if ((selector.rarities as string[])?.length) {
    rules.push({ scope: 'entity', field: 'rarity', aggregate: 'any', operator: 'in', value: selector.rarities });
  }
  if ((selector.regions as string[])?.length) {
    rules.push({ scope: 'entity', field: 'regionId', aggregate: 'any', operator: 'in', value: selector.regions });
  }
  if ((selector.factions as string[])?.length) {
    rules.push({ op: 'OR', rules: (selector.factions as string[]).map(f => ({ scope: 'entity', field: 'traitValues', aggregate: 'any', operator: 'contains', value: f } as RichSelectionRule)) });
  }
  if ((selector.traitsAny as string[])?.length) {
    const ta = selector.traitsAny as string[];
    if (ta.length === 1) {
      rules.push({ scope: 'entity', field: 'traitValues', aggregate: 'any', operator: 'contains', value: ta[0] });
    } else {
      rules.push({ op: 'OR', rules: ta.map(t => ({ scope: 'entity', field: 'traitValues', aggregate: 'any', operator: 'contains', value: t } as RichSelectionRule)) });
    }
  }
  if ((selector.traitsAll as string[])?.length) {
    for (const t of selector.traitsAll as string[]) {
      rules.push({ scope: 'entity', field: 'traitValues', aggregate: 'any', operator: 'contains', value: t });
    }
  }
  if (selector.minTraitCount !== undefined) {
    rules.push({ scope: 'entity', field: 'traitCount', aggregate: 'any', operator: 'gte', value: selector.minTraitCount });
  }
  if ((selector.locationTypes as string[])?.length) {
    const lt = selector.locationTypes as string[];
    if (lt.length === 1) {
      rules.push({ scope: 'entity', field: 'locationTypes', aggregate: 'any', operator: 'contains', value: lt[0] });
    } else {
      rules.push({ op: 'OR', rules: lt.map(l => ({ scope: 'entity', field: 'locationTypes', aggregate: 'any', operator: 'contains', value: l } as RichSelectionRule)) });
    }
  }
  if ((selector.buildingTagsAny as string[])?.length) {
    const bt = selector.buildingTagsAny as string[];
    if (bt.length === 1) {
      rules.push({ scope: 'entity', field: 'buildingTags', aggregate: 'any', operator: 'contains', value: bt[0] });
    } else {
      rules.push({ op: 'OR', rules: bt.map(b => ({ scope: 'entity', field: 'buildingTags', aggregate: 'any', operator: 'contains', value: b } as RichSelectionRule)) });
    }
  }
  if ((selector.missionTagsAny as string[])?.length) {
    const mt = selector.missionTagsAny as string[];
    if (mt.length === 1) {
      rules.push({ scope: 'entity', field: 'missionTags', aggregate: 'any', operator: 'contains', value: mt[0] });
    } else {
      rules.push({ op: 'OR', rules: mt.map(m => ({ scope: 'entity', field: 'missionTags', aggregate: 'any', operator: 'contains', value: m } as RichSelectionRule)) });
    }
  }
  if (rules.length === 0) return null;
  return { op: 'AND', rules };
}

function contextToRichSelection(ruleCtx: SynergyRuleContext): RichSelection | null {
  type R = RichSelection | RichSelectionRule;
  const rules: R[] = [];
  if ((ruleCtx.activityTypes as string[])?.length) {
    rules.push({ scope: 'context', field: 'activityType', operator: 'in', value: ruleCtx.activityTypes });
  }
  if ((ruleCtx.missionTypes as string[])?.length) {
    rules.push({ scope: 'context', field: 'missionType', operator: 'in', value: ruleCtx.missionTypes });
  }
  if ((ruleCtx.missionTagsAny as string[])?.length) {
    const mt = ruleCtx.missionTagsAny as string[];
    if (mt.length === 1) {
      rules.push({ scope: 'context', field: 'missionTags', operator: 'contains', value: mt[0] });
    } else {
      rules.push({ op: 'OR', rules: mt.map(m => ({ scope: 'context', field: 'missionTags', operator: 'contains', value: m } as RichSelectionRule)) });
    }
  }
  if ((ruleCtx.regionIds as string[])?.length) {
    rules.push({ scope: 'context', field: 'regionId', operator: 'in', value: ruleCtx.regionIds });
  }
  if ((ruleCtx.seasonIds as string[])?.length) {
    rules.push({ scope: 'context', field: 'seasonId', operator: 'in', value: ruleCtx.seasonIds });
  }
  if (ruleCtx.requiresTeamSizeMin !== undefined) {
    rules.push({ scope: 'context', field: 'teamSize', operator: 'gte', value: ruleCtx.requiresTeamSizeMin });
  }
  if (ruleCtx.requiresTeamSizeMax !== undefined) {
    rules.push({ scope: 'context', field: 'teamSize', operator: 'lte', value: ruleCtx.requiresTeamSizeMax });
  }
  if (rules.length === 0) return null;
  return { op: 'AND', rules };
}

function migrateSelectorField(value: unknown): { converted: boolean; result: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { converted: false, result: null };
  if (isRichSelection(value)) return { converted: false, result: value };
  if (isEmptySelectorOrContext(value)) return { converted: false, result: null };
  const richSel = selectorToRichSelection(value as SynergySelector);
  return { converted: richSel !== null, result: richSel };
}

function migrateContextField(value: unknown): { converted: boolean; result: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { converted: false, result: null };
  if (isRichSelection(value)) return { converted: false, result: value };
  if (isEmptySelectorOrContext(value)) return { converted: false, result: null };
  const richSel = contextToRichSelection(value as SynergyRuleContext);
  return { converted: richSel !== null, result: richSel };
}

// ─── Table definitions ──────────────────────────────────────────────────────

interface TableConfig {
  model: string;
  fields: Array<{ name: string; kind: 'requirement' | 'selector' | 'context' }>;
  findMany: () => Promise<Array<{ id: string; [k: string]: unknown }>>;
  update: (id: string, data: Record<string, unknown>) => Promise<void>;
}

function makeReqTable(
  model: string,
  fields: string[],
  prismaDelegate: { findMany: (args?: any) => Promise<any[]>; update: (args: any) => Promise<any> },
): TableConfig {
  return {
    model,
    fields: fields.map(f => ({ name: f, kind: 'requirement' as const })),
    findMany: () =>
      prismaDelegate.findMany({
        select: Object.fromEntries([['id', true], ...fields.map(f => [f, true])]),
      }),
    update: (id, data) => prismaDelegate.update({ where: { id }, data }),
  };
}

async function run() {
  console.log(`\nRequirements/Synergy → RichSelection migration${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const reqFields = ['requirements', 'visibilityRequirements'];

  const reqTables: TableConfig[] = [
    makeReqTable('MissionDef',         reqFields,          (client as any).missionDef),
    makeReqTable('MissionCategoryDef', reqFields,          (client as any).missionCategoryDef),
    makeReqTable('RecipeDef',          reqFields,          (client as any).recipeDef),
    makeReqTable('BuildingDef',        reqFields,          (client as any).buildingDef),
    makeReqTable('RoomDef',            reqFields,          (client as any).roomDef),
    makeReqTable('ItemDef',            reqFields,          (client as any).itemDef),
    makeReqTable('QuestDef',           ['requirements'],   (client as any).questDef),
    makeReqTable('LocationDefinition', reqFields,          (client as any).locationDefinition),
  ];

  const synergyTable: TableConfig = {
    model: 'SynergyRule',
    fields: [
      { name: 'sourceSelector', kind: 'selector' },
      { name: 'targetSelector', kind: 'selector' },
      { name: 'context', kind: 'context' },
    ],
    findMany: () =>
      (client as any).synergyRule.findMany({
        select: { id: true, sourceSelector: true, targetSelector: true, context: true },
      }),
    update: (id, data) => (client as any).synergyRule.update({ where: { id }, data }),
  };

  const allTables = [...reqTables, synergyTable];

  let totalRows = 0;
  let totalUpdated = 0;

  for (const table of allTables) {
    if (ONLY_TABLE && table.model !== ONLY_TABLE) continue;

    console.log(`\n── ${table.model}`);
    const rows = await table.findMany();
    console.log(`   ${rows.length} rows`);

    for (const row of rows) {
      const update: Record<string, unknown> = {};

      for (const { name: field, kind } of table.fields) {
        let result: { converted: boolean; result: unknown };
        if (kind === 'requirement') {
          result = migrateRequirementField(row[field]);
        } else if (kind === 'selector') {
          result = migrateSelectorField(row[field]);
        } else {
          result = migrateContextField(row[field]);
        }

        if (result.converted) {
          const src = kind === 'requirement'
            ? `legacy[${(row[field] as any[]).length}]`
            : `${kind}(${JSON.stringify(row[field]).slice(0, 40)})`;
          const dst = isRichSelection(result.result)
            ? `RichSelection(${(result.result as RichSelection).rules.length} rules)`
            : 'null';
          console.log(`   ✓ ${row.id}  ${field}  ${src} → ${dst}`);
          update[field] = result.result;
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

  console.log(
    `\nDone — ${totalRows} rows scanned, ${totalUpdated} updated${DRY_RUN ? ' (dry-run, no writes)' : ''}\n`,
  );
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => client.$disconnect());

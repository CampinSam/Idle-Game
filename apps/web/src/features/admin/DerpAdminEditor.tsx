import React, { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, Check, Upload, Download, Copy, Search, X, Edit3, Save, FileText, Database, Zap, Package, Users, Map, Building, Layers, Palette, Target, Gift, Calendar, Settings, AlertCircle, Info, ChevronUp, ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { adminApi, setAdminKey } from './adminApi';
import { api } from '../../services/api';

const TABLE_API_KEYS: Record<string, string> = {
  Currency: 'currency',
  ItemDef: 'itemDef',
  BodySchema: 'bodySchema',
  EquipmentSchema: 'equipmentSchema',
  ProgressionProfile: 'progressionProfile',
  TraitDefinition: 'traitDefinition',
  EntityDefinition: 'entityDefinition',
  RegionDefinition: 'regionDefinition',
  LocationDefinition: 'locationDefinition',
  BuildingDef: 'buildingDef',
  RoomDef: 'roomDef',
  DisplayDef: 'displayDef',
  MissionCategoryDef: 'missionCategoryDef',
  MissionDef: 'missionDef',
  RecipeDef: 'recipeDef',
  EventDefinition: 'eventDefinition',
  GiftDef: 'giftDef',
  ModalDef: 'modalDef',
};

const FALLBACK_ENUMS: Record<string, string[]> = {
  currencyType: ['SOFT', 'HARD', 'PREMIUM', 'SEASONAL', 'EVENT', 'GUILD'],
  itemType: ['MATERIAL', 'POTION', 'CONSUMABLE', 'GEAR', 'QUEST'],
  itemRarity: ['COMMON', 'UNCOMMON', 'SCARCE', 'ADVANCED', 'RARE', 'ULTRA_RARE', 'EPIC', 'MYTHIC', 'LEGENDARY'],
  itemCategory: ['MISC', 'CRAFTING', 'COMBAT', 'EXPLORATION', 'QUEST_ITEMS', 'ENHANCEMENT'],
  xpCurve: ['linear', 'exp', 'custom'],
  growthRate: ['flat', 'linear', 'exp'],
  operator: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'dne'],
  requirementType: ['keeper_level', 'team_size', 'flag', 'trait', 'building', 'currency', 'item', 'has_building', 'has_room', 'parent_has_building', 'parent_has_room', 'in_region'],
  rewardType: ['entity_xp', 'keeper_xp', 'currency', 'item', 'flag', 'text', 'emitEvent'],
  flagOperation: ['set', 'increment', 'decrement', 'invert', 'remove'],
  skipType: ['absolute', 'scaling'],
  giftRewardType: ['currency', 'item', 'entity', 'bundle'],
  eventKind: ['system', 'seasonal', 'promotional'],
  buildingCategory: ['GENERATOR', 'DEFENSE', 'STORAGE'],
  handlerKey: ['createGiftForPlayer'],
  stats: ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'],
  archetypes: ['Dave', 'Astro', 'Magician', 'Ninja', 'Redneck', 'Stoner', 'DJ', 'Viking', 'Monk', 'Corpo', 'Cyborg', 'Buff', 'MadScientist', 'Deity'],
  bodySlots: ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'],
  equipmentSlots: ['weapon', 'armor', 'accessory'],
};

const EnumsContext = createContext<Record<string, string[]>>(FALLBACK_ENUMS);
const useEnums = () => useContext(EnumsContext);

const TABLE_SCHEMAS: Record<string, any> = {
  Currency: {
    icon: Zap,
    color: '#FFD700',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier (e.g. soft_arcanium)' },
      name: { type: 'string', required: true, description: 'Display name' },
      symbol: { type: 'string', description: 'Short symbol (e.g. 💎)' },
      iconKey: { type: 'string', description: 'Icon key for display' },
      type: { type: 'enum', enum: 'currencyType', required: true, description: 'Currency type' },
      seasonId: { type: 'string', description: 'Season ID (for SEASONAL type)' },
      isTradeable: { type: 'boolean', default: false, description: 'Can players trade this?' },
      isSpendable: { type: 'boolean', default: true, description: 'Can be spent?' },
      decimals: { type: 'number', default: 0, description: 'Decimal precision' },
      cap: { type: 'number', description: 'Max amount (blank = unlimited)' },
    }
  },
  ItemDef: {
    icon: Package,
    color: '#4ECDC4',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      version: { type: 'number', default: 1, description: 'Schema version' },
      type: { type: 'enum', enum: 'itemType', required: true, description: 'Item type' },
      rarity: { type: 'enum', enum: 'itemRarity', default: 'COMMON', description: 'Rarity tier' },
      name: { type: 'string', required: true, description: 'Display name' },
      description: { type: 'string', description: 'Flavor text' },
      iconKey: { type: 'string', description: 'Icon key' },
      iconUrl: { type: 'string', description: 'Direct icon URL' },
      uiColor: { type: 'color', description: 'CSS color for UI accent' },
      category: { type: 'enum', enum: 'itemCategory', default: 'MISC', description: 'Item category' },
      groups: { type: 'stringArray', default: [], description: 'Tags for filtering' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      stackable: { type: 'boolean', default: false, description: 'Can stack in inventory?' },
      maxStack: { type: 'number', description: 'Max stack size' },
      uniqueInstance: { type: 'boolean', default: false, description: 'Each item unique?' },
      tradable: { type: 'boolean', default: true, description: 'Can be traded?' },
      bindOnEquip: { type: 'boolean', default: false, description: 'Binds when equipped?' },
      bindOnPickup: { type: 'boolean', default: false, description: 'Binds when acquired?' },
      hasState: { type: 'boolean', default: false, description: 'Has dynamic state?' },
      stateSchema: { type: 'json', description: 'JSON Schema for state' },
      equipData: { type: 'equipData', description: 'Equipment slot and stats' },
      statModifiers: { type: 'json', description: 'Passive stat modifiers' },
      passiveEffects: { type: 'json', description: 'Passive effects' },
      consumableData: { type: 'consumableData', description: 'Consumable behavior' },
      craftingData: { type: 'json', description: 'Crafting metadata' },
      data: { type: 'json', default: {}, description: 'Extra data' },
      seasonId: { type: 'string', description: 'Season ID' },
    }
  },
  EntityDefinition: {
    icon: Users,
    color: '#9B59B6',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      speciesId: { type: 'string', required: true, description: 'Species identifier' },
      bodySchemaId: { type: 'ref', refTable: 'BodySchema', required: true, description: 'References BodySchema' },
      equipmentSchemaId: { type: 'ref', refTable: 'EquipmentSchema', required: true, description: 'References EquipmentSchema' },
      progressionProfileId: { type: 'ref', refTable: 'ProgressionProfile', required: true, description: 'References ProgressionProfile' },
      rules: { type: 'levelRules', default: {}, description: 'Level-based rules' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  BodySchema: {
    icon: Layers,
    color: '#E74C3C',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      slots: { type: 'bodySlots', default: {}, description: 'Map of slot → allowed archetypes' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  EquipmentSchema: {
    icon: Settings,
    color: '#3498DB',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      schema: { type: 'equipmentSlots', default: {}, description: 'Map of slot → max count' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  ProgressionProfile: {
    icon: ChevronUp,
    color: '#2ECC71',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      leveling: { type: 'boolean', default: true, description: 'Can level up?' },
      ascension: { type: 'boolean', default: true, description: 'Can ascend?' },
      mastery: { type: 'boolean', default: true, description: 'Can gain mastery?' },
      prestigeEligible: { type: 'boolean', default: true, description: 'Eligible for prestige?' },
      maxLevel: { type: 'number', default: 50, description: 'Maximum level cap' },
      ascensionCap: { type: 'number', default: 5, description: 'Maximum ascension tier' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  TraitDefinition: {
    icon: Zap,
    color: '#F39C12',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      archetype: { type: 'string', required: true, description: 'Display name of archetype' },
      slotStats: { type: 'slotStats', default: {}, description: 'Nested map of slot → stat bonuses' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      emoji: { type: 'string', description: 'Emoji icon for this archetype (e.g. 🥷)' },
      color: { type: 'color', description: 'Accent color for this archetype' },
      gradient: { type: 'string', description: 'CSS gradient string for card backgrounds' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  RegionDefinition: {
    icon: Map,
    color: '#1ABC9C',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier (snake_case)' },
      displayName: { type: 'string', required: true, description: 'Human-readable name' },
      biome: { type: 'string', description: 'Biome type' },
      imageKey: { type: 'string', description: 'Region image slug (e.g. derpshire-valley) — used to resolve /images/regions/<imageKey>.png' },
      accentColor: { type: 'color', description: 'Accent color for region UI elements' },
      modifiers: { type: 'json', default: {}, description: 'Region-wide modifiers' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  LocationDefinition: {
    icon: Building,
    color: '#8E44AD',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      kind: { type: 'string', default: 'outpost_fungible', description: 'Location type' },
      regionId: { type: 'ref', refTable: 'RegionDefinition', description: 'Region reference' },
      isUnique: { type: 'boolean', default: false, description: 'Only one per player?' },
      rules: { type: 'levelRules', default: {}, description: 'Level-based rules' },
      productionProfile: { type: 'json', default: {}, description: 'Production configuration' },
      requirements: { type: 'requirements', default: [], description: 'Acquisition conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  BuildingDef: {
    icon: Building,
    color: '#D35400',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      description: { type: 'string', description: 'Flavor text' },
      iconKey: { type: 'string', description: 'Emoji or icon key for this building (e.g. ⚡)' },
      category: { type: 'enum', enum: 'buildingCategory', description: 'Building category for grouping and icon fallback' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      rules: { type: 'levelRules', default: {}, description: 'Level-based rules' },
      requirements: { type: 'requirements', default: [], description: 'Construction conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      activeModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown while building is under construction' },
      completedModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown when construction completes' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  RoomDef: {
    icon: Layers,
    color: '#16A085',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      description: { type: 'string', description: 'Flavor text' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      rules: { type: 'levelRules', default: {}, description: 'Level-based rules' },
      requirements: { type: 'requirements', default: [], description: 'Construction conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  DisplayDef: {
    icon: Palette,
    color: '#E91E63',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      borderColor: { type: 'color', description: 'CSS border color' },
      backgroundImage: { type: 'string', description: 'Background image URL' },
      cardBackground: { type: 'string', description: 'CSS background' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  MissionCategoryDef: {
    icon: Target,
    color: '#673AB7',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      parentId: { type: 'ref', refTable: 'MissionCategoryDef', description: 'Parent category' },
      displayDefId: { type: 'ref', refTable: 'DisplayDef', description: 'Visual styling' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      requirements: { type: 'requirements', default: [], description: 'Access conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      enabled: { type: 'boolean', default: true, description: 'Is active?' },
      sortOrder: { type: 'number', default: 0, description: 'Display order' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  MissionDef: {
    icon: Target,
    color: '#FF5722',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      description: { type: 'string', description: 'Flavor text' },
      type: { type: 'string', required: true, description: 'Mission type' },
      category: { type: 'string', description: 'Grouping category' },
      group: { type: 'string', description: 'Sub-group' },
      difficulty: { type: 'number', default: 0, description: 'Difficulty rating' },
      minSuccessChance: { type: 'number', default: 0, description: 'Min success chance (0–100)' },
      maxSuccessChance: { type: 'number', default: 100, description: 'Max success chance (0–100)' },
      timer: { type: 'timer', description: 'Duration and skip settings' },
      success: { type: 'outcomeBlock', description: 'Success outcome' },
      failure: { type: 'outcomeBlock', description: 'Failure outcome' },
      requirements: { type: 'requirements', default: [], description: 'All conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      rewardPreview: { type: 'json', default: [], description: 'Reward preview' },
      enabled: { type: 'boolean', default: true, description: 'Is active?' },
      displayDefId: { type: 'ref', refTable: 'DisplayDef', description: 'Visual styling' },
      missionCategoryDefId: { type: 'ref', refTable: 'MissionCategoryDef', description: 'Category grouping' },
      activeModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown while mission is active/in-progress' },
      completedModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown after mission completes' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  RecipeDef: {
    icon: FileText,
    color: '#795548',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      description: { type: 'string', description: 'Flavor text' },
      category: { type: 'string', description: 'Grouping category' },
      group: { type: 'string', description: 'Sub-group' },
      cost: { type: 'costArray', default: [], description: 'Crafting cost (array of {type, id, amount})' },
      timer: { type: 'timer', description: 'Duration and skip settings' },
      requiredKeeperLevel: { type: 'number', default: 1, description: 'Min keeper level' },
      rewards: { type: 'json', default: {}, description: 'Crafting output' },
      requirements: { type: 'requirements', default: [], description: 'Crafting conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
      activeModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown while recipe is crafting' },
      completedModalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown when crafting is collected' },
      data: { type: 'json', default: {}, description: 'Extra data' },
    }
  },
  EventDefinition: {
    icon: Calendar,
    color: '#009688',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Human-readable name' },
      version: { type: 'number', default: 1, description: 'Schema version' },
      kind: { type: 'enum', enum: 'eventKind', default: 'system', description: 'Event kind' },
      handlerKey: { type: 'enum', enum: 'handlerKey', required: true, description: 'Handler function' },
      security: { type: 'eventSecurity', default: {}, description: 'Access control' },
      inputSchema: { type: 'json', default: {}, description: 'Expected payload schema' },
      enabled: { type: 'boolean', default: true, description: 'Is active?' },
    }
  },
  GiftDef: {
    icon: Gift,
    color: '#E91E63',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier' },
      name: { type: 'string', required: true, description: 'Display name' },
      version: { type: 'number', default: 1, description: 'Schema version' },
      presentation: { type: 'giftPresentation', default: {}, description: 'Visual properties' },
      claimRules: { type: 'giftClaimRules', default: {}, description: 'Claiming behavior' },
      rewardSpec: { type: 'giftRewardSpec', default: {}, description: 'Reward on claim' },
      enabled: { type: 'boolean', default: true, description: 'Can create instances?' },
      modalDefId: { type: 'ref', refTable: 'ModalDef', description: 'Custom modal shown when this gift is opened' },
    }
  },
  ModalDef: {
    icon: FileText,
    color: '#607D8B',
    fields: {
      id: { type: 'string', required: true, description: 'Unique identifier (e.g. modal_mission_complete)' },
      name: { type: 'string', required: true, description: 'Admin-facing name' },
      description: { type: 'string', description: 'Notes on what this modal is for' },
      version: { type: 'number', default: 1, description: 'Schema version' },
      spec: { type: 'json', default: {}, description: 'ModalSpecV1 overrides: { header?, body?, buttons?, replaceBody? }' },
      enabled: { type: 'boolean', default: true, description: 'Active?' },
    }
  },
};

const generateId = (): string => `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const deepClone = (obj: any): any => JSON.parse(JSON.stringify(obj));

const validateRecord = (tableName: string, record: any, allData: any, originalId?: string): any[] => {
  const schema = TABLE_SCHEMAS[tableName];
  const errors: any[] = [];

  Object.entries(schema.fields).forEach(([fieldName, fieldDef]: [string, any]) => {
    if (fieldDef.required && (record[fieldName] === undefined || record[fieldName] === '')) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
    }
  });

  Object.entries(schema.fields).forEach(([fieldName, fieldDef]: [string, any]) => {
    if (fieldDef.type === 'ref' && record[fieldName]) {
      const refTable = fieldDef.refTable;
      const refData = allData[refTable] || [];
      if (!refData.find((r: any) => r.id === record[fieldName])) {
        errors.push({ field: fieldName, message: `Reference "${record[fieldName]}" not found in ${refTable}` });
      }
    }
  });

  const tableData = allData[tableName] || [];
  if (originalId) {
    const others = tableData.filter((r: any) => r.id !== originalId);
    if (others.some((r: any) => r.id === record.id)) {
      errors.push({ field: 'id', message: `Duplicate ID: ${record.id}` });
    }
  } else {
    const duplicates = tableData.filter((r: any) => r.id === record.id && r !== record);
    if (duplicates.length > 0) {
      errors.push({ field: 'id', message: `Duplicate ID: ${record.id}` });
    }
  }

  return errors;
};

const FieldLabel: React.FC<{ label: string; required?: boolean; description?: string }> = ({ label, required, description }) => (
  <div className="flex items-center gap-2 mb-1">
    <label className="text-sm font-medium text-cyan-300">{label}</label>
    {required && <span className="text-red-400 text-xs">*</span>}
    {description && (
      <div className="group relative">
        <Info size={12} className="text-gray-500 cursor-help" />
        <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-gray-800 text-xs text-gray-300 p-2 rounded shadow-lg w-48 z-50">
          {description}
        </div>
      </div>
    )}
  </div>
);

const StringField: React.FC<{ value: any; onChange: (v: any) => void; placeholder?: string; error?: any }> = ({ value, onChange, placeholder, error }) => (
  <input
    type="text"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
  />
);

const NumberField: React.FC<{ value: any; onChange: (v: any) => void; step?: number; min?: number; max?: number; error?: any }> = ({ value, onChange, step = 1, min, max, error }) => (
  <input
    type="number"
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    step={step}
    min={min}
    max={max}
    className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
  />
);

const BooleanField: React.FC<{ value: any; onChange: (v: any) => void; label?: string }> = ({ value, onChange }) => (
  <div className="flex items-center gap-3">
    <button
      onClick={() => onChange(true)}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${value === true ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
    >
      Yes
    </button>
    <button
      onClick={() => onChange(false)}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${value === false ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
    >
      No
    </button>
  </div>
);

const EnumField: React.FC<{ value: any; onChange: (v: any) => void; options: string[]; error?: any }> = ({ value, onChange, options, error }) => (
  <select
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
  >
    <option value="">-- Select --</option>
    {options.map(opt => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
  </select>
);

const ColorField: React.FC<{ value: any; onChange: (v: any) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={value || '#000000'}
      onChange={(e) => onChange(e.target.value)}
      className="w-10 h-10 rounded cursor-pointer bg-transparent border-0"
    />
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="#RRGGBB"
      className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
    />
  </div>
);

const StringArrayField: React.FC<{ value?: string[]; onChange: (v: string[]) => void }> = ({ value = [], onChange }) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = () => {
    if (inputValue.trim() && !value.includes(inputValue.trim())) {
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };

  const removeTag = (index: number) => {
    const newValue = [...value];
    newValue.splice(index, 1);
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-cyan-900/50 text-cyan-300 px-2 py-0.5 rounded text-xs">
            {tag}
            <button onClick={() => removeTag(i)} className="hover:text-red-400">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder="Add tag..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-cyan-500"
        />
        <button onClick={addTag} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 rounded text-white text-sm">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

const RefField: React.FC<{ value: any; onChange: (v: any) => void; refTable: string; allData: any; error?: any }> = ({ value, onChange, refTable, allData, error }) => {
  const options = (allData[refTable] || []).map((r: any) => r.id);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
    >
      <option value="">-- None --</option>
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
};

const JsonField: React.FC<{ value: any; onChange: (v: any) => void; error?: any }> = ({ value, onChange, error }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value || {}, null, 2));
  }, [value]);

  const handleChange = (newText: string) => {
    setText(newText);
    try {
      const parsed = JSON.parse(newText);
      setParseError(null);
      onChange(parsed);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className={`w-full bg-gray-800 border ${parseError || error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500 transition-colors min-h-[100px]`}
        rows={5}
      />
      {parseError && <p className="text-red-400 text-xs mt-1">{parseError}</p>}
    </div>
  );
};

const RequirementEditor: React.FC<{ requirement: any; onChange: (v: any) => void; onRemove: () => void; allData: any }> = ({ requirement, onChange, onRemove }) => {
  const enums = useEnums();
  const reqType = requirement.type || 'keeper_level';
  const needsKey = ['flag', 'trait', 'building', 'currency', 'item'].includes(reqType);
  const needsIds = ['has_building', 'has_room', 'parent_has_building', 'parent_has_room', 'in_region'].includes(reqType);

  return (
    <div className="bg-gray-800/50 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <select
          value={reqType}
          onChange={(e) => onChange({ ...requirement, type: e.target.value })}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
        >
          {enums.requirementType.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {needsKey && (
          <input
            type="text"
            value={requirement.key || ''}
            onChange={(e) => onChange({ ...requirement, key: e.target.value })}
            placeholder="Key"
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        )}
        {needsIds ? (
          <input
            type="text"
            value={(requirement.ids || []).join(', ')}
            onChange={(e) => onChange({ ...requirement, ids: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="IDs (comma-separated)"
            className="col-span-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        ) : (
          <>
            <input
              type="text"
              value={requirement.value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                const parsed = val === 'true' ? true : val === 'false' ? false : isNaN(Number(val)) ? val : Number(val);
                onChange({ ...requirement, value: parsed });
              }}
              placeholder="Value"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
            <select
              value={requirement.operator || ''}
              onChange={(e) => onChange({ ...requirement, operator: e.target.value || undefined })}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            >
              <option value="">Default</option>
              {enums.operator.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  );
};

const RequirementsField: React.FC<{ value?: any[]; onChange: (v: any) => void; allData: any }> = ({ value = [], onChange, allData }) => (
  <div className="space-y-2">
    {value.map((req: any, i: number) => (
      <RequirementEditor
        key={i}
        requirement={req}
        onChange={(newReq: any) => {
          const newValue = [...value];
          newValue[i] = newReq;
          onChange(newValue);
        }}
        onRemove={() => {
          const newValue = [...value];
          newValue.splice(i, 1);
          onChange(newValue);
        }}
        allData={allData}
      />
    ))}
    <button
      onClick={() => onChange([...value, { type: 'keeper_level', value: 1 }])}
      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
    >
      <Plus size={14} /> Add Requirement
    </button>
  </div>
);

const TimerField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel label="Duration (seconds)" />
        <NumberField value={value.duration} onChange={(v: any) => onChange({ ...value, duration: v })} />
      </div>
      <div>
        <FieldLabel label="Skip Type" />
        <EnumField value={value.skip_type} onChange={(v: any) => onChange({ ...value, skip_type: v })} options={enums.skipType} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel label="Boostable" />
        <BooleanField value={value.boostable} onChange={(v: any) => onChange({ ...value, boostable: v })} />
      </div>
      <div>
        <FieldLabel label="Skipable" />
        <BooleanField value={value.skipable} onChange={(v: any) => onChange({ ...value, skipable: v })} />
      </div>
    </div>
    {value.skipable && (
      <>
        <div>
          <FieldLabel label="Skip Cost" />
          {(Array.isArray(value.skip_cost) ? value.skip_cost : []).map((entry: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2 mb-1">
              <select className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white" value={entry.type || 'currency'} onChange={(e) => { const arr = [...(value.skip_cost || [])]; arr[idx] = { ...entry, type: e.target.value }; onChange({ ...value, skip_cost: arr }); }}>
                <option value="currency">Currency</option>
                <option value="item">Item</option>
              </select>
              <input className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white flex-1" placeholder="ID" value={entry.id || ''} onChange={(e) => { const arr = [...(value.skip_cost || [])]; arr[idx] = { ...entry, id: e.target.value }; onChange({ ...value, skip_cost: arr }); }} />
              <input className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-20" type="number" placeholder="Amount" value={entry.amount ?? ''} onChange={(e) => { const arr = [...(value.skip_cost || [])]; arr[idx] = { ...entry, amount: Number(e.target.value) }; onChange({ ...value, skip_cost: arr }); }} />
              <button className="text-red-400 hover:text-red-300 text-sm" onClick={() => { const arr = [...(value.skip_cost || [])]; arr.splice(idx, 1); onChange({ ...value, skip_cost: arr }); }}>✕</button>
            </div>
          ))}
          <button className="text-xs text-purple-400 hover:text-purple-300 mt-1" onClick={() => onChange({ ...value, skip_cost: [...(Array.isArray(value.skip_cost) ? value.skip_cost : []), { type: 'currency', id: '', amount: 0 }] })}>+ Add Cost</button>
        </div>
        <div>
          <FieldLabel label="Skip Type" />
          <select className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white" value={value.skip_type || 'absolute'} onChange={(e) => onChange({ ...value, skip_type: e.target.value })}>
            <option value="absolute">Absolute</option>
            <option value="scaling">Scaling</option>
          </select>
        </div>
      </>
    )}
  </div>
  );
};

const RewardEntryEditor: React.FC<{ entry: any; onChange: (v: any) => void; onRemove: () => void; allData: any }> = ({ entry, onChange, onRemove, allData }) => {
  const enums = useEnums();
  const entryType = entry.type || 'currency';
  const isBundle = entry.bundle !== undefined;

  if (isBundle) {
    const hasReqs = entry.requirements && entry.requirements.length > 0;
    return (
      <div className="bg-purple-900/30 border border-purple-500/30 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-purple-300 font-medium text-sm">Bundle</span>
          <button onClick={onRemove} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel label="Odds (%)" />
            <NumberField value={entry.odds} onChange={(v: any) => onChange({ ...entry, odds: v })} min={0} max={100} />
          </div>
        </div>
        <details className="text-sm">
          <summary className={`cursor-pointer select-none text-xs ${hasReqs ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-400'}`}>
            Requirements {hasReqs ? `(${entry.requirements.length})` : '(none)'}
          </summary>
          <div className="mt-2">
            <RequirementsField value={entry.requirements || []} onChange={(v: any) => onChange({ ...entry, requirements: v })} allData={allData} />
          </div>
        </details>
        <div className="pl-3 border-l-2 border-purple-500/50 space-y-2">
          {(entry.bundle || []).map((subEntry: any, i: number) => (
            <RewardEntryEditor
              key={i}
              entry={subEntry}
              onChange={(newEntry: any) => {
                const newBundle = [...entry.bundle];
                newBundle[i] = newEntry;
                onChange({ ...entry, bundle: newBundle });
              }}
              onRemove={() => {
                const newBundle = [...entry.bundle];
                newBundle.splice(i, 1);
                onChange({ ...entry, bundle: newBundle });
              }}
              allData={allData}
            />
          ))}
          <button
            onClick={() => onChange({ ...entry, bundle: [...(entry.bundle || []), { type: 'currency', key: '', min: 1, max: 1, odds: 100 }] })}
            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs"
          >
            <Plus size={12} /> Add to Bundle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <select
          value={entryType}
          onChange={(e) => onChange({ ...entry, type: e.target.value })}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
        >
          {enums.rewardType.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {['currency', 'item'].includes(entryType) && (
          <input
            type="text"
            value={entry.key || ''}
            onChange={(e) => onChange({ ...entry, key: e.target.value })}
            placeholder="Key/ID"
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        )}
        {['entity_xp', 'keeper_xp', 'currency', 'item'].includes(entryType) && (
          <>
            <input
              type="number"
              value={entry.min ?? ''}
              onChange={(e) => onChange({ ...entry, min: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Min"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
            <input
              type="number"
              value={entry.max ?? ''}
              onChange={(e) => onChange({ ...entry, max: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Max"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
          </>
        )}
        {entryType === 'flag' && (
          <>
            <select
              value={entry.operation || 'set'}
              onChange={(e) => onChange({ ...entry, operation: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            >
              {enums.flagOperation.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              type="text"
              value={entry.key || ''}
              onChange={(e) => onChange({ ...entry, key: e.target.value })}
              placeholder="Flag Key"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
            <input
              type="text"
              value={entry.value ?? ''}
              onChange={(e) => onChange({ ...entry, value: e.target.value })}
              placeholder="Value"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
          </>
        )}
        {entryType === 'text' && (
          <input
            type="text"
            value={entry.message || ''}
            onChange={(e) => onChange({ ...entry, message: e.target.value })}
            placeholder="Message"
            className="col-span-3 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        )}
        {entryType === 'emitEvent' && (
          <div className="col-span-full space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Event Def ID</label>
                <input
                  type="text"
                  value={entry.defId || ''}
                  onChange={(e) => onChange({ ...entry, defId: e.target.value })}
                  placeholder="e.g. evt_new_guest_arrived"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Idempotency Key</label>
                <input
                  type="text"
                  value={entry.idempotencyKey || ''}
                  onChange={(e) => onChange({ ...entry, idempotencyKey: e.target.value })}
                  placeholder="Optional"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">Payload</span>
                <button
                  type="button"
                  onClick={() => {
                    const rows = entry._payloadRows
                      ? [...entry._payloadRows]
                      : Object.entries(entry.payload || {}).map(([k, v]) => ({ k, v: String(v ?? '') }));
                    rows.push({ k: `field_${rows.length + 1}`, v: '' });
                    const payload = Object.fromEntries(rows.map((r: any) => [r.k, r.v]));
                    onChange({ ...entry, payload, _payloadRows: rows });
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >+ Add Field</button>
              </div>
              {(() => {
                const rows: { k: string; v: string }[] = entry._payloadRows
                  || Object.entries(entry.payload || {}).map(([k, v]) => ({ k, v: String(v ?? '') }));
                if (rows.length === 0) return null;
                const syncPayload = (updated: { k: string; v: string }[]) => {
                  const payload = Object.fromEntries(updated.filter((r) => r.k).map((r) => [r.k, r.v]));
                  onChange({ ...entry, payload, _payloadRows: updated });
                };
                return (
                  <div className="space-y-1">
                    {rows.map((row, pi) => (
                      <div key={pi} className="grid grid-cols-[1fr_2fr_auto] gap-1 items-center">
                        <input
                          type="text"
                          value={row.k}
                          onChange={(e) => {
                            const updated = [...rows];
                            updated[pi] = { ...updated[pi], k: e.target.value };
                            syncPayload(updated);
                          }}
                          placeholder="Key"
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs min-w-0"
                        />
                        <input
                          type="text"
                          value={row.v}
                          onChange={(e) => {
                            const updated = [...rows];
                            updated[pi] = { ...updated[pi], v: e.target.value };
                            syncPayload(updated);
                          }}
                          placeholder="Value"
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = rows.filter((_, i) => i !== pi);
                            syncPayload(updated);
                          }}
                          className="text-red-400 hover:text-red-300 text-xs px-1"
                        >x</button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        <input
          type="number"
          value={entry.odds ?? 100}
          onChange={(e) => onChange({ ...entry, odds: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="Odds %"
          min={0}
          max={100}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
        />
      </div>
      {(() => {
        const hasReqs = entry.requirements && entry.requirements.length > 0;
        return (
          <details className="text-sm">
            <summary className={`cursor-pointer select-none text-xs ${hasReqs ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-400'}`}>
              Requirements {hasReqs ? `(${entry.requirements.length})` : '(none)'}
            </summary>
            <div className="mt-2">
              <RequirementsField value={entry.requirements || []} onChange={(v: any) => onChange({ ...entry, requirements: v })} allData={allData} />
            </div>
          </details>
        );
      })()}
    </div>
  );
};

const OutcomeBlockField: React.FC<{ value?: any; onChange: (v: any) => void; allData: any }> = ({ value = { rewards: [] }, onChange, allData }) => (
  <div className="space-y-2">
    <div className="text-xs text-gray-400 mb-2">Rewards array (includes rewards, effects, text, bundles)</div>
    {(value.rewards || []).map((entry: any, i: number) => (
      <RewardEntryEditor
        key={i}
        entry={entry}
        onChange={(newEntry: any) => {
          const newRewards = [...(value.rewards || [])];
          newRewards[i] = newEntry;
          onChange({ ...value, rewards: newRewards });
        }}
        onRemove={() => {
          const newRewards = [...(value.rewards || [])];
          newRewards.splice(i, 1);
          onChange({ ...value, rewards: newRewards });
        }}
        allData={allData}
      />
    ))}
    <div className="flex gap-2">
      <button
        onClick={() => onChange({ ...value, rewards: [...(value.rewards || []), { type: 'currency', key: '', min: 1, max: 1, odds: 100 }] })}
        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
      >
        <Plus size={14} /> Add Entry
      </button>
      <button
        onClick={() => onChange({ ...value, rewards: [...(value.rewards || []), { bundle: [], odds: 100 }] })}
        className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
      >
        <Plus size={14} /> Add Bundle
      </button>
    </div>
  </div>
);

const EquipDataField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value: rawValue, onChange }) => {
  const enums = useEnums();
  const value = rawValue || {};
  return (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Slot" />
      <EnumField value={value.slot} onChange={(v: any) => onChange({ ...value, slot: v })} options={enums.equipmentSlots} />
    </div>
    <div>
      <FieldLabel label="Stats" />
      <div className="grid grid-cols-3 gap-2">
        {enums.stats.map(stat => (
          <div key={stat} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-8">{stat}</span>
            <input
              type="number"
              value={(value.stats || {})[stat] ?? ''}
              onChange={(e) => {
                const newStats = { ...(value.stats || {}) };
                if (e.target.value === '') {
                  delete newStats[stat];
                } else {
                  newStats[stat] = Number(e.target.value);
                }
                onChange({ ...value, stats: newStats });
              }}
              className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};

const ConsumableDataField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value: rawValue, onChange }) => {
  const value = rawValue || {};
  return (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Effect Type" />
      <StringField value={value.effect} onChange={(v: any) => onChange({ ...value, effect: v })} placeholder="heal, speed_boost, etc." />
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div>
        <FieldLabel label="Amount" />
        <NumberField value={value.amount} onChange={(v: any) => onChange({ ...value, amount: v })} />
      </div>
      <div>
        <FieldLabel label="Duration (s)" />
        <NumberField value={value.duration} onChange={(v: any) => onChange({ ...value, duration: v })} />
      </div>
      <div>
        <FieldLabel label="Multiplier" />
        <NumberField value={value.multiplier} onChange={(v: any) => onChange({ ...value, multiplier: v })} step={0.1} />
      </div>
    </div>
  </div>
  );
};

const BodySlotsField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-2">
    {enums.bodySlots.map(slot => (
      <div key={slot} className="bg-gray-800/50 rounded p-2">
        <FieldLabel label={slot} />
        <div className="flex flex-wrap gap-1">
          {enums.archetypes.map(arch => (
            <button
              key={arch}
              onClick={() => {
                const current = value[slot] || [];
                const newValue = { ...value };
                if (current.includes(arch)) {
                  newValue[slot] = current.filter((a: string) => a !== arch);
                } else {
                  newValue[slot] = [...current, arch];
                }
                onChange(newValue);
              }}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${(value[slot] || []).includes(arch) ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            >
              {arch}
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
  );
};

const EquipmentSlotsField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-2">
    {enums.equipmentSlots.map(slot => (
      <div key={slot} className="flex items-center gap-3 bg-gray-800/50 rounded p-2">
        <span className="text-sm text-gray-300 w-24">{slot}</span>
        <NumberField
          value={value[slot]}
          onChange={(v: any) => {
            const newValue = { ...value };
            if (v === undefined) {
              delete newValue[slot];
            } else {
              newValue[slot] = v;
            }
            onChange(newValue);
          }}
          min={0}
          max={10}
        />
      </div>
    ))}
  </div>
  );
};

const SlotStatsField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-2">
    {enums.bodySlots.map(slot => (
      <div key={slot} className="bg-gray-800/50 rounded p-2">
        <FieldLabel label={slot} />
        <div className="grid grid-cols-6 gap-1">
          {enums.stats.map(stat => (
            <div key={stat} className="flex flex-col items-center">
              <span className="text-[10px] text-gray-500">{stat}</span>
              <input
                type="number"
                value={((value[slot] || {})[stat]) ?? ''}
                onChange={(e) => {
                  const newValue = { ...value };
                  if (!newValue[slot]) newValue[slot] = {};
                  if (e.target.value === '') {
                    delete newValue[slot][stat];
                  } else {
                    newValue[slot][stat] = Number(e.target.value);
                  }
                  onChange(newValue);
                }}
                className="w-12 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white text-xs text-center"
              />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
  );
};

const CostObjectField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const entries = Object.entries(value);

  return (
    <div className="space-y-2">
      {entries.map(([key, amount]: [string, any], i: number) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => {
              const newValue: any = {};
              entries.forEach(([k, v]: [string, any], j: number) => {
                newValue[j === i ? e.target.value : k] = v;
              });
              onChange(newValue);
            }}
            placeholder="Currency/Item ID"
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const newValue = { ...value };
              newValue[key] = Number(e.target.value);
              onChange(newValue);
            }}
            placeholder="Amount"
            className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <button onClick={() => {
            const newValue = { ...value };
            delete newValue[key];
            onChange(newValue);
          }} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...value, '': 0 })}
        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
      >
        <Plus size={14} /> Add Cost
      </button>
    </div>
  );
};

const CostArrayField: React.FC<{ value?: any[]; onChange: (v: any) => void }> = ({ value = [], onChange }) => {
  const entries = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-2">
      {entries.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={entry.type || 'currency'}
            onChange={(e) => {
              const newEntries = [...entries];
              newEntries[i] = { ...entry, type: e.target.value };
              onChange(newEntries);
            }}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          >
            <option value="currency">currency</option>
            <option value="item">item</option>
          </select>
          <input
            type="text"
            value={entry.id || ''}
            onChange={(e) => {
              const newEntries = [...entries];
              newEntries[i] = { ...entry, id: e.target.value };
              onChange(newEntries);
            }}
            placeholder="ID"
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <input
            type="number"
            value={entry.amount ?? 0}
            onChange={(e) => {
              const newEntries = [...entries];
              newEntries[i] = { ...entry, amount: Number(e.target.value) };
              onChange(newEntries);
            }}
            placeholder="Amount"
            className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <button onClick={() => {
            const newEntries = [...entries];
            newEntries.splice(i, 1);
            onChange(newEntries);
          }} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...entries, { type: 'currency', id: '', amount: 0 }])}
        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
      >
        <Plus size={14} /> Add Cost Entry
      </button>
    </div>
  );
};

const EffectsField: React.FC<{ value?: any[]; onChange: (v: any) => void }> = ({ value = [], onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-2">
    {value.map((effect: any, i: number) => (
      <div key={i} className="bg-gray-800/50 rounded p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Flag Effect</span>
          <button onClick={() => {
            const newValue = [...value];
            newValue.splice(i, 1);
            onChange(newValue);
          }} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <select
            value={effect.operation || 'set'}
            onChange={(e) => {
              const newValue = [...value];
              newValue[i] = { ...effect, operation: e.target.value };
              onChange(newValue);
            }}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          >
            {enums.flagOperation.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            type="text"
            value={effect.key || ''}
            onChange={(e) => {
              const newValue = [...value];
              newValue[i] = { ...effect, key: e.target.value };
              onChange(newValue);
            }}
            placeholder="Key"
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <input
            type="text"
            value={effect.value ?? ''}
            onChange={(e) => {
              const newValue = [...value];
              newValue[i] = { ...effect, value: e.target.value };
              onChange(newValue);
            }}
            placeholder="Value"
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <input
            type="number"
            value={effect.odds ?? 100}
            onChange={(e) => {
              const newValue = [...value];
              newValue[i] = { ...effect, odds: Number(e.target.value) };
              onChange(newValue);
            }}
            placeholder="Odds %"
            min={0}
            max={100}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
        </div>
      </div>
    ))}
    <button
      onClick={() => onChange([...value, { type: 'flag', operation: 'set', key: '', value: '', odds: 100 }])}
      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
    >
      <Plus size={14} /> Add Effect
    </button>
  </div>
  );
};

const EventSecurityField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => (
  <div className="space-y-2 bg-gray-800/50 rounded p-3">
    <FieldLabel label="Allowed Emitters" description="Leave empty to allow all" />
    <StringArrayField
      value={value.allowedEmitters || []}
      onChange={(v) => onChange({ ...value, allowedEmitters: v })}
    />
  </div>
);

const GiftPresentationField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  return (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Title" />
      <StringField value={value.title} onChange={(v: any) => onChange({ ...value, title: v })} />
    </div>
    <div>
      <FieldLabel label="Body" />
      <textarea
        value={value.body || ''}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        rows={2}
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel label="Icon Key" />
        <StringField value={value.iconKey} onChange={(v: any) => onChange({ ...value, iconKey: v })} />
      </div>
      <div>
        <FieldLabel label="Rarity" />
        <EnumField value={value.rarity} onChange={(v: any) => onChange({ ...value, rarity: v })} options={enums.itemRarity} />
      </div>
    </div>
  </div>
  );
};

const GiftClaimRulesField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Expires In (seconds)" description="Leave blank for no expiry" />
      <NumberField value={value.expiresInSeconds} onChange={(v: any) => onChange({ ...value, expiresInSeconds: v })} />
    </div>
    <div>
      <FieldLabel label="Limit Per Player" description="Leave blank for unlimited" />
      <NumberField value={value.limitPerPlayer} onChange={(v: any) => onChange({ ...value, limitPerPlayer: v })} />
    </div>
  </div>
);

const GiftRewardSpecField: React.FC<{ value?: any; onChange: (v: any) => void; allData: any }> = ({ value = {}, onChange, allData }) => {
  const enums = useEnums();
  const rewardType = value.type || 'currency';
  const isBundle = rewardType === 'bundle';

  return (
    <div className="space-y-3 bg-gray-800/50 rounded p-3">
      <div>
        <FieldLabel label="Reward Type" />
        <EnumField value={rewardType} onChange={(v: any) => onChange({ type: v })} options={enums.giftRewardType} />
      </div>

      {rewardType === 'currency' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Currency ID" />
            <RefField value={value.currencyId} onChange={(v: any) => onChange({ ...value, currencyId: v })} refTable="Currency" allData={allData} />
          </div>
          <div>
            <FieldLabel label="Amount" />
            <NumberField value={value.amount} onChange={(v: any) => onChange({ ...value, amount: v })} />
          </div>
        </div>
      )}

      {rewardType === 'item' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Item Def ID" />
            <RefField value={value.itemDefId} onChange={(v: any) => onChange({ ...value, itemDefId: v })} refTable="ItemDef" allData={allData} />
          </div>
          <div>
            <FieldLabel label="Quantity" />
            <NumberField value={value.qty} onChange={(v: any) => onChange({ ...value, qty: v })} />
          </div>
        </div>
      )}

      {rewardType === 'entity' && (
        <div>
          <FieldLabel label="Entity Definition ID" />
          <RefField value={value.definitionId} onChange={(v: any) => onChange({ ...value, definitionId: v })} refTable="EntityDefinition" allData={allData} />
        </div>
      )}

      {isBundle && (
        <div className="space-y-2">
          <FieldLabel label="Bundle Entries" />
          {(value.entries || []).map((entry: any, i: number) => (
            <div key={i} className="bg-gray-700/50 rounded p-2">
              <GiftRewardSpecField
                value={entry}
                onChange={(newEntry: any) => {
                  const newEntries = [...(value.entries || [])];
                  newEntries[i] = newEntry;
                  onChange({ ...value, entries: newEntries });
                }}
                allData={allData}
              />
              <button
                onClick={() => {
                  const newEntries = [...(value.entries || [])];
                  newEntries.splice(i, 1);
                  onChange({ ...value, entries: newEntries });
                }}
                className="mt-2 text-red-400 hover:text-red-300 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...value, entries: [...(value.entries || []), { type: 'currency' }] })}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
          >
            <Plus size={14} /> Add Entry
          </button>
        </div>
      )}
    </div>
  );
};

const LevelRulesField: React.FC<{ value?: any; onChange: (v: any) => void }> = ({ value = {}, onChange }) => {
  const enums = useEnums();
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(['1']));
  const [newLevelInput, setNewLevelInput] = useState('');
  const levelEntries = Object.entries(value.level || {}).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <FieldLabel label="Max Level" />
          <NumberField value={value.maxLevel} onChange={(v: any) => onChange({ ...value, maxLevel: v })} />
        </div>
        <div>
          <FieldLabel label="XP Curve" />
          <EnumField value={value.xpCurve} onChange={(v: any) => onChange({ ...value, xpCurve: v })} options={enums.xpCurve} />
        </div>
        <div>
          <FieldLabel label="Base XP" />
          <NumberField value={value.baseXP} onChange={(v: any) => onChange({ ...value, baseXP: v })} />
        </div>
        <div>
          <FieldLabel label="XP Rate" />
          <NumberField value={value.xpRate} onChange={(v: any) => onChange({ ...value, xpRate: v })} step={0.1} />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel label="Level Blocks" />
        {levelEntries.map(([levelNum, block]) => (
          <div key={levelNum} className="border border-gray-700 rounded">
            <button
              onClick={() => {
                const newExpanded = new Set(expandedLevels);
                if (newExpanded.has(levelNum)) {
                  newExpanded.delete(levelNum);
                } else {
                  newExpanded.add(levelNum);
                }
                setExpandedLevels(newExpanded);
              }}
              className="w-full flex items-center justify-between p-2 bg-gray-800/50 hover:bg-gray-800 transition-colors"
            >
              <span className="text-cyan-300 font-medium">Level {levelNum}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newLevel = { ...(value.level || {}) };
                    delete newLevel[levelNum];
                    onChange({ ...value, level: newLevel });
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 size={14} />
                </button>
                {expandedLevels.has(levelNum) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            </button>
            {expandedLevels.has(levelNum) && (
              <div className="p-3 space-y-3 bg-gray-900/50">
                <JsonField
                  value={block}
                  onChange={(newBlock: any) => {
                    const newLevel = { ...(value.level || {}) };
                    newLevel[levelNum] = newBlock;
                    onChange({ ...value, level: newLevel });
                  }}
                />
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder="Level #"
            value={newLevelInput}
            onChange={(e) => setNewLevelInput(e.target.value)}
            className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <button
            onClick={() => {
              if (newLevelInput && !value.level?.[newLevelInput]) {
                const newLevel = { ...(value.level || {}) };
                newLevel[newLevelInput] = {};
                onChange({ ...value, level: newLevel });
                setNewLevelInput('');
              }
            }}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm"
          >
            <Plus size={14} /> Add Level
          </button>
        </div>
      </div>
    </div>
  );
};

const FieldEditor: React.FC<{ fieldName: string; fieldDef: any; value: any; onChange: (v: any) => void; allData: any; error: any }> = ({ fieldName, fieldDef, value, onChange, allData, error }) => {
  const enums = useEnums();
  const fieldError = error?.find((e: any) => e.field === fieldName);

  const renderField = () => {
    switch (fieldDef.type) {
      case 'string':
        return <StringField value={value} onChange={onChange} error={fieldError} />;
      case 'number':
        return <NumberField value={value} onChange={onChange} error={fieldError} />;
      case 'boolean':
        return <BooleanField value={value} onChange={onChange} />;
      case 'enum':
        return <EnumField value={value} onChange={onChange} options={enums[fieldDef.enum]} error={fieldError} />;
      case 'color':
        return <ColorField value={value} onChange={onChange} />;
      case 'stringArray':
        return <StringArrayField value={value} onChange={onChange} />;
      case 'ref':
        return <RefField value={value} onChange={onChange} refTable={fieldDef.refTable} allData={allData} error={fieldError} />;
      case 'json':
        return <JsonField value={value} onChange={onChange} error={fieldError} />;
      case 'requirements':
        return <RequirementsField value={value} onChange={onChange} allData={allData} />;
      case 'timer':
        return <TimerField value={value} onChange={onChange} />;
      case 'outcomeBlock':
        return <OutcomeBlockField value={value} onChange={onChange} allData={allData} />;
      case 'equipData':
        return <EquipDataField value={value} onChange={onChange} />;
      case 'consumableData':
        return <ConsumableDataField value={value} onChange={onChange} />;
      case 'bodySlots':
        return <BodySlotsField value={value} onChange={onChange} />;
      case 'equipmentSlots':
        return <EquipmentSlotsField value={value} onChange={onChange} />;
      case 'slotStats':
        return <SlotStatsField value={value} onChange={onChange} />;
      case 'costObject':
        return <CostObjectField value={value} onChange={onChange} />;
      case 'costArray':
        return <CostArrayField value={value} onChange={onChange} />;
      case 'effects':
        return <EffectsField value={value} onChange={onChange} />;
      case 'eventSecurity':
        return <EventSecurityField value={value} onChange={onChange} />;
      case 'giftPresentation':
        return <GiftPresentationField value={value} onChange={onChange} />;
      case 'giftClaimRules':
        return <GiftClaimRulesField value={value} onChange={onChange} />;
      case 'giftRewardSpec':
        return <GiftRewardSpecField value={value} onChange={onChange} allData={allData} />;
      case 'levelRules':
        return <LevelRulesField value={value} onChange={onChange} />;
      default:
        return <JsonField value={value} onChange={onChange} error={fieldError} />;
    }
  };

  return (
    <div className="space-y-1">
      <FieldLabel label={fieldName} required={fieldDef.required} description={fieldDef.description} />
      {renderField()}
      {fieldError && <p className="text-red-400 text-xs">{fieldError.message}</p>}
    </div>
  );
};

const RecordEditor: React.FC<{ tableName: string; record: any; onSave: (r: any) => void; onCancel: () => void; allData: any }> = ({ tableName, record, onSave, onCancel, allData }) => {
  const [editedRecord, setEditedRecord] = useState(deepClone(record));
  const originalId = useRef(record.id);
  const schema = TABLE_SCHEMAS[tableName];
  const errors = validateRecord(tableName, editedRecord, allData, originalId.current);

  const handleFieldChange = (fieldName: string, value: any) => {
    setEditedRecord((prev: any) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Edit3 size={18} className="text-cyan-400" />
          Edit {tableName}
        </h3>
        <div className="flex items-center gap-2">
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-yellow-400 text-sm">
              <AlertTriangle size={14} />
              {errors.length} issue{errors.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onCancel} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">
            Cancel
          </button>
          <button
            onClick={() => onSave(editedRecord)}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 rounded text-white text-sm flex items-center gap-1"
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {Object.entries(schema.fields).map(([fieldName, fieldDef]: [string, any]) => (
          <FieldEditor
            key={fieldName}
            fieldName={fieldName}
            fieldDef={fieldDef}
            value={editedRecord[fieldName]}
            onChange={(value: any) => handleFieldChange(fieldName, value)}
            allData={allData}
            error={errors}
          />
        ))}
      </div>
    </div>
  );
};

const RecordRow: React.FC<{ tableName: string; record: any; isSelected: boolean; onClick: () => void; onDelete: () => void; allData: any }> = ({ tableName, record, isSelected, onClick, onDelete, allData }) => {
  const errors = validateRecord(tableName, record, allData);
  const schema = TABLE_SCHEMAS[tableName];
  const Icon = schema.icon;

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 cursor-pointer transition-colors border-b border-gray-800 ${isSelected ? 'bg-cyan-900/30' : 'hover:bg-gray-800/50'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon size={16} style={{ color: schema.color }} />
        <div className="min-w-0">
          <div className="text-white font-medium truncate">{record.id}</div>
          {record.name && <div className="text-gray-400 text-xs truncate">{record.name}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {errors.length > 0 && (
          <AlertTriangle size={14} className="text-yellow-400" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-500 hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

interface DerpAdminEditorProps {
  adminKey: string;
}

const DerpAdminEditor: React.FC<DerpAdminEditorProps> = ({ adminKey }) => {
  const [enums, setEnums] = useState<Record<string, string[]>>(FALLBACK_ENUMS);
  const [data, setData] = useState<Record<string, any[]>>(() => {
    const initial: Record<string, any[]> = {};
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      initial[table] = [];
    });
    return initial;
  });

  const [selectedTable, setSelectedTable] = useState('Currency');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const statusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((type: 'success' | 'error' | 'info', text: string, duration = 3000) => {
    if (statusTimeout.current) clearTimeout(statusTimeout.current);
    setStatusMessage({ type, text });
    statusTimeout.current = setTimeout(() => setStatusMessage(null), duration);
  }, []);

  useEffect(() => {
    setAdminKey(adminKey);
  }, [adminKey]);

  useEffect(() => {
    api.getMetaEnums()
      .then((serverEnums) => setEnums({ ...FALLBACK_ENUMS, ...serverEnums }))
      .catch((err) => console.warn('Failed to load enums from server, using fallbacks:', err));
  }, []);

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        const newData: Record<string, any[]> = {};
        const tableKeys = Object.keys(TABLE_SCHEMAS);
        const results = await Promise.allSettled(
          tableKeys.map(tableName => {
            const apiKey = TABLE_API_KEYS[tableName];
            return apiKey ? adminApi.list(apiKey) : Promise.resolve([]);
          })
        );
        tableKeys.forEach((tableName, i) => {
          const result = results[i];
          newData[tableName] = result.status === 'fulfilled' ? result.value : [];
          if (result.status === 'rejected') {
            console.warn(`Failed to load ${tableName}:`, result.reason);
          }
        });
        setData(newData);
        showStatus('success', 'Data loaded from database');
      } catch (err: any) {
        showStatus('error', `Failed to load data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [adminKey, showStatus]);

  const selectedRecord = useMemo(() => {
    return (data[selectedTable] || []).find((r: any) => r.id === selectedRecordId);
  }, [data, selectedTable, selectedRecordId]);

  const filteredRecords = useMemo(() => {
    const records = data[selectedTable] || [];
    if (!searchTerm) return records;
    const term = searchTerm.toLowerCase();
    return records.filter((r: any) =>
      r.id?.toLowerCase().includes(term) ||
      r.name?.toLowerCase().includes(term)
    );
  }, [data, selectedTable, searchTerm]);

  const totalErrors = useMemo(() => {
    let count = 0;
    Object.entries(data).forEach(([tableName, records]) => {
      records.forEach((record: any) => {
        count += validateRecord(tableName, record, data).length;
      });
    });
    return count;
  }, [data]);

  const handleAddRecord = async () => {
    const newRecord: any = { id: generateId() };
    const schema = TABLE_SCHEMAS[selectedTable];

    Object.entries(schema.fields).forEach(([fieldName, fieldDef]: [string, any]) => {
      if (fieldDef.default !== undefined) {
        newRecord[fieldName] = typeof fieldDef.default === 'object'
          ? deepClone(fieldDef.default)
          : fieldDef.default;
      }
    });

    const apiKey = TABLE_API_KEYS[selectedTable];
    if (apiKey) {
      try {
        const created = await adminApi.create(apiKey, newRecord);
        const finalRecord = created || newRecord;
        setData(prev => ({
          ...prev,
          [selectedTable]: [...(prev[selectedTable] || []), finalRecord]
        }));
        setSelectedRecordId(finalRecord.id || newRecord.id);
        showStatus('success', `Created new ${selectedTable} record`);
      } catch (err: any) {
        setData(prev => ({
          ...prev,
          [selectedTable]: [...(prev[selectedTable] || []), newRecord]
        }));
        setSelectedRecordId(newRecord.id);
        showStatus('error', `Created locally but failed to save to DB: ${err.message}`);
      }
    } else {
      setData(prev => ({
        ...prev,
        [selectedTable]: [...(prev[selectedTable] || []), newRecord]
      }));
      setSelectedRecordId(newRecord.id);
    }
  };

  const TRANSIENT_KEYS = new Set(['_payloadRows', 'createdAt', 'updatedAt']);
  const stripTransientKeys = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(stripTransientKeys);
    if (obj && typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (TRANSIENT_KEYS.has(k)) continue;
        out[k] = stripTransientKeys(v);
      }
      return out;
    }
    return obj;
  };

  const handleSaveRecord = async (updatedRecord: any) => {
    const apiKey = TABLE_API_KEYS[selectedTable];
    if (apiKey) {
      try {
        const cleaned = stripTransientKeys(updatedRecord);
        const isNew = selectedRecordId && selectedRecordId.startsWith('new_');
        const idChanged = !isNew && selectedRecordId !== cleaned.id;

        if (isNew) {
          await adminApi.create(apiKey, cleaned);
        } else if (idChanged && selectedRecordId) {
          try { await adminApi.delete(apiKey, selectedRecordId); } catch (_e) {}
          await adminApi.create(apiKey, cleaned);
        } else {
          try {
            await adminApi.update(apiKey, selectedRecordId!, cleaned);
          } catch (updateErr: any) {
            if (updateErr.message && updateErr.message.includes('not found')) {
              await adminApi.create(apiKey, cleaned);
            } else {
              throw updateErr;
            }
          }
        }
        showStatus('success', 'Saved to database');
      } catch (err: any) {
        showStatus('error', `Save failed: ${err.message}`);
      }
    }

    setData(prev => ({
      ...prev,
      [selectedTable]: prev[selectedTable].map((r: any) =>
        r.id === selectedRecordId ? updatedRecord : r
      )
    }));
    setSelectedRecordId(updatedRecord.id);
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (confirm('Delete this record?')) {
      const apiKey = TABLE_API_KEYS[selectedTable];
      if (apiKey) {
        try {
          await adminApi.delete(apiKey, recordId);
          showStatus('success', 'Deleted from database');
        } catch (err: any) {
          showStatus('error', `Delete failed: ${err.message}`);
        }
      }

      setData(prev => ({
        ...prev,
        [selectedTable]: prev[selectedTable].filter((r: any) => r.id !== recordId)
      }));
      if (selectedRecordId === recordId) {
        setSelectedRecordId(null);
      }
    }
  };

  const handleExport = () => {
    const cleanedData: any = {};
    for (const [table, records] of Object.entries(data)) {
      cleanedData[table] = (records as any[]).map(stripTransientKeys);
    }
    const exportData: any = {
      _meta: {
        version: '1.0',
        description: 'Exported from admin panel',
        exportedAt: new Date().toISOString(),
        tables: Object.keys(TABLE_SCHEMAS),
      },
      ...cleanedData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seed-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAllToDb = async () => {
    showStatus('info', 'Saving all records to database...');
    let successCount = 0;
    let errorCount = 0;

    for (const [tableName, records] of Object.entries(data)) {
      const apiKey = TABLE_API_KEYS[tableName];
      if (!apiKey) continue;

      for (const record of records) {
        try {
          const cleaned = stripTransientKeys(record);
          if (cleaned.id && cleaned.id.startsWith('new_')) {
            await adminApi.create(apiKey, cleaned);
          } else {
            try {
              await adminApi.update(apiKey, cleaned.id, cleaned);
            } catch (updateErr: any) {
              if (updateErr.message && updateErr.message.includes('not found')) {
                await adminApi.create(apiKey, cleaned);
              } else {
                throw updateErr;
              }
            }
          }
          successCount++;
        } catch (err: any) {
          errorCount++;
          console.warn(`Failed to save ${tableName}/${record.id}:`, err.message);
        }
      }
    }

    if (errorCount === 0) {
      showStatus('success', `Saved ${successCount} records to database`);
    } else {
      showStatus('error', `Saved ${successCount}, failed ${errorCount} records`);
    }
  };

  const handleImport = (importedData: any) => {
    const merged: Record<string, any[]> = {};
    let addedCount = 0;
    let updatedCount = 0;
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      const existing = data[table] || [];
      const incoming = importedData[table] || [];
      if (incoming.length === 0) {
        merged[table] = existing;
        return;
      }
      const byId: Record<string, any> = {};
      for (const r of existing) { byId[r.id] = r; }
      for (const rec of incoming) {
        if (byId[rec.id]) {
          byId[rec.id] = { ...byId[rec.id], ...rec };
          updatedCount++;
        } else {
          byId[rec.id] = rec;
          addedCount++;
        }
      }
      merged[table] = Object.values(byId);
    });
    setData(merged);
    setShowImportModal(false);
    setSelectedRecordId(null);
    showStatus('success', `Import merged: ${addedCount} added, ${updatedCount} updated`);
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Database size={48} className="mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-gray-400 text-lg">Loading data from database...</p>
        </div>
      </div>
    );
  }

  return (
    <EnumsContext.Provider value={enums}>
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {statusMessage && (
        <div className={`flex-none px-4 py-2 text-sm flex items-center gap-2 ${
          statusMessage.type === 'success' ? 'bg-green-900/50 text-green-300 border-b border-green-500/30' :
          statusMessage.type === 'error' ? 'bg-red-900/50 text-red-300 border-b border-red-500/30' :
          'bg-blue-900/50 text-blue-300 border-b border-blue-500/30'
        }`}>
          {statusMessage.type === 'success' && <Check size={14} />}
          {statusMessage.type === 'error' && <AlertCircle size={14} />}
          {statusMessage.type === 'info' && <Info size={14} />}
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)} className="ml-auto hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      <header className="flex-none bg-gradient-to-r from-gray-900 via-gray-900 to-cyan-900/20 border-b border-cyan-500/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
              <Database size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Derp Universe Admin
              </h1>
              <p className="text-xs text-gray-500">Schema Definition Editor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {totalErrors > 0 && (
              <span className="flex items-center gap-1 px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-400 text-sm">
                <AlertTriangle size={14} />
                {totalErrors} validation issue{totalErrors !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-sm transition-colors"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={handleSaveAllToDb}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
            >
              <Database size={14} /> Save to DB
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 bg-gray-900/30 flex flex-col min-w-0 relative">
          <div className="flex-none p-3 space-y-2 border-b border-gray-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search records..."
                className="w-full bg-gray-800 border border-gray-700 rounded pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              onClick={handleAddRecord}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-sm transition-colors"
            >
              <Plus size={14} /> New {selectedTable}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRecords.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No records found
              </div>
            ) : (
              filteredRecords.map((record: any) => (
                <RecordRow
                  key={record.id}
                  tableName={selectedTable}
                  record={record}
                  isSelected={record.id === selectedRecordId}
                  onClick={() => setSelectedRecordId(record.id)}
                  onDelete={() => handleDeleteRecord(record.id)}
                  allData={data}
                />
              ))
            )}
          </div>

          {selectedRecord && (
            <div className="absolute inset-0 bg-gray-900 z-10 flex flex-col">
              <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900">
                <button
                  onClick={() => setSelectedRecordId(null)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <span className="text-gray-600">|</span>
                <span className="text-sm text-gray-400">Editing <span className="text-cyan-400">{selectedRecord.id || 'new record'}</span></span>
              </div>
              <div className="flex-1 min-h-0">
                <RecordEditor
                  key={`${selectedTable}-${selectedRecordId}`}
                  tableName={selectedTable}
                  record={selectedRecord}
                  onSave={handleSaveRecord}
                  onCancel={() => setSelectedRecordId(null)}
                  allData={data}
                />
              </div>
            </div>
          )}
        </div>

        <nav className={`flex-none ${sidebarCollapsed ? 'w-14' : 'w-56'} bg-gray-900/50 border-l border-gray-800 flex flex-col transition-all duration-200`}>
          <div className="flex-none p-2 border-b border-gray-800">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center p-1.5 rounded text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {Object.entries(TABLE_SCHEMAS).map(([tableName, schema]: [string, any]) => {
              const Icon = schema.icon;
              const recordCount = (data[tableName] || []).length;
              const tableErrors = (data[tableName] || []).reduce((count: number, record: any) =>
                count + validateRecord(tableName, record, data).length, 0
              );

              return (
                <button
                  key={tableName}
                  onClick={() => { setSelectedTable(tableName); setSelectedRecordId(null); }}
                  className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-1.5' : 'justify-between px-3'} py-2 rounded text-left text-sm transition-colors ${selectedTable === tableName ? 'bg-cyan-600/30 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                  title={sidebarCollapsed ? `${tableName} (${recordCount})` : undefined}
                >
                  {sidebarCollapsed ? (
                    <div className="relative">
                      <Icon size={18} style={{ color: schema.color }} />
                      {tableErrors > 0 && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 text-[8px] flex items-center justify-center text-gray-900 font-bold">!</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Icon size={14} style={{ color: schema.color }} />
                        <span>{tableName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {tableErrors > 0 && (
                          <span className="w-4 h-4 rounded-full bg-yellow-500/30 text-yellow-400 text-[10px] flex items-center justify-center">
                            {tableErrors}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{recordCount}</span>
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">Import Seed Data</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ImportPanel onImport={handleImport} onCancel={() => setShowImportModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
    </EnumsContext.Provider>
  );
};

const ImportPanel: React.FC<{ onImport: (data: any) => void; onCancel: () => void }> = ({ onImport, onCancel }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);

  const stripMeta = (obj: any) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const { _meta, ...rest } = obj;
      return rest;
    }
    return obj;
  };

  const handleTextChange = (value: string) => {
    setText(value);
    setError(null);
    setPreview(null);

    if (value.trim()) {
      try {
        const raw = JSON.parse(value);
        const parsed = stripMeta(raw);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError('Expected a JSON object with table arrays');
          return;
        }
        const tableCounts: Record<string, number> = {};
        Object.keys(TABLE_SCHEMAS).forEach(table => {
          const arr = parsed[table];
          if (Array.isArray(arr) && arr.length > 0) {
            tableCounts[table] = arr.length;
          }
        });
        if (Object.keys(tableCounts).length === 0) {
          setError('No recognized tables found in JSON');
          return;
        }
        setPreview(tableCounts);
      } catch (e: any) {
        setError('Invalid JSON: ' + e.message);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        setText(content);
        handleTextChange(content);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = () => {
    try {
      const raw = JSON.parse(text);
      const parsed = stripMeta(raw);
      onImport(parsed);
    } catch (e: any) {
      setError('Import failed: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Upload JSON file</label>
        <input
          type="file"
          accept=".json,.txt"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer"
        />
      </div>

      <div className="text-center text-gray-500 text-sm">— or —</div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Paste JSON</label>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder='{"Currency": [...], "ItemDef": [...], ...}'
          className="w-full h-48 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {preview && (
        <div className="bg-gray-800/50 rounded p-3">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Preview</h4>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {Object.entries(preview).map(([table, count]) => (
              <div key={table} className="flex items-center justify-between text-gray-400">
                <span>{table}</span>
                <span className="text-cyan-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={!preview || !!error}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm"
        >
          Import Data
        </button>
      </div>
    </div>
  );
};

export default DerpAdminEditor;

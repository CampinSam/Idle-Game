import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, Check, Upload, Download, Copy, Search, X, Edit3, Save, FileText, Database, Zap, Package, Users, Map, Building, Layers, Palette, Target, Gift, Calendar, Settings, AlertCircle, Info, ChevronUp } from 'lucide-react';

// ============================================================================
// SCHEMA DEFINITIONS - Based on admin-schemas.md
// ============================================================================

const ENUMS = {
  currencyType: ['SOFT', 'HARD', 'PREMIUM', 'SEASONAL', 'EVENT', 'GUILD'],
  itemType: ['MATERIAL', 'POTION', 'CONSUMABLE', 'GEAR', 'QUEST'],
  itemRarity: ['COMMON', 'UNCOMMON', 'SCARCE', 'ADVANCED', 'RARE', 'ULTRA_RARE', 'EPIC', 'MYTHIC', 'LEGENDARY'],
  itemCategory: ['MISC', 'CRAFTING', 'COMBAT', 'EXPLORATION', 'QUEST_ITEMS', 'ENHANCEMENT'],
  xpCurve: ['linear', 'exp', 'custom'],
  growthRate: ['flat', 'linear', 'exp'],
  operator: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
  requirementType: ['keeper_level', 'team_size', 'flag', 'trait', 'building', 'currency', 'item', 'has_building', 'has_room', 'parent_has_building', 'parent_has_room', 'in_region'],
  rewardType: ['bird_xp', 'keeper_xp', 'currency', 'item', 'flag', 'text', 'emitEvent'],
  flagOperation: ['set', 'increment', 'decrement', 'invert', 'remove'],
  skipType: ['absolute', 'scaling'],
  giftRewardType: ['currency', 'item', 'entity', 'bundle'],
  eventKind: ['system', 'seasonal', 'promotional'],
  handlerKey: ['createGiftForPlayer'],
  stats: ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'],
  archetypes: ['Dave', 'Astro', 'Magician', 'Ninja', 'Redneck', 'Stoner', 'DJ', 'Viking', 'Monk', 'Corpo', 'Cyborg', 'Buff', 'Mad Scientist', 'Deity'],
  bodySlots: ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'],
  equipmentSlots: ['weapon', 'armor', 'accessory'],
};

const TABLE_SCHEMAS = {
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
      tags: { type: 'stringArray', default: [], description: 'Classification tags' },
      rules: { type: 'levelRules', default: {}, description: 'Level-based rules' },
      requirements: { type: 'requirements', default: [], description: 'Construction conditions' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
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
      minSuccessChance: { type: 'number', default: 0.05, description: 'Min success probability' },
      maxSuccessChance: { type: 'number', default: 0.95, description: 'Max success probability' },
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
      cost: { type: 'costObject', default: {}, description: 'Crafting cost' },
      timer: { type: 'timer', description: 'Duration and skip settings' },
      requiredKeeperLevel: { type: 'number', default: 1, description: 'Min keeper level' },
      rewards: { type: 'json', default: {}, description: 'Crafting output' },
      requirements: { type: 'requirements', default: [], description: 'Crafting conditions' },
      effects: { type: 'effects', default: [], description: 'Side effects on completion' },
      visibilityRequirements: { type: 'requirements', default: [], description: 'Visibility conditions' },
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
      inputSchema: { type: 'json', default: {}, description: 'JSON Schema for payload' },
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
    }
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateId = () => `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const validateRecord = (tableName, record, allData) => {
  const schema = TABLE_SCHEMAS[tableName];
  const errors = [];
  
  // Check required fields
  Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
    if (fieldDef.required && (record[fieldName] === undefined || record[fieldName] === '')) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
    }
  });
  
  // Check reference validity
  Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
    if (fieldDef.type === 'ref' && record[fieldName]) {
      const refTable = fieldDef.refTable;
      const refData = allData[refTable] || [];
      if (!refData.find(r => r.id === record[fieldName])) {
        errors.push({ field: fieldName, message: `Reference "${record[fieldName]}" not found in ${refTable}` });
      }
    }
  });
  
  // Check ID uniqueness
  const tableData = allData[tableName] || [];
  const duplicates = tableData.filter(r => r.id === record.id && r !== record);
  if (duplicates.length > 0) {
    errors.push({ field: 'id', message: `Duplicate ID: ${record.id}` });
  }
  
  return errors;
};

// ============================================================================
// FIELD EDITOR COMPONENTS
// ============================================================================

const FieldLabel = ({ label, required, description }) => (
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

const StringField = ({ value, onChange, placeholder, error }) => (
  <input
    type="text"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
  />
);

const NumberField = ({ value, onChange, step = 1, min, max, error }) => (
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

const BooleanField = ({ value, onChange, label }) => (
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

const EnumField = ({ value, onChange, options, error }) => (
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

const ColorField = ({ value, onChange }) => (
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

const StringArrayField = ({ value = [], onChange }) => {
  const [inputValue, setInputValue] = useState('');
  
  const addTag = () => {
    if (inputValue.trim() && !value.includes(inputValue.trim())) {
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };
  
  const removeTag = (index) => {
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

const RefField = ({ value, onChange, refTable, allData, error }) => {
  const options = (allData[refTable] || []).map(r => r.id);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-600'} rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors`}
    >
      <option value="">-- None --</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
};

const JsonField = ({ value, onChange, error }) => {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [parseError, setParseError] = useState(null);
  
  useEffect(() => {
    setText(JSON.stringify(value || {}, null, 2));
  }, [value]);
  
  const handleChange = (newText) => {
    setText(newText);
    try {
      const parsed = JSON.parse(newText);
      setParseError(null);
      onChange(parsed);
    } catch (e) {
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

// ============================================================================
// COMPLEX FIELD EDITORS
// ============================================================================

const RequirementEditor = ({ requirement, onChange, onRemove, allData }) => {
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
          {ENUMS.requirementType.map(t => <option key={t} value={t}>{t}</option>)}
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
            onChange={(e) => onChange({ ...requirement, ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
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
              {ENUMS.operator.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  );
};

const RequirementsField = ({ value = [], onChange, allData }) => (
  <div className="space-y-2">
    {value.map((req, i) => (
      <RequirementEditor
        key={i}
        requirement={req}
        onChange={(newReq) => {
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

const TimerField = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel label="Duration (seconds)" />
        <NumberField value={value.duration} onChange={(v) => onChange({ ...value, duration: v })} />
      </div>
      <div>
        <FieldLabel label="Skip Type" />
        <EnumField value={value.skip_type} onChange={(v) => onChange({ ...value, skip_type: v })} options={ENUMS.skipType} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel label="Boostable" />
        <BooleanField value={value.boostable} onChange={(v) => onChange({ ...value, boostable: v })} />
      </div>
      <div>
        <FieldLabel label="Skipable" />
        <BooleanField value={value.skipable} onChange={(v) => onChange({ ...value, skipable: v })} />
      </div>
    </div>
    {value.skipable && (
      <div>
        <FieldLabel label="Skip Cost (JSON)" />
        <JsonField value={value.skip_cost || {}} onChange={(v) => onChange({ ...value, skip_cost: v })} />
      </div>
    )}
  </div>
);

const RewardEntryEditor = ({ entry, onChange, onRemove, allData }) => {
  const entryType = entry.type || 'currency';
  const isBundle = entry.bundle !== undefined;
  
  if (isBundle) {
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
            <NumberField value={entry.odds} onChange={(v) => onChange({ ...entry, odds: v })} min={0} max={100} />
          </div>
        </div>
        <div className="pl-3 border-l-2 border-purple-500/50 space-y-2">
          {(entry.bundle || []).map((subEntry, i) => (
            <RewardEntryEditor
              key={i}
              entry={subEntry}
              onChange={(newEntry) => {
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
          {ENUMS.rewardType.map(t => <option key={t} value={t}>{t}</option>)}
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
        {['bird_xp', 'keeper_xp', 'currency', 'item'].includes(entryType) && (
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
              {ENUMS.flagOperation.map(op => <option key={op} value={op}>{op}</option>)}
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
          <>
            <input
              type="text"
              value={entry.defId || ''}
              onChange={(e) => onChange({ ...entry, defId: e.target.value })}
              placeholder="Event Def ID"
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
            <input
              type="text"
              value={entry.idempotencyKey || ''}
              onChange={(e) => onChange({ ...entry, idempotencyKey: e.target.value })}
              placeholder="Idempotency Key"
              className="col-span-2 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            />
          </>
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
    </div>
  );
};

const OutcomeBlockField = ({ value = { rewards: [] }, onChange, allData }) => (
  <div className="space-y-2">
    <div className="text-xs text-gray-400 mb-2">Rewards array (includes rewards, effects, text, bundles)</div>
    {(value.rewards || []).map((entry, i) => (
      <RewardEntryEditor
        key={i}
        entry={entry}
        onChange={(newEntry) => {
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

const EquipDataField = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Slot" />
      <EnumField value={value.slot} onChange={(v) => onChange({ ...value, slot: v })} options={ENUMS.equipmentSlots} />
    </div>
    <div>
      <FieldLabel label="Stats" />
      <div className="grid grid-cols-3 gap-2">
        {ENUMS.stats.map(stat => (
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

const ConsumableDataField = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Effect Type" />
      <StringField value={value.effect} onChange={(v) => onChange({ ...value, effect: v })} placeholder="heal, speed_boost, etc." />
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div>
        <FieldLabel label="Amount" />
        <NumberField value={value.amount} onChange={(v) => onChange({ ...value, amount: v })} />
      </div>
      <div>
        <FieldLabel label="Duration (s)" />
        <NumberField value={value.duration} onChange={(v) => onChange({ ...value, duration: v })} />
      </div>
      <div>
        <FieldLabel label="Multiplier" />
        <NumberField value={value.multiplier} onChange={(v) => onChange({ ...value, multiplier: v })} step={0.1} />
      </div>
    </div>
  </div>
);

const BodySlotsField = ({ value = {}, onChange }) => (
  <div className="space-y-2">
    {ENUMS.bodySlots.map(slot => (
      <div key={slot} className="bg-gray-800/50 rounded p-2">
        <FieldLabel label={slot} />
        <div className="flex flex-wrap gap-1">
          {ENUMS.archetypes.map(arch => (
            <button
              key={arch}
              onClick={() => {
                const current = value[slot] || [];
                const newValue = { ...value };
                if (current.includes(arch)) {
                  newValue[slot] = current.filter(a => a !== arch);
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

const EquipmentSlotsField = ({ value = {}, onChange }) => (
  <div className="space-y-2">
    {ENUMS.equipmentSlots.map(slot => (
      <div key={slot} className="flex items-center gap-3 bg-gray-800/50 rounded p-2">
        <span className="text-sm text-gray-300 w-24">{slot}</span>
        <NumberField
          value={value[slot]}
          onChange={(v) => {
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

const SlotStatsField = ({ value = {}, onChange }) => (
  <div className="space-y-2">
    {ENUMS.bodySlots.map(slot => (
      <div key={slot} className="bg-gray-800/50 rounded p-2">
        <FieldLabel label={slot} />
        <div className="grid grid-cols-6 gap-1">
          {ENUMS.stats.map(stat => (
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

const CostObjectField = ({ value = {}, onChange }) => {
  const entries = Object.entries(value);
  
  return (
    <div className="space-y-2">
      {entries.map(([key, amount], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => {
              const newValue = {};
              entries.forEach(([k, v], j) => {
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

const EffectsField = ({ value = [], onChange }) => (
  <div className="space-y-2">
    {value.map((effect, i) => (
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
            {ENUMS.flagOperation.map(op => <option key={op} value={op}>{op}</option>)}
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

const EventSecurityField = ({ value = {}, onChange }) => (
  <div className="space-y-2 bg-gray-800/50 rounded p-3">
    <FieldLabel label="Allowed Emitters" description="Leave empty to allow all" />
    <StringArrayField
      value={value.allowedEmitters || []}
      onChange={(v) => onChange({ ...value, allowedEmitters: v })}
    />
  </div>
);

const GiftPresentationField = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Title" />
      <StringField value={value.title} onChange={(v) => onChange({ ...value, title: v })} />
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
        <StringField value={value.iconKey} onChange={(v) => onChange({ ...value, iconKey: v })} />
      </div>
      <div>
        <FieldLabel label="Rarity" />
        <EnumField value={value.rarity} onChange={(v) => onChange({ ...value, rarity: v })} options={ENUMS.itemRarity} />
      </div>
    </div>
  </div>
);

const GiftClaimRulesField = ({ value = {}, onChange }) => (
  <div className="space-y-3 bg-gray-800/50 rounded p-3">
    <div>
      <FieldLabel label="Expires In (seconds)" description="Leave blank for no expiry" />
      <NumberField value={value.expiresInSeconds} onChange={(v) => onChange({ ...value, expiresInSeconds: v })} />
    </div>
    <div>
      <FieldLabel label="Limit Per Player" description="Leave blank for unlimited" />
      <NumberField value={value.limitPerPlayer} onChange={(v) => onChange({ ...value, limitPerPlayer: v })} />
    </div>
  </div>
);

const GiftRewardSpecField = ({ value = {}, onChange, allData }) => {
  const rewardType = value.type || 'currency';
  const isBundle = rewardType === 'bundle';
  
  return (
    <div className="space-y-3 bg-gray-800/50 rounded p-3">
      <div>
        <FieldLabel label="Reward Type" />
        <EnumField value={rewardType} onChange={(v) => onChange({ type: v })} options={ENUMS.giftRewardType} />
      </div>
      
      {rewardType === 'currency' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Currency ID" />
            <RefField value={value.currencyId} onChange={(v) => onChange({ ...value, currencyId: v })} refTable="Currency" allData={allData} />
          </div>
          <div>
            <FieldLabel label="Amount" />
            <NumberField value={value.amount} onChange={(v) => onChange({ ...value, amount: v })} />
          </div>
        </div>
      )}
      
      {rewardType === 'item' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Item Def ID" />
            <RefField value={value.itemDefId} onChange={(v) => onChange({ ...value, itemDefId: v })} refTable="ItemDef" allData={allData} />
          </div>
          <div>
            <FieldLabel label="Quantity" />
            <NumberField value={value.qty} onChange={(v) => onChange({ ...value, qty: v })} />
          </div>
        </div>
      )}
      
      {rewardType === 'entity' && (
        <div>
          <FieldLabel label="Entity Definition ID" />
          <RefField value={value.definitionId} onChange={(v) => onChange({ ...value, definitionId: v })} refTable="EntityDefinition" allData={allData} />
        </div>
      )}
      
      {isBundle && (
        <div className="space-y-2">
          <FieldLabel label="Bundle Entries" />
          {(value.entries || []).map((entry, i) => (
            <div key={i} className="bg-gray-700/50 rounded p-2">
              <GiftRewardSpecField
                value={entry}
                onChange={(newEntry) => {
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

const LevelRulesField = ({ value = {}, onChange }) => {
  const [expandedLevels, setExpandedLevels] = useState(new Set(['1']));
  const levelEntries = Object.entries(value.level || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <FieldLabel label="Max Level" />
          <NumberField value={value.maxLevel} onChange={(v) => onChange({ ...value, maxLevel: v })} />
        </div>
        <div>
          <FieldLabel label="XP Curve" />
          <EnumField value={value.xpCurve} onChange={(v) => onChange({ ...value, xpCurve: v })} options={ENUMS.xpCurve} />
        </div>
        <div>
          <FieldLabel label="Base XP" />
          <NumberField value={value.baseXP} onChange={(v) => onChange({ ...value, baseXP: v })} />
        </div>
        <div>
          <FieldLabel label="XP Rate" />
          <NumberField value={value.xpRate} onChange={(v) => onChange({ ...value, xpRate: v })} step={0.1} />
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
                  onChange={(newBlock) => {
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
            id="newLevelInput"
            className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
          />
          <button
            onClick={() => {
              const input = document.getElementById('newLevelInput');
              const levelNum = input.value;
              if (levelNum && !value.level?.[levelNum]) {
                const newLevel = { ...(value.level || {}) };
                newLevel[levelNum] = {};
                onChange({ ...value, level: newLevel });
                input.value = '';
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

// ============================================================================
// FIELD RENDERER
// ============================================================================

const FieldEditor = ({ fieldName, fieldDef, value, onChange, allData, error }) => {
  const fieldError = error?.find(e => e.field === fieldName);
  
  const renderField = () => {
    switch (fieldDef.type) {
      case 'string':
        return <StringField value={value} onChange={onChange} error={fieldError} />;
      case 'number':
        return <NumberField value={value} onChange={onChange} error={fieldError} />;
      case 'boolean':
        return <BooleanField value={value} onChange={onChange} />;
      case 'enum':
        return <EnumField value={value} onChange={onChange} options={ENUMS[fieldDef.enum]} error={fieldError} />;
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

// ============================================================================
// RECORD EDITOR PANEL
// ============================================================================

const RecordEditor = ({ tableName, record, onSave, onCancel, allData }) => {
  const [editedRecord, setEditedRecord] = useState(deepClone(record));
  const schema = TABLE_SCHEMAS[tableName];
  const errors = validateRecord(tableName, editedRecord, allData);
  
  const handleFieldChange = (fieldName, value) => {
    setEditedRecord(prev => ({ ...prev, [fieldName]: value }));
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
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
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(schema.fields).map(([fieldName, fieldDef]) => (
          <FieldEditor
            key={fieldName}
            fieldName={fieldName}
            fieldDef={fieldDef}
            value={editedRecord[fieldName]}
            onChange={(value) => handleFieldChange(fieldName, value)}
            allData={allData}
            error={errors}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// RECORD LIST
// ============================================================================

const RecordRow = ({ tableName, record, isSelected, onClick, onDelete, allData }) => {
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

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const DerpAdminEditor = () => {
  const [data, setData] = useState(() => {
    const initial = {};
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      initial[table] = [];
    });
    return initial;
  });
  
  const [selectedTable, setSelectedTable] = useState('Currency');
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  
  const selectedRecord = useMemo(() => {
    return (data[selectedTable] || []).find(r => r.id === selectedRecordId);
  }, [data, selectedTable, selectedRecordId]);
  
  const filteredRecords = useMemo(() => {
    const records = data[selectedTable] || [];
    if (!searchTerm) return records;
    const term = searchTerm.toLowerCase();
    return records.filter(r => 
      r.id?.toLowerCase().includes(term) || 
      r.name?.toLowerCase().includes(term)
    );
  }, [data, selectedTable, searchTerm]);
  
  const totalErrors = useMemo(() => {
    let count = 0;
    Object.entries(data).forEach(([tableName, records]) => {
      records.forEach(record => {
        count += validateRecord(tableName, record, data).length;
      });
    });
    return count;
  }, [data]);
  
  const handleAddRecord = () => {
    const newRecord = { id: generateId() };
    const schema = TABLE_SCHEMAS[selectedTable];
    
    // Apply defaults
    Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
      if (fieldDef.default !== undefined) {
        newRecord[fieldName] = typeof fieldDef.default === 'object' 
          ? deepClone(fieldDef.default) 
          : fieldDef.default;
      }
    });
    
    setData(prev => ({
      ...prev,
      [selectedTable]: [...(prev[selectedTable] || []), newRecord]
    }));
    setSelectedRecordId(newRecord.id);
  };
  
  const handleSaveRecord = (updatedRecord) => {
    setData(prev => ({
      ...prev,
      [selectedTable]: prev[selectedTable].map(r => 
        r.id === selectedRecordId ? updatedRecord : r
      )
    }));
    setSelectedRecordId(updatedRecord.id);
  };
  
  const handleDeleteRecord = (recordId) => {
    if (confirm('Delete this record?')) {
      setData(prev => ({
        ...prev,
        [selectedTable]: prev[selectedTable].filter(r => r.id !== recordId)
      }));
      if (selectedRecordId === recordId) {
        setSelectedRecordId(null);
      }
    }
  };
  
  const handleExport = () => {
    const exportData = {
      _meta: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tables: Object.keys(TABLE_SCHEMAS),
      },
      ...data
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `derp-universe-seed-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImport = (importedData) => {
    const newData = {};
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      newData[table] = importedData[table] || [];
    });
    setData(newData);
    setShowImportModal(false);
    setSelectedRecordId(null);
  };
  
  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
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
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Table Sidebar */}
        <nav className="flex-none w-56 bg-gray-900/50 border-r border-gray-800 overflow-y-auto">
          <div className="p-2">
            {Object.entries(TABLE_SCHEMAS).map(([tableName, schema]) => {
              const Icon = schema.icon;
              const recordCount = (data[tableName] || []).length;
              const tableErrors = (data[tableName] || []).reduce((count, record) => 
                count + validateRecord(tableName, record, data).length, 0
              );
              
              return (
                <button
                  key={tableName}
                  onClick={() => { setSelectedTable(tableName); setSelectedRecordId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-left text-sm transition-colors ${selectedTable === tableName ? 'bg-cyan-600/30 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                >
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
                </button>
              );
            })}
          </div>
        </nav>
        
        {/* Record List */}
        <div className="flex-none w-72 bg-gray-900/30 border-r border-gray-800 flex flex-col">
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
              filteredRecords.map(record => (
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
        </div>
        
        {/* Editor Panel */}
        <div className="flex-1 bg-gray-900/20 min-w-0">
          {selectedRecord ? (
            <RecordEditor
              key={`${selectedTable}-${selectedRecordId}`}
              tableName={selectedTable}
              record={selectedRecord}
              onSave={handleSaveRecord}
              onCancel={() => setSelectedRecordId(null)}
              allData={data}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Database size={48} className="mx-auto mb-4 opacity-30" />
                <p>Select a record to edit</p>
                <p className="text-sm">or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Import Modal */}
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
  );
};

const ImportPanel = ({ onImport, onCancel }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  
  const handleTextChange = (value) => {
    setText(value);
    setError(null);
    setPreview(null);
    
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        const tableCounts = {};
        Object.keys(TABLE_SCHEMAS).forEach(table => {
          tableCounts[table] = (parsed[table] || []).length;
        });
        setPreview(tableCounts);
      } catch (e) {
        setError('Invalid JSON: ' + e.message);
      }
    }
  };
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        handleTextChange(evt.target.result);
      };
      reader.readAsText(file);
    }
  };
  
  const handleImport = () => {
    try {
      const parsed = JSON.parse(text);
      onImport(parsed);
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
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
          disabled={!preview || error}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm"
        >
          Import Data
        </button>
      </div>
    </div>
  );
};

export default DerpAdminEditor;

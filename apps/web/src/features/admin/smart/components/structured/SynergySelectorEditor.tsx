import {
  containerStyle,
  inputStyle,
  numberInputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
} from './editorStyles';
import { type StructuredEditorProps, omitKey } from './editorContract';

export interface SynergySelector {
  entityTypes?: string[];
  speciesIds?: string[];
  collections?: string[];
  traitsAny?: string[];
  traitsAll?: string[];
  minTraitCount?: number;
  entityIds?: string[];
  rarities?: string[];
  regions?: string[];
  locationTypes?: string[];
  buildingTagsAny?: string[];
  missionTagsAny?: string[];
  factions?: string[];
}

const ENTITY_TYPES = ['keeper', 'creature'];
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const LOCATION_TYPES = ['outpost', 'dungeon', 'city', 'wilderness', 'sanctum'];

type Props = StructuredEditorProps<SynergySelector>;

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      const next = selected.filter(x => x !== opt);
      onChange(next);
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <label
            key={opt}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              fontSize: 11,
              color: selected.includes(opt) ? '#a78bfa' : '#666',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${selected.includes(opt) ? '#a78bfa' : '#2a2a4e'}`,
              background: selected.includes(opt) ? 'rgba(167,139,250,0.1)' : 'transparent',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              style={{ display: 'none' }}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
  };
  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: tags.length ? 4 : 0 }}>
        {tags.map(tag => (
          <span
            key={tag}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 7px', background: '#1a1a2e', border: '1px solid #444',
              borderRadius: 12, color: '#e0e0ff', fontSize: 11,
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder ?? 'Type and press Enter…'}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const v = e.currentTarget.value.trim();
            if (v) { addTag(v); e.currentTarget.value = ''; }
          }
        }}
        onBlur={e => {
          const v = e.target.value.trim();
          if (v) { addTag(v); e.target.value = ''; }
        }}
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  );
}

const EMPTY: SynergySelector = {};

export const validate = validateSynergySelector;
export function validateSynergySelector(_v: SynergySelector | null | undefined): Record<string, string> {
  return {};
}

export function synergySelectorErrorCount(v: SynergySelector | null | undefined): number {
  return Object.keys(validateSynergySelector(v)).length;
}

export default function SynergySelectorEditor({ value, onChange }: Props) {
  const sel: SynergySelector = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;

  const set = <K extends keyof SynergySelector>(key: K, v: SynergySelector[K]) => {
    const isEmptyArray = Array.isArray(v) && (v as unknown[]).length === 0;
    const isUndefined = v === undefined || v === null || isEmptyArray;
    if (isUndefined) {
      const rest = omitKey(sel, key);
      onChange(Object.keys(rest).length > 0 ? rest as SynergySelector : EMPTY);
    } else {
      onChange({ ...sel, [key]: v });
    }
  };

  const isEmpty = Object.keys(sel).length === 0;

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      {isEmpty && (
        <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic', padding: '4px 0' }}>
          Empty selector matches any entity. Fill in fields to narrow the match.
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Entity Classification
        </div>
        <CheckboxGroup
          label="entityTypes"
          options={ENTITY_TYPES}
          selected={sel.entityTypes ?? []}
          onChange={v => set('entityTypes', v)}
        />
        <CheckboxGroup
          label="rarities"
          options={RARITIES}
          selected={sel.rarities ?? []}
          onChange={v => set('rarities', v)}
        />
        <CheckboxGroup
          label="locationTypes"
          options={LOCATION_TYPES}
          selected={sel.locationTypes ?? []}
          onChange={v => set('locationTypes', v)}
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Identity Filters
        </div>
        <TagInput
          label="speciesIds"
          tags={sel.speciesIds ?? []}
          onChange={v => set('speciesIds', v)}
          placeholder="species ID, press Enter…"
        />
        <TagInput
          label="collections"
          tags={sel.collections ?? []}
          onChange={v => set('collections', v)}
          placeholder="collection slug, press Enter…"
        />
        <TagInput
          label="entityIds"
          tags={sel.entityIds ?? []}
          onChange={v => set('entityIds', v)}
          placeholder="entity ID, press Enter…"
        />
        <TagInput
          label="factions"
          tags={sel.factions ?? []}
          onChange={v => set('factions', v)}
          placeholder="faction name, press Enter…"
        />
        <TagInput
          label="regions"
          tags={sel.regions ?? []}
          onChange={v => set('regions', v)}
          placeholder="region ID, press Enter…"
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Trait Filters
        </div>
        <TagInput
          label="traitsAny (matches if entity has any of these)"
          tags={sel.traitsAny ?? []}
          onChange={v => set('traitsAny', v)}
          placeholder="trait name, press Enter…"
        />
        <TagInput
          label="traitsAll (matches only if entity has ALL of these)"
          tags={sel.traitsAll ?? []}
          onChange={v => set('traitsAll', v)}
          placeholder="trait name, press Enter…"
        />
        <div style={{ ...fieldGroupStyle, maxWidth: 160 }}>
          <span style={labelStyle}>minTraitCount</span>
          <input
            type="number"
            value={sel.minTraitCount ?? ''}
            placeholder="—"
            min={0}
            onChange={e => set('minTraitCount', e.target.value === '' ? undefined : Number(e.target.value))}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Activity Filters
        </div>
        <TagInput
          label="buildingTagsAny"
          tags={sel.buildingTagsAny ?? []}
          onChange={v => set('buildingTagsAny', v)}
          placeholder="building tag, press Enter…"
        />
        <TagInput
          label="missionTagsAny"
          tags={sel.missionTagsAny ?? []}
          onChange={v => set('missionTagsAny', v)}
          placeholder="mission tag, press Enter…"
        />
      </div>
    </div>
  );
}

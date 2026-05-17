import {
  inputStyle,
  numberInputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
  containerStyle,
} from './editorStyles';
import type { StructuredEditorProps } from './editorContract';

export interface SynergyRuleContext {
  activityTypes?: string[];
  missionTypes?: string[];
  missionTagsAny?: string[];
  regionIds?: string[];
  seasonIds?: string[];
  requiresTeamSizeMin?: number;
  requiresTeamSizeMax?: number;
}

const ACTIVITY_TYPES = ['mission', 'crafting', 'outpost'];

type Props = StructuredEditorProps<SynergyRuleContext>;

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
    if (selected.includes(opt)) onChange(selected.filter(x => x !== opt));
    else onChange([...selected, opt]);
  };

  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <label
            key={opt}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              fontSize: 11, color: selected.includes(opt) ? '#a78bfa' : '#666',
              padding: '3px 8px', borderRadius: 4,
              border: `1px solid ${selected.includes(opt) ? '#a78bfa' : '#2a2a4e'}`,
              background: selected.includes(opt) ? 'rgba(167,139,250,0.1)' : 'transparent',
              userSelect: 'none',
            }}
          >
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ display: 'none' }} />
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
    const t = tag.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
  };
  return (
    <div style={fieldGroupStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: tags.length ? 4 : 0 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
            background: '#1a1a2e', border: '1px solid #444', borderRadius: 12,
            color: '#e0e0ff', fontSize: 11,
          }}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
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
        onBlur={e => { const v = e.target.value.trim(); if (v) { addTag(v); e.target.value = ''; } }}
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  );
}

const EMPTY: SynergyRuleContext = {};

export const validate = validateSynergyContext;
export function validateSynergyContext(_v: SynergyRuleContext | null | undefined): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!_v) return errs;
  const min = _v.requiresTeamSizeMin;
  const max = _v.requiresTeamSizeMax;
  if (min !== undefined && max !== undefined && min > max) {
    errs.teamSize = 'min team size cannot exceed max';
  }
  return errs;
}

export function synergyContextErrorCount(v: SynergyRuleContext | null | undefined): number {
  return Object.keys(validateSynergyContext(v)).length;
}

export default function SynergyContextEditor({ value, onChange }: Props) {
  const ctx: SynergyRuleContext = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;

  const set = <K extends keyof SynergyRuleContext>(key: K, v: SynergyRuleContext[K]) => {
    const isEmptyArray = Array.isArray(v) && (v as any[]).length === 0;
    const isUndefined = v === undefined || v === null || isEmptyArray;
    if (isUndefined) {
      const { [key]: _, ...rest } = ctx as any;
      onChange(Object.keys(rest).length > 0 ? rest : EMPTY);
    } else {
      onChange({ ...ctx, [key]: v });
    }
  };

  const isEmpty = Object.keys(ctx).length === 0;
  const errs = validateSynergyContext(ctx);

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      {isEmpty && (
        <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic', padding: '4px 0' }}>
          Empty context matches all activities. Fill in fields to restrict when this rule fires.
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Activity Filter
        </div>
        <CheckboxGroup
          label="activityTypes"
          options={ACTIVITY_TYPES}
          selected={ctx.activityTypes ?? []}
          onChange={v => set('activityTypes', v)}
        />
        <TagInput
          label="missionTypes"
          tags={ctx.missionTypes ?? []}
          onChange={v => set('missionTypes', v)}
          placeholder="mission type, press Enter…"
        />
        <TagInput
          label="missionTagsAny"
          tags={ctx.missionTagsAny ?? []}
          onChange={v => set('missionTagsAny', v)}
          placeholder="mission tag, press Enter…"
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Location & Season
        </div>
        <TagInput
          label="regionIds"
          tags={ctx.regionIds ?? []}
          onChange={v => set('regionIds', v)}
          placeholder="region ID, press Enter…"
        />
        <TagInput
          label="seasonIds"
          tags={ctx.seasonIds ?? []}
          onChange={v => set('seasonIds', v)}
          placeholder="season ID, press Enter…"
        />
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Team Size Gate
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, maxWidth: 160 }}>
            <span style={labelStyle}>requiresTeamSizeMin</span>
            <input
              type="number"
              value={ctx.requiresTeamSizeMin ?? ''}
              placeholder="—"
              min={1}
              onChange={e => set('requiresTeamSizeMin', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.teamSize ? '#ef4444' : undefined }}
            />
          </div>
          <div style={{ ...fieldGroupStyle, maxWidth: 160 }}>
            <span style={labelStyle}>requiresTeamSizeMax</span>
            <input
              type="number"
              value={ctx.requiresTeamSizeMax ?? ''}
              placeholder="—"
              min={1}
              onChange={e => set('requiresTeamSizeMax', e.target.value === '' ? undefined : Number(e.target.value))}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.teamSize ? '#ef4444' : undefined }}
            />
          </div>
        </div>
        {errs.teamSize && <span style={{ color: '#ef4444', fontSize: 11 }}>{errs.teamSize}</span>}
      </div>
    </div>
  );
}

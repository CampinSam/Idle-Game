import { useState } from 'react';
import RefSelect, { getCachedRefRow } from '../RefSelect';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  numberInputStyle,
  inputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';
import { errorTextStyle, errorWrapperStyle } from './validation';
import type { StructuredEditorProps } from './editorContract';

export type SynergyEffectType =
  | 'synergy_score_modifier'
  | 'stat_modifier'
  | 'duration_modifier'
  | 'resource_yield_modifier'
  | 'immunity';

export type SynergyOperation = 'flat_add' | 'percent_add' | 'multiplier' | 'flat_seconds';

export interface SynergyEffect {
  type: SynergyEffectType;
  operation?: SynergyOperation;
  value?: number;
  stat?: string;
  activity?: string;
  resourceId?: string;
  immuneTo?: string;
}

const EFFECT_TYPES: SynergyEffectType[] = [
  'synergy_score_modifier',
  'stat_modifier',
  'duration_modifier',
  'resource_yield_modifier',
  'immunity',
];

const STAT_NAMES = ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT', 'RND'];
const ACTIVITY_TYPES = ['mission', 'crafting', 'outpost'];

interface EffectErrors {
  type?: string;
  operation?: string;
  value?: string;
  stat?: string;
  activity?: string;
  resourceId?: string;
  immuneTo?: string;
}

export function validateSynergyEffect(effect: SynergyEffect): EffectErrors {
  const errs: EffectErrors = {};
  if (!effect.type) { errs.type = 'type required'; return errs; }

  const requiresValue = effect.type !== 'immunity';
  const requiresOperation = effect.type !== 'immunity';

  if (requiresOperation && !effect.operation) errs.operation = 'operation required';
  if (requiresValue && (effect.value === undefined || effect.value === null || isNaN(Number(effect.value)))) {
    errs.value = 'value required';
  }
  if (effect.type === 'stat_modifier' && !effect.stat) errs.stat = 'stat required';
  if (effect.type === 'duration_modifier' && !effect.activity) errs.activity = 'activity required';
  if (effect.type === 'resource_yield_modifier' && !effect.resourceId) errs.resourceId = 'resourceId required';
  if (effect.type === 'immunity' && !effect.immuneTo) errs.immuneTo = 'immuneTo required';
  return errs;
}

export function validateSynergyEffects(effects: any): EffectErrors[] {
  const arr = Array.isArray(effects) ? effects : [];
  return arr.map(validateSynergyEffect);
}

export const validate = validateSynergyEffects;
export function synergyEffectsErrorCount(effects: any): number {
  return validateSynergyEffects(effects).reduce((n, e) => n + Object.keys(e).length, 0);
}

export function synergyEffectsErrorMessages(effects: any, fieldName: string): string[] {
  const arr = Array.isArray(effects) ? effects : [];
  const msgs: string[] = [];
  arr.forEach((effect: SynergyEffect, i: number) => {
    const errs = validateSynergyEffect(effect);
    Object.values(errs).forEach(msg => msgs.push(`${fieldName}[${i}]: ${msg}`));
  });
  return msgs;
}

function defaultEffect(type: SynergyEffectType): SynergyEffect {
  switch (type) {
    case 'synergy_score_modifier':
      return { type, operation: 'flat_add', value: 10 };
    case 'stat_modifier':
      return { type, stat: 'ATK', operation: 'percent_add', value: 5 };
    case 'duration_modifier':
      return { type, activity: 'mission', operation: 'percent_add', value: -10 };
    case 'resource_yield_modifier':
      return { type, resourceId: '', operation: 'percent_add', value: 10 };
    case 'immunity':
      return { type, immuneTo: '' };
  }
}

function operationsFor(type: SynergyEffectType): SynergyOperation[] {
  if (type === 'duration_modifier') return ['flat_seconds', 'percent_add', 'multiplier'];
  if (type === 'immunity') return [];
  return ['flat_add', 'percent_add', 'multiplier'];
}

type ResourceKind = 'currency' | 'item';

function EffectEntryEditor({
  effect,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  effect: SynergyEffect;
  onChange: (e: SynergyEffect) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [resourceKind, setResourceKind] = useState<ResourceKind>(() => {
    const id = effect.resourceId;
    if (!id) return 'currency';
    if (getCachedRefRow('ItemDef', id)) return 'item';
    return 'currency';
  });
  const errs = validateSynergyEffect(effect);
  const ops = operationsFor(effect.type);

  const handleTypeChange = (newType: SynergyEffectType) => {
    onChange(defaultEffect(newType));
  };

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>type</span>
          <select
            value={effect.type}
            onChange={e => handleTypeChange(e.target.value as SynergyEffectType)}
            style={{ ...selectStyle, width: '100%' }}
          >
            {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errs.type && <span style={errorTextStyle}>{errs.type}</span>}
        </div>

        {ops.length > 0 && (
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>operation</span>
            <select
              value={effect.operation ?? ''}
              onChange={e => onChange({ ...effect, operation: e.target.value as SynergyOperation })}
              style={{ ...selectStyle, width: '100%', borderColor: errs.operation ? '#ef4444' : undefined }}
            >
              <option value="">— select —</option>
              {ops.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errs.operation && <span style={errorTextStyle}>{errs.operation}</span>}
          </div>
        )}

        {effect.type !== 'immunity' && (
          <div style={{ ...fieldGroupStyle, maxWidth: 120 }}>
            <span style={labelStyle}>value</span>
            <input
              type="number"
              step="any"
              value={effect.value ?? ''}
              onChange={e => onChange({ ...effect, value: e.target.value === '' ? undefined : Number(e.target.value) })}
              style={{ ...numberInputStyle, width: '100%', borderColor: errs.value ? '#ef4444' : undefined }}
            />
            {errs.value && <span style={errorTextStyle}>{errs.value}</span>}
          </div>
        )}

        {effect.type === 'stat_modifier' && (
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>stat</span>
            <select
              value={effect.stat ?? ''}
              onChange={e => onChange({ ...effect, stat: e.target.value })}
              style={{ ...selectStyle, width: '100%', borderColor: errs.stat ? '#ef4444' : undefined }}
            >
              <option value="">— select —</option>
              {STAT_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {errs.stat && <span style={errorTextStyle}>{errs.stat}</span>}
          </div>
        )}

        {effect.type === 'duration_modifier' && (
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>activity</span>
            <select
              value={effect.activity ?? ''}
              onChange={e => onChange({ ...effect, activity: e.target.value })}
              style={{ ...selectStyle, width: '100%', borderColor: errs.activity ? '#ef4444' : undefined }}
            >
              <option value="">— select —</option>
              {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errs.activity && <span style={errorTextStyle}>{errs.activity}</span>}
          </div>
        )}

        {effect.type === 'resource_yield_modifier' && (
          <>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>resource type</span>
              <select
                value={resourceKind}
                onChange={e => {
                  setResourceKind(e.target.value as ResourceKind);
                  onChange({ ...effect, resourceId: '' });
                }}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="currency">currency</option>
                <option value="item">item</option>
              </select>
            </div>
            <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
              <span style={labelStyle}>resourceId</span>
              <div style={errs.resourceId ? errorWrapperStyle : undefined}>
                <RefSelect
                  refTable={resourceKind === 'currency' ? 'Currency' : 'ItemDef'}
                  value={effect.resourceId ?? null}
                  onChange={v => onChange({ ...effect, resourceId: v ?? '' })}
                  placeholder={resourceKind === 'currency' ? 'Select Currency...' : 'Select Item...'}
                />
              </div>
              {errs.resourceId && <span style={errorTextStyle}>{errs.resourceId}</span>}
            </div>
          </>
        )}

        {effect.type === 'immunity' && (
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>immuneTo</span>
            <input
              type="text"
              value={effect.immuneTo ?? ''}
              placeholder="effect type or status"
              onChange={e => onChange({ ...effect, immuneTo: e.target.value })}
              style={{ ...inputStyle, width: '100%', borderColor: errs.immuneTo ? '#ef4444' : undefined }}
            />
            {errs.immuneTo && <span style={errorTextStyle}>{errs.immuneTo}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>
    </div>
  );
}

type Props = StructuredEditorProps<SynergyEffect[]>;

export default function SynergyEffectsEditor({ value, onChange }: Props) {
  const items: SynergyEffect[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: SynergyEffect) => {
    const arr = items.slice();
    arr[idx] = next;
    onChange(arr);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const arr = items.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };
  const add = (type: SynergyEffectType) => onChange([...items, defaultEffect(type)]);

  return (
    <div style={containerStyle}>
      {items.map((effect, idx) => (
        <EffectEntryEditor
          key={idx}
          effect={effect}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {EFFECT_TYPES.map(t => (
          <button key={t} type="button" style={addButtonStyle} onClick={() => add(t)}>
            + {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}

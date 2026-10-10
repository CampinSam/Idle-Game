import { useState } from 'react';
import RefSelect from '../RefSelect';
import OutcomeListEditor from './OutcomeListEditor';
import GiftPresentationEditor from './GiftPresentationEditor';
import GiftClaimRulesEditor from './GiftClaimRulesEditor';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  numberInputStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
  selectStyle,
  sectionStyle,
} from './editorStyles';

export interface GiftRef {
  giftDefId: string;
}

export interface InlineGiftDef {
  name: string;
  presentation?: Record<string, any>;
  claimRules?: Record<string, any>;
  rewardSpec?: any;
  instant?: boolean;
  modalDefId?: string;
}

export type GiftSpec = GiftRef | InlineGiftDef;

export interface CheckInDayReward {
  day?: number;
  gift?: GiftSpec;
  [k: string]: any;
}

function isGiftRef(spec: GiftSpec | undefined | null): spec is GiftRef {
  return !!spec && typeof (spec as any).giftDefId === 'string';
}

function giftSpecMode(spec: GiftSpec | undefined | null): 'ref' | 'inline' {
  if (!spec) return 'ref';
  return isGiftRef(spec) ? 'ref' : 'inline';
}

interface ListProps {
  value: any;
  onChange: (val: CheckInDayReward[]) => void;
}

function CheckInDayEntry({
  entry, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  entry: CheckInDayReward;
  onChange: (e: CheckInDayReward) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentSpec = entry.gift as GiftSpec | undefined;
  const mode = giftSpecMode(currentSpec);

  const setMode = (next: 'ref' | 'inline') => {
    if (next === 'ref') {
      onChange({ ...entry, gift: { giftDefId: '' } });
    } else {
      onChange({ ...entry, gift: { name: '', instant: true } });
    }
  };

  const inlineGift = (!isGiftRef(currentSpec) && currentSpec) ? currentSpec as InlineGiftDef : { name: '', instant: true };
  const refGiftId = isGiftRef(currentSpec) ? currentSpec.giftDefId : '';

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>day</span>
          <input
            type="number"
            min={0}
            value={entry.day ?? ''}
            onChange={e => onChange({ ...entry, day: e.target.value === '' ? undefined : Number(e.target.value) })}
            style={{ ...numberInputStyle, width: '100%' }}
          />
        </div>
        <div style={{ ...fieldGroupStyle, minWidth: 90 }}>
          <span style={labelStyle}>gift type</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as 'ref' | 'inline')}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="ref">GiftDef ref</option>
            <option value="inline">Inline</option>
          </select>
        </div>
        {mode === 'ref' && (
          <div style={{ ...fieldGroupStyle, flex: 3, minWidth: 200 }}>
            <span style={labelStyle}>giftDefId</span>
            <RefSelect
              refTable="GiftDef"
              value={refGiftId || null}
              onChange={v => onChange({ ...entry, gift: { giftDefId: v ?? '' } })}
              placeholder="Select GiftDef..."
            />
          </div>
        )}
        {mode === 'inline' && (
          <div style={{ ...fieldGroupStyle, flex: 3, minWidth: 200 }}>
            <span style={labelStyle}>name</span>
            <input
              type="text"
              value={inlineGift.name ?? ''}
              placeholder="Inline gift name"
              onChange={e => onChange({ ...entry, gift: { ...inlineGift, name: e.target.value } })}
              style={{ padding: '5px 8px', background: '#0f0f2e', border: '1px solid #333', borderRadius: 4, color: '#e0e0ff', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 1 }}>
          {mode === 'inline' && (
            <button type="button" style={iconButtonStyle} onClick={() => setExpanded(x => !x)} title={expanded ? 'Collapse' : 'Expand inline fields'}>
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button type="button" style={iconButtonStyle} disabled={!canMoveUp} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={iconButtonStyle} disabled={!canMoveDown} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Remove">×</button>
        </div>
      </div>

      {mode === 'inline' && expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div style={sectionStyle}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Presentation
            </div>
            <GiftPresentationEditor
              value={inlineGift.presentation ?? {}}
              onChange={pres => onChange({ ...entry, gift: { ...inlineGift, presentation: pres } })}
            />
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Claim Rules
            </div>
            <GiftClaimRulesEditor
              value={inlineGift.claimRules ?? {}}
              onChange={rules => onChange({ ...entry, gift: { ...inlineGift, claimRules: rules } })}
            />
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Reward Spec
            </div>
            <OutcomeListEditor
              value={Array.isArray(inlineGift.rewardSpec) ? inlineGift.rewardSpec : []}
              onChange={spec => onChange({ ...entry, gift: { ...inlineGift, rewardSpec: spec } })}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={fieldGroupStyle}>
              <span style={labelStyle}>instant</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={inlineGift.instant !== false}
                  onChange={e => onChange({ ...entry, gift: { ...inlineGift, instant: e.target.checked } })}
                />
                <span style={{ fontSize: 12, color: '#aaa' }}>Deliver immediately (uncheck = GIFT_PACKAGE item)</span>
              </label>
            </div>
            <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 180 }}>
              <span style={labelStyle}>modalDefId</span>
              <RefSelect
                refTable="ModalDef"
                value={inlineGift.modalDefId ?? null}
                onChange={v => onChange({ ...entry, gift: { ...inlineGift, modalDefId: v ?? undefined } })}
                placeholder="Select ModalDef (optional)..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckInDaysEditor({ value, onChange }: ListProps) {
  const items: CheckInDayReward[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: CheckInDayReward) => {
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
  const add = () => {
    const nextDay = items.length > 0
      ? Math.max(...items.map(i => Number(i.day) || 0)) + 1
      : 0;
    onChange([...items, { day: nextDay, gift: { giftDefId: '' } }]);
  };

  return (
    <div style={containerStyle}>
      {items.map((entry, idx) => (
        <CheckInDayEntry
          key={idx}
          entry={entry}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
        />
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={addButtonStyle} onClick={add}>+ day</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import OutcomeTiersEditor from './OutcomeTiersEditor';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  inputStyle,
  numberInputStyle,
  selectStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
  fieldGroupStyle,
  labelStyle,
  fieldRowStyle,
  sectionStyle,
} from './editorStyles';

const CONTINUE_RULE_OPTIONS = ['next_phase', 'complete', 'end_job', 'wait'] as const;
type ContinueRule = typeof CONTINUE_RULE_OPTIONS[number];

export interface MissionPhase {
  name?: string;
  description?: string;
  duration: number;
  difficulty?: number;
  injuryRate?: number;
  injuryPenalty?: number;
  count?: number;
  maxFailuresForCount?: number;
  tiers?: Record<string, any>;
  continueRules: {
    onSuccess: ContinueRule;
    onFailure: ContinueRule;
  };
}

const defaultPhase = (): MissionPhase => ({
  duration: 3600,
  continueRules: { onSuccess: 'next_phase', onFailure: 'wait' },
});

function PhaseEditor({
  phase,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  phase: MissionPhase;
  index: number;
  total: number;
  onChange: (p: MissionPhase) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [tiersOpen, setTiersOpen] = useState(false);

  const set = <K extends keyof MissionPhase>(key: K, val: MissionPhase[K]) =>
    onChange({ ...phase, [key]: val });

  const setContinue = (side: 'onSuccess' | 'onFailure', val: ContinueRule) =>
    onChange({
      ...phase,
      continueRules: { ...phase.continueRules, [side]: val },
    });

  const setTiers = (val: Record<string, any> | undefined) => {
    if (!val || Object.keys(val).length === 0) {
      const next = { ...phase };
      delete next.tiers;
      onChange(next);
    } else {
      onChange({ ...phase, tiers: val });
    }
  };

  const parseNum = (raw: string): number | undefined =>
    raw === '' ? undefined : Number(raw);

  const headerLabel = phase.name
    ? `Phase ${index + 1} — ${phase.name}`
    : `Phase ${index + 1}`;

  return (
    <div style={entryCardStyle}>
      <div style={entryHeaderStyle}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#a78bfa',
            letterSpacing: '0.05em',
            flex: 1,
            textTransform: 'uppercase',
          }}
        >
          {headerLabel}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            style={iconButtonStyle}
            disabled={index === 0}
            onClick={onMoveUp}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            style={iconButtonStyle}
            disabled={index === total - 1}
            onClick={onMoveDown}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            style={dangerIconButtonStyle}
            onClick={onRemove}
            title="Remove phase"
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>name</span>
          <input
            type="text"
            value={phase.name ?? ''}
            placeholder="Phase name (optional)"
            style={{ ...inputStyle, width: '100%' }}
            onChange={e => set('name', e.target.value || undefined)}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>description</span>
          <input
            type="text"
            value={phase.description ?? ''}
            placeholder="Flavour text (optional)"
            style={{ ...inputStyle, width: '100%' }}
            onChange={e => set('description', e.target.value || undefined)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>duration (seconds) *</span>
          <input
            type="number"
            min={1}
            value={phase.duration ?? ''}
            style={{ ...numberInputStyle, width: '100%', borderColor: !phase.duration ? '#ef4444' : undefined }}
            onChange={e => set('duration', parseNum(e.target.value) ?? 0)}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>difficulty</span>
          <input
            type="number"
            min={0}
            value={phase.difficulty ?? ''}
            placeholder="def default"
            style={{ ...numberInputStyle, width: '100%' }}
            onChange={e => set('difficulty', parseNum(e.target.value))}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>injuryRate (0–1)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={phase.injuryRate ?? ''}
            placeholder="def default"
            style={{ ...numberInputStyle, width: '100%' }}
            onChange={e => set('injuryRate', parseNum(e.target.value))}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>injuryPenalty (def 0.8)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={phase.injuryPenalty ?? ''}
            placeholder="0.8"
            style={{ ...numberInputStyle, width: '100%' }}
            onChange={e => set('injuryPenalty', parseNum(e.target.value))}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>count (def 1)</span>
          <input
            type="number"
            min={1}
            value={phase.count ?? ''}
            placeholder="1"
            style={{ ...numberInputStyle, width: '100%' }}
            onChange={e => set('count', parseNum(e.target.value))}
          />
        </div>
        <div style={fieldGroupStyle}>
          <span style={labelStyle}>maxFailuresForCount</span>
          <input
            type="number"
            min={0}
            value={phase.maxFailuresForCount ?? ''}
            placeholder="none"
            style={{ ...numberInputStyle, width: '100%' }}
            onChange={e => set('maxFailuresForCount', parseNum(e.target.value))}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <span
          style={{
            ...labelStyle,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#c4b5fd',
          }}
        >
          continueRules *
        </span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>onSuccess</span>
            <select
              value={phase.continueRules?.onSuccess ?? 'next_phase'}
              style={{ ...selectStyle, width: '100%' }}
              onChange={e => setContinue('onSuccess', e.target.value as ContinueRule)}
            >
              {CONTINUE_RULE_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div style={fieldGroupStyle}>
            <span style={labelStyle}>onFailure</span>
            <select
              value={phase.continueRules?.onFailure ?? 'wait'}
              style={{ ...selectStyle, width: '100%' }}
              onChange={e => setContinue('onFailure', e.target.value as ContinueRule)}
            >
              {CONTINUE_RULE_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#555',
            marginTop: 2,
          }}
        >
          next_phase = auto-advance · complete = mark ready · end_job = abandon · wait = pause for player decision (phase_ready)
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <span
            style={{
              ...labelStyle,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#c4b5fd',
              flex: 1,
            }}
          >
            per-phase tiers
            <span style={{ opacity: 0.55, fontWeight: 400, marginLeft: 4, textTransform: 'none', letterSpacing: 0 }}>
              — used for per_phase / hybrid rewardsMode
            </span>
          </span>
          <button
            type="button"
            style={{
              ...addButtonStyle,
              padding: '2px 8px',
              fontSize: 10,
            }}
            onClick={() => setTiersOpen(v => !v)}
          >
            {tiersOpen ? 'collapse' : (phase.tiers && Object.keys(phase.tiers).length > 0 ? 'edit tiers ●' : 'add tiers')}
          </button>
        </div>
        {tiersOpen && (
          <OutcomeTiersEditor
            value={phase.tiers ?? {}}
            onChange={setTiers}
          />
        )}
      </div>
    </div>
  );
}

interface MissionPhasesEditorProps {
  value: any;
  onChange: (v: MissionPhase[]) => void;
}

export default function MissionPhasesEditor({ value, onChange }: MissionPhasesEditorProps) {
  const phases: MissionPhase[] = Array.isArray(value) ? value : [];

  const update = (idx: number, next: MissionPhase) => {
    const arr = phases.slice();
    arr[idx] = next;
    onChange(arr);
  };

  const remove = (idx: number) => onChange(phases.filter((_, i) => i !== idx));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= phases.length) return;
    const arr = phases.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };

  return (
    <div style={containerStyle}>
      {phases.length === 0 && (
        <div
          style={{
            padding: '12px 10px',
            border: '1px dashed #2a2a4e',
            borderRadius: 6,
            color: '#555',
            fontSize: 11,
            textAlign: 'center',
          }}
        >
          No phases defined — add at least one phase for a multi_phase mission.
        </div>
      )}
      {phases.map((phase, idx) => (
        <PhaseEditor
          key={idx}
          phase={phase}
          index={idx}
          total={phases.length}
          onChange={next => update(idx, next)}
          onRemove={() => remove(idx)}
          onMoveUp={() => move(idx, idx - 1)}
          onMoveDown={() => move(idx, idx + 1)}
        />
      ))}
      <button
        type="button"
        style={addButtonStyle}
        onClick={() => onChange([...phases, defaultPhase()])}
      >
        + add phase
      </button>
    </div>
  );
}

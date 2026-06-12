import React, { useState } from 'react';
import SmartField from '../SmartField';
import OutcomeTiersEditor from './OutcomeTiersEditor';
import {
  containerStyle,
  entryCardStyle,
  entryHeaderStyle,
  inputStyle,
  numberInputStyle,
  selectStyle,
  labelStyle,
  fieldGroupStyle,
  fieldRowStyle,
  sectionStyle,
  iconButtonStyle,
  dangerIconButtonStyle,
  addButtonStyle,
} from './editorStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

const CONTINUE_OPTIONS = ['next_phase', 'complete', 'end_job', 'wait'] as const;
type ContinueRule = typeof CONTINUE_OPTIONS[number];

interface MissionPhase {
  name?: string;
  description?: string;
  duration: number;
  difficulty?: number;
  injuryRate?: number;
  injuryPenalty?: number;
  injuryPenaltyDuration?: number;
  count?: number;
  maxFailuresForCount?: number;
  allowRetry?: boolean;
  tiers?: Record<string, any>;
  continueRules: {
    onSuccess: ContinueRule;
    onFailure: ContinueRule;
  };
}

interface Props {
  record: Record<string, any>;
  onSetField: (field: string, value: any) => void;
  enumOptions: Record<string, string[]>;
}

// ─── Fake FieldDefs for SmartField ───────────────────────────────────────────

const FD = {
  timer:               { type: 'timerSpec',       description: 'Duration and skip-gem settings for this mission.' },
  minSuccessChance:    { type: 'number',           description: 'Minimum success chance (0–100). Floor applied to the formula result.', default: 0 },
  maxSuccessChance:    { type: 'number',           description: 'Maximum success chance (0–100). Ceiling applied to the formula result.', default: 100 },
  injuryRate:          { type: 'number',           description: 'Probability (0–1) that an entity is injured on failure. 0 = never.' },
  injuryRecoveryTicks: { type: 'number',           description: 'Base recovery ticks for injured entities. VIT reduces this: base*(1−VIT/(VIT+100)).' },
  cost:                { type: 'costArray',        description: 'Currency / item cost to start this mission.', default: [] },
  rewardPreview:       { type: 'costArray',        description: 'Non-binding reward preview shown on the mission card.', default: [] },
  tiers:               { type: 'outcomeTiers',     description: 'Per-tier outcome blocks (failure / common / … / legendary). Sigma controls the quality-roll spread.', default: {} },
  rewardsMode:         { type: 'enum',             enum: 'missionRewardsMode', description: '"final_bundle" — one roll at end; "per_phase" — rewards banked each phase; "hybrid" — per-phase banked + final bundle.', default: 'final_bundle' },
  maxFailures:         { type: 'number',           description: 'Max total phase failures before the expedition force-ends. Leave blank for unlimited.' },
} as const;

// ─── PhaseEditor ─────────────────────────────────────────────────────────────

function PhaseEditor({
  phase,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  enumOptions,
}: {
  phase: MissionPhase;
  index: number;
  total: number;
  onChange: (p: MissionPhase) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  enumOptions: Record<string, string[]>;
}) {
  const [tiersOpen, setTiersOpen] = useState(false);

  const set = <K extends keyof MissionPhase>(key: K, val: MissionPhase[K]) =>
    onChange({ ...phase, [key]: val });

  const setContinue = (side: 'onSuccess' | 'onFailure', val: ContinueRule) =>
    onChange({ ...phase, continueRules: { ...phase.continueRules, [side]: val } });

  const setTiers = (val: Record<string, any> | undefined) => {
    if (!val || Object.keys(val).length === 0) {
      const next = { ...phase };
      delete next.tiers;
      onChange(next);
    } else {
      onChange({ ...phase, tiers: val });
    }
  };

  const n = (raw: string): number | undefined =>
    raw === '' ? undefined : Number(raw);

  const hasTiers = phase.tiers && Object.keys(phase.tiers).length > 0;
  const durationMissing = !phase.duration;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 20px', overflowY: 'auto', flex: 1 }}>

      {/* Phase header with reorder + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 }}>
          Phase {index + 1}{phase.name ? ` — ${phase.name}` : ''}
        </span>
        <button type="button" style={iconButtonStyle} disabled={index === 0} onClick={onMoveUp} title="Move phase left">←</button>
        <button type="button" style={iconButtonStyle} disabled={index === total - 1} onClick={onMoveDown} title="Move phase right">→</button>
        <button type="button" style={dangerIconButtonStyle} onClick={onRemove} title="Delete this phase">×</button>
      </div>

      {/* Identity */}
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10 }}>Identity</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, flex: 2, minWidth: 160 }}>
            <span style={labelStyle}>name <span style={{ opacity: 0.5 }}>(optional)</span></span>
            <input
              type="text"
              value={phase.name ?? ''}
              placeholder="e.g. Descent, Boss Fight…"
              style={{ ...inputStyle, width: '100%' }}
              onChange={e => set('name', e.target.value || undefined)}
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: 3, minWidth: 200 }}>
            <span style={labelStyle}>description <span style={{ opacity: 0.5 }}>(optional)</span></span>
            <input
              type="text"
              value={phase.description ?? ''}
              placeholder="Flavour text shown during phase"
              style={{ ...inputStyle, width: '100%' }}
              onChange={e => set('description', e.target.value || undefined)}
            />
          </div>
        </div>
      </div>

      {/* Timing */}
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10 }}>Timing</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>
              duration (seconds) <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <input
              type="number"
              min={1}
              value={phase.duration ?? ''}
              style={{ ...numberInputStyle, width: '100%', borderColor: durationMissing ? '#ef4444' : undefined }}
              onChange={e => set('duration', n(e.target.value) ?? 0)}
            />
            {durationMissing && <span style={{ fontSize: 10, color: '#ef4444' }}>Required</span>}
          </div>
        </div>
        <span style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
          Phase 0 duration overrides the mission-level timer for display purposes.
        </span>
      </div>

      {/* Challenge */}
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10 }}>Challenge</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>difficulty override</span>
            <input
              type="number"
              min={0}
              value={phase.difficulty ?? ''}
              placeholder="uses def default"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('difficulty', n(e.target.value))}
            />
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>count <span style={{ opacity: 0.5 }}>(repetitions)</span></span>
            <input
              type="number"
              min={1}
              value={phase.count ?? ''}
              placeholder="1"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('count', n(e.target.value))}
            />
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>maxFailuresForCount</span>
            <input
              type="number"
              min={0}
              value={phase.maxFailuresForCount ?? ''}
              placeholder="none"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('maxFailuresForCount', n(e.target.value))}
            />
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 100 }}>
            <span style={labelStyle}>allowRetry</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}>
              <div
                onClick={() => set('allowRetry', !phase.allowRetry)}
                style={{
                  width: 32, height: 18, borderRadius: 9,
                  background: phase.allowRetry ? '#7c3aed' : '#2a2a4e',
                  position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  border: '1px solid #444', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: phase.allowRetry ? 14 : 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: phase.allowRetry ? '#fff' : '#666',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: '#888' }}>{phase.allowRetry ? 'yes' : 'no'}</span>
            </label>
          </div>
        </div>
        <span style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
          count &gt; 1 means this phase repeats N times. maxFailuresForCount limits failures within the count loop. allowRetry lets the player retry a failed phase (defaults to false).
        </span>
      </div>

      {/* Injury */}
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10 }}>Injury</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>injuryRate (0–1) <span style={{ opacity: 0.5 }}>override</span></span>
            <input
              type="number" min={0} max={1} step={0.01}
              value={phase.injuryRate ?? ''}
              placeholder="uses def default"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('injuryRate', n(e.target.value))}
            />
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>injuryPenalty (0–1)</span>
            <input
              type="number" min={0} max={1} step={0.01}
              value={phase.injuryPenalty ?? ''}
              placeholder="0.8"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('injuryPenalty', n(e.target.value))}
            />
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>injuryPenaltyDuration (ticks)</span>
            <input
              type="number" min={0}
              value={phase.injuryPenaltyDuration ?? ''}
              placeholder="uses def injuryRecoveryTicks"
              style={{ ...numberInputStyle, width: '100%' }}
              onChange={e => set('injuryPenaltyDuration', n(e.target.value))}
            />
          </div>
        </div>
        <span style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
          injuryPenalty is a direct MP multiplier (0.8 = 80% MP). Penalties stack multiplicatively across injuries. injuryPenaltyDuration ticks down linearly through subsequent phases.
        </span>
      </div>

      {/* Continue Rules */}
      <div style={sectionStyle}>
        <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10 }}>Continue Rules <span style={{ color: '#ef4444' }}>*</span></span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>on success</span>
            <select
              value={phase.continueRules?.onSuccess ?? 'next_phase'}
              style={{ ...selectStyle, width: '100%' }}
              onChange={e => setContinue('onSuccess', e.target.value as ContinueRule)}
            >
              {CONTINUE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>on failure</span>
            <select
              value={phase.continueRules?.onFailure ?? 'wait'}
              style={{ ...selectStyle, width: '100%' }}
              onChange={e => setContinue('onFailure', e.target.value as ContinueRule)}
            >
              {CONTINUE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <span style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
          <strong style={{ color: '#666' }}>next_phase</strong> auto-advances ·{' '}
          <strong style={{ color: '#666' }}>complete</strong> marks mission ready-to-collect ·{' '}
          <strong style={{ color: '#666' }}>end_job</strong> force-abandons ·{' '}
          <strong style={{ color: '#666' }}>wait</strong> pauses for player decision (phase_ready)
        </span>
      </div>

      {/* Tiers */}
      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <span style={{ ...labelStyle, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c4b5fd', fontSize: 10, flex: 1 }}>
            Phase Rewards (tiers)
            <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 4, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
              — used for per_phase &amp; hybrid rewardsMode
            </span>
          </span>
          <button
            type="button"
            style={{ ...addButtonStyle, padding: '2px 8px', fontSize: 10 }}
            onClick={() => setTiersOpen(v => !v)}
          >
            {tiersOpen ? 'collapse' : hasTiers ? 'edit tiers ●' : 'add tiers'}
          </button>
        </div>
        {tiersOpen && (
          <OutcomeTiersEditor value={phase.tiers ?? {}} onChange={setTiers} />
        )}
      </div>

    </div>
  );
}

// ─── PhaseTabBar ──────────────────────────────────────────────────────────────

function PhaseTabBar({
  phases,
  activeIdx,
  onSelect,
  onAdd,
}: {
  phases: MissionPhase[];
  activeIdx: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '8px 20px 0',
      borderBottom: '1px solid #1a1a3e',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {phases.map((p, i) => {
        const isActive = i === activeIdx;
        const label = p.name ? `${i + 1}. ${p.name}` : `Phase ${i + 1}`;
        const missing = !p.duration;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            style={{
              padding: '6px 14px',
              background: isActive ? '#1a1a3e' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #a78bfa' : '2px solid transparent',
              color: isActive ? '#e0e0ff' : '#777',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inherit',
              flexShrink: 0,
              transition: 'color 0.15s',
            }}
          >
            {label}
            {missing && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} title="Duration required" />
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: '6px 10px',
          background: 'transparent',
          border: '1px dashed #a78bfa44',
          borderRadius: 4,
          color: '#a78bfa',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: '0.04em',
          marginLeft: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        + Add Phase
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MissionOutcomesSectionEditor({ record, onSetField, enumOptions }: Props) {
  const isMultiPhase = record.mode === 'multi_phase';
  const phases: MissionPhase[] = Array.isArray(record.phases) ? record.phases : [];
  const [activePhaseIdx, setActivePhaseIdx] = useState(0);
  const [globalOpen, setGlobalOpen] = useState(false);

  const rewardsMode: string = record.rewardsMode ?? 'final_bundle';
  const showFinalTiers = rewardsMode !== 'per_phase';

  const safePhaseIdx = Math.max(0, Math.min(activePhaseIdx, phases.length - 1));

  const updatePhase = (idx: number, next: MissionPhase) => {
    const arr = phases.slice();
    arr[idx] = next;
    onSetField('phases', arr);
  };

  const addPhase = () => {
    const newPhases: MissionPhase[] = [
      ...phases,
      { duration: 3600, continueRules: { onSuccess: phases.length === 0 ? 'complete' : 'next_phase', onFailure: 'wait' } },
    ];
    onSetField('phases', newPhases);
    setActivePhaseIdx(newPhases.length - 1);
  };

  const removePhase = (idx: number) => {
    const arr = phases.filter((_, i) => i !== idx);
    onSetField('phases', arr);
    setActivePhaseIdx(Math.max(0, Math.min(safePhaseIdx, arr.length - 1)));
  };

  const movePhase = (from: number, to: number) => {
    if (to < 0 || to >= phases.length) return;
    const arr = phases.slice();
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onSetField('phases', arr);
    setActivePhaseIdx(to);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const sf = (name: string, fdKey: keyof typeof FD) => (
    <SmartField
      key={name}
      fieldName={name}
      fieldDef={FD[fdKey] as any}
      value={record[name]}
      onChange={v => onSetField(name, v)}
      enumOptions={enumOptions}
    />
  );

  // ── Single mode ────────────────────────────────────────────────────────────

  if (!isMultiPhase) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.02em' }}>
          Timer, success chance, injury and reward configuration for this single-phase mission.
        </div>
        {sf('timer', 'timer')}
        {sf('minSuccessChance', 'minSuccessChance')}
        {sf('maxSuccessChance', 'maxSuccessChance')}
        {sf('injuryRate', 'injuryRate')}
        {sf('injuryRecoveryTicks', 'injuryRecoveryTicks')}
        {sf('cost', 'cost')}
        {sf('rewardPreview', 'rewardPreview')}
        {sf('tiers', 'tiers')}
      </div>
    );
  }

  // ── Multi-phase mode ───────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Global expedition settings */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #1a1a3e' }}>
        <button
          type="button"
          onClick={() => setGlobalOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', background: 'transparent', border: 'none',
            color: '#a78bfa', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            textAlign: 'left',
          }}
        >
          <span style={{ flex: 1 }}>Expedition Settings</span>
          <span style={{ fontSize: 14, color: '#555' }}>{globalOpen ? '▲' : '▼'}</span>
        </button>

        {globalOpen && (
          <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: '#666' }}>
              Global settings apply to the expedition as a whole. Per-phase overrides take precedence where available.
            </div>
            {sf('rewardsMode', 'rewardsMode')}
            {sf('maxFailures', 'maxFailures')}
            {sf('minSuccessChance', 'minSuccessChance')}
            {sf('maxSuccessChance', 'maxSuccessChance')}
            {sf('injuryRate', 'injuryRate')}
            {sf('injuryRecoveryTicks', 'injuryRecoveryTicks')}
            {sf('cost', 'cost')}
            {sf('rewardPreview', 'rewardPreview')}
            {showFinalTiers && (
              <SmartField
                fieldName="tiers"
                fieldDef={{
                  ...(FD.tiers as any),
                  description: rewardsMode === 'hybrid'
                    ? 'Final bundle tier — rolled once when the expedition completes (on top of banked per-phase rewards).'
                    : 'Outcome tiers — single roll at mission completion.',
                }}
                value={record.tiers}
                onChange={v => onSetField('tiers', v)}
                enumOptions={enumOptions}
              />
            )}
          </div>
        )}
      </div>

      {/* Phase tabs */}
      {phases.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <div style={{ fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 1.6 }}>
            No phases defined.<br />
            <span style={{ color: '#555' }}>Add at least one phase to configure this expedition.</span>
          </div>
          <button
            type="button"
            style={{ ...addButtonStyle, padding: '8px 20px', fontSize: 12 }}
            onClick={addPhase}
          >
            + Add First Phase
          </button>
        </div>
      ) : (
        <>
          <PhaseTabBar
            phases={phases}
            activeIdx={safePhaseIdx}
            onSelect={setActivePhaseIdx}
            onAdd={addPhase}
          />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <PhaseEditor
              phase={phases[safePhaseIdx]}
              index={safePhaseIdx}
              total={phases.length}
              onChange={next => updatePhase(safePhaseIdx, next)}
              onRemove={() => removePhase(safePhaseIdx)}
              onMoveUp={() => movePhase(safePhaseIdx, safePhaseIdx - 1)}
              onMoveDown={() => movePhase(safePhaseIdx, safePhaseIdx + 1)}
              enumOptions={enumOptions}
            />
          </div>
        </>
      )}
    </div>
  );
}

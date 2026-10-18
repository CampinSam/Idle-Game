import type { ModalSpecV1 } from '@derp/shared';
import type { JobPreviewResult } from '../../features/jobs/useJobPreview';

// Synthetic protocol fixtures, never production content or a gameplay simulator.
export const missionDef = {
  id: 'mission-pilot', name: 'Survey the crystal marsh', missionCategoryDefId: 'pilot-category',
  description: 'Survey the marsh and return with a field report. '.repeat(10),
  enabled: true, requirements: [], cost: [], timer: { duration: 60 }, difficulty: 100,
};
export const missionCategory = { id: 'pilot-category', name: 'Field research', enabled: true, requirements: [] };
export const pilotEntity = { id: 'bird-pilot', name: 'Scout', status: 'idle', stats: {}, level: 1 };
export function missionPreview(overrides: Partial<JobPreviewResult> = {}): JobPreviewResult {
  return {
    jobType: 'mission', requirements: [{ label: 'An available scout', met: true, source: 'requirements' }],
    allRequirementsMet: true, canAfford: true, cost: [], durationSeconds: 60,
    mission: { teamMin: 1, teamMax: 2, missionPower: 100, difficulty: 100, successChance: 80,
      injuryChance: 10, spdTimerMultiplier: 1, synergy: null }, ...overrides,
  };
}
export function missionJob(status = 'active', phase = 0) {
  return { id: 'job-pilot', type: 'MissionJob', defId: missionDef.id, status, currentPhase: phase,
    startTick: 100, durationTicks: 60, data: { entityIds: [pilotEntity.id] } };
}
export function missionModal(status = 'active', phase = 0): ModalSpecV1 {
  const ready = status === 'ready_notified';
  const decision = status === 'phase_ready';
  const completed = status === 'completed';
  return {
    version: 1, id: `pilot-${status}-${phase}`, kind: 'mission', telemetry: { jobId: 'job-pilot' },
    dismiss: { x: true, backdrop: true, escape: true },
    header: { title: completed ? 'Field report: earned 10 crystals' : decision ? 'Choose the next phase' : ready ? 'Mission ready' : `Survey in progress — phase ${phase + 1}` },
    pages: [{ body: [] }],
    buttons: completed ? [] : [{ id: 'mission-action', label: decision ? 'Continue' : ready ? 'Collect' : 'Close', variant: 'primary',
      action: decision ? { type: 'EXECUTE_COMMAND', command: 'ContinueMission', payload: { jobId: 'job-pilot' } }
        : ready ? { type: 'COMPLETE_JOB', jobId: 'job-pilot' } : { type: 'CLOSE_MODAL' } }],
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

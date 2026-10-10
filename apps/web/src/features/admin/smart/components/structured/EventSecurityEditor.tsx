import {
  inputStyle,
  labelStyle,
  fieldGroupStyle,
  sectionStyle,
  containerStyle,
  addButtonStyle,
  dangerIconButtonStyle,
} from './editorStyles';
import { errorTextStyle } from './validation';
import { type StructuredEditorProps } from './editorContract';

export interface EventSecurity {
  allowedEmitters?: string[];
}

export interface EventSecurityErrors {
  emitters?: string[];
}

type Props = StructuredEditorProps<EventSecurity>;

const EMPTY: EventSecurity = {};

export function validateEventSecurity(v: EventSecurity | null | undefined): EventSecurityErrors {
  const errs: EventSecurityErrors = {};
  if (!v) return errs;
  const emitters: string[] = Array.isArray(v.allowedEmitters)
    ? v.allowedEmitters.map(e => (e == null ? '' : String(e)))
    : [];
  if (emitters.length === 0) return errs;

  const entryErrors: string[] = emitters.map(() => '');
  const seen = new Map<string, number>();
  let hasError = false;

  emitters.forEach((e, idx) => {
    const trimmed = e.trim();
    if (!trimmed) {
      entryErrors[idx] = 'emitter name cannot be blank';
      hasError = true;
    } else if (seen.has(trimmed)) {
      const firstIdx = seen.get(trimmed)!;
      entryErrors[idx] = `duplicate of entry ${firstIdx + 1}`;
      hasError = true;
    } else {
      seen.set(trimmed, idx);
    }
  });

  if (hasError) {
    errs.emitters = entryErrors;
  }
  return errs;
}

export function eventSecurityErrorCount(v: EventSecurity | null | undefined): number {
  const errs = validateEventSecurity(v);
  if (!errs.emitters) return 0;
  return errs.emitters.filter(e => e !== '').length;
}

export function eventSecurityErrorMessages(v: EventSecurity | null | undefined, fieldName: string): string[] {
  const errs = validateEventSecurity(v);
  if (!errs.emitters) return [];
  const msgs: string[] = [];
  errs.emitters.forEach((msg, idx) => {
    if (msg) msgs.push(`${fieldName}.allowedEmitters[${idx}]: ${msg}`);
  });
  return msgs;
}

export default function EventSecurityEditor({ value, onChange }: Props) {
  const sec: EventSecurity = (value && typeof value === 'object' && !Array.isArray(value)) ? value : EMPTY;
  // Coerce each entry to string to handle malformed legacy data gracefully
  const emitters: string[] = Array.isArray(sec.allowedEmitters)
    ? sec.allowedEmitters.map(e => (e == null ? '' : String(e)))
    : [];

  const setEmitters = (next: string[]) => {
    if (next.length === 0) {
      const { allowedEmitters: _removed, ...rest } = sec;
      onChange(Object.keys(rest).length > 0 ? rest : EMPTY);
    } else {
      onChange({ ...sec, allowedEmitters: next });
    }
  };

  const addEmitter = () => setEmitters([...emitters, '']);

  const updateEmitter = (idx: number, val: string) => {
    const next = emitters.map((e, i) => (i === idx ? val : e));
    setEmitters(next);
  };

  const removeEmitter = (idx: number) => {
    setEmitters(emitters.filter((_, i) => i !== idx));
  };

  const isUnrestricted = emitters.length === 0;
  const errs = validateEventSecurity(sec);
  const entryErrors = errs.emitters ?? [];

  return (
    <div style={{ ...containerStyle, gap: 10 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 10, color: '#e879f9', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
          Access Control
        </div>

        <div style={fieldGroupStyle}>
          <span style={labelStyle}>allowedEmitters</span>
          <span style={{ fontSize: 10, color: '#555' }}>
            job/system types that may trigger this event (blank list = any emitter allowed)
          </span>
        </div>

        {isUnrestricted && (
          <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            No emitter restrictions — any source may fire this event.
          </div>
        )}

        {emitters.map((emitter, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={emitter}
                placeholder="e.g. MissionJob"
                onChange={e => updateEmitter(idx, e.target.value)}
                style={{
                  ...inputStyle,
                  flex: 1,
                  borderColor: entryErrors[idx] ? '#ef4444' : undefined,
                }}
              />
              <button
                type="button"
                onClick={() => removeEmitter(idx)}
                style={dangerIconButtonStyle}
                title="Remove"
              >
                ×
              </button>
            </div>
            {entryErrors[idx] && (
              <span style={{ ...errorTextStyle, paddingLeft: 4 }}>{entryErrors[idx]}</span>
            )}
          </div>
        ))}

        <button type="button" onClick={addEmitter} style={addButtonStyle}>
          + Add Emitter
        </button>
      </div>

      <div style={{ border: '1px solid #1a1a3e', borderRadius: 6, background: '#0a0a1e', padding: 8 }}>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
          Tip
        </div>
        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
          Add emitters like <code style={{ color: '#a78bfa', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>MissionJob</code> or{' '}
          <code style={{ color: '#a78bfa', background: '#1a1a2e', padding: '0 4px', borderRadius: 3 }}>CraftingJob</code> to restrict
          which backend jobs can fire this event. Leave the list empty to allow any emitter.
        </div>
      </div>
    </div>
  );
}

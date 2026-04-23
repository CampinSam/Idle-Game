import {
  sectionStyle,
  inputStyle,
  selectStyle,
  fieldGroupStyle,
  labelStyle,
  fieldRowStyle,
} from './editorStyles';

interface FrequencySpec {
  type?: string;
  interval?: number;
  weekday?: number;
  day?: number;
  [k: string]: any;
}

interface Props {
  value: any;
  onChange: (val: FrequencySpec) => void;
}

const FREQUENCY_TYPES: { value: string; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'every_x_days', label: 'Every X days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

function defaultsForType(type: string): FrequencySpec {
  if (type === 'every_x_days') return { type, interval: 2 };
  if (type === 'weekly') return { type, weekday: 1 };
  if (type === 'monthly') return { type, day: 1 };
  return { type };
}

export default function FrequencyEditor({ value, onChange }: Props) {
  const spec: FrequencySpec =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const type = spec.type ?? 'daily';

  const setType = (newType: string) => {
    onChange(defaultsForType(newType));
  };

  const update = (patch: Partial<FrequencySpec>) => onChange({ ...spec, ...patch });

  return (
    <div style={sectionStyle}>
      <div style={fieldRowStyle}>
        <div style={{ ...fieldGroupStyle, minWidth: 160 }}>
          <span style={labelStyle}>type</span>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            style={{ ...selectStyle, width: '100%' }}
          >
            {FREQUENCY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {type === 'every_x_days' && (
          <div style={{ ...fieldGroupStyle, minWidth: 120 }}>
            <span style={labelStyle}>interval (days)</span>
            <input
              type="number"
              min={1}
              value={spec.interval ?? ''}
              onChange={e =>
                update({ interval: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)) })
              }
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        )}

        {type === 'weekly' && (
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>weekday</span>
            <select
              value={spec.weekday ?? 1}
              onChange={e => update({ weekday: Number(e.target.value) })}
              style={{ ...selectStyle, width: '100%' }}
            >
              {WEEKDAYS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        )}

        {type === 'monthly' && (
          <div style={{ ...fieldGroupStyle, minWidth: 140 }}>
            <span style={labelStyle}>day of month</span>
            <input
              type="number"
              min={1}
              max={31}
              value={spec.day ?? ''}
              onChange={e =>
                update({ day: e.target.value === '' ? undefined : Math.max(1, Math.min(31, Number(e.target.value))) })
              }
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

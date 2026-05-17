import type { BespokeFieldDescriptor } from '../../tableSchemas';
import RequirementsListEditor from './RequirementsListEditor';
import { numberInputStyle, labelStyle, fieldGroupStyle, inputStyle } from './editorStyles';

interface Requirement {
  type?: string;
  operator?: string;
  value?: any;
  [k: string]: any;
}

interface Props {
  value: any;
  onChange: (val: Requirement[]) => void;
  bespokeFields: BespokeFieldDescriptor[];
  sectionLabel?: string;
}

function bespokeKey(fd: BespokeFieldDescriptor): string {
  return `${fd.requirementType}__${fd.operator}`;
}

function parseValue(raw: string, inputType: 'number' | 'text' | undefined): number | string {
  if ((inputType ?? 'number') === 'number') {
    return Number(raw);
  }
  return raw;
}

function extractBespokeValues(
  items: Requirement[],
  bespokeFields: BespokeFieldDescriptor[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fd of bespokeFields) {
    const key = bespokeKey(fd);
    const match = items.find(r => r.type === fd.requirementType && r.operator === fd.operator);
    out[key] = match !== undefined ? String(match.value) : '';
  }
  return out;
}

function stripBespokeEntries(items: Requirement[], bespokeFields: BespokeFieldDescriptor[]): Requirement[] {
  return items.filter(r => {
    return !bespokeFields.some(fd => r.type === fd.requirementType && r.operator === fd.operator);
  });
}

function mergeBespokeIntoList(
  listItems: Requirement[],
  rawValues: Record<string, string>,
  bespokeFields: BespokeFieldDescriptor[],
): Requirement[] {
  const injected: Requirement[] = [];
  for (const fd of bespokeFields) {
    const key = bespokeKey(fd);
    const raw = rawValues[key];
    if (raw !== undefined && raw !== '') {
      injected.push({
        type: fd.requirementType,
        operator: fd.operator,
        value: parseValue(raw, fd.inputType),
      });
    }
  }
  return [...injected, ...listItems];
}

export default function RequirementsBlockEditor({ value, onChange, bespokeFields, sectionLabel = 'Bespoke Fields' }: Props) {
  const items: Requirement[] = Array.isArray(value) ? value : [];

  const rawValues = extractBespokeValues(items, bespokeFields);
  const listItems = stripBespokeEntries(items, bespokeFields);

  const handleBespokeChange = (key: string, raw: string) => {
    const next = { ...rawValues, [key]: raw };
    onChange(mergeBespokeIntoList(listItems, next, bespokeFields));
  };

  const handleListChange = (nextList: Requirement[]) => {
    onChange(mergeBespokeIntoList(nextList, rawValues, bespokeFields));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        background: '#0f0f2e',
        border: '1px solid #2a2a4e',
        borderRadius: 6,
        padding: 10,
      }}>
        <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {sectionLabel}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {bespokeFields.map(fd => {
            const key = bespokeKey(fd);
            const inputType = fd.inputType ?? 'number';
            return (
              <div key={key} style={{ ...fieldGroupStyle, minWidth: 120 }}>
                <span style={labelStyle}>{fd.label}</span>
                <input
                  type={inputType}
                  value={rawValues[key] ?? ''}
                  placeholder="—"
                  onChange={e => handleBespokeChange(key, e.target.value)}
                  style={{ ...(inputType === 'number' ? numberInputStyle : inputStyle), width: '100%' }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <RequirementsListEditor value={listItems} onChange={handleListChange} />
    </div>
  );
}

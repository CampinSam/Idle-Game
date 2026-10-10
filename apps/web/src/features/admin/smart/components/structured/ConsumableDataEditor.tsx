import EffectListEditor from './EffectListEditor';
import { sectionStyle, fieldGroupStyle, labelStyle } from './editorStyles';

interface Props {
  value: any;
  onChange: (val: any) => void;
}

export default function ConsumableDataEditor({ value, onChange }: Props) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const effects = Array.isArray(data.effects) ? data.effects : [];

  return (
    <div style={sectionStyle}>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>effects</span>
        <EffectListEditor
          value={effects}
          onChange={next => onChange({ effects: next })}
        />
      </div>
    </div>
  );
}

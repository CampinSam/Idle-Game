import EffectListEditor from './EffectListEditor';
import {
  sectionStyle,
  selectStyle,
  fieldGroupStyle,
  labelStyle,
} from './editorStyles';

const EFFECT_TARGET_TYPES = ['entity', 'player', 'location', 'team', 'job', 'global'];

interface Props {
  value: any;
  onChange: (val: any) => void;
}

export default function ConsumableDataEditor({ value, onChange }: Props) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const effects = Array.isArray(data.effects) ? data.effects : [];
  const targetType = typeof data.targetType === 'string' ? data.targetType : 'player';

  return (
    <div style={sectionStyle}>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>targetType (default for effects)</span>
        <select
          value={targetType}
          onChange={e => onChange({ ...data, targetType: e.target.value })}
          style={{ ...selectStyle, width: '100%' }}
        >
          {EFFECT_TARGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={fieldGroupStyle}>
        <span style={labelStyle}>effects</span>
        <EffectListEditor
          value={effects}
          onChange={next => onChange({ ...data, effects: next })}
        />
      </div>
    </div>
  );
}

import StatMapEditor from './StatMapEditor';
import SlotSingleArchetypeEditor from './SlotSingleArchetypeEditor';
import {
  containerStyle, sectionStyle, inputStyle, selectStyle, labelStyle,
  fieldRowStyle, numberInputStyle, fieldGroupStyle, addButtonStyle,
  dangerIconButtonStyle,
} from './editorStyles';

const SLOT_FILL_OPTIONS = ['singleRandomArchetype', 'multiRandomArchetype', 'fixed'];
const MISSING_SLOT_OPTIONS = ['skip', 'default', 'error'];

interface Props {
  value: any;
  onChange: (v: any) => void;
}

export default function InitEditor({ value, onChange }: Props) {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  const scratch = v.scratch && typeof v.scratch === 'object' ? v.scratch : { startingLevel: 1, baseStats: {}, slotFill: { kind: 'singleRandomArchetype' } };
  const nft = v.nft && typeof v.nft === 'object' ? v.nft : null;

  const patch = (p: any) => onChange({ ...v, ...p });
  const patchScratch = (p: any) => onChange({ ...v, scratch: { ...scratch, ...p } });

  return (
    <div style={containerStyle}>
      {/* SCRATCH */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, color: '#a78bfa' }}>SCRATCH (fresh / non-NFT mints)</div>
        <div style={fieldRowStyle}>
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>STARTING LEVEL</div>
            <input
              type="number"
              min={1}
              value={scratch.startingLevel ?? ''}
              onChange={e => {
                const n = Number(e.target.value);
                patchScratch({ startingLevel: isNaN(n) ? undefined : n });
              }}
              style={numberInputStyle}
            />
          </div>
        </div>

        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>BASE STATS</div>
          <StatMapEditor
            value={scratch.baseStats ?? {}}
            onChange={s => patchScratch({ baseStats: s })}
          />
        </div>

        <SlotFillEditor
          value={scratch.slotFill ?? { kind: 'singleRandomArchetype' }}
          onChange={s => patchScratch({ slotFill: s })}
        />
      </div>

      {/* NFT (optional) */}
      <div style={sectionStyle}>
        <div style={fieldRowStyle}>
          <div style={{ ...labelStyle, color: '#a78bfa', flex: 1 }}>NFT (optional, for NFT-backed claims)</div>
          {nft ? (
            <button type="button" onClick={() => patch({ nft: undefined })} style={dangerIconButtonStyle} title="Remove nft block">×</button>
          ) : (
            <button
              type="button"
              onClick={() => patch({ nft: { attributeMap: {}, missingSlotPolicy: 'skip', defaults: {} } })}
              style={addButtonStyle}
            >+ nft block</button>
          )}
        </div>
        {nft ? (
          <NftEditor value={nft} onChange={n => patch({ nft: n })} />
        ) : (
          <div style={{ fontSize: 11, color: '#555' }}>
            Not configured — NFT-backed claims for this entity will not work until added.
          </div>
        )}
      </div>
    </div>
  );
}

function SlotFillEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const v = (value && typeof value === 'object' && !Array.isArray(value)) ? value : { kind: 'singleRandomArchetype' };
  const kind: string = typeof v.kind === 'string' ? v.kind : 'singleRandomArchetype';

  const setKind = (k: string) => {
    // Preserve hidden subtree (count / fixed) when toggling so re-selecting the
    // prior kind restores the user's previous data.
    if (k === 'singleRandomArchetype') {
      onChange({ ...v, kind: k });
    } else if (k === 'multiRandomArchetype') {
      onChange({
        ...v,
        kind: k,
        count: typeof v.count === 'number' && v.count >= 1 ? v.count : 2,
      });
    } else {
      onChange({
        ...v,
        kind: 'fixed',
        fixed: (v.fixed && typeof v.fixed === 'object' && !Array.isArray(v.fixed)) ? v.fixed : {},
      });
    }
  };

  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 4 }}>SLOT FILL</div>
      <div style={fieldRowStyle}>
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>KIND</div>
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            style={selectStyle}
          >
            {SLOT_FILL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {kind === 'multiRandomArchetype' && (
          <div style={fieldGroupStyle}>
            <div style={labelStyle}>COUNT (per slot)</div>
            <input
              type="number"
              min={1}
              value={v.count ?? ''}
              onChange={e => {
                const n = Number(e.target.value);
                onChange({ ...v, count: isNaN(n) ? undefined : n });
              }}
              style={numberInputStyle}
            />
          </div>
        )}
      </div>
      {kind === 'fixed' && (
        <div style={{ marginTop: 6 }}>
          <div style={{ ...labelStyle, marginBottom: 4 }}>FIXED ASSIGNMENTS (slot → archetype)</div>
          <SlotSingleArchetypeEditor
            value={v.fixed ?? {}}
            onChange={f => onChange({ ...v, fixed: f })}
            emptyMessage="No fixed assignments — add slot → archetype below"
          />
        </div>
      )}
    </div>
  );
}

function NftEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const attributeMap = value.attributeMap && typeof value.attributeMap === 'object' ? value.attributeMap : {};
  const policy = typeof value.missingSlotPolicy === 'string' ? value.missingSlotPolicy : 'skip';
  const defaults = value.defaults && typeof value.defaults === 'object' ? value.defaults : {};

  const patch = (p: any) => onChange({ ...value, ...p });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>ATTRIBUTE MAP (raw NFT key → body slot)</div>
        <KeyValueMapEditor
          value={attributeMap}
          onChange={m => patch({ attributeMap: m })}
          keyPlaceholder="raw nft key (e.g. meta_body)"
          valuePlaceholder="slot name (e.g. body)"
        />
      </div>

      <div style={fieldRowStyle}>
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>MISSING SLOT POLICY</div>
          <select
            value={policy}
            onChange={e => patch({ missingSlotPolicy: e.target.value })}
            style={selectStyle}
          >
            {MISSING_SLOT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 4 }}>DEFAULTS (slot → archetype, used when policy=default)</div>
        <SlotSingleArchetypeEditor
          value={defaults}
          onChange={d => patch({ defaults: d })}
          emptyMessage="No defaults — add slot → archetype below"
        />
      </div>
    </div>
  );
}

function KeyValueMapEditor({ value, onChange, keyPlaceholder, valuePlaceholder }: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const entries = Object.entries(value);
  const setKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey) return;
    if (newKey === '' || value[newKey] !== undefined) return;
    const next: Record<string, string> = {};
    Object.entries(value).forEach(([k, v]) => { next[k === oldKey ? newKey : k] = v; });
    onChange(next);
  };
  const setVal = (k: string, val: string) => onChange({ ...value, [k]: val });
  const remove = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };
  const add = () => {
    let i = 0;
    let key = 'new_key';
    while (value[key] !== undefined) { i++; key = `new_key_${i}`; }
    onChange({ ...value, [key]: '' });
  };

  return (
    <div style={containerStyle}>
      {entries.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '6px 0' }}>
          No entries — add one below
        </div>
      )}
      {entries.map(([k, val]) => (
        <div key={k} style={fieldRowStyle}>
          <input
            type="text"
            defaultValue={k}
            onBlur={e => setKey(k, e.target.value.trim())}
            placeholder={keyPlaceholder}
            style={{ ...inputStyle, flex: 1 }}
          />
          <span style={labelStyle}>→</span>
          <input
            type="text"
            value={val}
            onChange={e => setVal(k, e.target.value)}
            placeholder={valuePlaceholder}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={() => remove(k)} style={dangerIconButtonStyle}>×</button>
        </div>
      ))}
      <button type="button" onClick={add} style={addButtonStyle}>+ entry</button>
    </div>
  );
}

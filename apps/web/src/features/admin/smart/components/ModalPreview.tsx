import { useState } from 'react';

interface Props {
  spec: any;
}

function BlockPreview({ block }: { block: any }) {
  if (!block || !block.type) return <div style={{ color: '#555', fontSize: 12, padding: '4px 0' }}>[unknown block]</div>;

  switch (block.type) {
    case 'richText':
      return (
        <div style={{ color: '#ccc', fontSize: 13, lineHeight: 1.5, padding: '4px 0' }}>
          {extractRichText(block.doc)}
        </div>
      );
    case 'timer':
      return (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: 'rgba(167,139,250,0.08)', borderRadius: 8, border: '1px solid rgba(167,139,250,0.2)',
          color: '#a78bfa', fontSize: 14, fontFamily: 'monospace',
        }}>
          <span>⏱</span>
          <span>{block.label || 'Time Remaining'}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700 }}>2h 30m</span>
        </div>
      );
    case 'progress':
      return (
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
            <span>{block.label || 'Progress'}</span>
            <span>60%</span>
          </div>
          <div style={{ height: 8, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: '60%', height: '100%', background: '#a78bfa', borderRadius: 4 }} />
          </div>
        </div>
      );
    case 'rewardsList': {
      const items = block.items || [{ label: 'Sample Reward', amount: '×1' }, { label: 'Another Reward', amount: '×3' }];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
          {items.map((item: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
              background: '#1a1a2e', borderRadius: 6,
            }}>
              <div style={{ width: 28, height: 28, background: '#2a2a3e', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {item.icon || '🎁'}
              </div>
              <span style={{ flex: 1, color: '#e0e0ff', fontSize: 13 }}>{item.label || item.name || 'Reward'}</span>
              <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600 }}>{item.amount || '×1'}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'giftReveal':
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px',
          background: 'linear-gradient(135deg, #1a1a2e, #2a1a3e)', borderRadius: 10,
          border: '1px solid rgba(167,139,250,0.3)',
        }}>
          <div style={{ fontSize: 40 }}>🎁</div>
          <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: 14 }}>{block.gift?.title || 'Gift'}</span>
        </div>
      );
    default:
      return (
        <div style={{ padding: '6px 10px', background: '#1a1a2e', borderRadius: 6, color: '#666', fontSize: 12, border: '1px dashed #333' }}>
          [{block.type}]
        </div>
      );
  }
}

function extractRichText(doc: any): string {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  if (Array.isArray(doc)) return doc.map(extractRichText).join('');
  if (doc.v !== undefined) return String(doc.v);
  if (doc.c) return extractRichText(doc.c);
  return '';
}

function ButtonPreview({ btn }: { btn: any }) {
  const isPrimary = btn.variant === 'primary';
  return (
    <button
      type="button"
      style={{
        padding: '10px 18px',
        background: isPrimary ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : 'transparent',
        border: isPrimary ? 'none' : '1px solid #444',
        borderRadius: 8,
        color: isPrimary ? '#fff' : '#aaa',
        fontSize: 14,
        fontWeight: isPrimary ? 600 : 400,
        cursor: 'default',
        flex: 1,
        minWidth: 80,
      }}
    >
      {btn.label || 'Button'}
    </button>
  );
}

export default function ModalPreview({ spec }: Props) {
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [payloadJson, setPayloadJson] = useState('');

  const safeSpec = (() => {
    if (!spec || typeof spec !== 'object') return {};
    return spec;
  })();

  const header = safeSpec.header || {};
  const body: any[] = Array.isArray(safeSpec.body) ? safeSpec.body : [];
  const buttons: any[] = Array.isArray(safeSpec.buttons) ? safeSpec.buttons : [
    { id: 'close', label: 'Close', variant: 'secondary' },
  ];

  let mergedBody = [...body];
  if (payloadJson) {
    try {
      const payload = JSON.parse(payloadJson);
      if (payload.rewards && Array.isArray(payload.rewards)) {
        const hasRewardsList = mergedBody.some(b => b.type === 'rewardsList');
        if (!hasRewardsList) {
          mergedBody = [...mergedBody, {
            type: 'rewardsList',
            items: payload.rewards.map((r: any) => ({
              label: r.name || r.type || 'Reward',
              amount: r.amount ? `×${r.amount}` : '×1',
              icon: r.icon,
            })),
          }];
        }
      }
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#888', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          Live Preview
        </span>
        <span style={{ fontSize: 10, color: '#555', background: '#1a1a2e', padding: '2px 6px', borderRadius: 4 }}>
          updates live
        </span>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        border: '1px solid #222',
      }}>
        <div style={{
          background: '#16213e',
          borderRadius: 16,
          width: '100%',
          maxWidth: 360,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          border: '1px solid #2a2a4e',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0f0f2e, #1a1a3e)',
            padding: '16px 20px 12px',
            borderBottom: '1px solid #2a2a4e',
          }}>
            {header.title ? (
              <h3 style={{ margin: '0 0 4px', color: '#e0e0ff', fontSize: 18, fontWeight: 700 }}>
                {header.title}
              </h3>
            ) : (
              <h3 style={{ margin: '0 0 4px', color: '#444', fontSize: 16, fontStyle: 'italic' }}>
                (no title)
              </h3>
            )}
            {header.subtitle && (
              <p style={{ margin: 0, color: '#888', fontSize: 13 }}>{header.subtitle}</p>
            )}
          </div>

          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mergedBody.length === 0 ? (
              <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>
                (no body blocks)
              </div>
            ) : (
              mergedBody.map((block, i) => <BlockPreview key={i} block={block} />)
            )}
          </div>

          {buttons.length > 0 && (
            <div style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid #1a1a2e',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              {buttons.map((btn, i) => <ButtonPreview key={i} btn={btn} />)}
            </div>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid #2a2a3e', borderRadius: 8, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setPayloadOpen(v => !v)}
          style={{
            width: '100%', padding: '8px 12px', background: '#1a1a2e', border: 'none',
            color: '#888', cursor: 'pointer', fontSize: 12, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 10 }}>{payloadOpen ? '▼' : '▶'}</span>
          <span>Payload Simulation (optional)</span>
          {payloadJson && <span style={{ color: '#a78bfa', marginLeft: 'auto', fontSize: 11 }}>● active</span>}
        </button>
        {payloadOpen && (
          <div style={{ padding: 10, background: '#0f0f2e' }}>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>
              Paste a sample payload (e.g. job results with rewards array) to simulate dynamic block data.
            </div>
            <textarea
              value={payloadJson}
              onChange={e => setPayloadJson(e.target.value)}
              placeholder={'{\n  "rewards": [\n    { "type": "currency", "name": "Gold", "amount": 100 }\n  ]\n}'}
              style={{
                width: '100%', height: 120, background: '#0a0a1e', border: '1px solid #333',
                borderRadius: 4, color: '#e0e0ff', fontSize: 12, padding: 8,
                fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            {payloadJson && (() => {
              try { JSON.parse(payloadJson); return null; }
              catch (e: any) { return <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Invalid JSON: {e.message}</div>; }
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

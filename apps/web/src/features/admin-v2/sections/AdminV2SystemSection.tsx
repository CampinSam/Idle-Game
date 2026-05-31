import { useState } from 'react';
import { IconManagerContent } from '../../admin/icons/IconManagerPage';
import { AudioManagerContent } from '../../admin/audio/AudioManagerPage';
import TagEditorPage from '../../admin/tag-editor/TagEditorPage';
import TelemetryAdminPage from '../../admin/telemetry/TelemetryAdminPage';
import SelectionTesterPage from '../../admin/selection-tester/SelectionTesterPage';
import { CryptoAdminPage } from '../../admin/CryptoAdminPage';
import type { AdminMe } from '../../admin/adminApi';

type SystemTool = 'icons' | 'audio' | 'tags' | 'telemetry' | 'god-mode' | 'selection-tester' | 'crypto';

const TOOLS: { key: SystemTool; label: string }[] = [
  { key: 'icons', label: 'Icons' },
  { key: 'audio', label: 'Audio' },
  { key: 'tags', label: 'Tags & Effects' },
  { key: 'telemetry', label: 'Telemetry' },
  { key: 'god-mode', label: 'God Mode' },
  { key: 'selection-tester', label: 'Selection Tester' },
  { key: 'crypto', label: 'Crypto' },
];

interface Props {
  me: AdminMe;
  initialTool?: SystemTool;
}

export default function AdminV2SystemSection({ me: _, initialTool = 'icons' }: Props) {
  const [activeTool, setActiveTool] = useState<SystemTool>(initialTool);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="av2-system-tabs">
        {TOOLS.map(t => (
          <button
            key={t.key}
            className={`av2-system-tab${activeTool === t.key ? ' active' : ''}`}
            onClick={() => setActiveTool(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="av2-system-content">
        {activeTool === 'icons' && (
          <div className="av2-tool-wrap">
            <IconManagerContent />
          </div>
        )}
        {activeTool === 'audio' && (
          <div className="av2-tool-wrap">
            <AudioManagerContent />
          </div>
        )}
        {activeTool === 'tags' && (
          <div className="av2-tool-wrap">
            <TagEditorPage />
          </div>
        )}
        {activeTool === 'telemetry' && (
          <div className="av2-tool-wrap">
            <TelemetryAdminPage />
          </div>
        )}
        {activeTool === 'god-mode' && (
          <div className="av2-tool-wrap" style={{ padding: 20 }}>
            <p style={{ color: '#4a4a7a', fontSize: 13 }}>
              God Mode requires selecting a player first. Go to the <strong style={{ color: '#8080a8' }}>Players</strong> section, search for a player, then use the God Mode tools from there.
            </p>
          </div>
        )}
        {activeTool === 'selection-tester' && (
          <div className="av2-tool-wrap">
            <SelectionTesterPage />
          </div>
        )}
        {activeTool === 'crypto' && (
          <div className="av2-tool-wrap">
            <CryptoAdminPage />
          </div>
        )}
      </div>
    </div>
  );
}

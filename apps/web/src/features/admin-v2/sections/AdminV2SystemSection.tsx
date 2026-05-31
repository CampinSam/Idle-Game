import { IconManagerContent } from '../../admin/icons/IconManagerPage';
import { AudioManagerContent } from '../../admin/audio/AudioManagerPage';
import TagEditorPage from '../../admin/tag-editor/TagEditorPage';
import TelemetryAdminPage from '../../admin/telemetry/TelemetryAdminPage';
import SelectionTesterPage from '../../admin/selection-tester/SelectionTesterPage';
import { CryptoAdminPage } from '../../admin/CryptoAdminPage';
import AdminV2PlayersSection from './AdminV2PlayersSection';
import type { AdminMe } from '../../admin/adminApi';

export type SystemTool = 'icons' | 'audio' | 'tags' | 'telemetry' | 'god-mode' | 'selection-tester' | 'crypto';

export const SYSTEM_TOOLS: { key: SystemTool; label: string }[] = [
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
  activeTool: SystemTool;
  onToolChange: (tool: SystemTool) => void;
}

export default function AdminV2SystemSection({ me, activeTool, onToolChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="av2-system-tabs">
        {SYSTEM_TOOLS.map(t => (
          <button
            key={t.key}
            className={`av2-system-tab${activeTool === t.key ? ' active' : ''}`}
            onClick={() => onToolChange(t.key)}
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
            <TelemetryAdminPage embedded />
          </div>
        )}
        {activeTool === 'god-mode' && (
          <div className="av2-tool-wrap" style={{ height: '100%', overflow: 'auto' }}>
            <AdminV2PlayersSection me={me} />
          </div>
        )}
        {activeTool === 'selection-tester' && (
          <div className="av2-tool-wrap">
            <SelectionTesterPage embedded />
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

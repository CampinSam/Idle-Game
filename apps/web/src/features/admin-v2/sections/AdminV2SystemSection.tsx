import { IconManagerContent } from '../../admin/icons/IconManagerPage';
import { AudioManagerContent } from '../../admin/audio/AudioManagerPage';
import TagEditorPage from '../../admin/tag-editor/TagEditorPage';
import TelemetryAdminPage from '../../admin/telemetry/TelemetryAdminPage';
import SelectionTesterPage from '../../admin/selection-tester/SelectionTesterPage';
import { CryptoAdminPage } from '../../admin/CryptoAdminPage';
import ScreenComposerPage from '../../admin/screen-composer/ScreenComposerPage';
import ModalEditorPage from '../../admin/modal-editor/ModalEditorPage';
import PlayerEventsAdminPage from '../../admin/player-events/PlayerEventsAdminPage';
import NftCollectionsPage from '../../admin/nft/NftCollectionsPage';
import AdminV2PlayersSection from './AdminV2PlayersSection';
import type { AdminMe } from '../../admin/adminApi';

export type SystemTool = 'icons' | 'audio' | 'tags' | 'telemetry' | 'god-mode' | 'selection-tester' | 'crypto' | 'screens' | 'modal-editor' | 'player-events' | 'nft-collections';

export const SYSTEM_TOOLS: { key: SystemTool; label: string }[] = [
  { key: 'nft-collections', label: 'NFT Collections' },
  { key: 'icons', label: 'Icons' },
  { key: 'audio', label: 'Audio' },
  { key: 'tags', label: 'Tags & Effects' },
  { key: 'telemetry', label: 'Telemetry' },
  { key: 'god-mode', label: 'God Mode' },
  { key: 'selection-tester', label: 'Selection Tester' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'screens', label: 'Screen Composer' },
  { key: 'modal-editor', label: 'Modal Editor' },
  { key: 'player-events', label: 'Player Events' },
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
        {activeTool === 'nft-collections' && (
          <div className="av2-tool-wrap" style={{ height: '100%', overflow: 'auto' }}>
            <NftCollectionsPage />
          </div>
        )}
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
        {activeTool === 'screens' && (
          <div className="av2-tool-wrap" style={{ height: '100%', overflow: 'auto' }}>
            <ScreenComposerPage />
          </div>
        )}
        {activeTool === 'modal-editor' && (
          <div className="av2-tool-wrap" style={{ height: '100%', overflow: 'auto' }}>
            <ModalEditorPage />
          </div>
        )}
        {activeTool === 'player-events' && (
          <div className="av2-tool-wrap" style={{ height: '100%', overflow: 'auto' }}>
            <PlayerEventsAdminPage />
          </div>
        )}
      </div>
    </div>
  );
}

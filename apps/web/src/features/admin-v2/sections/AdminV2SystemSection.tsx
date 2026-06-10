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
import EntityCollectionsPage from '../../admin/EntityCollectionsPage';
import AdminV2PlayersSection from './AdminV2PlayersSection';
import type { AdminMe } from '../../admin/adminApi';

export type SystemTool = 'icons' | 'audio' | 'tags' | 'telemetry' | 'god-mode' | 'selection-tester' | 'crypto' | 'screens' | 'modal-editor' | 'player-events' | 'nft-collections' | 'entity-collections';

export const SYSTEM_TOOLS: { key: SystemTool; label: string }[] = [
  { key: 'nft-collections', label: 'NFT Collections' },
  { key: 'entity-collections', label: 'Entity Collections' },
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

const TAB_BASE = "py-[5px] px-[12px] border rounded-[6px] bg-transparent text-[12px] font-semibold cursor-pointer transition-[background,color] duration-[120ms]";
const TAB_ACTIVE = "bg-[rgba(108,99,255,0.18)] border-[rgba(108,99,255,0.3)] text-[#a89fff]";
const TAB_INACTIVE = "border-transparent text-[#5a5a8a] hover:bg-[#1a1b35] hover:text-[#9090c8]";

export default function AdminV2SystemSection({ me, activeTool, onToolChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="flex gap-1 py-2 px-3 border-b border-[#1a1b35] bg-[#0a0b1c] flex-wrap flex-shrink-0">
        {SYSTEM_TOOLS.map(t => (
          <button
            key={t.key}
            className={`${TAB_BASE} ${activeTool === t.key ? TAB_ACTIVE : TAB_INACTIVE}`}
            onClick={() => onToolChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {activeTool === 'nft-collections' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <NftCollectionsPage />
          </div>
        )}
        {activeTool === 'icons' && (
          <div className="min-h-full">
            <IconManagerContent />
          </div>
        )}
        {activeTool === 'audio' && (
          <div className="min-h-full">
            <AudioManagerContent />
          </div>
        )}
        {activeTool === 'tags' && (
          <div className="min-h-full">
            <TagEditorPage />
          </div>
        )}
        {activeTool === 'telemetry' && (
          <div className="min-h-full">
            <TelemetryAdminPage embedded />
          </div>
        )}
        {activeTool === 'god-mode' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <AdminV2PlayersSection me={me} />
          </div>
        )}
        {activeTool === 'selection-tester' && (
          <div className="min-h-full">
            <SelectionTesterPage embedded />
          </div>
        )}
        {activeTool === 'crypto' && (
          <div className="min-h-full">
            <CryptoAdminPage />
          </div>
        )}
        {activeTool === 'screens' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <ScreenComposerPage />
          </div>
        )}
        {activeTool === 'modal-editor' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <ModalEditorPage />
          </div>
        )}
        {activeTool === 'player-events' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <PlayerEventsAdminPage />
          </div>
        )}
        {activeTool === 'entity-collections' && (
          <div className="min-h-full" style={{ height: '100%', overflow: 'auto' }}>
            <EntityCollectionsPage />
          </div>
        )}
      </div>
    </div>
  );
}

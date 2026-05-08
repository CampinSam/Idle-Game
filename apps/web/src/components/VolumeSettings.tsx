import { useState, useEffect, useCallback } from 'react';
import { audioEngine, AudioBusName } from '../services/AudioEngine';

const BUS_LABELS: Record<AudioBusName, string> = {
  music: 'Music',
  sfx: 'SFX',
  ui: 'UI',
  ambient: 'Ambient',
};

const BUS_ICONS: Record<AudioBusName, string> = {
  music: '🎵',
  sfx: '💥',
  ui: '🔔',
  ambient: '🌿',
};

const BUSES: AudioBusName[] = ['music', 'sfx', 'ui', 'ambient'];

interface Props {
  onClose: () => void;
}

export default function VolumeSettings({ onClose }: Props) {
  const [volumes, setVolumes] = useState<Record<AudioBusName, number>>(() => ({
    music: audioEngine.getVolume('music'),
    sfx: audioEngine.getVolume('sfx'),
    ui: audioEngine.getVolume('ui'),
    ambient: audioEngine.getVolume('ambient'),
  }));

  const handleChange = useCallback((bus: AudioBusName, value: number) => {
    audioEngine.setVolume(bus, value);
    setVolumes(prev => ({ ...prev, [bus]: value }));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[900] bg-[rgba(0,0,0,0.4)] flex items-start justify-end pt-[4.5rem] px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border border-[#2a2a4e] rounded-xl p-5 min-w-[260px] max-w-[320px] w-full shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold text-[#e0e0ff]">Audio Settings</span>
          <button
            className="!bg-transparent !border-0 text-[#888] cursor-pointer !text-base !p-1 !rounded hover:text-[#e0e0ff] transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {BUSES.map(bus => (
            <div key={bus} className="grid [grid-template-columns:1.5rem_5rem_1fr_2.5rem] items-center gap-2">
              <span className="text-base text-center">{BUS_ICONS[bus]}</span>
              <label className="text-[0.85rem] text-[#b8b8ff] font-semibold">{BUS_LABELS[bus]}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={volumes[bus]}
                onChange={e => handleChange(bus, Number(e.target.value))}
                className="settings-volume-slider"
              />
              <span className="text-[0.75rem] text-[#888] text-right min-w-8">{volumes[bus]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

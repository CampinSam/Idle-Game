import { useState, useEffect, useCallback } from 'react';
import { audioEngine, AudioBusName } from '../services/AudioEngine';
import './VolumeSettings.css';

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
    <div className="volume-overlay" onClick={onClose}>
      <div className="volume-panel" onClick={e => e.stopPropagation()}>
        <div className="volume-panel-header">
          <span className="volume-panel-title">Audio Settings</span>
          <button className="volume-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="volume-sliders">
          {BUSES.map(bus => (
            <div key={bus} className="volume-row">
              <span className="volume-icon">{BUS_ICONS[bus]}</span>
              <label className="volume-label">{BUS_LABELS[bus]}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={volumes[bus]}
                onChange={e => handleChange(bus, Number(e.target.value))}
                className="volume-slider"
              />
              <span className="volume-value">{volumes[bus]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

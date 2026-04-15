const STORAGE_KEY = 'audio_volumes';

export type AudioBusName = 'music' | 'sfx' | 'ui' | 'ambient';

interface SoundEntry {
  soundKey: string;
  fileKey: string | null;
  weight: number;
}

interface AudioConfig {
  actionMap: Record<string, SoundEntry[]>;
}

const DEFAULT_VOLUMES: Record<AudioBusName, number> = {
  music: 70,
  sfx: 80,
  ui: 60,
  ambient: 50,
};

function loadVolumes(): Record<AudioBusName, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        music: typeof parsed.music === 'number' ? parsed.music : DEFAULT_VOLUMES.music,
        sfx: typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULT_VOLUMES.sfx,
        ui: typeof parsed.ui === 'number' ? parsed.ui : DEFAULT_VOLUMES.ui,
        ambient: typeof parsed.ambient === 'number' ? parsed.ambient : DEFAULT_VOLUMES.ambient,
      };
    }
  } catch {}
  return { ...DEFAULT_VOLUMES };
}

function saveVolumes(volumes: Record<AudioBusName, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
  } catch {}
}

class AudioEngine {
  private config: AudioConfig = { actionMap: {} };
  private volumes: Record<AudioBusName, number> = loadVolumes();
  private currentMusic: HTMLAudioElement | null = null;
  private currentMusicKey: string | null = null;
  private currentAmbient: HTMLAudioElement | null = null;
  private currentAmbientKey: string | null = null;
  private loaded = false;
  private loading = false;
  private pendingMusicChain: string[] | null = null;
  private pendingAmbientChain: string[] | null = null;

  async init() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    try {
      const res = await fetch('/api/audio/config');
      if (res.ok) {
        this.config = await res.json();
      }
    } catch {
    } finally {
      this.loaded = true;
      this.loading = false;
      this.flushPending();
    }
  }

  private flushPending() {
    if (this.pendingMusicChain) {
      const chain = this.pendingMusicChain;
      this.pendingMusicChain = null;
      this.crossfadeChain(chain);
    }
    if (this.pendingAmbientChain) {
      const chain = this.pendingAmbientChain;
      this.pendingAmbientChain = null;
      this.crossfadeChain(chain);
    }
  }

  isMapped(actionKey: string): boolean {
    const entries = this.config.actionMap[actionKey];
    return !!(entries && entries.length > 0);
  }

  getVolume(bus: AudioBusName): number {
    return this.volumes[bus];
  }

  setVolume(bus: AudioBusName, value: number) {
    this.volumes[bus] = Math.max(0, Math.min(100, value));
    saveVolumes(this.volumes);

    if (bus === 'music' && this.currentMusic) {
      this.currentMusic.volume = this.volumes.music / 100;
    }
    if (bus === 'ambient' && this.currentAmbient) {
      this.currentAmbient.volume = this.volumes.ambient / 100;
    }
  }

  play(actionKey: string) {
    const bus = this.getBusForAction(actionKey);

    if (!this.loaded) {
      if (bus === 'music') {
        this.pendingMusicChain = [actionKey];
      } else if (bus === 'ambient') {
        this.pendingAmbientChain = [actionKey];
      }
      return;
    }

    const entries = this.config.actionMap[actionKey];
    if (!entries || entries.length === 0) return;

    const sound = this.pickWeighted(entries);
    if (!sound || !sound.fileKey) return;

    const vol = this.volumes[bus] / 100;
    if (vol === 0) return;

    const url = `/api/media/${sound.fileKey}`;

    if (bus === 'music') {
      this.playMusic(actionKey, url, vol);
    } else if (bus === 'ambient') {
      this.playAmbient(actionKey, url, vol);
    } else {
      const audio = new Audio(url);
      audio.volume = vol;
      audio.play().catch(() => {});
    }
  }

  crossfadeTo(actionKey: string) {
    this.crossfadeChain([actionKey]);
  }

  crossfadeChain(keys: string[]) {
    if (keys.length === 0) return;
    const bus = this.getBusForAction(keys[0]);

    if (!this.loaded) {
      if (bus === 'music') {
        this.pendingMusicChain = keys;
      } else if (bus === 'ambient') {
        this.pendingAmbientChain = keys;
      }
      return;
    }

    for (const key of keys) {
      if (this.isMapped(key)) {
        this.play(key);
        return;
      }
    }

    if (bus === 'music') {
      this.stopMusic();
    } else if (bus === 'ambient') {
      this.stopAmbient();
    }
  }

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic = null;
      this.currentMusicKey = null;
    }
    this.pendingMusicChain = null;
  }

  stopAmbient() {
    if (this.currentAmbient) {
      this.currentAmbient.pause();
      this.currentAmbient = null;
      this.currentAmbientKey = null;
    }
    this.pendingAmbientChain = null;
  }

  private playMusic(actionKey: string, url: string, vol: number) {
    if (this.currentMusicKey === actionKey) return;
    if (this.currentMusic) {
      this.currentMusic.pause();
    }
    const audio = new Audio(url);
    audio.volume = vol;
    audio.loop = true;
    audio.play().catch(() => {});
    this.currentMusic = audio;
    this.currentMusicKey = actionKey;
  }

  private playAmbient(actionKey: string, url: string, vol: number) {
    if (this.currentAmbientKey === actionKey) return;
    if (this.currentAmbient) {
      this.currentAmbient.pause();
    }
    const audio = new Audio(url);
    audio.volume = vol;
    audio.loop = true;
    audio.play().catch(() => {});
    this.currentAmbient = audio;
    this.currentAmbientKey = actionKey;
  }

  private pickWeighted(entries: SoundEntry[]): SoundEntry | null {
    if (entries.length === 0) return null;
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * total;
    for (const entry of entries) {
      rand -= entry.weight;
      if (rand <= 0) return entry;
    }
    return entries[entries.length - 1];
  }

  private getBusForAction(actionKey: string): AudioBusName {
    if (actionKey.startsWith('music.')) return 'music';
    if (actionKey.startsWith('sfx.')) return 'sfx';
    if (actionKey.startsWith('ui.')) return 'ui';
    if (actionKey.startsWith('ambient.')) return 'ambient';
    return 'sfx';
  }
}

export const audioEngine = new AudioEngine();

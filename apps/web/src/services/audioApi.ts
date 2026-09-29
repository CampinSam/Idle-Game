/** First-party audio configuration transport; playback remains in AudioEngine. */
export const audioApi = {
  getConfig(): Promise<Response> {
    return fetch('/api/audio/config');
  },
};
import terminal from 'virtual:terminal';

export class KeepAliveManager {
  private audio: HTMLAudioElement;
  private wakeLock: any = null;
  private isEnabled: boolean = false;

  constructor() {
    // 1 second of silence (WAV)
    // RIFF header + fmt chunk + data chunk (silent)
    const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    this.audio = new Audio(silentWav);
    this.audio.loop = true;
    this.audio.volume = 0.01; // Non-zero volume is sometimes required for "media" status, though 0 usually works too. Safe bet.
  }

  public async enable() {
    if (this.isEnabled) return;

    try {
      // 1. Play Silent Audio
      await this.audio.play();
      this.isEnabled = true;
      terminal.log('[KeepAlive] Audio started successfully (playing silent loop)');

      // 2. Request Wake Lock (Screen)
      if ('wakeLock' in navigator) {
        try {
          // @ts-ignore
          this.wakeLock = await navigator.wakeLock.request('screen');
          terminal.log('[KeepAlive] Wake Lock acquired successfully');

          // Re-acquire on visibility change
          document.addEventListener('visibilitychange', this.handleVisibilityChange);
        } catch (err) {
          terminal.log(`[KeepAlive] Wake Lock Error: ${err instanceof Error ? err.message : String(err)}`);
          console.warn('[KeepAlive] Wake Lock failed:', err);
        }
      }
    } catch (err) {
      terminal.log(`[KeepAlive] Critical Start Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error('[KeepAlive] Failed to start:', err);
      // Usually due to lack of user interaction. UI should handle this.
      throw err;
    }
  }

  public disable() {
    if (!this.isEnabled) return;

    // 1. Stop Audio
    this.audio.pause();
    this.audio.currentTime = 0;

    // 2. Release Wake Lock
    if (this.wakeLock) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
        console.log('[KeepAlive] Wake Lock released');
      });
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.isEnabled = false;
    console.log('[KeepAlive] Stopped');
  }

  private handleVisibilityChange = async () => {
    if (this.isEnabled && document.visibilityState === 'visible') {
      try {
        // 先释放旧锁（如果有）
        if (this.wakeLock) {
          await this.wakeLock.release();
          this.wakeLock = null;
        }
        // @ts-ignore
        this.wakeLock = await navigator.wakeLock.request('screen');
        terminal.log('[KeepAlive] Wake Lock re-acquired');
      } catch (err) {
        // 降低日志频率，不再使用 terminal.log 轰炸
        console.warn('[KeepAlive] Re-acquire Wake Lock failed:', err);
      }
    }
  };

  public isActive() {
    return this.isEnabled;
  }
}

export const keepAliveManager = new KeepAliveManager();

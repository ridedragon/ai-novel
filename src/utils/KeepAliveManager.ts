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
      // 核心修复 4.4：彻底移除音频保活，仅保留 Wake Lock
      // 深度原因：持续循环播放音频可能导致浏览器多媒体进程与主进程在高负载下出现同步死锁，进而引发主进程内存爆炸。
      // 在现代浏览器中，Wake Lock 已经足够维持工作流运行。

      this.isEnabled = true;
      terminal.log('[KeepAlive] System enabled (Wake Lock mode)');

      // 2. Request Wake Lock (Screen)
      if ('wakeLock' in navigator) {
        try {
          // @ts-ignore
          this.wakeLock = await navigator.wakeLock.request('screen');
          terminal.log('[KeepAlive] Wake Lock acquired successfully');

          // Re-acquire on visibility change
          document.addEventListener('visibilitychange', this.handleVisibilityChange);
        } catch (err) {
          terminal.warn(`[KeepAlive] Wake Lock Warning: ${err instanceof Error ? err.message : String(err)}`);
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

    // 2. Release Wake Lock
    if (this.wakeLock) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
        terminal.log('[KeepAlive] Wake Lock released');
      });
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.isEnabled = false;
    terminal.log('[KeepAlive] Stopped');
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

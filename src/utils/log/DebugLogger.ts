import terminal from 'virtual:terminal';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

export interface VolumeFolderCreationLog {
  volumeIndex: number;
  folderName: string;
  timestamp: number;
  success: boolean;
  error?: string;
  nodesState?: {
    multiCreateFolderNodeId?: string;
    multiCreateFolderStatus?: string;
    creationInfoNodeId?: string;
    creationInfoStatus?: string;
    loopNodeId?: string;
    loopNodeStatus?: string;
  };
}

export interface InfoClearLog {
  triggerType: 'volume_switch' | 'loop_reset' | 'manual' | 'unknown';
  timestamp: number;
  clearedItems: string[];
  beforeState?: any;
  afterState?: any;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private volumeCreationLogs: VolumeFolderCreationLog[] = [];
  private infoClearLogs: InfoClearLog[] = [];
  private maxLogs: number = 1000;
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  constructor() {
    this.log = this.log.bind(this);
    this.logVolumeCreation = this.logVolumeCreation.bind(this);
    this.logInfoClear = this.logInfoClear.bind(this);
  }

  public log(level: LogLevel, category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const logMessage = `[DEBUG][${category}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    switch (level) {
      case 'error':
        terminal.error(logMessage);
        break;
      case 'warn':
        terminal.warn(logMessage);
        break;
      case 'debug':
        terminal.log(logMessage);
        break;
      default:
        terminal.log(logMessage);
    }

    this.listeners.forEach(listener => listener(entry));
  }

  public info(category: string, message: string, data?: any) {
    this.log('info', category, message, data);
  }

  public warn(category: string, message: string, data?: any) {
    this.log('warn', category, message, data);
  }

  public error(category: string, message: string, data?: any) {
    this.log('error', category, message, data);
  }

  public debug(category: string, message: string, data?: any) {
    this.log('debug', category, message, data);
  }

  public logVolumeCreation(log: VolumeFolderCreationLog) {
    this.volumeCreationLogs.push(log);
    this.info('VOLUME_FOLDER', `Volume folder creation: ${log.folderName} (index: ${log.volumeIndex}, success: ${log.success})`, log);
  }

  public logInfoClear(log: InfoClearLog) {
    this.infoClearLogs.push(log);
    this.info('INFO_CLEAR', `Info cleared: trigger=${log.triggerType}, items=${log.clearedItems.join(', ')}`, {
      before: log.beforeState,
      after: log.afterState,
    });
  }

  public subscribe(listener: (entry: LogEntry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getVolumeCreationLogs(): VolumeFolderCreationLog[] {
    return [...this.volumeCreationLogs];
  }

  public getInfoClearLogs(): InfoClearLog[] {
    return [...this.infoClearLogs];
  }

  public getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  public clearLogs() {
    this.logs = [];
    this.volumeCreationLogs = [];
    this.infoClearLogs = [];
    this.info('DEBUG_LOGGER', 'Logs cleared');
  }

  public exportLogs(): string {
    return JSON.stringify({
      logs: this.logs,
      volumeCreationLogs: this.volumeCreationLogs,
      infoClearLogs: this.infoClearLogs,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  public getVolumeCreationReport(): string {
    const lines = ['=== Volume Folder Creation Report ===', ''];
    if (this.volumeCreationLogs.length === 0) {
      lines.push('No volume creation logs found.');
      return lines.join('\n');
    }

    const successCount = this.volumeCreationLogs.filter(l => l.success).length;
    lines.push(`Total: ${this.volumeCreationLogs.length}, Success: ${successCount}, Failed: ${this.volumeCreationLogs.length - successCount}`);
    lines.push('');

    this.volumeCreationLogs.forEach((log, idx) => {
      lines.push(`[${idx + 1}] Volume ${log.volumeIndex}: ${log.folderName}`);
      lines.push(`    Time: ${new Date(log.timestamp).toLocaleString()}`);
      lines.push(`    Success: ${log.success}`);
      if (log.error) {
        lines.push(`    Error: ${log.error}`);
      }
      if (log.nodesState) {
        lines.push(`    Node States:`);
        if (log.nodesState.multiCreateFolderNodeId) {
          lines.push(`      - multiCreateFolder: ${log.nodesState.multiCreateFolderNodeId} [${log.nodesState.multiCreateFolderStatus}]`);
        }
        if (log.nodesState.creationInfoNodeId) {
          lines.push(`      - creationInfo: ${log.nodesState.creationInfoNodeId} [${log.nodesState.creationInfoStatus}]`);
        }
        if (log.nodesState.loopNodeId) {
          lines.push(`      - loopNode: ${log.nodesState.loopNodeId} [${log.nodesState.loopNodeStatus}]`);
        }
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  public getInfoClearReport(): string {
    const lines = ['=== Info Clear Report ===', ''];
    if (this.infoClearLogs.length === 0) {
      lines.push('No info clear logs found.');
      return lines.join('\n');
    }

    this.infoClearLogs.forEach((log, idx) => {
      lines.push(`[${idx + 1}] Trigger: ${log.triggerType}`);
      lines.push(`    Time: ${new Date(log.timestamp).toLocaleString()}`);
      lines.push(`    Cleared: ${log.clearedItems.join(', ')}`);
      lines.push('');
    });

    return lines.join('\n');
  }
}

export const debugLogger = new DebugLogger();
export default debugLogger;

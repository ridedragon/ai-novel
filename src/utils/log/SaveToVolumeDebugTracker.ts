import { debugLogger } from './DebugLogger';

export interface SaveToVolumeNodeLog {
  nodeId: string;
  nodeLabel: string;
  timestamp: number;
  
  request: {
    model: string;
    temperature: number;
    messagesCount: number;
    systemPromptLength: number;
    userPromptLength: number;
  };
  
  aiResponse: {
    rawContent: string;
    rawContentLength: number;
    rawContentPreview: string;
  };
  
  parsing: {
    attempted: boolean;
    method?: 'block_parser' | 'json' | 'fuzzy_line' | 'regex';
    success: boolean;
    error?: string;
    
    splitRulesExtracted: Array<{
      chapterTitle?: string;
      nextVolumeName: string;
      startChapter?: number;
      endChapter?: number;
    }>;
    
    volumesExtracted: Array<{
      volumeName: string;
      folderName: string;
      startChapter?: number;
      endChapter?: number;
      description?: string;
    }>;
  };
  
  result: {
    status: 'completed' | 'failed';
    outputEntriesCount: number;
    splitRulesCount: number;
    volumesCount: number;
    savedVolumes?: any[];
  };
}

class SaveToVolumeDebugTracker {
  private logs: SaveToVolumeNodeLog[] = [];
  private maxLogs: number = 50;

  public logNodeStart(
    nodeId: string,
    nodeLabel: string,
    model: string,
    temperature: number,
    messages: any[]
  ) {
    const systemPrompts = messages.filter(m => m.role === 'system');
    const userPrompts = messages.filter(m => m.role === 'user');
    
    const log: SaveToVolumeNodeLog = {
      nodeId,
      nodeLabel,
      timestamp: Date.now(),
      request: {
        model,
        temperature,
        messagesCount: messages.length,
        systemPromptLength: systemPrompts.reduce((sum, m) => sum + (m.content?.length || 0), 0),
        userPromptLength: userPrompts.reduce((sum, m) => sum + (m.content?.length || 0), 0),
      },
      aiResponse: {
        rawContent: '',
        rawContentLength: 0,
        rawContentPreview: '',
      },
      parsing: {
        attempted: false,
        success: false,
        splitRulesExtracted: [],
        volumesExtracted: [],
      },
      result: {
        status: 'completed',
        outputEntriesCount: 0,
        splitRulesCount: 0,
        volumesCount: 0,
      },
    };
    
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    debugLogger.info('SAVE_TO_VOLUME', `=== START SaveToVolume Node ===`, {
      nodeId,
      nodeLabel,
      model,
      temperature,
      messagesCount: messages.length,
      systemPromptLength: log.request.systemPromptLength,
      userPromptLength: log.request.userPromptLength,
    });
    
    return log;
  }

  public logAiResponse(logIndex: number, rawContent: string) {
    const log = this.logs[logIndex];
    if (!log) return;
    
    log.aiResponse = {
      rawContent,
      rawContentLength: rawContent.length,
      rawContentPreview: rawContent.substring(0, 500),
    };
    
    debugLogger.info('SAVE_TO_VOLUME', `AI Response received`, {
      nodeId: log.nodeId,
      contentLength: rawContent.length,
      preview: rawContent.substring(0, 200),
    });
  }

  public logParsingAttempt(
    logIndex: number,
    method: 'block_parser' | 'json' | 'fuzzy_line' | 'regex',
    success: boolean,
    error?: string
  ) {
    const log = this.logs[logIndex];
    if (!log) return;
    
    log.parsing.attempted = true;
    log.parsing.method = method;
    log.parsing.success = success;
    log.parsing.error = error;
    
    debugLogger.info('SAVE_TO_VOLUME', `Parsing ${success ? 'SUCCESS' : 'FAILED'} using ${method}`, {
      nodeId: log.nodeId,
      error,
    });
  }

  public logExtractedData(
    logIndex: number,
    splitRules: any[],
    volumes: any[]
  ) {
    const log = this.logs[logIndex];
    if (!log) return;
    
    log.parsing.splitRulesExtracted = splitRules.map(r => ({
      chapterTitle: r.chapterTitle || r.title || '',
      nextVolumeName: r.nextVolumeName || r.name || '',
      startChapter: r.startChapter,
      endChapter: r.endChapter,
    }));
    
    log.parsing.volumesExtracted = volumes.map(v => ({
      volumeName: v.volumeName || v.name || '',
      folderName: v.folderName || v.folderName || v.volumeName || '',
      startChapter: v.startChapter,
      endChapter: v.endChapter,
      description: v.description || v.summary || '',
    }));
    
    debugLogger.info('SAVE_TO_VOLUME', `Extracted data`, {
      nodeId: log.nodeId,
      splitRulesCount: splitRules.length,
      volumesCount: volumes.length,
      splitRules: log.parsing.splitRulesExtracted,
      volumes: log.parsing.volumesExtracted,
    });
  }

  public logResult(
    logIndex: number,
    status: 'completed' | 'failed',
    outputEntries: any[],
    splitRules: any[],
    volumes: any[]
  ) {
    const log = this.logs[logIndex];
    if (!log) return;
    
    log.result = {
      status,
      outputEntriesCount: outputEntries?.length || 0,
      splitRulesCount: splitRules?.length || 0,
      volumesCount: volumes?.length || 0,
      savedVolumes: volumes,
    };
    
    debugLogger.info('SAVE_TO_VOLUME', `=== END SaveToVolume Node ===`, {
      nodeId: log.nodeId,
      nodeLabel: log.nodeLabel,
      status,
      outputEntriesCount: log.result.outputEntriesCount,
      splitRulesCount: log.result.splitRulesCount,
      volumesCount: log.result.volumesCount,
      hasRawContent: !!log.aiResponse.rawContent,
      rawContentLength: log.aiResponse.rawContentLength,
    });
  }

  public getLogs(): SaveToVolumeNodeLog[] {
    return [...this.logs];
  }

  public getLogByNodeId(nodeId: string): SaveToVolumeNodeLog | undefined {
    return this.logs.find(l => l.nodeId === nodeId);
  }

  public getMostRecentLog(): SaveToVolumeNodeLog | undefined {
    return this.logs[this.logs.length - 1];
  }

  public generateReport(): string {
    const lines = ['=== SaveToVolume Node Debug Report ===', ''];
    
    if (this.logs.length === 0) {
      lines.push('No SaveToVolume node logs found.');
      return lines.join('\n');
    }

    this.logs.forEach((log, idx) => {
      lines.push(`[${idx + 1}] Node: ${log.nodeLabel} (${log.nodeId})`);
      lines.push(`    Time: ${new Date(log.timestamp).toLocaleString()}`);
      lines.push('');
      
      lines.push('    Request:');
      lines.push(`      Model: ${log.request.model}`);
      lines.push(`      Temperature: ${log.request.temperature}`);
      lines.push(`      Messages: ${log.request.messagesCount}`);
      lines.push(`      System Prompt Length: ${log.request.systemPromptLength}`);
      lines.push(`      User Prompt Length: ${log.request.userPromptLength}`);
      lines.push('');
      
      lines.push('    AI Response:');
      lines.push(`      Raw Content Length: ${log.aiResponse.rawContentLength}`);
      if (log.aiResponse.rawContentPreview) {
        lines.push(`      Preview: ${log.aiResponse.rawContentPreview.substring(0, 300)}...`);
      }
      lines.push('');
      
      lines.push('    Parsing:');
      lines.push(`      Attempted: ${log.parsing.attempted}`);
      lines.push(`      Method: ${log.parsing.method || 'none'}`);
      lines.push(`      Success: ${log.parsing.success}`);
      if (log.parsing.error) {
        lines.push(`      Error: ${log.parsing.error}`);
      }
      lines.push(`      Split Rules Extracted: ${log.parsing.splitRulesExtracted.length}`);
      log.parsing.splitRulesExtracted.forEach((rule, i) => {
        lines.push(`        ${i + 1}. ${rule.chapterTitle} -> ${rule.nextVolumeName}`);
      });
      lines.push(`      Volumes Extracted: ${log.parsing.volumesExtracted.length}`);
      log.parsing.volumesExtracted.forEach((vol, i) => {
        lines.push(`        ${i + 1}. ${vol.volumeName} (${vol.folderName})`);
        if (vol.startChapter || vol.endChapter) {
          lines.push(`           Chapters: ${vol.startChapter || '?'} - ${vol.endChapter || '?'}`);
        }
      });
      lines.push('');
      
      lines.push('    Result:');
      lines.push(`      Status: ${log.result.status}`);
      lines.push(`      Output Entries: ${log.result.outputEntriesCount}`);
      lines.push(`      Split Rules: ${log.result.splitRulesCount}`);
      lines.push(`      Volumes: ${log.result.volumesCount}`);
      lines.push('');
      lines.push('');
    });

    return lines.join('\n');
  }
}

export const saveToVolumeDebugTracker = new SaveToVolumeDebugTracker();
export default saveToVolumeDebugTracker;

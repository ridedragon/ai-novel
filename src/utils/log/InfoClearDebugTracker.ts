import { debugLogger } from './DebugLogger';

export type ClearTriggerType = 'volume_switch' | 'loop_reset' | 'manual' | 'unknown';

export interface InfoClearDetail {
  id: string;
  triggerType: ClearTriggerType;
  timestamp: number;
  
  context: {
    volumeIndex: number;
    volumeName: string;
    nextVolumeName?: string;
    chapterTitle?: string;
    loopIndex: number;
  };
  
  clearedNodes: Array<{
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    previousOutputCount: number;
    clearedOutputCount: number;
  }>;
  
  clearedNovelData: {
    clearedWorldviewSets: string[];
    clearedCharacterSets: string[];
    clearedOutlineSets: string[];
    clearedInspirationSets: string[];
    clearedPlotOutlineSets: string[];
  };
  
  beforeState: {
    nodesOutput: Record<string, any[]>;
    novelSets: Record<string, any[]>;
  };
  
  afterState: {
    nodesOutput: Record<string, any[]>;
    novelSets: Record<string, any[]>;
  };
}

class InfoClearDebugTracker {
  private history: InfoClearDetail[] = [];
  private maxHistory: number = 50;

  public recordClearStart(
    triggerType: ClearTriggerType,
    context: InfoClearDetail['context'],
    beforeState: InfoClearDetail['beforeState']
  ): string {
    const id = `clear_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    debugLogger.info('INFO_CLEAR_TRACKER', `Info clear START: trigger=${triggerType}`, {
      context,
      hasBeforeState: !!beforeState,
    });
    
    return id;
  }

  public recordNodeClear(
    _trackingId: string,
    nodeId: string,
    nodeType: string,
    nodeLabel: string,
    previousOutputCount: number,
    clearedOutputCount: number
  ) {
    debugLogger.debug('INFO_CLEAR_TRACKER', `Node cleared: ${nodeType} "${nodeLabel}"`, {
      nodeId,
      previousOutputCount,
      clearedOutputCount,
    });
  }

  public recordNovelDataClear(
    _trackingId: string,
    clearedSets: InfoClearDetail['clearedNovelData'],
    _beforeSets: InfoClearDetail['beforeState']['novelSets']
  ) {
    debugLogger.info('INFO_CLEAR_TRACKER', `Novel data cleared`, {
      worldviewSets: clearedSets.clearedWorldviewSets,
      characterSets: clearedSets.clearedCharacterSets,
      outlineSets: clearedSets.clearedOutlineSets,
      inspirationSets: clearedSets.clearedInspirationSets,
      plotOutlineSets: clearedSets.clearedPlotOutlineSets,
    });
  }

  public recordClearComplete(
    triggerType: ClearTriggerType,
    context: InfoClearDetail['context'],
    clearedNodes: InfoClearDetail['clearedNodes'],
    clearedNovelData: InfoClearDetail['clearedNovelData'],
    beforeState: InfoClearDetail['beforeState'],
    afterState: InfoClearDetail['afterState']
  ) {
    const detail: InfoClearDetail = {
      id: `clear_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      triggerType,
      timestamp: Date.now(),
      context,
      clearedNodes,
      clearedNovelData,
      beforeState,
      afterState,
    };
    
    this.history.push(detail);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    debugLogger.info('INFO_CLEAR_TRACKER', `Info clear COMPLETE: ${clearedNodes.length} nodes cleared`, {
      triggerType,
      context,
      clearedNovelData,
    });
    
    debugLogger.logInfoClear({
      triggerType,
      timestamp: detail.timestamp,
      clearedItems: [
        ...clearedNodes.map(n => `${n.nodeType}:${n.nodeLabel}`),
        ...clearedNovelData.clearedWorldviewSets.map(s => `worldview:${s}`),
        ...clearedNovelData.clearedCharacterSets.map(s => `character:${s}`),
        ...clearedNovelData.clearedOutlineSets.map(s => `outline:${s}`),
        ...clearedNovelData.clearedInspirationSets.map(s => `inspiration:${s}`),
        ...clearedNovelData.clearedPlotOutlineSets.map(s => `plotOutline:${s}`),
      ],
      beforeState,
      afterState,
    });
  }

  public getHistory(): InfoClearDetail[] {
    return [...this.history];
  }

  public getClearsByTriggerType(triggerType: ClearTriggerType): InfoClearDetail[] {
    return this.history.filter(h => h.triggerType === triggerType);
  }

  public generateDetailedReport(): string {
    const lines = ['=== Info Clear Detailed Report ===', ''];
    
    if (this.history.length === 0) {
      lines.push('No info clear history found.');
      return lines.join('\n');
    }

    const byTriggerType: Record<string, InfoClearDetail[]> = {};
    this.history.forEach(h => {
      if (!byTriggerType[h.triggerType]) {
        byTriggerType[h.triggerType] = [];
      }
      byTriggerType[h.triggerType].push(h);
    });

    Object.entries(byTriggerType).forEach(([type, clears]) => {
      lines.push(`## Trigger Type: ${type} (${clears.length} occurrences)`);
      lines.push('');
      
      clears.forEach((clear, idx) => {
        lines.push(`[${idx + 1}] Time: ${new Date(clear.timestamp).toLocaleString()}`);
        lines.push(`    Context:`);
        lines.push(`      Volume: ${clear.context.volumeName} (index: ${clear.context.volumeIndex})`);
        if (clear.context.nextVolumeName) {
          lines.push(`      Next Volume: ${clear.context.nextVolumeName}`);
        }
        if (clear.context.chapterTitle) {
          lines.push(`      Chapter: ${clear.context.chapterTitle}`);
        }
        lines.push(`      Loop Index: ${clear.context.loopIndex}`);
        lines.push('');
        
        lines.push(`    Cleared Nodes (${clear.clearedNodes.length}):`);
        clear.clearedNodes.forEach(node => {
          lines.push(`      - ${node.nodeType} "${node.nodeLabel}": ${node.previousOutputCount} -> ${node.clearedOutputCount} outputs`);
        });
        lines.push('');
        
        lines.push(`    Cleared Novel Data:`);
        if (clear.clearedNovelData.clearedWorldviewSets.length > 0) {
          lines.push(`      Worldview: ${clear.clearedNovelData.clearedWorldviewSets.join(', ')}`);
        }
        if (clear.clearedNovelData.clearedCharacterSets.length > 0) {
          lines.push(`      Characters: ${clear.clearedNovelData.clearedCharacterSets.join(', ')}`);
        }
        if (clear.clearedNovelData.clearedOutlineSets.length > 0) {
          lines.push(`      Outlines: ${clear.clearedNovelData.clearedOutlineSets.join(', ')}`);
        }
        if (clear.clearedNovelData.clearedInspirationSets.length > 0) {
          lines.push(`      Inspirations: ${clear.clearedNovelData.clearedInspirationSets.join(', ')}`);
        }
        if (clear.clearedNovelData.clearedPlotOutlineSets.length > 0) {
          lines.push(`      Plot Outlines: ${clear.clearedNovelData.clearedPlotOutlineSets.join(', ')}`);
        }
        lines.push('');
        lines.push('');
      });
    });

    return lines.join('\n');
  }
}

export const infoClearDebugTracker = new InfoClearDebugTracker();
export default infoClearDebugTracker;

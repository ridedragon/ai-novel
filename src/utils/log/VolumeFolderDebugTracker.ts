import { debugLogger } from './DebugLogger';

export interface VolumeFolderCreationDetail {
  volumeIndex: number;
  folderName: string;
  targetVolumeId: string;
  timestamp: number;
  triggeredBy: 'multiCreateFolder' | 'autoCreate' | 'manual';
  
  workflowState: {
    currentNodeIndex: number;
    currentNodeType: string;
    currentNodeId: string;
    loopIndex: number;
    totalVolumes: number;
  };
  
  nodesExecution: Array<{
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    status: string;
    timestamp: number;
    details?: any;
  }>;
  
  folderCreationResult?: {
    success: boolean;
    createdVolumeId?: string;
    existingVolumeId?: string;
    error?: string;
  };
  
  setsCreationResult?: {
    success: boolean;
    createdSets: string[];
    skippedSets: string[];
    error?: string;
  };
}

class VolumeFolderDebugTracker {
  private currentTracking: VolumeFolderCreationDetail | null = null;
  private history: VolumeFolderCreationDetail[] = [];
  private maxHistory: number = 50;

  public startTracking(volumeIndex: number, folderName: string, triggeredBy: VolumeFolderCreationDetail['triggeredBy'], initialState: any) {
    this.currentTracking = {
      volumeIndex,
      folderName,
      targetVolumeId: '',
      timestamp: Date.now(),
      triggeredBy,
      workflowState: {
        currentNodeIndex: initialState.currentNodeIndex || 0,
        currentNodeType: initialState.currentNodeType || '',
        currentNodeId: initialState.currentNodeId || '',
        loopIndex: initialState.loopIndex || 1,
        totalVolumes: initialState.totalVolumes || 0,
      },
      nodesExecution: [],
    };
    
    debugLogger.info('VOLUME_TRACKER', `Started tracking volume folder creation: ${folderName} (index: ${volumeIndex})`, {
      triggeredBy,
      workflowState: this.currentTracking.workflowState,
    });
    
    return this.currentTracking;
  }

  public updateWorkflowState(state: Partial<VolumeFolderCreationDetail['workflowState']>) {
    if (this.currentTracking) {
      this.currentTracking.workflowState = {
        ...this.currentTracking.workflowState,
        ...state,
      };
    }
  }

  public recordNodeExecution(
    nodeId: string,
    nodeType: string,
    nodeLabel: string,
    status: string,
    details?: any
  ) {
    if (this.currentTracking) {
      this.currentTracking.nodesExecution.push({
        nodeId,
        nodeType,
        nodeLabel,
        status,
        timestamp: Date.now(),
        details,
      });
      
      debugLogger.debug('VOLUME_TRACKER', `Node execution: ${nodeType} "${nodeLabel}" -> ${status}`, {
        nodeId,
        details,
      });
    }
  }

  public recordFolderCreation(result: VolumeFolderCreationDetail['folderCreationResult']) {
    if (this.currentTracking && result) {
      this.currentTracking.folderCreationResult = result;
      
      if (result.success) {
        this.currentTracking.targetVolumeId = result.createdVolumeId || result.existingVolumeId || '';
        debugLogger.info('VOLUME_TRACKER', `Folder creation ${result.success ? 'SUCCESS' : 'FAILED'}`, {
          createdVolumeId: result.createdVolumeId,
          existingVolumeId: result.existingVolumeId,
          error: result.error,
        });
      } else {
        debugLogger.error('VOLUME_TRACKER', `Folder creation FAILED: ${result.error}`, result);
      }
    }
  }

  public recordSetsCreation(result: VolumeFolderCreationDetail['setsCreationResult']) {
    if (this.currentTracking && result) {
      this.currentTracking.setsCreationResult = result;
      
      debugLogger.info('VOLUME_TRACKER', `Sets creation ${result.success ? 'SUCCESS' : 'FAILED'}`, {
        createdSets: result.createdSets,
        skippedSets: result.skippedSets,
        error: result.error,
      });
    }
  }

  public finishTracking(): VolumeFolderCreationDetail | null {
    if (this.currentTracking) {
      this.history.push(this.currentTracking);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      
      debugLogger.info('VOLUME_TRACKER', `Finished tracking: ${this.currentTracking.folderName}`, {
        totalNodesExecuted: this.currentTracking.nodesExecution.length,
        folderCreationSuccess: this.currentTracking.folderCreationResult?.success,
        setsCreationSuccess: this.currentTracking.setsCreationResult?.success,
      });
      
      const result = this.currentTracking;
      this.currentTracking = null;
      return result;
    }
    return null;
  }

  public getCurrentTracking(): VolumeFolderCreationDetail | null {
    return this.currentTracking;
  }

  public getHistory(): VolumeFolderCreationDetail[] {
    return [...this.history];
  }

  public generateDetailedReport(): string {
    const lines = ['=== Volume Folder Creation Detailed Report ===', ''];
    
    if (this.history.length === 0) {
      lines.push('No volume folder creation history found.');
      return lines.join('\n');
    }

    this.history.forEach((tracking, idx) => {
      lines.push(`[${idx + 1}] Volume ${tracking.volumeIndex}: ${tracking.folderName}`);
      lines.push(`    Triggered by: ${tracking.triggeredBy}`);
      lines.push(`    Time: ${new Date(tracking.timestamp).toLocaleString()}`);
      lines.push('');
      
      lines.push('    Workflow State:');
      lines.push(`      Current Node Index: ${tracking.workflowState.currentNodeIndex}`);
      lines.push(`      Current Node: ${tracking.workflowState.currentNodeType} (${tracking.workflowState.currentNodeId})`);
      lines.push(`      Loop Index: ${tracking.workflowState.loopIndex}`);
      lines.push(`      Total Volumes: ${tracking.workflowState.totalVolumes}`);
      lines.push('');
      
      lines.push('    Nodes Execution:');
      tracking.nodesExecution.forEach((node, nIdx) => {
        lines.push(`      ${nIdx + 1}. ${node.nodeType} "${node.nodeLabel}" [${node.status}]`);
        lines.push(`         NodeId: ${node.nodeId}`);
        lines.push(`         Time: ${new Date(node.timestamp).toLocaleTimeString()}`);
        if (node.details) {
          lines.push(`         Details: ${JSON.stringify(node.details).substring(0, 200)}`);
        }
      });
      lines.push('');
      
      if (tracking.folderCreationResult) {
        lines.push('    Folder Creation:');
        lines.push(`      Success: ${tracking.folderCreationResult.success}`);
        if (tracking.folderCreationResult.createdVolumeId) {
          lines.push(`      Created VolumeId: ${tracking.folderCreationResult.createdVolumeId}`);
        }
        if (tracking.folderCreationResult.existingVolumeId) {
          lines.push(`      Existing VolumeId: ${tracking.folderCreationResult.existingVolumeId}`);
        }
        if (tracking.folderCreationResult.error) {
          lines.push(`      Error: ${tracking.folderCreationResult.error}`);
        }
        lines.push('');
      }
      
      if (tracking.setsCreationResult) {
        lines.push('    Sets Creation:');
        lines.push(`      Success: ${tracking.setsCreationResult.success}`);
        lines.push(`      Created: ${tracking.setsCreationResult.createdSets.join(', ')}`);
        lines.push(`      Skipped: ${tracking.setsCreationResult.skippedSets.join(', ')}`);
        if (tracking.setsCreationResult.error) {
          lines.push(`      Error: ${tracking.setsCreationResult.error}`);
        }
        lines.push('');
      }
      
      lines.push('');
    });

    return lines.join('\n');
  }
}

export const volumeFolderDebugTracker = new VolumeFolderDebugTracker();
export default volumeFolderDebugTracker;

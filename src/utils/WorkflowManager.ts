import terminal from 'virtual:terminal';

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'failed';

interface WorkflowState {
  isRunning: boolean;
  isPaused: boolean;
  currentNodeIndex: number;
  activeWorkflowId: string | null;
  error: string | null;
}

type StateListener = (state: WorkflowState) => void;

/**
 * WorkflowManager 单例
 * 负责在 UI 组件生命周期之外管理工作流的运行状态
 * 解决界面关闭后 "isRunning" 丢失导致 UI 显示不一致的问题
 */
class WorkflowManager {
  private state: WorkflowState = {
    isRunning: false,
    isPaused: false,
    currentNodeIndex: -1,
    activeWorkflowId: null,
    error: null,
  };

  private listeners: Set<StateListener> = new Set();

  constructor() {
    // 构造函数保持干净，异步状态恢复将由 UI 组件触发
  }

  public getState(): WorkflowState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener) {
    this.listeners.add(listener);
    // 立即发送当前状态
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach(listener => listener(currentState));
  }

  public start(workflowId: string, startIndex: number = 0) {
    terminal.log(`[WorkflowManager] Starting workflow: ${workflowId} at index ${startIndex}`);
    this.state = {
      ...this.state,
      isRunning: true,
      isPaused: false,
      currentNodeIndex: startIndex,
      activeWorkflowId: workflowId,
      error: null,
    };
    this.notify();
  }

  public updateProgress(index: number) {
    if (this.state.currentNodeIndex !== index) {
      this.state.currentNodeIndex = index;
      this.notify();
    }
  }

  public pause(index: number) {
    terminal.log(`[WorkflowManager] Pausing workflow at index ${index}`);
    this.state = {
      ...this.state,
      isRunning: false,
      isPaused: true,
      currentNodeIndex: index,
    };
    this.notify();
  }

  public stop() {
    terminal.log(`[WorkflowManager] Stopping/Completing workflow`);
    this.state = {
      ...this.state,
      isRunning: false,
      isPaused: false,
      currentNodeIndex: -1,
      // 不清除 activeWorkflowId，以便界面知道上次选的是哪个
    };
    this.notify();
  }

  public setError(error: string | null) {
    this.state.error = error;
    if (error) {
      this.state.isRunning = false;
      this.state.isPaused = true;
    }
    this.notify();
  }

  public setActiveWorkflowId(id: string | null) {
    if (this.state.activeWorkflowId !== id) {
      this.state.activeWorkflowId = id;
      this.notify();
    }
  }
}

export const workflowManager = new WorkflowManager();

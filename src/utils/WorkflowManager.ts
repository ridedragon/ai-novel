import terminal from 'virtual:terminal';
import { WorkflowGlobalContext, VariableBinding } from '../types';

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'failed';

interface WorkflowState {
  isRunning: boolean;
  isPaused: boolean;
  currentNodeIndex: number;
  activeWorkflowId: string | null;
  error: string | null;
  globalContext: WorkflowGlobalContext;
}

type StateListener = (state: WorkflowState) => void;

/**
 * WorkflowManager 单例
 * 负责在 UI 组件生命周期之外管理工作流的运行状态
 * 解决界面关闭后 "isRunning" 丢失导致 UI 显示不一致的问题
 * V2 Upgrade: 升级为逻辑执行引擎，支持变量插值、上下文管理和控制流状态
 */
class WorkflowManager {
  private state: WorkflowState = {
    isRunning: false,
    isPaused: false,
    currentNodeIndex: -1,
    activeWorkflowId: null,
    error: null,
    globalContext: {
      variables: {},
      executionStack: []
    }
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
    // 如果是从头开始，重置上下文
    const newContext: WorkflowGlobalContext = startIndex === 0 ? {
      variables: {
        // 初始化系统变量
        loop_index: 0,
        batch_range: '',
      },
      executionStack: [],
      activeVolumeAnchor: undefined
    } : this.state.globalContext;

    this.state = {
      ...this.state,
      isRunning: true,
      isPaused: false,
      currentNodeIndex: startIndex,
      activeWorkflowId: workflowId,
      error: null,
      globalContext: newContext
    };
    this.notify();
  }

  public updateProgress(index: number) {
    if (this.state.currentNodeIndex !== index) {
      this.state.currentNodeIndex = index;
      this.notify();
    }
  }

  /**
   * 更新全局上下文
   */
  public updateContext(updates: Partial<WorkflowGlobalContext>) {
    // 深度合并变量
    const newVariables = {
      ...this.state.globalContext.variables,
      ...(updates.variables || {})
    };

    this.state = {
      ...this.state,
      globalContext: {
        ...this.state.globalContext,
        ...updates,
        variables: newVariables
      }
    };
    this.notify();
  }

  public getContextVar(key: string): any {
    return this.state.globalContext.variables[key];
  }

  public setContextVar(key: string, value: any) {
    this.updateContext({
      variables: { [key]: value }
    });
  }

  /**
   * 变量插值引擎
   * 将字符串中的 {{variable}} 替换为全局上下文中的值
   */
  public interpolate(text: string): string {
    if (!text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const varName = key.trim();
      
      // 特殊系统变量处理
      if (varName === 'active_volume_anchor') {
        return this.state.globalContext.activeVolumeAnchor || match;
      }
      if (varName === 'loop_index') {
        // 如果在循环栈中，优先取栈顶的 index
        // 目前简化处理，直接取全局变量
        return String(this.state.globalContext.variables['loop_index'] ?? 0);
      }

      const val = this.state.globalContext.variables[varName];
      if (val !== undefined && val !== null) {
        return String(val);
      }
      return match; // 未找到变量保持原样
    });
  }

  /**
   * 处理变量捕获
   * 从节点输出中提取数据并更新到全局上下文
   */
  public processVariableBindings(bindings: VariableBinding[], outputContent: string) {
    if (!bindings || bindings.length === 0) return;

    const updates: Record<string, any> = {};
    
    bindings.forEach(binding => {
      if (!binding.targetVar) return;

      let value = outputContent;

      // 如果有正则提取
      if (binding.extractRegex) {
        try {
          const regex = new RegExp(binding.extractRegex);
          const match = outputContent.match(regex);
          if (match && match[1]) {
            value = match[1];
          }
        } catch (e) {
          console.warn(`[WorkflowManager] Regex extract failed for ${binding.targetVar}:`, e);
        }
      }

      updates[binding.targetVar] = value;
      terminal.log(`[WorkflowManager] Captured variable: ${binding.targetVar} = ${value.substring(0, 50)}...`);
    });

    if (Object.keys(updates).length > 0) {
      this.setContextVarVars(updates);
    }
  }

  // 批量设置变量的辅助方法
  private setContextVarVars(vars: Record<string, any>) {
    this.updateContext({
      variables: vars
    });
  }

  public setActiveVolumeAnchor(volumeId: string) {
    this.updateContext({ activeVolumeAnchor: volumeId });
    terminal.log(`[WorkflowManager] Active Volume Anchor set to: ${volumeId}`);
  }

  public getActiveVolumeAnchor(): string | undefined {
    return this.state.globalContext.activeVolumeAnchor;
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
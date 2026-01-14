import terminal from 'virtual:terminal';
import { VariableBinding, WorkflowGlobalContext } from '../types';

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'failed';

interface WorkflowState {
  isRunning: boolean;
  isPaused: boolean;
  currentNodeIndex: number;
  activeWorkflowId: string | null;
  error: string | null;
  globalContext: WorkflowGlobalContext;
}

export interface NodeStatusUpdate {
  nodeId: string;
  data: Partial<any>; // 使用 any 以兼容 WorkflowNodeData，避免循环引用
}

type StateListener = (state: WorkflowState) => void;
type NodeUpdateListener = (update: NodeStatusUpdate) => void;

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
      executionStack: [],
    },
  };

  private listeners: Set<StateListener> = new Set();
  private nodeUpdateListeners: Set<NodeUpdateListener> = new Set();

  constructor() {
    // 构造函数保持干净，异步状态恢复将由 UI 组件触发
  }

  public subscribeToNodeUpdates(listener: NodeUpdateListener) {
    this.nodeUpdateListeners.add(listener);
    return () => this.nodeUpdateListeners.delete(listener);
  }

  public broadcastNodeUpdate(nodeId: string, data: Partial<any>) {
    const update = { nodeId, data };
    this.nodeUpdateListeners.forEach(listener => listener(update));
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
    const newContext: WorkflowGlobalContext =
      startIndex === 0
        ? {
            variables: {
              // 初始化系统变量
              loop_index: 1,
              batch_range: '',
            },
            executionStack: [],
            activeVolumeAnchor: undefined,
            pendingSplitChapter: undefined,
            pendingNextVolumeName: undefined,
            pendingSplits: [],
          }
        : this.state.globalContext;

    this.state = {
      ...this.state,
      isRunning: true,
      isPaused: false,
      currentNodeIndex: startIndex,
      activeWorkflowId: workflowId,
      error: null,
      globalContext: newContext,
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
      ...(updates.variables || {}),
    };

    this.state = {
      ...this.state,
      globalContext: {
        ...this.state.globalContext,
        ...updates,
        variables: newVariables,
      },
    };
    this.notify();
  }

  public getContextVar(key: string): any {
    return this.state.globalContext.variables[key];
  }

  public setContextVar(key: string, value: any) {
    this.updateContext({
      variables: { [key]: value },
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
      variables: vars,
    });
  }

  public setActiveVolumeAnchor(volumeId: string) {
    this.updateContext({ activeVolumeAnchor: volumeId });
    terminal.log(`[WorkflowManager] Active Volume Anchor set to: ${volumeId}`);
  }

  public getActiveVolumeAnchor(): string | undefined {
    return this.state.globalContext.activeVolumeAnchor;
  }

  public setPendingSplit(chapterTitle: string | undefined, nextVolumeName: string | undefined) {
    this.updateContext({
      pendingSplitChapter: chapterTitle,
      pendingNextVolumeName: nextVolumeName,
    });
  }

  public getPendingSplit() {
    return {
      chapterTitle: this.state.globalContext.pendingSplitChapter,
      nextVolumeName: this.state.globalContext.pendingNextVolumeName,
    };
  }

  public setPendingSplits(rules: any[]) {
    this.updateContext({
      pendingSplits: rules.map(r => ({ ...r, processed: false })),
    });
    terminal.log(`[WorkflowManager] Pending Splits set: ${rules.length} rules`);
  }

  public getPendingSplits() {
    return this.state.globalContext.pendingSplits || [];
  }

  /**
   * 规范化章节标题，支持中文数字转换
   * 例如："第一章" -> "1", "第11章" -> "11", "1" -> "1"
   */
  private normalizeChapterToken(title: string): string {
    if (!title) return '';
    // 移除空白字符、"第"、"章" 以及冒号等分隔符
    let text = title.replace(/\s+/g, '').replace(/[第章：:]/g, '');

    // 中文数字映射
    const chnNumChar: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };

    // 尝试将前面的中文数字转换为阿拉伯数字
    const chineseToNumber = (str: string) => {
      if (/^\d+$/.test(str)) return str;

      let res = 0;
      let temp = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const val = chnNumChar[char];
        if (val !== undefined) {
          temp = val;
          if (i === str.length - 1) res += temp;
        } else if (char === '十') {
          if (temp === 0) temp = 1;
          res += temp * 10;
          temp = 0;
        } else {
          // 遇到非数字字符，停止转换数字部分
          res += temp;
          break;
        }
      }
      return res > 0 ? String(res) : str;
    };

    // 提取开头的数字部分（中文或阿拉伯）
    const match = text.match(/^([零一二三四五六七八九十]+|\d+)/);
    if (match) {
      return chineseToNumber(match[1]);
    }

    return text;
  }

  /**
   * 检查是否触发分卷
   * 支持 Legacy (单一触发) 和 V2 (多触发规则)
   * 增强匹配逻辑：支持“第一章”、“1”等多种格式的灵活匹配
   */
  public checkTriggerSplit(currentChapterTitle: string): { chapterTitle: string; nextVolumeName: string } | null {
    const context = this.state.globalContext;
    const normalizedCurrent = this.normalizeChapterToken(currentChapterTitle);

    const isMatch = (targetTitle: string) => {
      if (!targetTitle) return false;
      // 1. 精确匹配
      if (targetTitle === currentChapterTitle) return true;
      // 2. 规范化匹配 (处理 "1" 匹配 "第一章")
      const normalizedTarget = this.normalizeChapterToken(targetTitle);
      return normalizedTarget === normalizedCurrent;
    };

    // 1. 优先检查新规则列表
    if (context.pendingSplits && context.pendingSplits.length > 0) {
      const rule = context.pendingSplits.find(r => !r.processed && isMatch(r.chapterTitle));
      if (rule) {
        return { chapterTitle: currentChapterTitle, nextVolumeName: rule.nextVolumeName };
      }
    }

    // 2. 兜底 Legacy 逻辑
    if (context.pendingSplitChapter && isMatch(context.pendingSplitChapter)) {
      return {
        chapterTitle: currentChapterTitle,
        nextVolumeName: context.pendingNextVolumeName || '新分卷',
      };
    }

    return null;
  }

  /**
   * 标记某个分卷规则已处理
   */
  public markSplitProcessed(chapterTitle: string) {
    const context = this.state.globalContext;
    const normalizedCurrent = this.normalizeChapterToken(chapterTitle);

    const isMatch = (targetTitle: string) => {
      if (!targetTitle) return false;
      if (targetTitle === chapterTitle) return true;
      return this.normalizeChapterToken(targetTitle) === normalizedCurrent;
    };

    // 清除 Legacy 触发器
    if (context.pendingSplitChapter && isMatch(context.pendingSplitChapter)) {
      this.updateContext({
        pendingSplitChapter: undefined,
        pendingNextVolumeName: undefined,
      });
    }

    // 标记新规则已处理
    if (context.pendingSplits) {
      const newSplits = context.pendingSplits.map(r => (isMatch(r.chapterTitle) ? { ...r, processed: true } : r));
      this.updateContext({ pendingSplits: newSplits });
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

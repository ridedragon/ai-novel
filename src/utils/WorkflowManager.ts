import terminal from 'virtual:terminal';
import { Chapter, VariableBinding, WorkflowContextSnapshot, WorkflowGlobalContext } from '../types';
import { resolveMacros, MacroContext, MACRO_QUICK_REFERENCE } from '../components/Workflow/macros';
import { storage } from './storage';

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'failed';

// 工作流执行状态接口
interface WorkflowExecutionState {
  runId: string | null;
  state: WorkflowState;
  timestamp: number;
}

const WORKFLOW_EXECUTION_KEY = 'workflow_execution_state';

interface WorkflowState {
  isRunning: boolean;
  isPaused: boolean;
  currentNodeIndex: number;
  currentNodeId: string | null; // 新增：保存当前执行节点的 ID
  activeWorkflowId: string | null;
  error: string | null;
  globalContext: WorkflowGlobalContext;
  totalVolumes: number; // 计划的总分卷数
  lockedStartVolumeId?: string;
  lockedStartVolumeIndex?: number;
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
    currentNodeId: null,
    activeWorkflowId: null,
    error: null,
    totalVolumes: 0,
    lockedStartVolumeId: undefined,
    lockedStartVolumeIndex: undefined,
    globalContext: {
      variables: {},
      executionStack: [],
    },
  };

  // 核心修复 (Bug 2): 引入全局执行 ID，用于识别并废弃过时的异步回调
  private currentRunId: string | null = null;

  private listeners: Set<StateListener> = new Set();
  private nodeUpdateListeners: Set<NodeUpdateListener> = new Set();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // 构造函数中恢复执行状态
    this.loadExecutionState();
    
    // 监听 localStorage 变化，实现多标签页同步
    window.addEventListener('storage', (event) => {
      if (event.key === WORKFLOW_EXECUTION_KEY && event.newValue) {
        try {
          const executionState = JSON.parse(event.newValue);
          this.currentRunId = executionState.runId;
          this.state = executionState.state;
          this.notify();
        } catch (error) {
          terminal.error(`[WorkflowManager] Failed to sync state from storage event: ${error}`);
        }
      }
    });
  }

  // 验证状态完整性
  private validateExecutionState(state: WorkflowExecutionState): boolean {
    if (!state || !state.state) {
      return false;
    }
    
    // 检查必要字段
    const requiredFields = ['isRunning', 'currentNodeIndex', 'activeWorkflowId'];
    for (const field of requiredFields) {
      if (!(field in state.state)) {
        return false;
      }
    }
    
    // 检查时间戳，避免使用过期状态
    const now = Date.now();
    const stateAge = now - state.timestamp;
    const maxAge = 30 * 60 * 1000; // 30分钟
    if (stateAge > maxAge) {
      terminal.warn(`[WorkflowManager] Execution state is too old (${stateAge}ms), discarding`);
      return false;
    }
    
    return true;
  }

  // 防抖保存状态
  private debouncedSaveExecutionState() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveExecutionState();
    }, 500); // 500ms 防抖
  }

  // 保存执行状态到 localStorage
  private saveExecutionState() {
    try {
      const executionState: WorkflowExecutionState = {
        runId: this.currentRunId,
        state: this.state,
        timestamp: Date.now(),
      };
      localStorage.setItem(WORKFLOW_EXECUTION_KEY, JSON.stringify(executionState));
      terminal.log(`[WorkflowManager] Execution state saved to localStorage`);
    } catch (error) {
      terminal.error(`[WorkflowManager] Failed to save execution state: ${error}`);
    }
  }

  // 从 localStorage 加载执行状态
  private loadExecutionState() {
    try {
      const localState = localStorage.getItem(WORKFLOW_EXECUTION_KEY);
      if (localState) {
        const executionState = JSON.parse(localState);
        if (this.validateExecutionState(executionState)) {
          this.currentRunId = executionState.runId;
          this.state = executionState.state;
          terminal.log(`[WorkflowManager] Execution state loaded from localStorage`);
          this.notify();
        }
      }
    } catch (error) {
      terminal.error(`[WorkflowManager] Failed to load execution state: ${error}`);
    }
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

  public getCurrentNodeId(): string | null {
    return this.state.currentNodeId;
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

  public start(workflowId: string, startIndex: number = 0, snapshot?: WorkflowContextSnapshot) {
    // 核心修复 (Bug 2): 生成并锁定本次运行的唯一 ID
    this.currentRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    terminal.log(
      `[WorkflowManager] Starting workflow: ${workflowId} at index ${startIndex} (RunID: ${this.currentRunId})`,
    );

    // 确定新的上下文逻辑
    let newContext: WorkflowGlobalContext;

    if (startIndex === 0) {
      // 1. 完全从头开始：彻底重置
      newContext = {
        variables: {
          loop_index: 1,
          batch_range: '',
        },
        executionStack: [],
        activeVolumeAnchor: undefined,
        pendingSplitChapter: undefined,
        pendingNextVolumeName: undefined,
        pendingSplits: [],
        volumePlans: [],
        volumeEndChapters: [],
      };
    } else if (startIndex > 0) {
      // 2. 恢复执行逻辑
      const memoryContext = this.state.globalContext;
      const hasMemory = Object.keys(memoryContext.variables).length > 2 || memoryContext.activeVolumeAnchor;

      if (hasMemory && this.state.activeWorkflowId === workflowId) {
        // 2a. 优先使用内存中的上下文 (最实时)
        terminal.log(`[WorkflowManager] Resuming with in-memory context.`);
        newContext = memoryContext;
      } else if (snapshot) {
        // 2b. 内存丢失或切换了工作流，尝试从持久化快照恢复
        terminal.log(`[WorkflowManager] Resuming with context snapshot recovery.`);
        newContext = {
          variables: snapshot.variables || { loop_index: 1 },
          executionStack: [],
          activeVolumeAnchor: snapshot.activeVolumeAnchor,
          pendingSplits: snapshot.pendingSplits || [],
          volumePlans: snapshot.volumePlans || [],
          volumeEndChapters: snapshot.volumeEndChapters || [],
        };
      } else {
        // 2c. 既无内存也无快照，维持现状
        newContext = memoryContext;
      }

      // 核心增强 (Bug 1 反馈修复)：如果恢复时没有锚点，但不是从头开始，尝试从全局变量回溯
      // 这能解决因快照未能及时保存导致的“分卷归类丢失”问题
      if (!newContext.activeVolumeAnchor && startIndex > 0) {
        terminal.warn(`[WorkflowManager] Anchor missing in snapshot. Will attempt back-tracing in engine.`);
      }
    } else {
      // 3. 正常的内存内继续执行
      newContext = this.state.globalContext;
    }

    this.state = {
      ...this.state,
      isRunning: true,
      isPaused: false,
      currentNodeIndex: startIndex,
      activeWorkflowId: workflowId,
      error: null,
      globalContext: newContext,
    };
    
    // 保存状态
    this.debouncedSaveExecutionState();
    this.notify();
  }

  public getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  /**
   * 检查提供的 ID 是否为当前活跃的运行 ID (Bug 2 深度修复)
   */
  public isRunActive(runId: string | null | undefined): boolean {
    // 如果 runId 为空，说明该任务未受锁保护（如旧版数据），允许其继续以保持兼容
    if (!runId) return true;

    // 核心逻辑：传入的 ID 必须与全局最新 ID 一致，且系统处于运行状态
    return this.currentRunId === runId && this.state.isRunning;
  }

  /**
   * 为手动任务注册一个执行 ID
   */
  public registerManualRun(type: string): string {
    const runId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.currentRunId = runId;
    this.state.isRunning = true;
    terminal.log(`[WorkflowManager] Manual run registered: ${runId}`);
    return runId;
  }

  public updateProgress(index: number, nodeId?: string) {
    if (this.state.currentNodeIndex !== index || this.state.currentNodeId !== nodeId) {
      this.state.currentNodeIndex = index;
      if (nodeId !== undefined) {
        this.state.currentNodeId = nodeId;
      }
      
      // 保存状态
      this.debouncedSaveExecutionState();
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
    
    // 保存状态
    this.debouncedSaveExecutionState();
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
  /**
   * 将数字转换为中文大写数字 (如 24 -> 二十四)
   */
  /**
   * 将数字转换为中文大写数字 (如 24 -> 二十四)
   * 采用更严谨的网文序号转换逻辑
   */
  public toChineseNumeral(num: number): string {
    if (num === 0) return '零';
    if (num === 10) return '十';

    const zh = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const units = ['', '十', '百', '千', '万'];

    let res = '';
    const s = String(num);
    const len = s.length;

    for (let i = 0; i < len; i++) {
      const n = Number(s[i]);
      const u = len - i - 1;

      if (n !== 0) {
        // 处理 10-19 的特殊读法 (一十 -> 十)
        if (len === 2 && i === 0 && n === 1) {
          res += units[u];
        } else {
          res += zh[n] + units[u];
        }
      } else {
        // 处理中间的零
        if (res !== '' && res[res.length - 1] !== '零' && u !== 0) {
          res += '零';
        }
      }
    }

    return res.replace(/零$/, '');
  }

  /**
   * 变量插值引擎
   * 将字符串中的 {{variable}} 替换为全局上下文中的值
   * 注意：此方法处理简单变量，宏组件由 interpolateWithMacros 处理
   */
  public interpolate(text: string): string {
    if (!text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const varName = key.trim();

      // 特殊系统变量处理
      if (varName === 'active_volume_anchor') {
        return this.state.globalContext.activeVolumeAnchor || match;
      }
      if (varName === 'loop_index' || varName === 'loop_idx') {
        const val = this.state.globalContext.variables['loop_index'] ?? 0;
        return String(val);
      }
      if (varName === 'chinese_loop_index' || varName === 'chapter_index') {
        const val = this.state.globalContext.variables['loop_index'] ?? 0;
        return this.toChineseNumeral(Number(val));
      }

      const val = this.state.globalContext.variables[varName];
      if (val !== undefined && val !== null) {
        return String(val);
      }
      return match; // 未找到变量保持原样
    });
  }

  /**
   * 增强版插值引擎 - 支持宏组件
   * 在变量插值的基础上，额外处理宏组件解析
   * 宏组件可以引用其他节点的全部内容，不受执行顺序限制
   * 
   * @param text 要处理的文本
   * @param macroContext 宏解析上下文（包含所有节点数据）
   * @returns 处理后的文本
   */
  public interpolateWithMacros(text: string, macroContext: Partial<MacroContext>): string {
    if (!text) return text;

    // 1. 先进行基础变量插值
    let result = this.interpolate(text);

    // 2. 构建完整的宏上下文
    const fullContext: MacroContext = {
      previousNodes: macroContext.previousNodes || [],
      allNodes: macroContext.allNodes || [],
      currentNode: macroContext.currentNode,
      globalVariables: {
        ...this.state.globalContext.variables,
        ...macroContext.globalVariables,
      },
      activeVolumeAnchor: this.state.globalContext.activeVolumeAnchor || macroContext.activeVolumeAnchor,
      currentVolumeIndex: this.getCurrentVolumeIndex(),
      novelData: macroContext.novelData,
    };

    // 3. 进行宏组件解析
    result = resolveMacros(result, fullContext);

    return result;
  }

  /**
   * 获取宏组件快速参考文本
   * 用于在 UI 中显示可用的宏列表
   */
  public getMacroQuickReference(): string {
    return MACRO_QUICK_REFERENCE;
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

  public lockStartVolume(volumeId?: string, volumeIndex?: number) {
    this.state = {
      ...this.state,
      lockedStartVolumeId: volumeId,
      lockedStartVolumeIndex: volumeIndex,
    };
    this.notify();
    terminal.log(
      `[WorkflowManager] Start volume lock set: volumeId=${volumeId || 'none'}, index=${volumeIndex ?? 'none'}`,
    );
  }

  public clearStartVolumeLock() {
    if (this.state.lockedStartVolumeId === undefined && this.state.lockedStartVolumeIndex === undefined) {
      return;
    }
    this.state = {
      ...this.state,
      lockedStartVolumeId: undefined,
      lockedStartVolumeIndex: undefined,
    };
    this.notify();
    terminal.log('[WorkflowManager] Start volume lock cleared');
  }

  public getStartVolumeLock() {
    return {
      volumeId: this.state.lockedStartVolumeId,
      volumeIndex: this.state.lockedStartVolumeIndex,
    };
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

  public setVolumePlans(volumes: any[]) {
    this.updateContext({
      volumePlans: volumes.map(v => ({ ...v, processed: false })),
    });
    terminal.log(`[WorkflowManager] Volume Plans set: ${volumes.length} volumes`);
  }

  public getVolumePlans() {
    return this.state.globalContext.volumePlans || [];
  }

  public getPendingSplits() {
    return this.state.globalContext.pendingSplits || [];
  }

  /**
   * 获取当前执行上下文快照 (Bug 1 修复：用于持久化)
   */
  public getSnapshot(): WorkflowContextSnapshot {
    const ctx = this.state.globalContext;
    return {
      activeVolumeAnchor: ctx.activeVolumeAnchor,
      pendingSplits: ctx.pendingSplits,
      volumePlans: ctx.volumePlans,
      volumeEndChapters: ctx.volumeEndChapters,
      variables: ctx.variables,
    };
  }

  /**
   * 规范化章节标题，支持中文数字转换
   * 例如："第一章" -> "1", "第11章" -> "11", "1" -> "1"
   */
  /**
   * 规范化章节标题，支持中文数字转换 (Bug 1 增强)
   * 采用与移动端同步的解析逻辑，提升分卷触发匹配的鲁棒性
   */
  /**
   * 规范化章节标题，提取其中的数字序号 (Bug 1 反馈加固)
   * 目标：将 "第二十一章：新陈之间" 或 "第21章" 都统一识别为 "21"
   */
  private normalizeChapterToken(title: string): string {
    if (!title) return '';

    // 1. 提取第一段连续的中文数字或阿拉伯数字
    const match = title.match(/[零一二三四五六七八九十百千]+|\d+/);
    if (!match) return title;

    const token = match[0];

    // 2. 如果是纯数字，直接返回
    if (/^\d+$/.test(token)) return token;

    // 3. 处理中文数字转换
    const chineseNums: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      百: 100,
      千: 1000,
    };

    if (token.length === 1) return String(chineseNums[token] ?? token);

    let result = 0;
    let temp = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token[i];
      const num = chineseNums[char];
      if (num === 10) {
        if (temp === 0) temp = 1;
        result += temp * 10;
        temp = 0;
      } else if (num === 100) {
        result += temp * 100;
        temp = 0;
      } else if (num === 1000) {
        result += temp * 1000;
        temp = 0;
      } else {
        temp = num;
      }
    }
    result += temp;
    return result > 0 ? String(result) : token;
  }

  /**
   * 检查是否触发分卷
   * 支持 Legacy (单一触发) 和 V2 (多触发规则)
   * 增强匹配逻辑：支持“第一章”、“1”等多种格式的灵活匹配
   */
  public checkTriggerSplit(
    currentChapterTitle: string, 
    currentChapterGlobalIndex?: number
  ): { chapterTitle: string; nextVolumeName: string } | null {
    const context = this.state.globalContext;
    const normalizedCurrent = this.normalizeChapterToken(currentChapterTitle);

    const isMatch = (targetTitle: string, targetStartChapter?: number) => {
      if (!targetTitle) return false;
      
      // 1. 如果有全局索引，优先用全局索引匹配（最可靠，因为全局索引全书唯一）
      if (currentChapterGlobalIndex !== undefined && targetStartChapter !== undefined) {
        if (currentChapterGlobalIndex === targetStartChapter) {
          return true;
        }
      }
      
      // 2. 精确匹配标题
      if (targetTitle === currentChapterTitle) return true;
      
      // 3. 规范化匹配 (处理 "1" 匹配 "第一章")
      const normalizedTarget = this.normalizeChapterToken(targetTitle);
      return normalizedTarget === normalizedCurrent;
    };

    // 1. 优先检查新规则列表
    // 核心修复 (Bug 6): 只检查第一个未处理的规则，防止旧规则误触发
    // 原来的问题：volume 2 的规则 (endChapter: 3) 未被标记为 processed
    // 当 volume 3 章节运行时 (globalIndex 7, 8, 9)，7 > 3 会错误触发
    if (context.pendingSplits && context.pendingSplits.length > 0) {
      const unprocessedRules = context.pendingSplits.filter(r => !r.processed);
      terminal.log(
        `[WorkflowManager] Checking split: ${unprocessedRules.length} unprocessed rules for "${currentChapterTitle}" (globalIndex: ${currentChapterGlobalIndex}, norm: ${normalizedCurrent})`,
      );

      // 只检查第一个未处理的规则
      if (unprocessedRules.length > 0) {
        const rule = unprocessedRules[0];
        terminal.log(
          `[WorkflowManager]   Checking FIRST rule: "${rule.nextVolumeName}" (startChapter: ${rule.startChapter}, endChapter: ${rule.endChapter}, chapterTitle: ${rule.chapterTitle})`,
        );

        // 核心修复：从指定卷/指定位置启动时，禁止旧规则把执行回切到更早的卷。
        // 典型场景：用户从第二卷开始，但第一条未处理规则仍是“切到第二卷/第一卷之前的旧规则”，
        // 由于 currentChapterGlobalIndex > endChapter，会被误触发，导致当前章节写入错误分卷。
        const startLock = this.getStartVolumeLock();
        const lockIndex = startLock.volumeIndex;
        if (lockIndex !== undefined && lockIndex >= 0) {
          // 只要设置了启动卷锁，就检查是否要切换到更早的卷
          const targetRuleVolumeIndex = (context.volumePlans || []).findIndex(
            (v: any) => (v.volumeName || v.folderName) === rule.nextVolumeName,
          );
          if (targetRuleVolumeIndex !== -1 && targetRuleVolumeIndex < lockIndex) {
            terminal.warn(
              `[WorkflowManager]   Split suppressed by start volume lock: targetRuleVolumeIndex=${targetRuleVolumeIndex} < lockIndex=${lockIndex}`,
            );
            return null;
          }
          // 额外保护：如果有启动卷锁，且规则没有明确的 volumePlans 匹配，
          // 但规则看起来是要切换到更早的卷（如 endChapter 检查会触发），
          // 我们也应该禁止，以确保安全
          if (targetRuleVolumeIndex === -1 && (rule.endChapter !== undefined || rule.chapterTitle !== undefined)) {
            terminal.warn(
              `[WorkflowManager]   Split suppressed by start volume lock: ambiguous rule, lockIndex=${lockIndex}`,
            );
            return null;
          }
        }

        // 使用 endChapter 判断触发（如果存在）
        // endChapter=4 表示第4章是最后一章，第4章完成后（globalIndex > 4）切换
        if (rule.endChapter && currentChapterGlobalIndex !== undefined) {
          const shouldTrigger = currentChapterGlobalIndex > rule.endChapter;
          terminal.log(
            `[WorkflowManager]   endChapter check: globalIndex=${currentChapterGlobalIndex} > endChapter=${rule.endChapter} = ${shouldTrigger}`,
          );
          if (shouldTrigger) {
            terminal.log(`[WorkflowManager]   TRIGGERED by endChapter`);
            return { chapterTitle: currentChapterTitle, nextVolumeName: rule.nextVolumeName };
          } else {
            // 如果 endChapter 不匹配，说明还没到切换点，不再检查后续规则
            terminal.log(`[WorkflowManager]   Not triggered yet, skipping remaining rules`);
          }
        } else if (rule.chapterTitle) {
          // 兜底：使用 chapterTitle 判断（兼容旧数据）
          const ruleNorm = this.normalizeChapterToken(rule.chapterTitle);
          const matched = isMatch(rule.chapterTitle, rule.startChapter);
          terminal.log(
            `[WorkflowManager]   chapterTitle check: "${rule.chapterTitle}" (norm: ${ruleNorm}) -> match=${matched}`,
          );
          if (matched) {
            return { chapterTitle: currentChapterTitle, nextVolumeName: rule.nextVolumeName || '' };
          }
        }
      }
    }

    // Bug修复：禁用 SAFETY TRIGGER，因为它使用了错误的 endChapter 数据
    // 原来的问题：volumePlans 中的 endChapter 值不正确（如第二卷 endChapter=2）
    // 导致在最后一章还没完成时就触发了分卷切换
    // 修复：依赖 onChapterComplete 中的主分卷切换机制，它在章节完成后正确判断
    // 【安全机制已禁用】：检查 volumePlans 中的分卷规划
    // if (context.volumePlans && context.volumePlans.length > 1 && currentChapterGlobalIndex !== undefined) {
    //   const unprocessedVolumes = context.volumePlans.filter((v: any, idx: number) => !v.processed && idx > 0);
    //   for (const volume of unprocessedVolumes) {
    //     if (volume.endChapter && currentChapterGlobalIndex > volume.endChapter) {
    //       terminal.log(`[WorkflowManager] SAFETY TRIGGER: ...`);
    //       return { chapterTitle: currentChapterTitle, nextVolumeName: volume.volumeName };
    //     }
    //   }
    // }

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
   * 核心修复 (Bug 7): 分卷切换时，清理所有过期的 pendingSplits 规则
   * 原来的问题：旧规则（如 endChapter: 1）未被清理，后续章节 globalIndex > 1 会误触发
   */
  public markSplitProcessed(chapterTitle: string, nextVolumeName?: string, currentGlobalIndex?: number) {
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

    // 核心修复：清理所有过期的 pendingSplits 规则
    if (context.pendingSplits) {
      const newSplits = context.pendingSplits.map(r => {
        // 1. 匹配当前章节的规则，标记为已处理
        if (r.chapterTitle && isMatch(r.chapterTitle)) {
          return { ...r, processed: true };
        }
        // 2. 清理所有 endChapter 小于当前全局索引的规则（过期规则）
        if (currentGlobalIndex !== undefined && r.endChapter && currentGlobalIndex > r.endChapter) {
          terminal.log(`[WorkflowManager] Marking stale rule as processed: "${r.nextVolumeName}" (endChapter: ${r.endChapter} < globalIndex: ${currentGlobalIndex})`);
          return { ...r, processed: true };
        }
        return r;
      });
      this.updateContext({ pendingSplits: newSplits });
    }

    // 标记 volumePlans 中对应的分卷为已处理
    if (context.volumePlans && nextVolumeName) {
      const newVolumePlans = context.volumePlans.map((v: any) => 
        (v.volumeName === nextVolumeName ? { ...v, processed: true } : v)
      );
      this.updateContext({ volumePlans: newVolumePlans });
    }
  }

  /**
   * 检查是否到达分卷终止章
   * 用于多分卷目录节点，当创作完成终止章后自动切换到下一卷
   * @param currentChapterTitle 当前章节标题
   * @param currentVolumeIndex 当前分卷索引
   * @param isVolumeMode 是否为本卷模式（true: 每卷章节号重新开始; false: 整书模式，章节号全局延续）
   * @param completedChaptersCount 全局已完成章节数（整书模式使用）
   */
  public checkVolumeEndChapter(
    currentChapterTitle: string, 
    currentVolumeIndex: number,
    isVolumeMode: boolean = true,
    completedChaptersCount?: number
  ): { 
    shouldSwitchVolume: boolean; 
    nextVolumeIndex: number;
    endChapterNum: number;
  } | null {
    const context = this.state.globalContext;
    const normalizedCurrent = this.normalizeChapterToken(currentChapterTitle);
    const currentChapterNum = parseInt(normalizedCurrent);

    if (isNaN(currentChapterNum)) return null;

    // 检查是否有分卷终止章配置
    const volumeEndChapters = context.volumeEndChapters || [];

    for (const vec of volumeEndChapters) {
      if (vec.volumeId === context.activeVolumeAnchor ||
          (currentVolumeIndex >= 0 && vec.volumeId === `vol_idx_${currentVolumeIndex}`)) {
        const endChapterNum = parseInt(this.normalizeChapterToken(vec.endChapterTitle));

        if (isNaN(endChapterNum)) continue;

        // 根据模式选择不同的比较逻辑
        let shouldSwitch = false;
        if (isVolumeMode) {
          // 本卷模式：使用卷内章节编号比较
          // endChapter=3 表示第3章是该卷最后一章，第3章完成后（currentChapterNum >= 3）切换
          shouldSwitch = currentChapterNum >= endChapterNum;
        } else {
          // 整书模式：使用全局章节索引比较
          // endChapter=3 表示第1-3章属于当前卷，第3章完成后（completedChaptersCount >= 3）切换
          if (completedChaptersCount !== undefined) {
            shouldSwitch = completedChaptersCount >= endChapterNum;
          }
        }

        if (shouldSwitch) {
          return {
            shouldSwitchVolume: true,
            nextVolumeIndex: currentVolumeIndex + 1,
            endChapterNum,
          };
        }
      }
    }

    return null;
  }

  /**
   * 设置分卷终止章配置
   */
  public setVolumeEndChapters(configs: { volumeId: string; volumeName: string; endChapterTitle: string }[]) {
    this.updateContext({
      volumeEndChapters: configs.map(c => ({
        ...c,
        processed: false,
      })),
    });
    terminal.log(`[WorkflowManager] Volume end chapters set: ${configs.length} configs`);
  }

  /**
   * 获取当前分卷索引
   */
  public getCurrentVolumeIndex(): number {
    return this.state.globalContext.variables['current_volume_index'] || 0;
  }

  /**
   * 设置当前分卷索引
   */
  public setCurrentVolumeIndex(index: number) {
    this.setContextVar('current_volume_index', index);
    terminal.log(`[WorkflowManager] Current volume index set to: ${index}`);
  }

  /**
   * 设置总分卷数
   */
  public setTotalVolumes(total: number) {
    this.state.totalVolumes = total;
    terminal.log(`[WorkflowManager] Total volumes set to: ${total}`);
  }

  /**
   * 获取总分卷数
   */
  public getTotalVolumes(): number {
    return this.state.totalVolumes;
  }

  /**
   * 从 AI 返回的文本中解析分卷规划规则
   * 采用“深度分块模糊解析”算法，具备极强的格式兼容性
   * 返回对象包含：
   *   - splitRules: 分卷切换规则数组（用于向后兼容）
   *   - volumes: 完整的分卷列表数组（包含第一卷）
   */
  public parseVolumesFromAI(aiText: string): any {
    if (!aiText) return { splitRules: [], volumes: [] };

    const rules: any[] = [];
    const volumes: any[] = [];
    const timestamp = Date.now();

    // 策略 1：深度分块模糊解析 (首选，抗干扰强)
    // 逻辑：以“分卷名称”作为分隔符切块，每个分块内独立提取信息
    const sections = aiText.split(/[*]*分卷名称[*]*[:：]/);

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];

      // 1. 提取名称 (分卷名称关键词后的第一行，移除 Markdown 符号)
      const nameMatch = section.match(/^\s*[*]*([^\n*]+)[*]*/);
      const name = nameMatch ? nameMatch[1].trim() : '新分卷';

      // 2. 提取范围 (支持各种连接符和可选的“第/章”文字)
      const rangeMatch = section.match(
        /(?:章节范围|范围)[:：]\s*(?:第)?\s*([零一二两三四五六七八九十百千\d]+)\s*(?:章)?\s*[-－—至到~]\s*(?:第)?\s*([零一二两三四五六七八九十百千\d]+)\s*(?:章)?/,
      );

      // 3. 提取概述 (寻找“基本内容概述”关键词直到下一个分卷块开始或全文结束)
      const summaryMatch = section.match(
        /(?:基本内容概述|概述|内容)[:：]\s*([\s\S]*?)(?=\n\s*[*]*(?:分卷名称|章节范围|第|$))/,
      );
      const summary = summaryMatch ? summaryMatch[1].trim() : '';

      if (rangeMatch) {
        const startStr = rangeMatch[1];
        const endStr = rangeMatch[2];
        const startNum = parseInt(this.normalizeChapterToken(startStr));
        const endNum = parseInt(this.normalizeChapterToken(endStr));

        // 保存完整的分卷信息（包括第一卷）
        volumes.push({
          id: `vol_${timestamp}_${volumes.length}`,
          volumeName: name,
          folderName: name,
          startChapter: isNaN(startNum) ? undefined : startNum,
          endChapter: isNaN(endNum) ? undefined : endNum,
          description: summary,
          processed: false,
        });

        // 关键修复：分卷应该在当前范围结束后的下一章触发
        // 例如：第一卷是1-5章，那么在第6章时才切换到第二卷
        const triggerChapterNum = isNaN(endNum) ? undefined : endNum + 1;
        const triggerChapterStr = triggerChapterNum ? triggerChapterNum.toString() : startStr;

        rules.push({
          id: `vol_rule_block_${timestamp}_${rules.length}`,
          chapterTitle: `第${triggerChapterStr}章`, // 使用下一章作为触发点
          nextVolumeName: name,
          description: summary,
          startChapter: isNaN(startNum) ? undefined : startNum,
          endChapter: isNaN(endNum) ? undefined : endNum,
          processed: false,
        });
      }
    }

    if (rules.length > 0) {
      terminal.log(`[WorkflowManager] Successfully parsed ${rules.length} volume rules and ${volumes.length} volumes using Block Parser`);
      return { splitRules: rules, volumes };
    }

    // 策略 2：JSON 解析 (针对少数强制 JSON 的模型)
    try {
      const cleanJson = aiText.replace(/```json\s*([\s\S]*?)```/gi, '$1').trim();
      const startIdx = Math.max(cleanJson.indexOf('['), cleanJson.indexOf('{'));
      if (startIdx !== -1) {
        const parsed = JSON.parse(cleanJson.substring(startIdx));
        const items = Array.isArray(parsed) ? parsed : parsed.volumes || [];
        items.forEach((item: any, idx: number) => {
          const sStr = String(item.startChapter || item.start || '');
          const sNum = parseInt(this.normalizeChapterToken(sStr));
          const eStr = String(item.endChapter || item.end || '');
          const eNum = parseInt(this.normalizeChapterToken(eStr));
          const name = item.title || item.name || '新分卷';
          
          // 保存完整的分卷信息
          volumes.push({
            id: `vol_${timestamp}_${volumes.length}`,
            volumeName: name,
            folderName: name,
            startChapter: isNaN(sNum) ? undefined : sNum,
            endChapter: isNaN(eNum) ? undefined : eNum,
            description: item.summary || item.description || '',
            processed: false,
          });
          
          // 同样修复：使用结束章+1作为触发点
          const triggerChapterNum = isNaN(eNum) ? undefined : eNum + 1;
          const triggerChapterStr = triggerChapterNum ? triggerChapterNum.toString() : sStr;
          
          rules.push({
            id: `vol_rule_json_${timestamp}_${idx}`,
            chapterTitle: `第${triggerChapterStr}章`,
            nextVolumeName: name,
            description: item.summary || item.description || '',
            startChapter: isNaN(sNum) ? undefined : sNum,
            endChapter: isNaN(eNum) ? undefined : eNum,
            processed: false,
          });
        });
      }
    } catch (e) {}

    // 策略 3：模糊行匹配 (最后的兜底)
    if (rules.length === 0) {
      const lines = aiText.split('\n');
      lines.forEach((line, idx) => {
        const fuzzy = line.match(
          /(?:第)?\s*([零一二两三四五六七八九十百千\d]+)\s*(?:章)?\s*[-－—至到~]\s*(?:第)?\s*([零一二两三四五六七八九十百千\d]+)\s*(?:章)?/,
        );
        if (fuzzy) {
          const name =
            line
              .replace(fuzzy[0], '')
              .replace(/[0-9.．:：、\s()（）分卷第章]/g, '')
              .trim() || `第${fuzzy[1]}章起`;
          const startNum = parseInt(this.normalizeChapterToken(fuzzy[1]));
          const endStr = fuzzy[2];
          const endNum = parseInt(this.normalizeChapterToken(endStr));
          
          // 保存完整的分卷信息
          volumes.push({
            id: `vol_${timestamp}_${volumes.length}`,
            volumeName: name,
            folderName: name,
            startChapter: startNum,
            endChapter: endNum,
            description: '自动提取',
            processed: false,
          });
          
          // 同样修复：使用结束章+1作为触发点
          const triggerChapterNum = isNaN(endNum) ? undefined : endNum + 1;
          const triggerChapterStr = triggerChapterNum ? triggerChapterNum.toString() : fuzzy[1];
          
          rules.push({
            id: `vol_rule_fuzzy_${timestamp}_${idx}`,
            chapterTitle: `第${triggerChapterStr}章`,
            nextVolumeName: name,
            description: '自动提取',
            startChapter: startNum,
            endChapter: endNum,
            processed: false,
          });
        }
      });
    }

    terminal.log(`[WorkflowManager] Final parsing result: ${rules.length} volume rules, ${volumes.length} volumes found`);
    return { splitRules: rules, volumes };
  }

  public pause(index: number) {
    terminal.log(`[WorkflowManager] Pausing workflow at index ${index}`);
    this.state = {
      ...this.state,
      isRunning: false,
      isPaused: true,
      currentNodeIndex: index,
    };
    
    // 保存状态
    this.debouncedSaveExecutionState();
    this.notify();
  }

  public stop() {
    terminal.log(`[WorkflowManager] Stopping/Completing workflow (RunID reset)`);
    this.currentRunId = null;
    this.state = {
      ...this.state,
      isRunning: false,
      isPaused: false,
      currentNodeIndex: -1,
      currentNodeId: null,
      totalVolumes: 0,
      lockedStartVolumeId: undefined,
      lockedStartVolumeIndex: undefined,
      globalContext: {
        variables: {
          loop_index: 1,
          batch_range: '',
        },
        executionStack: [],
        activeVolumeAnchor: undefined,
        pendingSplitChapter: undefined,
        pendingNextVolumeName: undefined,
        pendingSplits: [],
        volumePlans: [],
        volumeEndChapters: undefined,
      },
    };
    
    // 清除保存的状态
    try {
      // 直接使用 localStorage 删除，避免 async/await 问题
      localStorage.removeItem(WORKFLOW_EXECUTION_KEY);
      // 异步删除 IndexedDB 中的数据
      import('idb-keyval').then(({ del }) => {
        del(WORKFLOW_EXECUTION_KEY).catch(error => {
          terminal.error(`[WorkflowManager] Failed to clear execution state from IndexedDB: ${error}`);
        });
      });
      terminal.log(`[WorkflowManager] Execution state cleared`);
    } catch (error) {
      terminal.error(`[WorkflowManager] Failed to clear execution state: ${error}`);
    }
    
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

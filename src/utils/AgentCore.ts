import { AgentAction, AgentManifest, AgentModelConfig, AgentPromptConfig, AgentStatus, Novel } from '../types';
import { AgentDirector } from './AgentDirector';

export interface AgentCoreState {
  status: AgentStatus;
  manifest: AgentManifest | null;
  currentTaskIndex: number;
  retryCount: number;
  logs: string[];
}

/**
 * AgentCore 是自动化创作的核心调度器。
 * 负责管理任务状态机、调用导演 Agent 规划以及驱动自动化执行。
 * 遵循“导演规划 -> 程序执行”模式。
 */
export class AgentCore {
  private state: AgentCoreState = {
    status: 'IDLE',
    manifest: null,
    currentTaskIndex: -1,
    retryCount: 0,
    logs: [],
  };

  private stopFlag: boolean = false;

  private onStateChange?: (state: AgentCoreState) => void;
  private lastNovel?: Novel;
  private callLLM?: (system: string, user: string, model?: string) => Promise<string>;
  private modelConfig?: AgentModelConfig;
  private promptConfig?: AgentPromptConfig;
  private onAction?: (actions: AgentAction[]) => void;
  private onTaskTrigger?: (type: string, payload: any, onComplete: () => void) => void;

  constructor(onStateChange?: (state: AgentCoreState) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * 初始化运行时参数
   */
  public init(
    novel: Novel,
    callLLM: (system: string, user: string, model?: string) => Promise<string>,
    onAction: (actions: AgentAction[]) => void,
    onTaskTrigger: (type: string, payload: any) => void,
    modelConfig?: AgentModelConfig,
    promptConfig?: AgentPromptConfig,
  ) {
    this.lastNovel = novel;
    this.callLLM = callLLM;
    this.onAction = onAction;
    this.onTaskTrigger = onTaskTrigger;
    this.modelConfig = modelConfig;
    this.promptConfig = promptConfig;

    if (this.onStateChange) this.onStateChange(this.state);
  }

  private updateState(patch: Partial<AgentCoreState>) {
    this.state = { ...this.state, ...patch };
    this.logs(`状态变更: ${this.state.status}`);
    if (this.onStateChange) this.onStateChange(this.state);
  }

  private logs(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${msg}`;
    this.state.logs = [logEntry, ...this.state.logs].slice(0, 100);
    if (this.onStateChange) this.onStateChange(this.state);
  }

  /**
   * 启动导演规划阶段
   */
  public async startPlanning(
    novel: Novel,
    callLLM: (system: string, user: string, model?: string) => Promise<string>,
    userInstruction?: string,
    modelConfig?: AgentModelConfig,
    promptConfig?: AgentPromptConfig,
  ) {
    this.lastNovel = novel;
    this.callLLM = callLLM;
    this.modelConfig = modelConfig;
    this.promptConfig = promptConfig;
    this.stopFlag = false;

    this.updateState({ status: 'PLANNING' });
    this.logs('导演 Agent 开始规划创作清单...');

    try {
      const systemPrompt = this.promptConfig?.directorPrompt || AgentDirector.getSystemPrompt();
      const userPrompt = AgentDirector.buildUserPrompt(novel, userInstruction);

      const response = await callLLM(systemPrompt, userPrompt, this.modelConfig?.directorModel);
      if (this.stopFlag) return;
      const manifest = AgentDirector.parseManifest(response);

      if (manifest) {
        this.updateState({
          status: 'AWAITING_USER',
          manifest,
          currentTaskIndex: 0,
        });
        this.logs('规划完成，等待用户确认清单。');
      } else {
        throw new Error('解析清单 JSON 失败');
      }
    } catch (e: any) {
      this.updateState({ status: 'ERROR' });
      this.logs(`规划失败: ${e.message}`);
    }
  }

  /**
   * 用户确认清单后，开始正式执行
   */
  public async startExecution() {
    if (this.state.status !== 'AWAITING_USER' || !this.state.manifest) {
      return;
    }

    this.updateState({ status: 'EXECUTING' });
    this.logs('全自动执行流启动...');
    this.stopFlag = false;
    this.executeNextTask();
  }

  public async resume() {
    if (this.state.status !== 'PAUSED' && this.state.status !== 'ERROR') {
      return;
    }

    this.stopFlag = false;
    this.updateState({ status: 'EXECUTING', retryCount: 0 });
    this.logs('恢复执行...');
    this.executeNextTask();
  }

  public resetToIdle() {
    this.stopFlag = true;
    this.updateState({ status: 'IDLE', retryCount: 0 });
    this.logs('已重置状态。');
  }

  public fullReset() {
    this.stopFlag = true;
    this.state = {
      status: 'IDLE',
      manifest: null,
      currentTaskIndex: -1,
      retryCount: 0,
      logs: ['[系统] 流程已彻底重置。'],
    };
    if (this.onStateChange) this.onStateChange(this.state);
  }

  private async executeNextTask() {
    if (this.stopFlag) {
      this.logs('停止信号。');
      return;
    }
    if (!this.state.manifest || !this.onTaskTrigger) return;

    const index = this.state.currentTaskIndex;
    if (index >= this.state.manifest.tasks.length) {
      this.updateState({ status: 'COMPLETED' });
      this.logs('所有自动化任务已完成！');
      return;
    }

    const currentTask = this.state.manifest.tasks[index];
    this.logs(`正在执行任务: ${currentTask.title} (${currentTask.type})`);

    try {
      // 触发程序执行具体功能
      // 导演 Agent 不写内容，只规划任务。具体的“生成”由 UI/程序层面监听此触发器执行。
      if (this.onTaskTrigger) {
        this.onTaskTrigger(currentTask.type, currentTask, () => {
          if (this.stopFlag) return;
          this.updateState({ currentTaskIndex: index + 1 });
          this.executeNextTask();
        });
      } else {
        // 如果没有触发器，直接下一步
        this.updateState({ currentTaskIndex: index + 1 });
        setTimeout(() => {
          if (!this.stopFlag) this.executeNextTask();
        }, 1000);
      }
    } catch (e: any) {
      this.updateState({ status: 'ERROR' });
      this.logs(`执行失败: ${e.message}`);
    }
  }

  public stop() {
    this.stopFlag = true;
    this.updateState({ status: 'IDLE' });
    this.logs('已停止。');
  }

  public getState() {
    return this.state;
  }
}

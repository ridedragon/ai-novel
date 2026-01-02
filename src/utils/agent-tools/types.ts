import { AgentAction } from '../../types';

/**
 * Agent 工具的基础接口
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  // 执行工具逻辑，返回一个或多个动作供系统分发
  execute: (args: any) => AgentAction | AgentAction[] | Promise<AgentAction | AgentAction[]>;
}

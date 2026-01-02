import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 当前流程：获取当前需要进行的流程
 */
export const GetCurrentTaskTool: AgentTool = {
  name: 'get_current_task',
  description: '获取当前正在进行或下一步需要进行的创作任务节点信息',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: (): AgentAction => {
    return {
      type: 'GET_CURRENT_TASK',
      payload: {},
    };
  },
};

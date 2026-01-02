import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 导演agent流程：获取导演agent输出流程
 */
export const GetDirectorFlowTool: AgentTool = {
  name: 'get_director_flow',
  description: '获取导演 Agent 规划的完整创作清单/任务流程',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: (): AgentAction => {
    return {
      type: 'GET_MANIFEST',
      payload: {},
    };
  },
};

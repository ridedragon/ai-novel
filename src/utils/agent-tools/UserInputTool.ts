import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * userinput：获取user输入的信息
 */
export const UserInputTool: AgentTool = {
  name: 'userinput',
  description: '获取用户输入的信息，用于引导创作方向或补充细节',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '向用户询问的具体问题或需要的输入描述',
      },
    },
    required: ['query'],
  },
  execute: (args: { query: string }): AgentAction => {
    return {
      type: 'AWAIT_USER_INPUT',
      payload: {
        message: args.query,
      },
    };
  },
};

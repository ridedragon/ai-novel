import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 将agent输出输入到输入框并触发生成
 */
export const FillAndGenerateTool: AgentTool = {
  name: 'fill_and_generate',
  description: '将指定的文本内容填入当前界面的输入框中，并立即触发 AI 生成动作',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '需要填入输入框的内容（如 Agent 的推理结果或指令）',
      },
    },
    required: ['content'],
  },
  execute: (args: { content: string }): AgentAction => {
    return {
      type: 'FILL_AND_GENERATE',
      payload: {
        content: args.content,
      },
    };
  },
};

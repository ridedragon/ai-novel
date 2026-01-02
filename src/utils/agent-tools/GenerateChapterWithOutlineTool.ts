import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 生成正文根据：自动点击大纲做全局参考，然后再触发自动生成开始自动创作。
 */
export const GenerateChapterWithOutlineTool: AgentTool = {
  name: 'generate_chapter_with_outline',
  description: '将当前选中的大纲集作为全局参考，并开始自动创作小说正文内容',
  parameters: {
    type: 'object',
    properties: {
      includeFullOutline: {
        type: 'boolean',
        description: '是否将完整大纲（而非仅当前章大纲）作为上下文参考',
        default: true,
      },
    },
  },
  execute: (args: { includeFullOutline?: boolean }): AgentAction => {
    return {
      type: 'START_AUTO_WRITE',
      payload: {
        includeFullOutline: args.includeFullOutline ?? true,
      },
    };
  },
};

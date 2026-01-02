import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 选择参考：用于为当前的创作任务选择相关的背景资料。
 */
export const SelectReferenceTool: AgentTool = {
  name: 'select_reference',
  description:
    '为当前的创作任务选择相关的参考资料（如世界观设定、角色卡、灵感或大纲）。通过指定名称和索引，系统会自动将其内容注入到生成上下文中。',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['worldview', 'character', 'inspiration', 'outline'],
        description: '参考资料的类型',
      },
      setName: {
        type: 'string',
        description: '参考集的名称（文件夹名/设定集名）',
      },
      indices: {
        type: 'array',
        items: { type: 'number' },
        description: '可选：指定参考集内特定条目的索引列表（从0开始）。如果不提供，则参考整个集合。',
      },
    },
    required: ['type', 'setName'],
  },
  execute: (args: { type: string; setName: string; indices?: number[] }): AgentAction => {
    return {
      type: 'SELECT_REFERENCE',
      payload: {
        type: args.type,
        setName: args.setName,
        indices: args.indices || [],
      },
    };
  },
};

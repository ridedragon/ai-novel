import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 创建文件夹：在灵感界面创建文件夹，由agent命名。同时创建世界观、粗纲、角色集、大纲的同名文件夹
 */
export const CreateFoldersTool: AgentTool = {
  name: 'create_project_folders',
  description: '创建一个新的创作项目文件夹结构，同步在灵感、世界观、剧情粗纲、角色集和大纲模块中创建同名集合',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '项目文件夹的名称（例如："我的奇幻故事"）',
      },
    },
    required: ['name'],
  },
  execute: (args: { name: string }): AgentAction => {
    return {
      type: 'CREATE_PROJECT_FOLDERS',
      payload: {
        name: args.name,
      },
    };
  },
};

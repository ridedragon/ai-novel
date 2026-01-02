import { AgentAction } from '../../types';
import { AgentTool } from './types';

/**
 * 切换界面和文件夹：切换到其他界面的文件夹里面，例如当前在灵感的“我的故事”文件夹切换到世界观的“我的故事”文件夹。
 */
export const SwitchModuleTool: AgentTool = {
  name: 'switch_module_and_folder',
  description: '切换当前显示的功能界面，并自动定位到指定的项目文件夹/设定集',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['inspiration', 'worldview', 'plotOutline', 'characters', 'outline', 'reference'],
        description: '目标界面模块名称',
      },
      setName: {
        type: 'string',
        description: '目标项目文件夹/设定集的名称（如："我的奇幻故事"）',
      },
    },
    required: ['target'],
  },
  execute: (args: { target: string; setName?: string }): AgentAction => {
    return {
      type: 'NAVIGATE',
      payload: {
        target: args.target,
        setName: args.setName,
      },
    };
  },
};

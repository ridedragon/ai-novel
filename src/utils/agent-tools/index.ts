import { CreateFoldersTool } from './CreateFoldersTool';
import { FillAndGenerateTool } from './FillAndGenerateTool';
import { GenerateChapterWithOutlineTool } from './GenerateChapterWithOutlineTool';
import { GetCurrentTaskTool } from './GetCurrentTaskTool';
import { GetDirectorFlowTool } from './GetDirectorFlowTool';
import { SelectReferenceTool } from './SelectReferenceTool';
import { SwitchModuleTool } from './SwitchModuleTool';
import { AgentTool } from './types';
import { UserInputTool } from './UserInputTool';

/**
 * 导出所有 Agent 工具
 */
export const agentTools: Record<string, AgentTool> = {
  [UserInputTool.name]: UserInputTool,
  [GetDirectorFlowTool.name]: GetDirectorFlowTool,
  [GetCurrentTaskTool.name]: GetCurrentTaskTool,
  [CreateFoldersTool.name]: CreateFoldersTool,
  [SelectReferenceTool.name]: SelectReferenceTool,
  [SwitchModuleTool.name]: SwitchModuleTool,
  [FillAndGenerateTool.name]: FillAndGenerateTool,
  [GenerateChapterWithOutlineTool.name]: GenerateChapterWithOutlineTool,
};

export * from './CreateFoldersTool';
export * from './FillAndGenerateTool';
export * from './GenerateChapterWithOutlineTool';
export * from './GetCurrentTaskTool';
export * from './GetDirectorFlowTool';
export * from './SelectReferenceTool';
export * from './SwitchModuleTool';
export * from './types';
export * from './UserInputTool';

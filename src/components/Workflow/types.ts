import { Edge, Node } from '@xyflow/react';
import {
  GeneratorPreset,
  GeneratorPrompt,
  LoopConfig,
  LoopInstruction,
  Novel,
  PromptItem,
  RegexScript,
  VariableBinding,
} from '../../types';

export interface OutputEntry {
  id: string;
  title: string;
  content: string;
  versions?: any[];
  analysisResult?: string;
}

export interface VolumeFolderConfig {
  id: string;
  volumeName: string; // 分卷名称
  startChapter: number; // 起始章节号
  endChapter?: number; // 终止章节号（可选，用于自动切换）
  folderName: string; // 对应的目录名称
  processed?: boolean; // 是否已处理
}

export interface VolumeEndChapter {
  volumeId: string;
  volumeName: string;
  endChapterTitle: string; // 终止章节标题
  processed?: boolean;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  _deleted?: boolean; // Special marker for node deletion
  label: string;
  typeLabel: string;
  color: string;
  presetType: string | null;
  presetId: string;
  presetName: string;
  instruction: string;
  typeKey: string;
  folderName: string;
  selectedWorldviewSets: string[];
  selectedCharacterSets: string[];
  selectedOutlineSets: string[];
  selectedInspirationSets: string[];
  selectedReferenceFolders: string[];
  outputEntries: OutputEntry[];
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  targetVolumeId?: string;
  targetVolumeName?: string;
  splitChapterTitle?: string;
  nextVolumeName?: string;
  splitRules?: { id: string; chapterTitle?: string; nextVolumeName: string; startChapter?: number; endChapter?: number; description?: string }[];
  volumes?: { 
    id: string; 
    volumeName: string; 
    folderName?: string;
    startChapter?: number; 
    endChapter?: number; 
    description?: string;
    processed?: boolean;
  }[]; // 完整的分卷列表（包含所有分卷信息）

  // Workflow V2 Logic
  loopInstructions?: LoopInstruction[];
  isContainer?: boolean;
  parentId?: string;
  loopConfig?: LoopConfig;
  variableBinding?: VariableBinding[];
  targetVolumeMode?: 'static' | 'dynamic_anchor'; // static: use targetVolumeId, dynamic_anchor: use context.activeVolumeAnchor

  // AI 节点特定设置
  overrideAiConfig?: boolean;
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  systemPrompt?: string; // 保持兼容
  promptItems?: GeneratorPrompt[]; // 新的多条目系统
  presencePenalty?: number;
  frequencyPenalty?: number;
  skipped?: boolean;
  apiKey?: string;
  baseUrl?: string;
  // 工作流生成节点特定设置
  autoFillContent?: boolean; // AI 是否自动填写生成的节点内容
  volumeContent?: string; // AI 生成的分卷规划原始内容
  triggeredSkills?: string[]; // 本次执行触发的 Skills

  // 多初始化目录节点特定设置
  volumeFolderConfigs?: VolumeFolderConfig[]; // 多分卷目录配置
  currentVolumeIndex?: number; // 当前正在处理的分卷索引
  volumeEndChapters?: VolumeEndChapter[]; // 分卷终止章配置

  // 循环配置器节点特定设置
  globalLoopConfig?: LoopConfig; // 全局循环配置
  globalLoopInstructions?: LoopInstruction[]; // 全局循环指令
  useAiGeneration?: boolean; // 是否使用AI生成循环配置
  generatedLoopConfig?: string; // AI生成的循环配置原始内容
}

export type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowData {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  currentNodeIndex?: number;
  lastModified: number;
  contextSnapshot?: any; // 存储 WorkflowContextSnapshot
}

export interface ExecutionNode {
  type: 'node' | 'container';
  node: WorkflowNode;
  index: number; // Index in the flattened topological sort (for progress tracking)
  children?: ExecutionNode[]; // For containers
}

export type NodeTypeKey =
  | 'createFolder'
  | 'multiCreateFolder'
  | 'reuseDirectory'
  | 'saveToVolume'
  | 'userInput'
  | 'creationInfo'
  | 'aiChat'
  | 'inspiration'
  | 'worldview'
  | 'characters'
  | 'plotOutline'
  | 'outline'
  | 'chapter'
  | 'workflowGenerator'
  | 'loopNode'
  | 'loopConfigurator'
  | 'pauseNode';

export interface WorkflowEditorProps {
  isOpen: boolean;
  onClose: () => void;
  activeNovel: Novel | undefined;
  onSelectChapter?: (chapterId: number) => void;
  onUpdateNovel?: (novel: Novel) => void;
  onStartAutoWrite?: (outlineSetId?: string | null) => void;
  globalConfig?: {
    apiKey: string;
    baseUrl: string;
    model: string;
    outlineModel: string;
    characterModel: string;
    worldviewModel: string;
    inspirationModel: string;
    plotOutlineModel: string;
    optimizeModel: string;
    analysisModel: string;
    contextLength: number;
    maxReplyLength: number;
    temperature: number;
    topP: number;
    topK: number;
    stream: boolean;
    maxRetries: number;
    globalCreationPrompt: string;
    longTextMode: boolean;
    autoOptimize: boolean;
    twoStepOptimization: boolean;
    consecutiveChapterCount: number;
    smallSummaryInterval: number;
    bigSummaryInterval: number;
    smallSummaryPrompt: string;
    bigSummaryPrompt: string;
    prompts: PromptItem[];
    getActiveScripts: () => RegexScript[];
    onChapterComplete: (chapterId: number, content: string) => Promise<any>;
    updateAutoOptimize?: (val: boolean) => void;
    updateTwoStepOptimization?: (val: boolean) => void;
    updateAsyncOptimize?: (val: boolean) => void;
    asyncOptimize?: boolean;
    contextChapterCount?: number;
    maxConcurrentOptimizations?: number;
    optimizePresets?: GeneratorPreset[];
    activeOptimizePresetId?: string;
    analysisPresets?: GeneratorPreset[];
    activeAnalysisPresetId?: string;
  };
}

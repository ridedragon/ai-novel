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

export interface WorkflowNodeData extends Record<string, unknown> {
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
  splitChapterTitle?: string; // 到达特定章节后分卷 (Legacy)
  nextVolumeName?: string; // 分卷后的命名 (Legacy)
  splitRules?: { id: string; chapterTitle: string; nextVolumeName: string }[]; // 多次分卷规则

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
  | 'reuseDirectory'
  | 'saveToVolume'
  | 'userInput'
  | 'aiChat'
  | 'inspiration'
  | 'worldview'
  | 'characters'
  | 'plotOutline'
  | 'outline'
  | 'chapter'
  | 'workflowGenerator'
  | 'loopNode'
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

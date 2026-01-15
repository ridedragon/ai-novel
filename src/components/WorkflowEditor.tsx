import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Connection,
  Controls,
  Edge,
  EdgeProps,
  getBezierPath,
  Handle,
  Node,
  NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  Cpu,
  Download,
  Edit2,
  File,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  LayoutList,
  Library,
  Lightbulb,
  MessageSquare,
  PauseCircle,
  Play,
  Plus,
  Repeat,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  User,
  Users,
  Wand2,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, GeneratorPrompt, LoopConfig, LoopInstruction, Novel, PromptItem, RegexScript, VariableBinding } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';
import { keepAliveManager } from '../utils/KeepAliveManager';
import { storage } from '../utils/storage';
import { workflowManager } from '../utils/WorkflowManager';

// --- 数字解析工具 (与 App.tsx 同步) ---
const parseAnyNumber = (text: string): number | null => {
  if (!text) return null;
  const arabicMatch = text.match(/\d+/);
  if (arabicMatch) return parseInt(arabicMatch[0]);
  const chineseNums: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000
  };
  const chineseMatch = text.match(/[零一二两三四五六七八九十百千]+/);
  if (chineseMatch) {
    const s = chineseMatch[0];
    if (s.length === 1) return chineseNums[s] ?? null;
    let result = 0; let temp = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s[i]; const num = chineseNums[char];
      if (num === 10) { if (temp === 0) temp = 1; result += temp * 10; temp = 0; }
      else if (num === 100) { result += temp * 100; temp = 0; }
      else { temp = num; }
    }
    result += temp; return result > 0 ? result : null;
  }
  return null;
};

const extractTargetEndChapter = (prompt: string): number | null => {
  if (!prompt) return null;
  const rangeMatch = prompt.match(/(?:到|至|-|—|直到)\s*([零一二两三四五六七八九十百千\d]+)(?:\s*章)?/);
  if (rangeMatch) return parseAnyNumber(rangeMatch[1]);
  return null;
};

// --- 类型定义 ---

interface ReferenceItem {
  type: 'worldview' | 'character' | 'outline' | 'inspiration';
  setId: string;
  index: number;
}

// 结构化的生成内容条目
interface OutputEntry {
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
  outputEntries: OutputEntry[]; // 改为结构化条目
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  targetVolumeId?: string;
  targetVolumeName?: string;
  splitChapterTitle?: string; // 到达特定章节后分卷 (Legacy)
  nextVolumeName?: string;    // 分卷后的命名 (Legacy)
  splitRules?: { id: string; chapterTitle: string; nextVolumeName: string; }[]; // 多次分卷规则
  
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

// --- Workflow V2 Execution Types ---

interface ExecutionNode {
  type: 'node' | 'container';
  node: WorkflowNode;
  index: number; // Index in the flattened topological sort (for progress tracking)
  children?: ExecutionNode[]; // For containers
}

const buildExecutionPlan = (nodes: WorkflowNode[], sortedNodes: WorkflowNode[]): ExecutionNode[] => {
  // 1. Map all nodes for quick lookup
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // 2. Group by parentId
  const childrenMap = new Map<string, WorkflowNode[]>();
  const topLevelNodes: WorkflowNode[] = [];

  // Use sortedNodes to determine order
  sortedNodes.forEach(node => {
    if (node.data.parentId && nodeMap.has(node.data.parentId)) {
      const parentId = node.data.parentId;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(node);
    } else {
      topLevelNodes.push(node);
    }
  });

  // 3. Recursive build
  const buildTree = (currentLevelNodes: WorkflowNode[]): ExecutionNode[] => {
    return currentLevelNodes.map(node => {
      const flatIndex = sortedNodes.findIndex(n => n.id === node.id);
      
      if (node.data.isContainer) {
        const children = childrenMap.get(node.id) || [];
        return {
          type: 'container',
          node,
          index: flatIndex,
          children: buildTree(children)
        };
      }
      
      return {
        type: 'node',
        node,
        index: flatIndex
      };
    });
  };

  return buildTree(topLevelNodes);
};

// --- 自定义节点组件 ---

const CustomNode = ({ data, selected }: NodeProps<WorkflowNode>) => {
  const Icon = NODE_CONFIGS[data.typeKey as NodeTypeKey]?.icon;
  const color = data.color;

  const refCount = (data.selectedWorldviewSets?.length || 0) +
                   (data.selectedCharacterSets?.length || 0) +
                   (data.selectedOutlineSets?.length || 0) +
                   (data.selectedInspirationSets?.length || 0) +
                   (data.selectedReferenceFolders?.length || 0);

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return data.skipped ? 'border-gray-500 opacity-60' : 'border-green-600/50 shadow-none';
      case 'failed': return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      default: return selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700';
    }
  };

  return (
    <div className={`relative px-4 py-3 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '280px' }}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-4 h-4 bg-gray-600 border-2 border-gray-800 z-50 absolute top-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
        style={{ left: '-10px' }}
        isConnectable={true}
      />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              {data.typeLabel}
              {data.skipped && <span className="text-[8px] bg-gray-700 px-1 rounded text-gray-400">已跳过</span>}
            </span>
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
          </div>
          <div className="text-sm font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1.5">
        {data.folderName && (
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
            <FolderPlus className="w-3 h-3" />
            <span className="truncate">目录: {data.folderName}</span>
          </div>
        )}
        {refCount > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <Library className="w-3 h-3" />
            <span>引用了 {refCount} 个资料集</span>
          </div>
        )}
      </div>


      {/*
        CRITICAL FIX for Cyclic Connections:
        For loop workflows (as requested by user), nodes need to be able to accept input
        AND send output simultaneously to form a cycle.
        However, React Flow's default Handles can be restrictive.
        We explicitly enable handles on both sides with connectable={true}.
        
        Also, for the Loop Node specifically, it often needs to connect BACK to a previous node.
        We ensure the target handle (left) is also robust.
      */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-4 h-4 bg-gray-600 border-2 border-gray-800 z-50 absolute top-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
        style={{ right: '-10px' }}
        isConnectable={true}
        id="source"
      />
    </div>
  );
};

const CoolEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  animated,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  // 颜色配置 - 支持独立自定义或跟随系统主题色
  // 优先级：用户定义的 CSS 变量 > 系统主题色 > 默认紫色
  // 用户可以在不修改源码的情况下，通过在外部 CSS 中定义 --workflow-edge-color 来单独更改连接线颜色
  const COLORS = {
    primary: 'var(--workflow-edge-color, var(--theme-color, #6366f1))',
    secondary: 'var(--workflow-edge-color-dark, var(--theme-color-hover, #4f46e5))',
    highlight: 'var(--workflow-edge-color-light, var(--theme-color-light, #818cf8))',
    core: selected ? '#fff' : 'var(--workflow-edge-color-light, var(--theme-color-light, #818cf8))',
    glow: selected ? 'var(--workflow-edge-color, var(--theme-color, #6366f1))' : 'var(--workflow-edge-color-dark, var(--theme-color-hover, #4f46e5))',
  };

  return (
    <>
      {/* 核心修复 4.1：合并渲染层级，移除内联 <style> 以解决主进程内存爆炸 */}
      {/* 仅保留一层外发光 (使用 strokeOpacity 模拟，不再使用多层 Path 叠加) */}
      <path
        id={`${id}-glow-combined`}
        d={edgePath}
        fill="none"
        stroke={selected ? COLORS.highlight : COLORS.primary}
        strokeWidth={selected ? 6 : 3}
        strokeOpacity={selected ? 0.3 : 0.15}
      />
      {/* 核心线条 */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: COLORS.core,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {/* 科技感流动效果：使用全局 CSS 动画 .animate-workflow-dash 替代 inline style 和 animateMotion */}
      {(selected || animated) && (
        <path
          d={edgePath}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          strokeDasharray="4, 16"
          strokeLinecap="round"
          className="animate-workflow-dash"
          style={{
            opacity: selected ? 0.6 : 0.2,
          }}
        />
      )}
    </>
  );
};


// --- 配置定义 ---

type NodeTypeKey = 'createFolder' | 'reuseDirectory' | 'saveToVolume' | 'userInput' | 'aiChat' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline' | 'chapter' | 'workflowGenerator' | 'loopNode' | 'pauseNode';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
  pauseNode: {
    typeLabel: '暂停节点',
    icon: PauseCircle,
    color: '#64748b', // Slate 500
    defaultLabel: '暂停等待',
    presetType: null,
  },
  loopNode: {
    typeLabel: '循环执行器',
    icon: Repeat,
    color: '#0ea5e9', // Sky blue
    defaultLabel: '循环控制',
    presetType: null,
  },
  saveToVolume: {
    typeLabel: '分卷规划',
    icon: Library,
    color: '#14b8a6', // Teal 500
    defaultLabel: '分卷规划器',
    presetType: 'completion',
    splitRules: [], // 初始化空规则列表
  },
  workflowGenerator: {
    typeLabel: '智能生成工作流',
    icon: Wand2,
    color: '#f87171',
    defaultLabel: '工作流架构师',
    presetType: 'generator',
  },
  createFolder: {
    typeLabel: '创建项目目录',
    icon: FolderPlus,
    color: '#818cf8',
    defaultLabel: '初始化目录',
    presetType: null,
  },
  reuseDirectory: {
    typeLabel: '复用已有目录',
    icon: Folder,
    color: '#fbbf24',
    defaultLabel: '切换目录节点',
    presetType: null,
  },
  userInput: {
    typeLabel: '用户输入',
    icon: User,
    color: '#3b82f6',
    defaultLabel: '全局输入',
    presetType: null,
  },
  aiChat: {
    typeLabel: 'AI 聊天',
    icon: MessageSquare,
    color: '#a855f7',
    defaultLabel: '自由对话',
    presetType: 'chat',
  },
  inspiration: {
    typeLabel: '灵感集',
    icon: Lightbulb,
    color: '#eab308',
    defaultLabel: '生成灵感',
    presetType: 'inspiration',
  },
  worldview: {
    typeLabel: '世界观',
    icon: Globe,
    color: '#10b981',
    defaultLabel: '构建设定',
    presetType: 'worldview',
  },
  characters: {
    typeLabel: '角色集',
    icon: Users,
    color: '#f97316',
    defaultLabel: '塑造人物',
    presetType: 'character',
  },
  plotOutline: {
    typeLabel: '粗纲',
    icon: LayoutList,
    color: '#ec4899',
    defaultLabel: '规划结构',
    presetType: 'plotOutline',
  },
  outline: {
    typeLabel: '大纲',
    icon: BookOpen,
    color: '#6366f1',
    defaultLabel: '细化章节',
    presetType: 'outline',
  },
  chapter: {
    typeLabel: '正文生成',
    icon: FileText,
    color: '#8b5cf6',
    defaultLabel: '生成章节正文',
    presetType: 'completion',
  },
};

const WORKFLOW_DSL_PROMPT = `你是一个顶级的 AI 小说工作流架构师。
你的职责是将用户的创作需求拆解为一套标准化的自动化流程。你必须以 JSON 格式输出。

### 1. 节点类型百科 (typeKey 指南)
你必须根据创作逻辑合理安排以下节点的先后顺序：

- **createFolder**: 【必需起点】初始化项目。参数: folderName (小说书名)。
- **worldview**: 构建世界观。参数: instruction (地理、力量体系设定要求)。
- **characters**: 塑造角色。参数: instruction (主角及配角的人设要求)。
- **inspiration**: 灵感生成。参数: instruction (核心冲突、金手指、反转点要求)。
- **plotOutline**: 剧情粗纲。参数: instruction (全书起承转合的高级逻辑规划)。
- **outline**: 章节大纲。参数: instruction (详细到每一章的剧情细化要求)。
- **chapter**: 【正文生成】根据 outline 自动写书。通常接在 outline 节点之后。
- **userInput**: 用户干预。参数: instruction (明确告诉用户此处需要输入什么信息)。
- **aiChat**: AI 顾问。参数: instruction (如"请以毒舌编辑身份对上述设定进行逻辑审核")。
- **reuseDirectory**: 关联目录。参数: folderName (要复用的目录名)。

### 2. 顶级指令编写规范 (Instruction)
当用户开启"自动填写"时，你为 nodes 生成的 instruction 必须达到出版级水准：
- **篇幅要求**: 每个节点的指令必须在 300-600 字之间。
- **结构规范**: 包含【身份背景】、【任务目标】、【创作禁忌】、【风格参考】和【输出格式】。
- **示例**: "你是一个拥有20年经验的网文主编。现在请为本作设计一个'低魔高武'的世界观。严禁出现西式幻想元素，必须扎根于中式神话，引入独特的'气血交换'体系..."

### 3. JSON 协议格式
你必须返回纯净的 JSON，严禁 Markdown 代码块标记：
{
  "nodes": [
    { "id": "node_0", "typeKey": "createFolder", "label": "书名初始化", "folderName": "用户需求书名" },
    { "id": "node_1", "typeKey": "outline", "label": "长篇大纲规划", "instruction": "极其详细的300字以上提示词..." }
  ],
  "edges": [
    { "id": "edge_0_1", "source": "node_0", "target": "node_1" }
  ]
}
`;

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

const NodePropertiesModal = ({
  node,
  onClose,
  updateNodeData,
  toggleSetReference,
  activeNovel,
  allPresets,
  pendingFolders,
  globalConfig,
  addEntry,
  removeEntry,
  updateEntryTitle,
  updateEntryContent,
  setPreviewEntry
}: {
  node: WorkflowNode;
  onClose: () => void;
  updateNodeData: (nodeId: string, updates: Partial<WorkflowNodeData>) => void;
  toggleSetReference: (type: any, setId: string) => void;
  activeNovel: Novel | undefined;
  allPresets: Record<string, GeneratorPreset[]>;
  pendingFolders: string[];
  globalConfig: any;
  addEntry: () => void;
  removeEntry: (entryId: string) => void;
  updateEntryTitle: (entryId: string, title: string) => void;
  updateEntryContent: (entryId: string, content: string) => void;
  setPreviewEntry: (entry: OutputEntry) => void;
}) => {
  const [localLabel, setLocalLabel] = useState(node.data.label);
  const [localFolderName, setLocalFolderName] = useState(node.data.folderName);
  const [localInstruction, setLocalInstruction] = useState(node.data.instruction);
  const [localVolumeContent, setLocalVolumeContent] = useState(node.data.volumeContent || '');
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);
  const [isEditingPrompts, setIsEditingPrompts] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalLabel(node.data.label);
    setLocalFolderName(node.data.folderName);
    setLocalInstruction(node.data.instruction);
    setLocalVolumeContent(node.data.volumeContent || '');
  }, [node.id, node.data.volumeContent]);

  // 整合所有分类 API 模型并去重 (PC端同步)
  const consolidatedModelList = useMemo(() => {
    const list = [...(globalConfig?.modelList || [])];
    if (globalConfig?.model) list.push(globalConfig.model);
    if (globalConfig?.outlineModel) list.push(globalConfig.outlineModel);
    if (globalConfig?.characterModel) list.push(globalConfig.characterModel);
    if (globalConfig?.worldviewModel) list.push(globalConfig.worldviewModel);
    if (globalConfig?.inspirationModel) list.push(globalConfig.inspirationModel);
    if (globalConfig?.plotOutlineModel) list.push(globalConfig.plotOutlineModel);
    if (globalConfig?.optimizeModel) list.push(globalConfig.optimizeModel);
    if (globalConfig?.analysisModel) list.push(globalConfig.analysisModel);
    
    // 核心增强：整合所有预设方案中定义的模型
    // 注意：Object.values(allPresets).flat() 仅覆盖了当前组件状态中的 allPresets
    // 我们还需要显式读取 localStorage 中的其他分类预设以确保完整
    const presetTypes = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat', 'generator'];
    presetTypes.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        if (saved) {
          const presets = JSON.parse(saved) as GeneratorPreset[];
          presets.forEach(p => {
            if (p.apiConfig?.model) list.push(p.apiConfig.model);
          });
        }
      } catch (e) {}
    });

    Object.values(allPresets).flat().forEach(p => {
      if (p.apiConfig?.model) list.push(p.apiConfig.model);
    });
    
    return Array.from(new Set(list.filter(Boolean)));
  }, [globalConfig, allPresets]);

  const debouncedUpdate = (updates: Partial<WorkflowNodeData>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      updateNodeData(node.id, updates);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[650px] bg-[#1e2230] rounded-xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29]">
          <div className="flex items-center gap-4 text-primary">
            <div className="flex items-center gap-2.5">
              {(() => {
                const Icon = NODE_CONFIGS[node.data.typeKey as NodeTypeKey]?.icon;
                return Icon && <Icon className="w-5 h-5" />;
              })()}
              <span className="font-bold text-gray-100 text-lg">配置: {localLabel}</span>
            </div>
            <button
              onClick={() => updateNodeData(node.id, { skipped: !node.data.skipped })}
              className={`text-[10px] px-2 py-1 rounded transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${node.data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-primary/20 text-primary border border-primary/30'}`}
            >
              {node.data.skipped ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
              {node.data.skipped ? '已跳过' : '执行此节点'}
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700/50 rounded-md text-gray-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 custom-scrollbar max-h-[80vh] overflow-y-auto bg-[#1e2230]">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">模块显示名称</label>
              <input
                type="text"
                value={localLabel}
                onChange={(e) => {
                  setLocalLabel(e.target.value);
                  debouncedUpdate({ label: e.target.value });
                }}
                className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
            </div>
            <div className={`space-y-2.5 ${(node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') ? 'col-span-2' : ''}`}>
              <label className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                {node.data.typeKey === 'createFolder' ? <FolderPlus className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
                {node.data.typeKey === 'createFolder' ? '创建并关联目录名' : node.data.typeKey === 'reuseDirectory' ? '选择或输入要复用的目录名' : '独立目录关联 (可选)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localFolderName}
                  onChange={(e) => {
                    setLocalFolderName(e.target.value);
                    debouncedUpdate({ folderName: e.target.value });
                  }}
                  className="flex-1 bg-[#161922] border border-primary/30 rounded-lg px-4 py-2.5 text-sm text-primary-light focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                  placeholder={node.data.typeKey === 'createFolder' ? "输入要创建的项目文件夹名称..." : "输入或选择目录名..."}
                />
                {node.data.typeKey === 'reuseDirectory' && activeNovel && (
                  <select
                    className="bg-[#161922] border border-gray-700 rounded-lg px-2 text-xs text-gray-300 outline-none"
                    onChange={(e) => {
                      setLocalFolderName(e.target.value);
                      updateNodeData(node.id, { folderName: e.target.value });
                    }}
                    value=""
                  >
                    <option value="" disabled>快速选择...</option>
                    {Array.from(new Set([
                      ...(activeNovel.volumes?.map(v => v.title) || []),
                      ...(activeNovel.worldviewSets?.map(s => s.name) || []),
                      ...(activeNovel.characterSets?.map(s => s.name) || []),
                      ...(activeNovel.outlineSets?.map(s => s.name) || [])
                    ])).filter(Boolean).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {node.data.presetType && node.data.typeKey !== 'workflowGenerator' && node.data.typeKey !== 'saveToVolume' && node.data.typeKey !== 'aiChat' && (
            <div className="space-y-3 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" /> 基础模板 (调用系统预设)
              </label>
              <div className="relative">
                <select
                  value={node.data.presetId as string}
                  onChange={(e) => {
                    const presets = Object.values(allPresets).flat();
                    const preset = presets.find(p => p.id === e.target.value);
                    updateNodeData(node.id, {
                      presetId: e.target.value,
                      presetName: preset?.name || ''
                    });
                  }}
                  className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                >
                  <option value="">-- 不使用预设模板 (使用主设置) --</option>
                  {(allPresets[node.data.presetType as string] || []).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认'})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                * 选择预设将加载该预设定义的提示词和模型。
              </p>
            </div>
          )}

          {(node.data.typeKey === 'aiChat' || node.data.typeKey === 'workflowGenerator' || node.data.typeKey === 'saveToVolume') && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              {node.data.typeKey === 'workflowGenerator' && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                      <Wand2 className="w-4 h-4" /> 架构师模式说明
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const configToSave = {
                            instruction: localInstruction,
                            autoFillContent: node.data.autoFillContent,
                            overrideAiConfig: node.data.overrideAiConfig,
                            promptItems: node.data.promptItems,
                            model: node.data.model,
                            temperature: node.data.temperature,
                            topP: node.data.topP,
                            topK: node.data.topK,
                            maxTokens: node.data.maxTokens,
                            apiKey: node.data.apiKey,
                            baseUrl: node.data.baseUrl,
                          };
                          localStorage.setItem('workflow_generator_default_config', JSON.stringify(configToSave));
                          alert('配置已保存。下次创建架构师节点将自动应用。');
                        }}
                        className="text-[10px] px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors font-bold flex items-center gap-1"
                        title="保存当前所有配置（包括 Prompt）为默认值"
                      >
                        <Save className="w-3 h-3" /> 保存配置
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('确定要恢复出厂设置吗？这将删除已保存的默认架构师配置。')) {
                            localStorage.removeItem('workflow_generator_default_config');
                            alert('已恢复出厂设置。重新创建节点将看到初始默认内容。');
                          }
                        }}
                        className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors font-bold"
                      >
                        重置默认
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    此节点运行后将<b>根据需求重新生成整个画布</b>。
                    完成后此节点会消失，替换为完整的工作流。
                  </p>
                  <div className="mt-3 pt-3 border-t border-indigo-500/10">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${node.data.autoFillContent ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${node.data.autoFillContent ? 'left-4.5' : 'left-0.5'}`} />
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={node.data.autoFillContent}
                        onChange={(e) => updateNodeData(node.id, { autoFillContent: e.target.checked })}
                      />
                      <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">AI 自动填写节点内容 (指令/配置)</span>
                    </label>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" /> 强制自定义 (覆盖所有设置)
                </label>
                <button
                  onClick={() => {
                    const newVal = !node.data.overrideAiConfig;
                    const updates: any = { overrideAiConfig: newVal };
                    // 开启自定义时，如果提示词列表为空，自动初始化包含上下文占位符的默认模版
                    // 这样可以确保“全局输入”和“参考资料”能直接传递给 AI
                    if (newVal && (!node.data.promptItems || (node.data.promptItems as any[]).length === 0)) {
                      if (node.data.typeKey === 'saveToVolume') {
                        updates.promptItems = [
                          { id: 'sys-1', role: 'system', content: '你是一名拥有丰富经验的网文作家和架构师，擅长规划长篇小说的整体节奏与结构。你的任务是根据用户提供的故事核心创意、世界观和主要角色，为其设计一份专业、可行、富有吸引力的小说分卷大纲。此大纲将作为写作的路线图。\n\n规划要求\n\n1. 宏观结构：你需要规划整部小说的分卷（卷） 结构。分卷数量需符合故事体量。\n2. 具体内容：为每一个分卷定义：\n   · 分卷名称：一个能概括本卷核心主题或高潮的、具有吸引力的标题（例如：崛起之卷、风暴之卷、终局之战等）。\n   · 章节范围：明确标注该分卷涵盖的章节，格式为“第XX章 - 第XX章”。\n   · 基本内容概述：用一段话（100-200字）概括该分卷的核心剧情走向、关键冲突、角色重大转变及阶段性的结局（如小高潮、重大转折或悬念）。概述需保持在大纲层面，避免细化到具体场景对话。\n3. 逻辑性：各分卷之间需有清晰的逻辑递进和节奏变化（如：开端铺垫、矛盾发展、冲突升级、高潮决战、结局收尾）。', enabled: true },
                          { id: 'user-1', role: 'user', content: '我已理解你的角色和任务。接下来，我已经为你提供这部小说的【故事核心要素】。请你严格根据这些要素，并遵循上述所有要求与格式，生成一份完整的、可用于指导写作的小说分卷。\n\n{{context}}', enabled: true }
                        ];
                      } else {
                        updates.promptItems = [
                          { id: 'sys-1', role: 'system', content: '你是一个专业的创作助手。', enabled: true },
                          { id: 'user-1', role: 'user', content: '{{context}}', enabled: true }
                        ];
                      }
                    }
                    updateNodeData(node.id, updates);
                    if (newVal) setShowAdvancedAI(true);
                  }}
                  className={`text-[10px] px-2 py-1 rounded transition-all font-bold uppercase tracking-wider ${node.data.overrideAiConfig ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                >
                  {node.data.overrideAiConfig ? '已开启重写' : '开启自定义'}
                </button>
              </div>

              {node.data.typeKey === 'workflowGenerator' && (
                <div className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg">
                  <div className="text-[10px] text-gray-500 font-bold uppercase mb-2 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> AI 返回协议示例 (Expected JSON)
                  </div>
                  <pre className="text-[9px] text-emerald-400 font-mono overflow-x-auto leading-relaxed">
{`{
  "nodes": [
    { "id": "n1", "typeKey": "outline", "label": "大纲", "instruction": "要求..." },
    { "id": "n2", "typeKey": "chapter", "label": "正文" }
  ],
  "edges": [ { "id": "e1", "source": "n1", "target": "n2" } ]
}`}
                  </pre>
                </div>
              )}

              {node.data.overrideAiConfig && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* API 快速选择器 */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-indigo-400 font-bold uppercase flex items-center gap-1.5">
                      <Settings2 className="w-3 h-3" /> 快速同步 API 设置
                    </label>
                    <select
                      className="w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none focus:border-indigo-500 transition-all"
                      value=""
                      onChange={(e) => {
                        const [key, url] = e.target.value.split('|');
                        if (key && url) {
                          updateNodeData(node.id, { apiKey: key, baseUrl: url });
                        }
                      }}
                    >
                      <option value="" disabled>从现有配置中选择以自动填充...</option>
                      {(() => {
                        const apis = [];
                        if (globalConfig?.apiKey) apis.push({ name: '主设置 API', key: globalConfig.apiKey, url: globalConfig.baseUrl });
                        Object.values(allPresets).flat().forEach(p => {
                          if (p.apiConfig?.apiKey && p.apiConfig?.baseUrl) {
                            apis.push({ name: `预设: ${p.name}`, key: p.apiConfig.apiKey, url: p.apiConfig.baseUrl });
                          }
                        });
                        // 按 URL 去重
                        return apis.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i).map((api, idx) => (
                          <option key={idx} value={`${api.key}|${api.url}`}>{api.name} ({api.url})</option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] text-indigo-400 font-bold uppercase">API Key</label>
                      <input
                        type="password"
                        value={node.data.apiKey as string || ''}
                        onChange={(e) => updateNodeData(node.id, { apiKey: e.target.value })}
                        placeholder="不填则使用全局设置..."
                        className="w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] text-indigo-400 font-bold uppercase">API Base URL</label>
                      <input
                        type="text"
                        value={node.data.baseUrl as string || ''}
                        onChange={(e) => updateNodeData(node.id, { baseUrl: e.target.value })}
                        placeholder="例如: https://api.openai.com/v1"
                        className="w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] text-indigo-400 font-bold uppercase">执行模型 (Model ID)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={node.data.model as string || ''}
                          onChange={(e) => updateNodeData(node.id, { model: e.target.value })}
                          placeholder="手动输入模型名称 (如 gpt-4o)..."
                          className="flex-1 bg-[#161922] border border-indigo-900/30 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500 transition-all font-mono"
                        />
                        <select
                          className="w-32 bg-[#161922] border border-gray-700 rounded-lg px-2 text-[10px] text-gray-400 outline-none cursor-pointer"
                          onChange={(e) => updateNodeData(node.id, { model: e.target.value })}
                          value=""
                        >
                          <option value="" disabled>从预设列表选择...</option>
                          {consolidatedModelList.map((m: any) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-400 uppercase">多样性 (Temperature): {node.data.temperature ?? 0.7}</label>
                      <input
                        type="range" min="0" max="2" step="0.1"
                        value={node.data.temperature ?? 0.7}
                        onChange={(e) => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-400 uppercase">核采样 (Top P): {node.data.topP ?? 1}</label>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={node.data.topP ?? 1}
                        onChange={(e) => updateNodeData(node.id, { topP: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-400 uppercase">最大长度 (Max Tokens)</label>
                      <input
                        type="number"
                        value={node.data.maxTokens as number || ''}
                        onChange={(e) => updateNodeData(node.id, { maxTokens: parseInt(e.target.value) || undefined })}
                        placeholder="不填则不限制"
                        className="w-full bg-[#161922] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-400 uppercase">Top K</label>
                      <input
                        type="number"
                        value={node.data.topK as number || ''}
                        onChange={(e) => updateNodeData(node.id, { topK: parseInt(e.target.value) || undefined })}
                        placeholder="默认"
                        className="w-full bg-[#161922] border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-gray-400 uppercase">对话提示词 (Prompts)</label>
                      <button
                        onClick={() => setIsEditingPrompts(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold"
                      >
                        <Edit2 className="w-3 h-3" /> 编辑条目 ({(node.data.promptItems as any[])?.length || (node.data.systemPrompt ? 1 : 0)})
                      </button>
                    </div>
                    <div
                      onClick={() => setIsEditingPrompts(true)}
                      className="w-full h-20 bg-[#161922] border border-gray-700 rounded-lg p-3 text-xs text-gray-400 hover:border-gray-600 cursor-pointer overflow-hidden font-mono"
                    >
                      {node.data.promptItems && (node.data.promptItems as any[]).length > 0 ? (
                        (node.data.promptItems as any[]).map((p, i) => (
                          <div key={i} className="truncate mb-1 last:mb-0">
                            <span className="text-indigo-500 font-bold">[{p.role}]</span> {p.content}
                          </div>
                        ))
                      ) : node.data.systemPrompt ? (
                        <div className="truncate"><span className="text-indigo-500 font-bold">[system]</span> {node.data.systemPrompt as string}</div>
                      ) : (
                        <span className="italic opacity-50">未设置提示词，点击编辑...</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {node.data.typeKey === 'saveToVolume' && activeNovel && (
            <div className="space-y-6 pt-6 border-t border-gray-700/30">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-teal-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> 分卷规划内容 (AI 生成/可手动修改)
                </label>
                <textarea
                  value={localVolumeContent}
                  onChange={(e) => {
                    setLocalVolumeContent(e.target.value);
                    debouncedUpdate({ volumeContent: e.target.value });
                  }}
                  placeholder="AI 生成的分卷规划内容将出现在这里，您也可以手动编辑以调整分卷..."
                  className="w-full h-48 bg-[#161922] border border-teal-500/30 rounded-lg p-4 text-sm text-gray-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 outline-none resize-none font-mono leading-relaxed transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* 多次分卷触发器 UI */}
                <div className="space-y-4 col-span-2 p-5 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-teal-400 font-bold text-[10px] uppercase tracking-wider">
                      <Repeat className="w-3.5 h-3.5" /> 自动分卷触发器 (支持多次)
                    </div>
                    <button
                      onClick={() => {
                        const currentRules = (node.data.splitRules || []) as any[];
                        // 兼容 Legacy 数据迁移
                        const legacyRule = (!currentRules.length && node.data.splitChapterTitle)
                          ? [{ id: 'legacy', chapterTitle: node.data.splitChapterTitle, nextVolumeName: node.data.nextVolumeName || '新分卷' }]
                          : [];
                        
                        const nextRules = [
                          ...(currentRules.length ? currentRules : legacyRule),
                          { id: Date.now().toString(), chapterTitle: '', nextVolumeName: '新分卷' }
                        ];
                        updateNodeData(node.id, {
                          splitRules: nextRules,
                          // 迁移后清空旧字段以避免逻辑冲突
                          splitChapterTitle: '',
                          nextVolumeName: ''
                        });
                      }}
                      className="px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 rounded-md text-[10px] font-bold border border-teal-500/30 transition-all"
                    >
                      <Plus className="w-3 h-3 inline mr-1" /> 添加触发点
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {(() => {
                      const rules = (node.data.splitRules || []) as any[];
                      // 如果规则列表为空但有旧数据，渲染旧数据项
                      if (rules.length === 0 && node.data.splitChapterTitle) {
                        rules.push({ id: 'legacy', chapterTitle: node.data.splitChapterTitle, nextVolumeName: node.data.nextVolumeName || '新分卷' });
                      }

                      const allOutlineTitles = new Set<string>();
                      activeNovel.outlineSets?.forEach(set => {
                        set.items.forEach(item => allOutlineTitles.add(item.title));
                      });
                      const titleOptions = Array.from(allOutlineTitles);

                      return rules.map((rule, idx) => (
                        <div key={rule.id} className="grid grid-cols-12 gap-3 items-end bg-gray-900/40 p-3 rounded-lg border border-gray-700/30 group">
                          <div className="col-span-5 space-y-1.5">
                            <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">触发章节 (如: 第一章/1)</label>
                            <input
                              type="text"
                              value={rule.chapterTitle}
                              onChange={(e) => {
                                const nextRules = [...rules];
                                nextRules[idx] = { ...rule, chapterTitle: e.target.value };
                                updateNodeData(node.id, { splitRules: nextRules });
                              }}
                              placeholder="例如: 第一章 或 1"
                              className="w-full bg-[#161922] border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-teal-500 transition-all"
                            />
                          </div>
                          <div className="col-span-5 space-y-1.5">
                            <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">新分卷命名</label>
                            <input
                              type="text"
                              value={rule.nextVolumeName}
                              onChange={(e) => {
                                const nextRules = [...rules];
                                nextRules[idx] = { ...rule, nextVolumeName: e.target.value };
                                updateNodeData(node.id, { splitRules: nextRules });
                              }}
                              placeholder="新分卷名称..."
                              className="w-full bg-[#161922] border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-teal-500 transition-all"
                            />
                          </div>
                          <div className="col-span-2 flex justify-center pb-1">
                            <button
                              onClick={() => {
                                const nextRules = rules.filter((_, i) => i !== idx);
                                updateNodeData(node.id, { splitRules: nextRules });
                              }}
                              className="p-2 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                    
                    {(!node.data.splitRules || (node.data.splitRules as any[]).length === 0) && !node.data.splitChapterTitle && (
                      <div className="text-center py-6 border border-dashed border-gray-700 rounded-xl">
                        <p className="text-[10px] text-gray-600">未设置自动分卷触发器，正文将全部存入初始目标分卷。</p>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-[9px] text-gray-600 leading-relaxed px-1">
                    * 工作流运行中每当完成指定章节，将立即创建新分卷并把后续章节保存至其中。
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                * 此节点之后生成的正文内容将自动保存到该分卷中，直到遇到下一个分卷节点。
              </p>
            </div>
          )}

          {node.data.typeKey !== 'userInput' && node.data.typeKey !== 'pauseNode' && node.data.typeKey !== 'saveToVolume' && activeNovel && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5" /> 关联参考资料集 (Context)
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                    <Globe className="w-3 h-3 text-emerald-500"/> 世界观设定
                  </div>
                  <div className="space-y-1 pt-1">
                    {activeNovel.worldviewSets?.map(set => (
                      <button
                        key={set.id}
                        onClick={() => toggleSetReference('worldview', set.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedWorldviewSets || []) as string[]).includes(set.id) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                      >
                        {((node.data.selectedWorldviewSets || []) as string[]).includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {set.name}
                      </button>
                    ))}
                    {pendingFolders.filter(name => !activeNovel.worldviewSets?.some(s => s.name === name)).map(name => {
                      const pendingId = `pending:${name}`;
                      const isSelected = ((node.data.selectedWorldviewSets || []) as string[]).includes(pendingId);
                      return (
                        <button
                          key={pendingId}
                          onClick={() => toggleSetReference('worldview', pendingId)}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/50 shadow-sm shadow-emerald-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-emerald-500/20'}`}
                        >
                          {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5" />}
                          {name} (计划中)
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                    <Users className="w-3 h-3 text-orange-500"/> 角色档案集
                  </div>
                  <div className="space-y-1 pt-1">
                    {activeNovel.characterSets?.map(set => (
                      <button
                        key={set.id}
                        onClick={() => toggleSetReference('character', set.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedCharacterSets || []) as string[]).includes(set.id) ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                      >
                        {((node.data.selectedCharacterSets || []) as string[]).includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {set.name}
                      </button>
                    ))}
                    {pendingFolders.filter(name => !activeNovel.characterSets?.some(s => s.name === name)).map(name => {
                      const pendingId = `pending:${name}`;
                      const isSelected = ((node.data.selectedCharacterSets || []) as string[]).includes(pendingId);
                      return (
                        <button
                          key={pendingId}
                          onClick={() => toggleSetReference('character', pendingId)}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-orange-600/30 text-orange-200 border border-orange-500/50 shadow-sm shadow-orange-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-orange-500/20'}`}
                        >
                          {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-orange-400" /> : <Square className="w-3.5 h-3.5" />}
                          {name} (计划中)
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                    <LayoutList className="w-3 h-3 text-pink-500"/> 剧情粗纲
                  </div>
                  <div className="space-y-1 pt-1">
                    {activeNovel.outlineSets?.map(set => (
                      <button
                        key={set.id}
                        onClick={() => toggleSetReference('outline', set.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedOutlineSets || []) as string[]).includes(set.id) ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                      >
                        {((node.data.selectedOutlineSets || []) as string[]).includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {set.name}
                      </button>
                    ))}
                    {pendingFolders.filter(name => !activeNovel.outlineSets?.some(s => s.name === name)).map(name => {
                      const pendingId = `pending:${name}`;
                      const isSelected = ((node.data.selectedOutlineSets || []) as string[]).includes(pendingId);
                      return (
                        <button
                          key={pendingId}
                          onClick={() => toggleSetReference('outline', pendingId)}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-pink-600/30 text-pink-200 border border-pink-500/50 shadow-sm shadow-pink-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-pink-500/20'}`}
                        >
                          {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-pink-400" /> : <Square className="w-3.5 h-3.5" />}
                          {name} (计划中)
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                    <Lightbulb className="w-3 h-3 text-yellow-500"/> 灵感脑洞集
                  </div>
                  <div className="space-y-1 pt-1">
                    {activeNovel.inspirationSets?.map(set => (
                      <button
                        key={set.id}
                        onClick={() => toggleSetReference('inspiration', set.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedInspirationSets || []) as string[]).includes(set.id) ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                      >
                        {((node.data.selectedInspirationSets || []) as string[]).includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {set.name}
                      </button>
                    ))}
                    {pendingFolders.filter(name => !activeNovel.inspirationSets?.some(s => s.name === name)).map(name => {
                      const pendingId = `pending:${name}`;
                      const isSelected = ((node.data.selectedInspirationSets || []) as string[]).includes(pendingId);
                      return (
                        <button
                          key={pendingId}
                          onClick={() => toggleSetReference('inspiration', pendingId)}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-yellow-600/30 text-yellow-200 border border-yellow-500/50 shadow-sm shadow-yellow-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-yellow-500/20'}`}
                        >
                          {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-yellow-400" /> : <Square className="w-3.5 h-3.5" />}
                          {name} (计划中)
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700/30">
                <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-2">
                  <Folder className="w-3 h-3 text-blue-500"/> 参考资料库文件夹 (全量关联)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {activeNovel.referenceFolders?.map(folder => {
                    const folderFiles = activeNovel.referenceFiles?.filter(f => f.parentId === folder.id) || [];
                    const hasImages = folderFiles.some(f => f.type.startsWith('image/'));
                    const hasPdf = folderFiles.some(f => f.type === 'application/pdf');
                    return (
                      <button
                        key={folder.id}
                        onClick={() => toggleSetReference('folder', folder.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedReferenceFolders || []) as string[]).includes(folder.id) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium' : 'bg-[#161922] hover:bg-gray-700 text-gray-400 border border-gray-700/50'}`}
                      >
                        {((node.data.selectedReferenceFolders || []) as string[]).includes(folder.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                          <span className="truncate">{folder.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {hasImages && <ImageIcon className="w-2.5 h-2.5 text-blue-400" />}
                            {hasPdf && <File className="w-2.5 h-2.5 text-red-400" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {(!activeNovel.referenceFolders || activeNovel.referenceFolders.length === 0) && (
                    <div className="col-span-2 py-4 text-center text-[10px] text-gray-600 border border-dashed border-gray-700 rounded-lg">
                      资料库中暂无文件夹，请先在资料库中创建
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {node.data.typeKey !== 'pauseNode' && node.data.typeKey !== 'saveToVolume' && (
            <>
              <div className="space-y-3 pt-6 border-t border-gray-700/30">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  {node.data.typeKey === 'workflowGenerator' ? '工作流需求描述 (Architecture Requirements)' : '额外指令 (USER PROMPT)'}
                </label>
                <textarea
                  value={localInstruction}
                  onChange={(e) => {
                    setLocalInstruction(e.target.value);
                    debouncedUpdate({ instruction: e.target.value });
                  }}
                  placeholder={node.data.typeKey === 'workflowGenerator'
                    ? "描述你想要的工作流结构，例如：先写灵感，再写世界观和角色，最后生成大纲和正文..."
                    : "输入该步骤的特定要求或引导词..."
                  }
                  className="w-full h-32 bg-[#161922] border border-gray-700/80 rounded-lg p-4 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none font-mono leading-relaxed transition-all"
                />
              </div>

              {/* 循环指令配置 (所有节点通用) */}
              <div className="space-y-4 pt-6 border-t border-gray-700/30">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Repeat className="w-3.5 h-3.5" /> 循环特定指令 (Loop Instructions)
                  </label>
                  <button
                    onClick={() => {
                      const currentInstructions = (node.data.loopInstructions as LoopInstruction[]) || [];
                      const nextIndex = currentInstructions.length > 0 ? Math.max(...currentInstructions.map(i => i.index)) + 1 : 1;
                      const newInstructions = [...currentInstructions, { index: nextIndex, content: '' }];
                      updateNodeData(node.id, { loopInstructions: newInstructions });
                    }}
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Plus className="w-3 h-3" /> 添加轮次
                  </button>
                </div>
                
                {((node.data.loopInstructions as LoopInstruction[]) || []).map((inst, idx) => (
                  <div key={idx} className="bg-[#161922] border border-gray-700/50 rounded-lg overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between bg-gray-800/50 px-3 py-1.5 border-b border-gray-700/30">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">第 {inst.index} 次循环时发送</span>
                      <button
                        onClick={() => {
                          const newInstructions = ((node.data.loopInstructions as LoopInstruction[]) || []).filter((_, i) => i !== idx);
                          updateNodeData(node.id, { loopInstructions: newInstructions });
                        }}
                        className="text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <textarea
                      value={inst.content}
                      onChange={(e) => {
                        const newInstructions = [...((node.data.loopInstructions as LoopInstruction[]) || [])];
                        newInstructions[idx] = { ...inst, content: e.target.value };
                        updateNodeData(node.id, { loopInstructions: newInstructions });
                      }}
                      placeholder="输入该轮次特定的额外指令..."
                      className="w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none"
                    />
                  </div>
                ))}
                {(!node.data.loopInstructions || node.data.loopInstructions.length === 0) && (
                  <div className="text-center py-4 text-[10px] text-gray-600 italic border border-dashed border-gray-700/50 rounded-lg">
                    未配置循环特定指令，每次循环将使用通用指令。
                  </div>
                )}
              </div>
            </>
          )}

          {node.data.typeKey === 'loopNode' && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-sky-500 uppercase tracking-widest flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5" /> 循环控制器配置
              </label>
              <div className="space-y-3 bg-sky-500/10 border border-sky-500/20 rounded-lg p-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-sky-300 font-bold uppercase">循环次数</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={node.data.loopConfig?.count || 1}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      updateNodeData(node.id, {
                        loopConfig: {
                          ...(node.data.loopConfig || { enabled: true }),
                          count,
                          enabled: true
                        }
                      });
                    }}
                    className="w-full bg-[#161922] border border-sky-500/30 rounded px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
                  />
                </div>
                <div className="text-[10px] text-sky-400/70 leading-relaxed">
                  * 此节点将作为循环的起点/终点连接器。
                  <br/>
                  * 当流程执行到此节点时，如果未达到指定次数，将跳转回循环起始位置（通过连线闭环）。
                  <br/>
                  * 系统变量 <code>{'{{loop_index}}'}</code> 可在循环内的任何节点中使用。
                </div>
              </div>
            </div>
          )}

          {node.data.typeKey === 'pauseNode' && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <PauseCircle className="w-3.5 h-3.5" /> 暂停节点说明
              </label>
              <div className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-lg">
                <p className="text-xs text-slate-300 leading-relaxed">
                  当工作流执行到此节点时，将自动暂停并进入等待状态。
                  <br/><br/>
                  您可以在确认内容或进行人工操作后，点击顶部工具栏的
                  <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30 text-[10px] font-bold"><Play className="w-2 h-2" /> 从停止处继续</span>
                  按钮以继续执行后续流程。
                </p>
              </div>
            </div>
          )}

          {node.data.typeKey === 'chapter' ? (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-indigo-400" /> 生成产物说明
              </label>
              <div className="text-center py-12 bg-[#161922] rounded-xl border border-dashed border-gray-700">
                <div className="inline-block p-3 bg-gray-800 rounded-full mb-3">
                  <BookOpen className="w-6 h-6 text-indigo-500" />
                </div>
                <p className="text-sm text-gray-300">章节内容已实时保存至侧边栏目录</p>
                <p className="text-xs text-gray-500 mt-2 px-10 leading-relaxed">工作流执行过程中生成的正文会直接写入小说对应的分卷中（由前置的“保存至分卷”节点决定），您可以在主界面左侧的目录树中点击查看、编辑或手动优化这些章节。</p>
              </div>
            </div>
          ) : node.data.typeKey !== 'pauseNode' && node.data.typeKey !== 'saveToVolume' && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Workflow className="w-3.5 h-3.5" /> 生成内容列表 (Output Entries)
                </label>
                <button onClick={addEntry} className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                  <Plus className="w-3 h-3" /> 新增条目
                </button>
              </div>
              
              <div className="space-y-4">
                {(() => {
                  const entries = (node.data.outputEntries || []) as OutputEntry[];
                  return entries.map((entry, idx) => {
                    const isFirst = idx === 0;
                    return (
                      <div key={entry.id} className="bg-[#161922] border border-gray-700/50 rounded-xl overflow-hidden shadow-lg group/entry transition-all">
                        <div
                          className="bg-[#1a1d29] px-4 py-2 border-b border-gray-700/50 flex items-center justify-between cursor-pointer hover:bg-[#202436]"
                          onClick={(e) => {
                            // 简单的手风琴效果：通过 details/summary 或者手动状态管理。
                            // 这里利用 DOM 操作简化实现，或者如果想要 React 状态控制，需要重构为子组件。
                            // 为了保持单文件简洁，我们给它加上 details/summary 语义的变体。
                            const contentEl = e.currentTarget.nextElementSibling as HTMLElement;
                            if (contentEl) {
                              contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
                              // 旋转图标
                              const icon = e.currentTarget.querySelector('.chevron-icon');
                              if (icon) icon.classList.toggle('rotate-180');
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform chevron-icon ${!isFirst ? '-rotate-90' : ''}`} />
                            <input
                              value={entry.title}
                              onClick={(e) => e.stopPropagation()} // 防止触发折叠
                              onChange={(e) => updateEntryTitle(entry.id, e.target.value)}
                              className="bg-transparent border-none outline-none text-xs font-bold text-indigo-300 focus:text-white transition-colors flex-1"
                              placeholder="条目标题..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-600 font-mono">{entry.content.length}字</span>
                            <button onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }} className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover/entry:opacity-100">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div style={{ display: isFirst ? 'block' : 'none' }}>
                          <textarea
                            value={entry.content}
                            onChange={(e) => updateEntryContent(entry.id, e.target.value)}
                            placeholder="输入内容..."
                            className="w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-emerald-50 outline-none resize-none font-mono leading-relaxed"
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
                {(!node.data.outputEntries || (node.data.outputEntries as OutputEntry[]).length === 0) && (
                  <div className="text-center py-12 bg-[#161922] rounded-xl border border-dashed border-gray-700">
                    <div className="inline-block p-3 bg-gray-800 rounded-full mb-3">
                      <Workflow className="w-6 h-6 text-gray-600" />
                    </div>
                    <p className="text-sm text-gray-500">暂无生成产物，执行工作流或手动添加</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-700/50 bg-[#1a1d29]">
          <button
            onClick={() => {
              updateNodeData(node.id, { _deleted: true });
              onClose();
            }}
            className="w-full py-3 bg-red-900/10 hover:bg-red-900/20 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 text-sm font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Trash2 className="w-4 h-4" /> 删除模块
          </button>
        </div>
      </div>

      {/* --- 提示词条目管理弹窗 --- */}
      {isEditingPrompts && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsEditingPrompts(false)} />
          <div className="relative w-full max-w-[700px] bg-[#1e2230] rounded-2xl shadow-2xl border border-gray-700 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29]">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <Wand2 className="w-5 h-5" />
                <span className="font-bold text-gray-100 text-lg">编辑对话提示词</span>
              </div>
              <button onClick={() => setIsEditingPrompts(false)} className="p-1.5 hover:bg-gray-700/50 rounded-md text-gray-400 hover:text-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#1e2230]">
              {(() => {
                const items = (node.data.promptItems as GeneratorPrompt[]) || (node.data.systemPrompt ? [{ id: 'default', role: 'system', content: node.data.systemPrompt as string, enabled: true }] : []);
                
                return (
                  <>
                    {items.length === 0 && (
                      <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-2xl">
                        <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">暂无自定义提示词条目</p>
                      </div>
                    )}
                    
                    {items.map((item, idx) => (
                      <div key={item.id || idx} className="bg-[#161922] border border-gray-700 rounded-xl overflow-hidden group/item">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700/50">
                          <div className="flex items-center gap-3">
                            <select
                              value={item.role}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[idx] = { ...newItems[idx], role: e.target.value as any };
                                updateNodeData(node.id, { promptItems: newItems });
                              }}
                              className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/30 rounded px-2 py-1 outline-none"
                            >
                              <option value="system">System</option>
                              <option value="user">User</option>
                              <option value="assistant">Assistant</option>
                            </select>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.enabled !== false}
                                onChange={(e) => {
                                  const newItems = [...items];
                                  newItems[idx] = { ...newItems[idx], enabled: e.target.checked };
                                  updateNodeData(node.id, { promptItems: newItems });
                                }}
                                className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">启用</span>
                            </label>
                          </div>
                          <button
                            onClick={() => {
                              const newItems = items.filter((_, i) => i !== idx);
                              updateNodeData(node.id, { promptItems: newItems });
                            }}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={item.content}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[idx] = { ...newItems[idx], content: e.target.value };
                            updateNodeData(node.id, { promptItems: newItems });
                          }}
                          placeholder="输入提示词内容... 支持 {{context}} 变量"
                          className="w-full h-24 bg-transparent p-4 text-xs text-gray-300 focus:text-white outline-none resize-none font-mono leading-relaxed"
                        />
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        const newItems = [...items, { id: `prompt-${Date.now()}`, role: 'user' as const, content: '', enabled: true }];
                        updateNodeData(node.id, { promptItems: newItems });
                      }}
                      className="w-full py-4 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      添加新的提示词条目
                    </button>
                  </>
                );
              })()}
            </div>

            <div className="p-5 border-t border-gray-700/50 bg-[#1a1d29] flex justify-end">
              <button
                onClick={() => setIsEditingPrompts(false)}
                className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkflowEditorContent = (props: WorkflowEditorProps) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, onStartAutoWrite, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => {
      const nextNodes = applyNodeChanges(changes, nds) as WorkflowNode[];
      
      // 核心修复：防止拖拽/选中操作会导致旧状态覆盖 Ref 中的最新执行状态
      // 我们信任 applyNodeChanges 返回的 position/selected/dragging，但数据必须以 Ref 为准
      const mergedNodes = nextNodes.map(n => {
        const refNode = nodesRef.current.find(r => r.id === n.id);
        if (refNode) {
          return { ...n, data: refNode.data };
        }
        return n;
      });

      nodesRef.current = mergedNodes;
      return mergedNodes;
    });
  }, []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(workflowManager.getState().isRunning);
  const [isPaused, setIsPaused] = useState(workflowManager.getState().isPaused);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(workflowManager.getState().currentNodeIndex);
  const [stopRequested, setStopRequested] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  // 性能优化：显式使用 useMemo 锁定 nodeTypes 和 edgeTypes，消除 React Flow 的重绘警告
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    custom: CoolEdge,
  }), []);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const activeNovelRef = useRef(activeNovel);
  const nodesRef = useRef(nodes);
  const workflowsRef = useRef(workflows);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);

  // 核心修复：移除 useEffect 对 nodesRef 的同步，改为在 setNodes 调用处手动同步以消除延迟

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  // 同步全局工作流状态
  useEffect(() => {
    const unsubscribeState = workflowManager.subscribe((state) => {
      // 只有当本地状态与全局状态不一致且当前工作流 ID 匹配时才更新
      // 或者是刚刚打开界面（isInitialLoadRef 为 true）
      if (state.activeWorkflowId === activeWorkflowId || !activeWorkflowId || activeWorkflowId === 'default') {
        setIsRunning(state.isRunning);
        setIsPaused(state.isPaused);
        setCurrentNodeIndex(state.currentNodeIndex);
        if (state.error) setError(state.error);
      }
    });

    // 核心修复：订阅节点级别的细粒度更新广播
    // 这允许后台执行的逻辑将状态变更实时推送到新挂载的 UI 实例
    const unsubscribeNodes = workflowManager.subscribeToNodeUpdates((update) => {
      setNodes((nds) => {
        const nextNodes = nds.map(n => {
          if (n.id === update.nodeId) {
            // Smart Merge: 仅更新变更的字段，保留原有的位置和其他属性
            return {
              ...n,
              data: { ...n.data, ...update.data }
            };
          }
          return n;
        });
        
        // 同时更新 Ref 以保持同步，防止闭包陷阱
        nodesRef.current = nextNodes;
        return nextNodes;
      });
    });

    return () => {
      unsubscribeState();
      unsubscribeNodes();
    };
  }, [activeWorkflowId]);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  // 获取工作流中所有“初始化目录”节点定义的文件夹名（即便尚未运行创建）
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

  const [allPresets, setAllPresets] = useState<Record<string, GeneratorPreset[]>>({
    outline: [],
    character: [],
    worldview: [],
    inspiration: [],
    plotOutline: [],
    completion: [],
    optimize: [],
    analysis: [],
    generator: [],
  });

  // 加载预设
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat', 'generator'];
    const loaded: Record<string, GeneratorPreset[]> = {};
    types.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        loaded[t] = saved ? JSON.parse(saved) : [];
      } catch (e) {
        loaded[t] = [];
      }
    });
    setAllPresets(loaded);
  }, [isOpen]);

  // 加载保存的工作流列表
  useEffect(() => {
    const initWorkflows = async () => {
      // 如果已经初始化过，且当前正在运行，不要重新从本地存储加载，避免覆盖内存中的执行状态
      if (!isInitialLoadRef.current && isRunning) return;
      if (!isOpen && !isInitialLoadRef.current) return;

      setIsLoadingWorkflows(true);
      try {
        const loadedWorkflows = await storage.getWorkflows();
        const targetId = await storage.getActiveWorkflowId();

        setWorkflows(loadedWorkflows);
        
        const finalId = targetId && loadedWorkflows.find(w => w.id === targetId)
          ? targetId
          : (loadedWorkflows[0]?.id || 'default');
        
        setActiveWorkflowId(finalId);
        loadWorkflow(finalId, loadedWorkflows);
      } catch (e) {
        terminal.error(`[WORKFLOW] 启动加载失败: ${e}`);
      } finally {
        setIsLoadingWorkflows(false);
        isInitialLoadRef.current = false;
      }
    };
    
    initWorkflows();
  }, [isOpen]); // 移除 activeNovel 依赖，防止执行期间或结束时因 novel 更新触发重新加载

  const loadWorkflow = (id: string, workflowList: WorkflowData[]) => {
    // 核心修复：解除加载死锁。
    // 如果 nodes 长度为 0（说明组件刚刚挂载），即使正在运行也必须允许恢复初始结构
    if (isRunning && nodesRef.current.length > 0) return;

    const workflow = workflowList.find(w => w.id === id);
    const globalIsRunning = workflowManager.getState().isRunning;
    if (workflow) {
      // 兼容存量边数据：确保所有边都使用新的 'custom' 类型
      const restoredEdges = (workflow.edges || []).map(edge => ({
        ...edge,
        type: 'custom',
        animated: edge.animated || false
      }));

      const restoredNodes = (workflow.nodes || []).map((n: WorkflowNode) => {
        // 判定并过滤旧数据中遗留的自动勾选引用
        // 逻辑：如果 ID 是 'pending:' 开头，或者该资料集的名称与当前工作流定义的目录名一致，
        // 则判定为旧版自动生成的冗余引用，加载时将其剔除。
        const workflowFolderName = (workflow.nodes || []).find(node => node.data.typeKey === 'createFolder')?.data.folderName;

        const filterLegacyRefs = (list: string[] | undefined, type: 'worldview' | 'character' | 'outline' | 'inspiration') => {
          if (!list) return [];
          return list.filter(setId => {
            if (!setId || typeof setId !== 'string') return false;
            // 1. 过滤掉所有未创建的计划中引用
            if (setId.startsWith('pending:')) return false;
            
            // 2. 过滤掉名称与目录名完全一致的已转换引用（旧版自动勾选的特征）
            if (activeNovel && workflowFolderName) {
              let sets: any[] = [];
              if (type === 'worldview') sets = activeNovel.worldviewSets || [];
              else if (type === 'character') sets = activeNovel.characterSets || [];
              else if (type === 'outline') sets = activeNovel.outlineSets || [];
              else if (type === 'inspiration') sets = activeNovel.inspirationSets || [];
              
              const targetSet = sets.find(s => s.id === setId);
              if (targetSet && targetSet.name === workflowFolderName) return false;
            }
            return true;
          });
        };
        
        return {
          ...n,
          data: {
            ...n.data,
            // 核心修复：数据自愈。如果全局未运行，但节点状态卡在执行中，则重置为完成
            status: (!globalIsRunning && n.data.status === 'executing') ? 'completed' : n.data.status,
            label: (!globalIsRunning && n.data.status === 'executing' && n.data.typeKey === 'chapter')
              ? NODE_CONFIGS.chapter.defaultLabel
              : n.data.label,
            selectedWorldviewSets: filterLegacyRefs(n.data.selectedWorldviewSets, 'worldview'),
            selectedCharacterSets: filterLegacyRefs(n.data.selectedCharacterSets, 'character'),
            selectedOutlineSets: filterLegacyRefs(n.data.selectedOutlineSets, 'outline'),
            selectedInspirationSets: filterLegacyRefs(n.data.selectedInspirationSets, 'inspiration'),
            selectedReferenceFolders: n.data.selectedReferenceFolders || [],
            outputEntries: n.data.outputEntries || [],
          }
        };
      });
      setNodes(restoredNodes);
      nodesRef.current = restoredNodes; // 同步 Ref
      setEdges(restoredEdges);
      setCurrentNodeIndex(workflow.currentNodeIndex !== undefined ? workflow.currentNodeIndex : -1);
      
      // 只有当有明确的执行进度且未在运行时，才设为暂停状态以便恢复
      if (workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1) {
        setIsPaused(true);
      } else {
        setIsPaused(false);
      }
    }
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 自动持久化状态 - 增加防抖处理 (核心重构：异步 IndexedDB + 状态锁)
  useEffect(() => {
    // 重要：如果正在加载中，绝对禁止触发保存，防止空状态覆盖数据库
    if (isLoadingWorkflows) return;
    
    // 核心修复：防止多实例竞争导致的任务终止。
    // 如果 UI 已经关闭（isOpen=false），则禁止由 React 组件实例触发自动保存。
    // 后台运行的任务状态持久化应仅由 runWorkflow 内部的 syncNodeStatus 负责。
    // 这样避免了用户重新打开 UI 时，新实例持有过时状态并通过此 Effect 覆盖了正在跑的后台任务进度。
    if (!isOpen || workflows.length === 0) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const currentWorkflows = workflows.map(w => {
        if (w.id === activeWorkflowId) {
          return {
            ...w,
            nodes: nodesRef.current, // 核心修复：自动保存使用 Ref 抓取绝对最新的内存快照
            edges,
            currentNodeIndex,
            lastModified: Date.now(),
            contextSnapshot: workflowManager.getSnapshot()
          };
        }
        return w;
      });
      
      try {
        await storage.saveWorkflows(currentWorkflows);
        await storage.setActiveWorkflowId(activeWorkflowId);
        // 同时更新内存中的状态，保持同步但不触发额外的 Effect
        setWorkflows(currentWorkflows);
      } catch (e) {
        terminal.error(`[WORKFLOW] 自动保存失败: ${e}`);
      }
    }, 5000); // 5秒防抖

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning, isLoadingWorkflows, workflows]);

  const switchWorkflow = (id: string, targetList?: WorkflowData[]) => {
    if (isRunning) {
      alert('请先停止当前工作流再切换');
      return;
    }
    setActiveWorkflowId(id);
    loadWorkflow(id, targetList || workflows);
    setShowWorkflowMenu(false);
  };

  const createNewWorkflow = async () => {
    if (isRunning) {
      alert('请先停止当前工作流');
      return;
    }
    const newId = `wf_${Date.now()}`;
    const newWf: WorkflowData = {
      id: newId,
      name: `新工作流 ${workflows.length + 1}`,
      nodes: [],
      edges: [],
      lastModified: Date.now()
    };
    const updated = [...workflows, newWf];
    setWorkflows(updated);
    await storage.saveWorkflows(updated);
    switchWorkflow(newId, updated);
  };

  const deleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workflows.length <= 1) {
      setError('无法删除最后一个工作流');
      return;
    }
    if (isRunning && id === activeWorkflowId) {
      setError('无法删除正在运行的工作流');
      return;
    }
    if (confirm('确定要删除这个工作流吗？')) {
      const updated = workflows.filter(w => w.id !== id);
      setWorkflows(updated);
      await storage.saveWorkflows(updated);
      if (activeWorkflowId === id) {
        switchWorkflow(updated[0].id, updated);
      }
    }
  };

  const renameWorkflow = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = workflows.map(w => w.id === id ? { ...w, name: newName } : w);
    setWorkflows(updated);
    await storage.saveWorkflows(updated);
    setIsEditingWorkflowName(false);
  };

  const exportWorkflow = (id: string) => {
    const workflow = workflows.find(w => w.id === id);
    if (!workflow) return;
    
    // 导出时移除临时状态
    const exportData = {
      ...workflow,
      nodes: workflow.nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          status: 'pending',
          outputEntries: []
        }
      })),
      currentNodeIndex: -1
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isRunning) {
      alert('请先停止当前工作流再导入');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as WorkflowData;
        if (!imported.nodes || !imported.edges) {
          throw new Error('无效的工作流文件格式');
        }
        
        const newId = `wf_imported_${Date.now()}`;
        const newWf: WorkflowData = {
          ...imported,
          id: newId,
          name: `${imported.name} (导入)`,
          lastModified: Date.now()
        };
        
        const updated = [...workflows, newWf];
        setWorkflows(updated);
        await storage.saveWorkflows(updated);
        switchWorkflow(newId, updated);
        setError(null);
      } catch (err: any) {
        setError(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // 重置 input
    e.target.value = '';
  };

  // 只有在组件真正卸载（如切换页面）时才中止执行
  // 关闭弹窗（isOpen 变为 false）不应停止执行，实现后台运行
  useEffect(() => {
    return () => {
      // 这里的清理函数在组件真正卸载时执行
      // 注意：ReactFlowProvider 内部的组件在弹窗关闭（isOpen=false）时由于其父级渲染逻辑可能被卸载
      // 我们需要确保只有在用户显式终止或任务彻底完成时才不进行清理
      if (stopRequestedRef.current === false && isRunning) {
        // terminal.log('[WORKFLOW] 检测到组件卸载，尝试后台维持执行 (或由父组件决定是否终止)');
        // 如果我们希望支持真正的后台运行且不被卸载干扰，此处不应直接调用 stopWorkflow()
        // 但由于本应用中 WorkflowEditorContent 是在 WorkflowEditor 内部根据 isOpen 渲染的，
        // 弹窗关闭会导致此处卸载。
        // 为修复“章节没有润色优化完成”的问题，我们在这里需要更加谨慎。
      }
    };
  }, [isRunning]);

  const onConnect = useCallback(
    (params: Connection) => {
      // 允许任意节点之间的连接，包括回环（Loop）
      // ReactFlow 默认可能会限制一些连接，我们显式放开
      // 特别是 Loop Node，用户意图是将其输出连回前面的某个节点（Back-edge）
      const newEdge = {
        ...params,
        type: 'custom',
        animated: false,
        // 增加交互区域，使连接线更容易被选中和删除
        interactionWidth: 20,
        // 关键：对于回环连接，使用 step 类型的路径可能更好看，或者保持贝塞尔曲线
        // 这里保持 custom 类型（CoolEdge），它使用 getBezierPath
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const addNewNode = useCallback((typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
    
    // 互斥检查
    if (typeKey === 'workflowGenerator' && nodes.length > 0) {
      alert('“智能生成工作流”节点只能在空画布上创建。请先清空当前画布。');
      return;
    }
    if (nodes.some(n => n.data.typeKey === 'workflowGenerator')) {
      alert('画布中已存在生成节点。请先运行该节点或将其删除后再添加其他模块。');
      return;
    }

    // 自动发现当前工作流中定义的计划文件夹
    const currentPendingFolders = nodes
      .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
      .map(n => `pending:${n.data.folderName}`);

    // 计算视口中心位置
    // 我们假设编辑器区域的中心点。screenToFlowPosition 需要屏幕坐标。
    // 由于 WorkflowEditor 通常占据大部分屏幕，我们可以取 window 的中心，
    // 或者取一个合理的默认值。
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });

    const { icon, ...serializableConfig } = config;

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      data: {
        ...serializableConfig,
        typeKey,
        label: config.defaultLabel,
        presetId: '',
        presetName: '',
        instruction: '',
        folderName: '',
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        selectedReferenceFolders: [],
        outputEntries: [],
        targetVolumeId: typeKey === 'chapter' ? '' : (activeNovel?.volumes[0]?.id || ''),
        targetVolumeName: '',
        // 为生成节点初始化示例提示词
        ...(typeKey === 'workflowGenerator' ? (() => {
          try {
            const savedConfig = localStorage.getItem('workflow_generator_default_config');
            if (savedConfig) {
              const parsed = JSON.parse(savedConfig);
              return {
                overrideAiConfig: parsed.overrideAiConfig ?? true,
                autoFillContent: parsed.autoFillContent ?? true,
                instruction: parsed.instruction ?? '',
                promptItems: parsed.promptItems ?? [],
                model: parsed.model,
                temperature: parsed.temperature,
                topP: parsed.topP,
                topK: parsed.topK,
                maxTokens: parsed.maxTokens,
                apiKey: parsed.apiKey,
                baseUrl: parsed.baseUrl,
              };
            }
          } catch (e) {
            console.error('Failed to load workflow architect config:', e);
          }
          
          // 兜底默认配置
          return {
            overrideAiConfig: true,
            autoFillContent: true,
            promptItems: [
              {
                id: 'sys-1',
                role: 'system',
                content: `你是一个顶级的 AI 小说工作流架构师。你的职责是将用户的创作需求拆解为一套标准化的自动化流程。你必须以 JSON 格式输出。

### 1. 节点类型百科 (typeKey 指南)
你必须根据创作逻辑合理安排以下节点的先后顺序：
- createFolder: 【必需起点】初始化项目。参数: folderName (小说书名)。
- worldview: 构建世界观。参数: instruction (设定要求)。
- characters: 塑造角色。参数: instruction (人设要求)。
- inspiration: 灵感生成。参数: instruction (脑洞要求)。
- plotOutline: 剧情粗纲。参数: instruction (宏观逻辑规划)。
- outline: 章节大纲。参数: instruction (细化到每章的要求)。
- chapter: 【正文生成】通常接在 outline 节点之后。
- userInput: 用户干预。参数: instruction (提示词)。
- aiChat: AI 顾问。参数: instruction (审核要求)。
- reuseDirectory: 关联目录。参数: folderName (目录名)。

### 2. 顶级指令编写规范 (Instruction)
如果你开启"自动填写"，你为 nodes 生成的 instruction 必须在 300-600 字之间，包含身份背景、任务目标、创作禁忌和风格规范。

### 3. JSON 协议格式
你必须返回纯净的 JSON，严禁 Markdown 代码块标记。结构如下：
{
  "nodes": [ { "id": "n0", "typeKey": "createFolder", "label": "初始化", "folderName": "书名" } ],
  "edges": [ { "id": "e1", "source": "n0", "target": "n1" } ]
}`,
                enabled: true
              },
              {
                id: 'user-1',
                role: 'user',
                content: '请以此为基础，为我生成一套完整的工作流。如果我开启了自动填写，请在每个节点的 instruction 字段中为我写好专业的引导提示词。',
                enabled: true
              }
            ]
          };
        })() : {})
      },
      position: {
        x: position.x - 140, // 减去节点宽度的一半 (280/2)
        y: position.y - 40   // 减去大概高度的一半
      },
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      nodesRef.current = nextNodes; // 同步 Ref
      return nextNodes;
    });
    setShowAddMenu(false);
  }, [setNodes, nodes, activeNovel, screenToFlowPosition]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setEditingNodeId(node.id);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEdgeToDelete(edge);
  }, []);

  const confirmDeleteEdge = useCallback(() => {
    if (edgeToDelete) {
      setEdges((eds) => eds.filter((e) => e.id !== edgeToDelete.id));
      setEdgeToDelete(null);
    }
  }, [edgeToDelete, setEdges]);

  const updateNodeData = useCallback((nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes((nds) => {
      const targetNode = nds.find(n => n.id === nodeId);
      const isRenameFolder = (targetNode?.data.typeKey === 'createFolder' || targetNode?.data.typeKey === 'reuseDirectory') && updates.folderName !== undefined && updates.folderName !== targetNode?.data.folderName;

      const nextNodes = nds.map((node) => {
        // 1. 获取 Ref 中最新的执行状态 (Execution Truth)
        const refNode = nodesRef.current.find(n => n.id === node.id);
        
        // 2. 构造基础数据 (Smart Merge)
        let baseData = node.data;
        if (refNode) {
            // 如果 Ref 的状态与 State 不一致，且 Ref 更有可能是“新”的状态，则优先使用 Ref 防止回滚
            if (refNode.data.status !== node.data.status) {
                baseData = { ...baseData, status: refNode.data.status };
            }
            if ((refNode.data.outputEntries?.length || 0) > (node.data.outputEntries?.length || 0)) {
                baseData = { ...baseData, outputEntries: refNode.data.outputEntries };
            }
            if (refNode.data.loopConfig) {
                 baseData = { ...baseData, loopConfig: refNode.data.loopConfig };
            }
             if (refNode.data.label && refNode.data.label !== node.data.label) {
                 baseData = { ...baseData, label: refNode.data.label };
             }
        }

        // 3. 应用本次显式更新
        if (node.id === nodeId) {
          return { ...node, data: { ...baseData, ...updates } };
        }
        
        if (isRenameFolder) {
          return {
            ...node,
            data: {
              ...baseData,
              outputEntries: [],
            }
          };
        }
        
        return { ...node, data: baseData };
      });

      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, [setNodes]);

  const toggleSetReference = useCallback((type: 'worldview' | 'character' | 'outline' | 'inspiration' | 'folder', setId: string) => {
    if (!editingNodeId) return;
    
    // 核心修复：改用 updateNodeData 以享受其内置的 Smart Merge 保护
    // 必须先获取当前的列表（注意：这里仍可能读取到 stale state，但 updateNodeData 会保护其他字段）
    // 对于当前字段，由于用户交互时该节点通常不在运行，风险较低
    const targetNode = nodesRef.current.find(n => n.id === editingNodeId);
    if (!targetNode) return;

    const key = type === 'worldview' ? 'selectedWorldviewSets' :
                type === 'character' ? 'selectedCharacterSets' :
                type === 'outline' ? 'selectedOutlineSets' :
                type === 'inspiration' ? 'selectedInspirationSets' : 'selectedReferenceFolders';
    
    const currentList = [...(targetNode.data[key] as string[])];
    const newList = currentList.includes(setId)
      ? currentList.filter(id => id !== setId)
      : [...currentList, setId];
      
    updateNodeData(editingNodeId, { [key]: newList });
  }, [editingNodeId, updateNodeData]);

  const updateEntryContent = (entryId: string, content: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.map(e => e.id === entryId ? { ...e, content } : e);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const updateEntryTitle = (entryId: string, title: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.map(e => e.id === entryId ? { ...e, title } : e);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const removeEntry = (entryId: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.filter(e => e.id !== entryId);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const addEntry = () => {
    if (!editingNodeId || !editingNode) return;
    const newEntry: OutputEntry = {
      id: Date.now().toString(),
      title: '新条目',
      content: ''
    };
    updateNodeData(editingNodeId, { outputEntries: [...editingNode.data.outputEntries, newEntry] });
  };

  const handleSaveWorkflow = () => {
    const workflow = { nodes, edges };
    localStorage.setItem('novel_workflow', JSON.stringify(workflow));
  };

  // 拓扑排序函数：根据连线确定执行顺序
  // 性能优化：使用 useMemo 缓存拓扑排序结果，避免频繁重排导致的 UI 闪烁和动画卡顿
  const orderedNodes = useMemo(() => {
    const startTime = Date.now();
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    // 基础过滤，确保节点数据有效
    const validNodes = nodes.filter(n => n && n.id);
    const validEdges = edges.filter(e => e && e.source && e.target);

    // 1. 构建图结构
    validNodes.forEach(node => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });
    
    validEdges.forEach(edge => {
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });
    
    const queue: string[] = [];
    const resultIds: string[] = [];
    const visited = new Set<string>();

    // 2. 初始化队列：将所有入度为 0 的节点加入队列（通常是起点）
    const startNodes = validNodes.filter(n => (inDegree.get(n.id) || 0) === 0)
                           .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));
    
    startNodes.forEach(n => {
      queue.push(n.id);
      visited.add(n.id);
    });

    const currentInDegree = new Map(inDegree);

    // 3. 循环处理
    while (resultIds.length < validNodes.length) {
      // 如果队列空了，但还有节点没处理完 -> 说明遇到了环路 (Cycle)
      if (queue.length === 0) {
        const remainingNodes = validNodes.filter(n => !visited.has(n.id));
        if (remainingNodes.length === 0) break;

        // --- 核心修复逻辑 START ---
        
        // 策略 A：寻找“入口节点” (Entry Point)
        // 定义：如果一个未处理节点的父节点中，包含“已处理”的节点，说明它是从外部进入循环的入口。
        // 我们应该优先执行它，而不是随机挑一个。
        let candidates = remainingNodes.filter(node => {
           // 检查该节点是否有任何入边来自 resultIds (已处理节点)
           return validEdges.some(e => e.target === node.id && visited.has(e.source));
        });

        // 策略 B：如果找不到显式入口（比如完全独立的闭环），或者有多个入口
        // 则优先寻找 loopNode 类型的节点作为破局点，因为它们通常是循环的逻辑起点
        // 如果没有循环节点，则退化为按屏幕位置排序 (Top-Left 优先)
        if (candidates.length === 0) {
          const loopNodes = remainingNodes.filter(n => n.data.typeKey === 'loopNode');
          candidates = loopNodes.length > 0 ? loopNodes : remainingNodes;
        }

        // 按位置排序候选者 (Top-Left 优先)
        candidates.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));
        
        // 强制选取第一个节点破局
        const breaker = candidates[0];
        queue.push(breaker.id);
        visited.add(breaker.id);
        
        // --- 核心修复逻辑 END ---
      }

      // 标准 Kahn 算法处理
      const uId = queue.shift()!;
      // 防止重复添加（虽然 visited 应该能防住，但加一层保险）
      if (!resultIds.includes(uId)) {
        resultIds.push(uId);
      }
      
      const neighbors = adjacencyList.get(uId) || [];
      // 对邻居进行排序，确保同一层级的节点执行顺序稳定
      const sortedNeighbors = neighbors
        .map(id => validNodes.find(n => n.id === id)!)
        .filter(Boolean)
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));

      sortedNeighbors.forEach(v => {
        // 如果邻居已经被强行访问过了（破局点），则跳过
        if (visited.has(v.id)) return;

        const newDegree = (currentInDegree.get(v.id) || 0) - 1;
        currentInDegree.set(v.id, newDegree);
        // 如果依赖都满足了，加入队列
        if (newDegree === 0) {
          queue.push(v.id);
          visited.add(v.id);
        }
      });
    }
    
    // 4. 构建最终结果
    const finalNodes = resultIds.map(id => validNodes.find(n => n.id === id)!);
    
    const duration = Date.now() - startTime;
    if (duration > 15) {
      terminal.log(`[PERF] WorkflowEditor.orderedNodes recalculate: ${duration}ms (Nodes: ${nodes.length})`);
    }
    return finalNodes;
  }, [nodes, edges]);

  // 保持兼容性的 Getter
  const getOrderedNodes = useCallback(() => orderedNodes, [orderedNodes]);

  // 自动整理布局逻辑
  const autoLayoutNodes = useCallback(() => {
    const ordered = getOrderedNodes();
    const cols = 4;
    const spacingX = 320;
    const spacingY = 180;
    const startX = 100;
    const startY = 250;

    // 核心修复：布局整理时必须基于 nodesRef (最新数据) 进行，而非 React State (可能滞后)
    // 否则会造成点击整理布局时，节点状态回滚
    const currentNodes = nodesRef.current.length > 0 ? nodesRef.current : nodes;

    const nextNodes = currentNodes.map(node => {
      const idx = ordered.findIndex(n => n.id === node.id);
      if (idx !== -1) {
        return {
          ...node,
          position: {
            x: (idx % cols) * spacingX + startX,
            y: Math.floor(idx / cols) * spacingY + startY
          }
        };
      }
      return node;
    });

    setNodes(nextNodes);
    nodesRef.current = nextNodes;
  }, [nodes, getOrderedNodes, setNodes]);

  // 辅助函数：同步节点状态并强制持久化到磁盘
  // 解决 UI 关闭后组件卸载导致的状态丢失问题
  const syncNodeStatus = async (nodeId: string, updates: Partial<WorkflowNodeData>, currentIndex: number) => {
    if (abortControllerRef.current?.signal.aborted) return;

    // 1. 构造最新的节点列表并同步给 Ref (Ref 是后台循环的可靠数据源)
    // 注意：必须先更新 Ref，再触发 setNodes，确保后续循环中能立即读到最新状态
    const latestNodes = nodesRef.current.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n);
    nodesRef.current = latestNodes;

    // 2. 更新 React 状态 (如果组件仍挂载)
    setNodes(latestNodes);

    // 3. 广播节点更新到其他可能的监听者 (解决 UI 重启后的状态同步)
    workflowManager.broadcastNodeUpdate(nodeId, updates);

    // 4. 显式持久化到存储
    const currentWfs = workflowsRef.current.map(w => {
      if (w.id === activeWorkflowId) {
        return {
          ...w,
          nodes: latestNodes,
          currentNodeIndex: currentIndex,
          lastModified: Date.now(),
          contextSnapshot: workflowManager.getSnapshot()
        };
      }
      return w;
    });

    try {
      await storage.saveWorkflows(currentWfs);
      // 同步更新内存中的工作流列表，保持一致性
      setWorkflows(currentWfs);
    } catch (e) {
      terminal.error(`[WORKFLOW] 显式持久化失败: ${e}`);
    }
  };

  // --- 自动化执行引擎 (AI 调用) ---
  const runWorkflow = async (startIndex: number = 0) => {
    terminal.log(`[WORKFLOW] 准备执行工作流: ${workflowsRef.current.find(w => w.id === activeWorkflowId)?.name}, 起始节点索引: ${startIndex}`);
    if (!globalConfig?.apiKey) {
      setError('请先在主设置中配置 API Key');
      return;
    }
    
    const currentWf = workflowsRef.current.find(w => w.id === activeWorkflowId);
    workflowManager.start(activeWorkflowId, startIndex, currentWf?.contextSnapshot);
    const startRunId = workflowManager.getCurrentRunId(); // 核心修复 (Bug 2): 锁定本次执行 ID
    
    setStopRequested(false);
    setError(null);
    stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();

    // 开启保活，防止移动端切后台导致执行中断 (不阻塞主流程)
    keepAliveManager.enable().catch(e => {
      console.warn('[Workflow] KeepAlive failed to enable:', e);
    });
    
    try {
      if (!activeNovel) {
        workflowManager.stop();
        return;
      }

      // 使用 localNovel 跟踪执行过程中的最新状态，避免闭包捕获 stale props
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        // 优化：合并状态时保留 UI 特有的折叠状态。
        const startTime = Date.now();
        // 使用 Map 优化搜索效率，将 O(N^2) 复杂度降低到 O(N)，解决章节/分卷多时的卡顿
        const currentActiveNovel = activeNovelRef.current;
        const volumeStateMap = new Map();
        (currentActiveNovel?.volumes || []).forEach(v => volumeStateMap.set(v.id, v.collapsed));

        const mergedNovel: Novel = {
          ...newNovel,
          volumes: (newNovel.volumes || []).map(v => ({
            ...v,
            collapsed: volumeStateMap.has(v.id) ? volumeStateMap.get(v.id) : v.collapsed
          }))
        };
        localNovel = mergedNovel;
        
        // 性能优化：在大型对象更新前 yield 一次，确保浏览器有时间处理用户输入
        // 只有在流式生成期间才执行此 yield，以维持 UI 响应
        if (isRunning) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        if (onUpdateNovel) {
          onUpdateNovel(mergedNovel);
        }
        const duration = Date.now() - startTime;
        if (duration > 30) {
          terminal.log(`[PERF] WorkflowEditor.updateLocalAndGlobal: ${duration}ms`);
        }
      };

      let sortedNodes = getOrderedNodes();

      if (sortedNodes.length === 0) {
        setError('工作流中没有任何节点可执行');
        workflowManager.stop();
        return;
      }
      
      // 活跃性校验闭包 (核心修复 Bug 2)
      const checkActive = () => {
        if (stopRequestedRef.current) return false;
        if (!workflowManager.isRunActive(startRunId)) {
          terminal.warn(`[Workflow] 侦测到过时执行实例 (RunID: ${startRunId})，正在拦截更新以防双倍生成。`);
          return false;
        }
        return true;
      };

      // 核心修复：重置执行路径上节点的执行状态 (不仅限于 startIndex === 0)
      // 只要是即将执行的节点（i >= startIndex），都应该确保其状态是干净的
      // 这样可以防止“从中间节点开始运行”时，循环计数器继承了上次运行的旧值导致不循环
      const resetNodeData = (n: WorkflowNode): WorkflowNode => {
        const updates: Partial<WorkflowNodeData> = {
          status: 'pending',
          outputEntries: []
        };
        
        if (n.data.typeKey === 'chapter') {
          updates.label = NODE_CONFIGS.chapter.defaultLabel;
        }

        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = {
            ...n.data.loopConfig,
            currentIndex: 0
          };
        }
        
        return { ...n, data: { ...n.data, ...updates } };
      };

      setNodes(nds => {
          const nextNodes = nds.map(n => {
            const nodeInSorted = sortedNodes.findIndex(sn => sn.id === n.id);
            // 只有当节点在当前起始位置之后时才重置，保留前序节点的完成状态和产出
            if (nodeInSorted >= startIndex) {
              return resetNodeData(n);
            }
            return n;
          });
          nodesRef.current = nextNodes; // 同步 Ref
          return nextNodes;
      });
      setEdges(eds => eds.map(e => {
        const targetInSorted = sortedNodes.findIndex(sn => sn.id === e.target);
        if (targetInSorted >= startIndex) return { ...e, animated: false };
        return e;
      }));
      
      // 同步更新本地排序后的副本快照，确保执行循环中使用的是最新的重置后数据
      sortedNodes = sortedNodes.map((sn, idx) => idx >= startIndex ? resetNodeData(sn) : sn);

      let accumContext = ''; // 累积全局和常驻上下文
      let lastNodeOutput = ''; // 累积的前序节点产出
      let currentWorkflowFolder = ''; // 当前工作流确定的文件夹名

      // 如果是从中间开始，需要重建上下文，并强制清理视觉状态冲突
      if (startIndex > 0) {
        // 核心修复：清理所有节点和连线的执行中状态，防止多点闪烁
        const cleanedNodes = nodesRef.current.map(n => {
          const sortedIdx = sortedNodes.findIndex(sn => sn.id === n.id);
          if (sortedIdx < startIndex && n.data.status === 'executing') {
            return { ...n, data: { ...n.data, status: 'completed' as const } };
          }
          return n;
        });
        nodesRef.current = cleanedNodes;
        setNodes(cleanedNodes);
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));

        for (let j = 0; j < startIndex; j++) {
          const prevNode = sortedNodes[j];
          if (prevNode.data.typeKey === 'createFolder' || prevNode.data.typeKey === 'reuseDirectory') {
            currentWorkflowFolder = prevNode.data.folderName || currentWorkflowFolder;
          } else if (prevNode.data.typeKey === 'userInput') {
            accumContext += `【全局输入】：\n${prevNode.data.instruction}\n\n`;
          } else if (prevNode.data.typeKey === 'saveToVolume') {
            // 核心修复：断点恢复时，必须从已完成的“分卷规划”节点恢复触发规则和锚点
            if (prevNode.data.splitRules && (prevNode.data.splitRules as any[]).length > 0) {
              workflowManager.setPendingSplits(prevNode.data.splitRules as any[]);
            }
            if (prevNode.data.targetVolumeId) {
              workflowManager.setActiveVolumeAnchor(prevNode.data.targetVolumeId as string);
            }
          }

          // 核心增强 (Bug 1 反馈修复)：断点恢复时，如果仍然没有锚点，从现有章节回溯
          // 核心增强 (Bug 1 反馈修复)：断点恢复时，如果仍然没有锚点，从现有章节回溯
          if (!workflowManager.getActiveVolumeAnchor() && localNovel.chapters && localNovel.chapters.length > 0) {
            // 找到最后一个有分卷 ID 的章节
            for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
              const chap = localNovel.chapters[k];
              if (chap.volumeId) {
                workflowManager.setActiveVolumeAnchor(chap.volumeId);
                terminal.log(`[Workflow] Back-traced active volume anchor from chapter "${chap.title}": ${chap.volumeId}`);
                break;
              }
            }
          }

          // 获取上一个执行完的节点的产出作为 lastNodeOutput
          // 核心修复：如果是循环回跳产生的多条历史记录，应该将所有历史记录（按时间倒序恢复为正序）都拼接到上下文中
          if (prevNode.data.outputEntries && prevNode.data.outputEntries.length > 0) {
            // outputEntries[0] 是最新的，outputEntries[length-1] 是最早的。
            // 为了让 AI 获得符合时间线的发展脉络，我们应该从旧到新拼接。
            // 因此先复制数组，翻转，然后 join。
            const allHistory = [...prevNode.data.outputEntries].reverse().map(e => e.content).join('\n\n---\n\n');
            lastNodeOutput += `【${prevNode.data.typeLabel}输出历史】：\n${allHistory}\n\n`;
          }
        }
      }
      
      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (!checkActive()) {
          workflowManager.pause(i);
          break;
        }

        // 核心修复：使用 nodesRef 获取最新的节点状态，防止闭包导致的状态陈旧
        // sortedNodes 是静态的快照，但节点内部的 data (如 status) 需要是实时的
        // 如果不这样做，当 loop 回跳重置了前面节点的状态为 'pending' 后，
        // 这里 sortedNodes[i] 拿到的可能还是之前 'completed' 的旧状态，
        // 导致下面的 if (node.data.status === 'completed') 误判跳过
        const staticNode = sortedNodes[i];
        const node = nodesRef.current.find(n => n.id === staticNode.id) || staticNode;
        workflowManager.updateProgress(i);

        // --- Pause Node Logic ---
        if (node.data.typeKey === 'pauseNode') {
          terminal.log(`[PauseNode] Pausing workflow at node index ${i}`);
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          
          // 在此处暂停，下一次 resume 时从 i + 1 开始
          workflowManager.pause(i + 1);
          
          // 设置标志位以阻止后续的 stopWorkflow() 调用 (因为我们已经进入了 pause 状态)
          stopRequestedRef.current = true;
          return;
        }

        // --- Save To Volume Node Logic (分卷规划器) ---
        if (node.data.typeKey === 'saveToVolume') {
          terminal.log(`[SaveToVolume] Executing volume planning: ${node.data.label}`);
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          
          if (!node.data.overrideAiConfig) {
            // 兼容旧逻辑：如果不开启 AI，则仅作为静态锚点或 Legacy 触发器
            let targetVolumeId = node.data.targetVolumeId as string;
            if (targetVolumeId === 'NEW_VOLUME' && node.data.targetVolumeName) {
               const newVolume = { id: `vol_${Date.now()}`, title: node.data.targetVolumeName as string, collapsed: false };
               const updatedNovel: Novel = { ...localNovel as Novel, volumes: [...(localNovel.volumes || []), newVolume] };
               await updateLocalAndGlobal(updatedNovel);
               targetVolumeId = newVolume.id;
               await syncNodeStatus(node.id, { targetVolumeId, targetVolumeName: '', status: 'completed' }, i);
            }
            if (targetVolumeId) workflowManager.setActiveVolumeAnchor(targetVolumeId);
            const rules = (node.data.splitRules as any[]) || [];
            if (rules.length > 0) workflowManager.setPendingSplits(rules);
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
            continue;
          }

          // AI 分卷规划逻辑
          // 获取对应类型的预设
          const volTypePresets = allPresets[node.data.presetType as string] || [];
          let volPresetForPlan = volTypePresets.find(p => p.id === node.data.presetId) || volTypePresets[0];

          const volNodeApiConfig = (volPresetForPlan as any)?.apiConfig || {};
          const volOpenai = new OpenAI({
            apiKey: (node.data.apiKey) ? node.data.apiKey : (volNodeApiConfig.apiKey || globalConfig.apiKey),
            baseURL: (node.data.baseUrl) ? node.data.baseUrl : (volNodeApiConfig.baseUrl || globalConfig.baseUrl),
            dangerouslyAllowBrowser: true
          });

          const planningModel = node.data.model || volNodeApiConfig.model || globalConfig.model;
          
          // 构建上下文 (对于规划节点也需要参考资料)
          // 核心修复：分卷节点上下文构建升级，支持所有参考资料类型及多模态附件
          let planningRefContext = '';
          const planningAttachments: { type: 'image' | 'pdf', url: string, name: string }[] = [];
          
          const resolvePendingRefInternal = (list: string[], sets: any[] | undefined) => {
            return list.map(id => {
              if (id && typeof id === 'string' && id.startsWith('pending:')) {
                const folderName = id.replace('pending:', '');
                const matched = sets?.find(s => s.name === folderName);
                return matched ? matched.id : id;
              }
              return id;
            });
          };

          const pWorldview = resolvePendingRefInternal([...(node.data.selectedWorldviewSets || [])], localNovel.worldviewSets);
          const pCharacters = resolvePendingRefInternal([...(node.data.selectedCharacterSets || [])], localNovel.characterSets);
          const pOutlines = resolvePendingRefInternal([...(node.data.selectedOutlineSets || [])], localNovel.outlineSets);
          const pInspirations = resolvePendingRefInternal([...(node.data.selectedInspirationSets || [])], localNovel.inspirationSets);
          const pFolders = [...(node.data.selectedReferenceFolders || [])];

          pWorldview.forEach(id => {
              const set = localNovel.worldviewSets?.find(s => s.id === id);
              if (set) planningRefContext += `【参考世界观 (${set.name})】：\n${set.entries.map(e => `· ${e.item}: ${e.setting}`).join('\n')}\n`;
          });
          pCharacters.forEach(id => {
              const set = localNovel.characterSets?.find(s => s.id === id);
              if (set) planningRefContext += `【参考角色 (${set.name})】：\n${set.characters.map(c => `· ${c.name}: ${c.bio}`).join('\n')}\n`;
          });
          pOutlines.forEach(id => {
              const set = localNovel.outlineSets?.find(s => s.id === id);
              if (set) planningRefContext += `【参考粗纲 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.summary}`).join('\n')}\n`;
          });
          pInspirations.forEach(id => {
              const set = localNovel.inspirationSets?.find(s => s.id === id);
              if (set) planningRefContext += `【参考灵感 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.content}`).join('\n')}\n`;
          });
          pFolders.forEach(folderId => {
              const folder = localNovel.referenceFolders?.find(f => f.id === folderId);
              if (folder) {
                  localNovel.referenceFiles?.filter(f => f.parentId === folderId).forEach(f => {
                      if (f.type.startsWith('text/') || f.name.endsWith('.md') || f.name.endsWith('.txt')) {
                          planningRefContext += `· 文件: ${f.name}\n内容: ${f.content}\n---\n`;
                      } else if (f.type.startsWith('image/')) {
                          planningAttachments.push({ type: 'image', url: f.content, name: f.name });
                      } else if (f.type === 'application/pdf') {
                          planningAttachments.push({ type: 'pdf', url: f.content, name: f.name });
                      }
                  });
              }
          });

          const planningFinalContextStr = `${planningRefContext}${accumContext}${lastNodeOutput ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''}`;

          const formatAtts = (text: string) => {
            if (planningAttachments.length === 0) return text;
            const content: any[] = [{ type: 'text', text }];
            planningAttachments.forEach(att => {
              if (att.type === 'image') content.push({ type: 'image_url', image_url: { url: att.url } });
              else if (att.type === 'pdf') content.push({ type: 'file', file_url: { url: att.url.startsWith('data:') ? att.url : `data:application/pdf;base64,${att.url}` } } as any);
            });
            return content;
          };

          // 构建消息
          const nodePromptItems = (node.data.promptItems as GeneratorPrompt[]) || [];
          let planningMessages: any[] = [];
          if (nodePromptItems.length > 0) {
            let hasContextPlaceholder = false;
            planningMessages = nodePromptItems.filter(p => p.enabled !== false).map(p => {
              if (p.content.includes('{{context}}')) hasContextPlaceholder = true;
              const content = workflowManager.interpolate(p.content.replace('{{context}}', planningFinalContextStr));
              return { role: p.role, content: p.role === 'user' ? formatAtts(content) : content };
            });
            // 自动补全注入逻辑
            if (!hasContextPlaceholder && planningFinalContextStr.trim()) {
              planningMessages.unshift({ role: 'user', content: formatAtts(`【参考背景与全局输入】：\n${planningFinalContextStr}`) });
            }
          } else {
            planningMessages = [
              { role: 'system', content: '你是一名拥有丰富经验特的长篇小说架构师。' },
              { role: 'user', content: formatAtts(`请根据以下参考资料和全局要求规划分卷大纲：\n\n${planningFinalContextStr}`) }
            ];
          }
          if (node.data.instruction) planningMessages.push({ role: 'user', content: workflowManager.interpolate(node.data.instruction) });

          // debug: 在 F12 打印分卷规划节点发送给 AI 的内容
          console.groupCollapsed(`[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}`);
          console.log('Messages:', planningMessages);
          console.log('Config:', {
            model: planningModel,
            temperature: node.data.temperature ?? 0.7,
          });
          console.log('Constructed Context:', planningFinalContextStr);
          console.groupEnd();

          const volCompletion = await volOpenai.chat.completions.create({
            model: planningModel,
            messages: planningMessages,
            temperature: node.data.temperature ?? 0.7,
          } as any, { signal: abortControllerRef.current?.signal });

          const aiResponse = volCompletion.choices[0]?.message?.content || '';
          terminal.log(`[SaveToVolume] AI Response:\n${aiResponse.slice(0, 300)}...`);

          // 解析 AI 响应
          const parsedRules = workflowManager.parseVolumesFromAI(aiResponse);
          if (parsedRules.length > 0) {
            // 更新节点规则
            await syncNodeStatus(node.id, {
              splitRules: parsedRules,
              volumeContent: aiResponse, // 自动同步 AI 回复到文本框
              outputEntries: [{ id: `vol_plan_${Date.now()}`, title: '分卷规划结果', content: aiResponse }],
              status: 'completed'
            }, i);
            // 更新全局触发器
            workflowManager.setPendingSplits(parsedRules);
            
            // 自动将第一卷设为当前锚点 (如果存在)
            if (parsedRules[0].nextVolumeName) {
               const existingVol = localNovel.volumes?.find(v => v.title === parsedRules[0].nextVolumeName);
               if (existingVol) {
                 workflowManager.setActiveVolumeAnchor(existingVol.id);
               }
            }
          } else {
            terminal.error('[SaveToVolume] Failed to parse any volume rules from AI response.');
            // 即使解析失败，也将内容写入 volumeContent 供用户查看并手动修改
            await syncNodeStatus(node.id, {
              status: 'failed',
              volumeContent: aiResponse,
              outputEntries: [{ id: `vol_plan_fail_${Date.now()}`, title: '分卷规划 (解析失败)', content: aiResponse }]
            }, i);
            throw new Error('无法从 AI 返回的内容中解析出分卷规划，请检查提示词或 AI 输出格式。');
          }

          // 核心修复：优先使用文本框中的内容传递给下游，实现“手动编辑可生效”
          const finalVolumeOutput = node.data.volumeContent || aiResponse;
          lastNodeOutput += `【分卷规划内容】：\n${finalVolumeOutput}\n\n`;

          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // --- Loop Node Logic ---
        if (node.data.typeKey === 'loopNode') {
          // 初始化 loopConfig
          const loopConfig = node.data.loopConfig || { enabled: true, count: 1, currentIndex: 0 };
          const currentLoopIndex = (loopConfig.currentIndex || 0) + 1;
          
          // 更新进度展示，但不立即修改全局变量，由回跳逻辑控制递增
          terminal.log(`[LoopNode] Checking loop ${currentLoopIndex} / ${loopConfig.count}`);

          // 更新状态为执行中
          await syncNodeStatus(node.id, {
            status: 'executing',
            loopConfig: { ...loopConfig, currentIndex: currentLoopIndex - 1 }
          }, i);
          
          // 视觉反馈
          setEdges(eds => eds.map(e => ({ ...e, animated: e.target === node.id })));
          await new Promise(resolve => setTimeout(resolve, 600)); // 动画展示时间

          // 核心修复：循环次数判断逻辑修正
          // currentLoopIndex 是当前正要执行（或刚执行完）的轮次
          // 如果 currentLoopIndex < loopConfig.count，说明还需要继续下一轮
          // 例如 count=2，当前是第1次（currentLoopIndex=1），1 < 2，需要回跳继续跑第2次
          // 第2次跑完后回来（currentLoopIndex=2），2 < 2 不成立，结束
          if (currentLoopIndex < loopConfig.count) {
             // 核心修复：更鲁棒的回跳目标查找
             // 只要是从 LoopNode 连出去的线，我们都认为是跳转目标
             const outEdges = edges.filter(e => e.source === node.id);
             
             if (outEdges.length > 0) {
                // 1. 优先寻找显式的“回跳”（即目标在当前节点之前）
                let targetEdge = outEdges.find(e => {
                   const idx = sortedNodes.findIndex(n => n.id === e.target);
                   return idx !== -1 && idx <= i;
                });

                // 2. 如果没找到严格的回跳（比如排序算法导致目标在后，或者这就是个单纯的跳转），
                // 则直接使用第一条出边作为目标
                if (!targetEdge) {
                   targetEdge = outEdges[0];
                }

                const targetNodeId = targetEdge.target;
                const targetIndex = sortedNodes.findIndex(n => n.id === targetNodeId);
                
                if (targetIndex !== -1) {
                   terminal.log(`[LoopNode] Looping back to node index ${targetIndex} (${sortedNodes[targetIndex].data.label})`);
                   
                   // 1. 重置循环体内节点的状态
                   const nodesToReset = sortedNodes.slice(targetIndex, i + 1);
                   const resetNodeIds = new Set(nodesToReset.map(n => n.id));
                   
                   const nextNodes = nodesRef.current.map(n => {
                      if (resetNodeIds.has(n.id)) {
                         // 保留 loopNode 的状态
                         if (n.id === node.id) return { ...n, data: { ...n.data, status: 'pending' as const, loopConfig: { ...loopConfig, currentIndex: currentLoopIndex } } };
                         
                         // 核心修复：不再清空 outputEntries，而是保留作为历史记录。
                         // UI 层已通过折叠（Accordion）处理了显示问题，context 层已改为读取全量历史。
                         return {
                           ...n,
                           data: {
                             ...n.data,
                             status: 'pending' as const,
                             // outputEntries: [], // 已移除清空逻辑，保留历史
                             label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label // 重置正文生成节点的显示状态
                           }
                         };
                      }
                      return n;
                   });
                   
                   nodesRef.current = nextNodes;
                   setNodes(nextNodes);
                   
                   // 2. 将执行指针 i 设为 targetIndex - 1 (因为循环末尾会 i++)
                   i = targetIndex - 1;
                   
                   // 3. 更新全局 loop_index 变量为下一轮的值
                   workflowManager.setContextVar('loop_index', currentLoopIndex + 1);

                   // 4. 更新 LoopNode 自身的计数状态
                   await syncNodeStatus(node.id, {
                      status: 'pending',
                      loopConfig: { ...loopConfig, currentIndex: currentLoopIndex }
                   }, i);
                   
                   continue;
                }
             }
          } else {
             // 循环结束
             terminal.log(`[LoopNode] Loop completed.`);
             // 核心修复：循环结束时显式重置 currentIndex 为 0，防止状态残留
             await syncNodeStatus(node.id, {
                status: 'completed',
                loopConfig: { ...loopConfig, currentIndex: 0 }
             }, i);

             // 核心修复：如果循环执行器是在循环体之前的（Head模式），执行结束时需要跳过整个循环体
             // 寻找物理连线中连回此节点的“最远”节点（Tail）
             const inEdges = edges.filter(e => e.target === node.id);
             let maxTailIndex = i;
             inEdges.forEach(e => {
                const tailIdx = sortedNodes.findIndex(sn => sn.id === e.source);
                if (tailIdx > maxTailIndex) maxTailIndex = tailIdx;
             });
             
             if (maxTailIndex > i) {
                terminal.log(`[LoopNode] Skipping loop body, jumping past index ${maxTailIndex}`);
                i = maxTailIndex;
                // 这样下一次 for 循环 i++ 后，将执行循环体之后的节点
             }
          }
          
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          // 如果循环结束，继续执行后续节点（如果有）
          continue;
        }

        if (node.data.skipped) {
          // 核心修复：必须同时更新 Ref，否则会被后续步骤的 syncNodeStatus 回滚状态
          const nextNodes = nodesRef.current.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' as const } } : n);
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          // 确保跳过时也清理可能残留的连线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }
        
        // 更新节点状态为正在执行，并即时同步到磁盘
        await syncNodeStatus(node.id, { status: 'executing' }, i);
        
        // 核心修复：先全量关闭动画，再激活当前节点的输入线，确保视觉焦点唯一
        setEdges(eds => eds.map(e => ({
          ...e,
          animated: e.target === node.id
        })));

        // 核心修复：在状态更新后强制 yield，确保 React 有机会渲染 "executing" 状态和动画起效
        await new Promise(resolve => setTimeout(resolve, 50));

        // 视觉反馈增强：为非 AI 调用节点增加最小执行感，确保用户能看到脉冲发光提示
        if (node.data.typeKey === 'userInput' || node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // 注入当前循环轮次的特定指令
        const currentLoopIndex = workflowManager.getContextVar('loop_index') || 1;
        const loopInstructions = node.data.loopInstructions as LoopInstruction[] || [];
        const specificInstruction = loopInstructions.find(inst => inst.index === currentLoopIndex)?.content || '';
        
        // 核心修复：循环特定指令应当只针对当前节点生效，不应污染全局累积上下文 (accumContext)
        let nodeLoopContext = '';
        if (specificInstruction) {
           nodeLoopContext = `\n【第 ${currentLoopIndex} 轮循环特定指令】：\n${specificInstruction}\n`;
        }

        // 处理创建文件夹节点
        if (node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          // 如果节点指定了目录名，则切换；如果复用节点没填目录，则保持当前已有的目录名
          if (node.data.folderName) {
            currentWorkflowFolder = node.data.folderName;
          }
          
          if (node.data.typeKey === 'reuseDirectory') {
             // 复用目录节点仅切换当前上下文中的目录名，不重新创建
             await syncNodeStatus(node.id, { status: 'completed' }, i);
             continue;
          }

          if (currentWorkflowFolder) {
            const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
              const existing = sets?.find(s => (s.name || s.title) === name);
              if (existing) return { id: existing.id, isNew: false, set: existing };
              const newSet = creator();
              return { id: newSet.id, isNew: true, set: newSet };
            };

            const updatedNovel = { ...localNovel };
            let changed = false;

            // 不再自动创建同名分卷，改由分卷规划节点负责
            const volumeResult: { id: string; isNew: boolean; set: any } = { id: '', isNew: false, set: null };
            const existingVol = updatedNovel.volumes?.find(v => v.title === currentWorkflowFolder);
            if (existingVol) {
              volumeResult.id = existingVol.id;
              volumeResult.set = existingVol;
              workflowManager.setActiveVolumeAnchor(existingVol.id);
            }

            const worldviewResult = createSetIfNotExist(updatedNovel.worldviewSets, currentWorkflowFolder, () => ({
              id: `wv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              entries: [],
            }));
            if (worldviewResult.isNew) {
              updatedNovel.worldviewSets = [...(updatedNovel.worldviewSets || []), worldviewResult.set];
              changed = true;
            }

            const characterResult = createSetIfNotExist(updatedNovel.characterSets, currentWorkflowFolder, () => ({
              id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              characters: [],
            }));
            if (characterResult.isNew) {
              updatedNovel.characterSets = [...(updatedNovel.characterSets || []), characterResult.set];
              changed = true;
            }

            const outlineResult = createSetIfNotExist(updatedNovel.outlineSets, currentWorkflowFolder, () => ({
              id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (outlineResult.isNew) {
              updatedNovel.outlineSets = [...(updatedNovel.outlineSets || []), outlineResult.set];
              changed = true;
            }

            const inspirationResult = createSetIfNotExist(updatedNovel.inspirationSets, currentWorkflowFolder, () => ({
              id: `insp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (inspirationResult.isNew) {
              updatedNovel.inspirationSets = [...(updatedNovel.inspirationSets || []), inspirationResult.set];
              changed = true;
            }

            const plotOutlineResult = createSetIfNotExist(updatedNovel.plotOutlineSets, currentWorkflowFolder, () => ({
              id: `plot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (plotOutlineResult.isNew) {
              updatedNovel.plotOutlineSets = [...(updatedNovel.plotOutlineSets || []), plotOutlineResult.set];
              changed = true;
            }

            if (changed) {
              await updateLocalAndGlobal(updatedNovel);
            }

            // 目录创建后，仅负责将正文生成节点关联到新分卷，不再进行资料集的自动转换和强行勾选
            const nextNodesAfterFolder = nodesRef.current.map(n => ({
              ...n,
              data: {
                ...n.data,
                // 仅自动将生成的章节关联到新创建的分卷，除非用户已手动指定
                targetVolumeId: (n.data.typeKey === 'chapter' && (!n.data.targetVolumeId || n.data.targetVolumeId === ''))
                  ? volumeResult.id
                  : n.data.targetVolumeId
              }
            }));
            nodesRef.current = nextNodesAfterFolder;
            setNodes(nextNodesAfterFolder);
          }
          // 更新节点状态为已完成
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          // V2: Interpolate instruction (allow dynamic prompts in user input node)
          const interpolatedInput = workflowManager.interpolate(node.data.instruction);
          accumContext += `【全局输入】：\n${interpolatedInput}\n\n`;

          // V2: Variable Binding (Capture input to variables)
          if (node.data.variableBinding && node.data.variableBinding.length > 0) {
             workflowManager.processVariableBindings(node.data.variableBinding, interpolatedInput);
          }

          // 更新节点状态为已完成
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }

        // --- 智能工作流生成逻辑拦截 ---
        if (node.data.typeKey === 'workflowGenerator') {
          if (nodesRef.current.length > 1) {
            throw new Error('“智能生成工作流”节点必须在空画布上运行。请移除其他节点。');
          }

          // 寻找对应预设
          const genPresets = (allPresets as any).generator || [];
          const genPreset = genPresets.find((p: any) => p.id === node.data.presetId) || genPresets[0];

          const genOpenai = new OpenAI({
            apiKey: (node.data.overrideAiConfig && node.data.apiKey) ? node.data.apiKey : (genPreset?.apiConfig?.apiKey || globalConfig.apiKey),
            baseURL: (node.data.overrideAiConfig && node.data.baseUrl) ? node.data.baseUrl : (genPreset?.apiConfig?.baseUrl || globalConfig.baseUrl),
            dangerouslyAllowBrowser: true
          });

          // 构建生成专用消息
          let generatorMessages: any[] = [];
          
          if (node.data.overrideAiConfig && node.data.promptItems && node.data.promptItems.length > 0) {
            // 使用自定义提示词
            generatorMessages = node.data.promptItems
              .filter(p => p.enabled !== false)
              .map(p => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', WORKFLOW_DSL_PROMPT)
              }));
            // 始终将需求描述作为独立消息发送
            if (node.data.instruction) {
              generatorMessages.push({ role: 'user', content: node.data.instruction });
            }
          } else if (genPreset && genPreset.prompts) {
            // 使用预设提示词
            generatorMessages = genPreset.prompts
              .filter((p: any) => p.enabled)
              .map((p: any) => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', WORKFLOW_DSL_PROMPT)
              }));
            // 始终将需求描述作为独立消息发送
            if (node.data.instruction) {
              generatorMessages.push({ role: 'user', content: node.data.instruction });
            }
          } else {
            // 默认兜底消息
            generatorMessages = [
              { role: 'system', content: WORKFLOW_DSL_PROMPT },
              { role: 'user', content: `用户需求：${node.data.instruction || '请生成一个标准的长篇小说创作工作流'}\n\n是否自动填写内容：${node.data.autoFillContent ? '是' : '否'}` }
            ];
          }

          const genCompletion = await genOpenai.chat.completions.create({
            model: (node.data.overrideAiConfig && node.data.model) ? node.data.model : (genPreset?.apiConfig?.model || globalConfig.model),
            messages: generatorMessages,
            temperature: (node.data.overrideAiConfig && node.data.temperature !== undefined) ? node.data.temperature : (genPreset?.temperature ?? 0.7),
          });

          const aiResponse = genCompletion.choices[0]?.message?.content || '';
          
          try {
            // 解析 JSON
            let dslData: { nodes: any[], edges: any[] };
            const cleanJson = aiResponse.replace(/```json\s*([\s\S]*?)```/gi, '$1').trim();
            dslData = JSON.parse(cleanJson);

            if (!dslData.nodes || !Array.isArray(dslData.nodes)) throw new Error('AI 返回的节点数据格式不正确');

            // 转换节点
            const newNodes: WorkflowNode[] = dslData.nodes.map((n, idx) => {
              const config = NODE_CONFIGS[n.typeKey as NodeTypeKey] || NODE_CONFIGS.aiChat;
              const { icon, ...serializableConfig } = config;
              
              return {
                id: n.id || `node_${Date.now()}_${idx}`,
                type: 'custom',
                data: {
                  ...serializableConfig,
                  typeKey: n.typeKey,
                  label: n.label || config.defaultLabel,
                  presetId: '',
                  presetName: '',
                  instruction: n.instruction || '',
                  folderName: n.folderName || '',
                  selectedWorldviewSets: [],
                  selectedCharacterSets: [],
                  selectedOutlineSets: [],
                  selectedInspirationSets: [],
                  selectedReferenceFolders: [],
                  outputEntries: [],
                  targetVolumeId: n.typeKey === 'chapter' ? '' : (activeNovel?.volumes[0]?.id || ''),
                  targetVolumeName: '',
                },
                position: {
                  x: (idx % 4) * 320 + 100,
                  y: Math.floor(idx / 4) * 180 + 250
                } // 4列网格换行布局
              };
            });

            // 转换边
            const newEdges: Edge[] = (dslData.edges || []).map((e, idx) => ({
              id: e.id || `edge_${Date.now()}_${idx}`,
              source: e.source,
              target: e.target,
              type: 'custom',
              animated: false
            }));

            // 核心操作：替换画布
            setNodes(newNodes);
            nodesRef.current = newNodes;
            setEdges(newEdges);
            
            terminal.log(`[WORKFLOW] 智能生成完成，已部署 ${newNodes.length} 个节点。`);
            
            // 立即停止当前工作流执行，因为生成节点已经消失，工作流结构已彻底改变
            workflowManager.stop();
            keepAliveManager.disable();
            return;

          } catch (parseErr: any) {
            console.error('DSL Parse Error:', parseErr, aiResponse);
            throw new Error(`无法解析 AI 返回的工作流协议: ${parseErr.message}\nAI回复内容：${aiResponse.substring(0, 100)}...`);
          }
        }

        // 1. 获取对应类型的预设
        let typePresets = allPresets[node.data.presetType as string] || [];
        
        if (node.data.typeKey === 'aiChat') {
          const allAvailablePresets = Object.values(allPresets).flat();
          typePresets = allAvailablePresets;
        }

        let preset = typePresets.find(p => p.id === node.data.presetId);
        if (!preset && node.data.typeKey !== 'aiChat' && node.data.presetType !== null) {
          preset = typePresets[0];
          if (!preset) continue;
        }

        // 2. 构建参考资料上下文 (Context) & 附件 (Attachments)
        let refContext = '';
        const attachments: { type: 'image' | 'pdf', url: string, name: string }[] = [];
        
        // 优先使用节点选中的资料集，如果没有选中且存在当前工作流文件夹，则尝试自动匹配
        let selectedWorldview = [...(node.data.selectedWorldviewSets || [])];
        let selectedCharacters = [...(node.data.selectedCharacterSets || [])];
        let selectedOutlines = [...(node.data.selectedOutlineSets || [])];
        let selectedInspirations = [...(node.data.selectedInspirationSets || [])];
        let selectedFolders = [...(node.data.selectedReferenceFolders || [])];

        // 核心逻辑：解析 pending: 引用
        const resolvePendingRef = (list: string[], sets: any[] | undefined) => {
          return list.map(id => {
            if (id && typeof id === 'string' && id.startsWith('pending:')) {
              const folderName = id.replace('pending:', '');
              const matched = sets?.find(s => s.name === folderName);
              return matched ? matched.id : id;
            }
            return id;
          });
        };

        selectedWorldview = resolvePendingRef(selectedWorldview, localNovel.worldviewSets);
        selectedCharacters = resolvePendingRef(selectedCharacters, localNovel.characterSets);
        selectedOutlines = resolvePendingRef(selectedOutlines, localNovel.outlineSets);
        selectedInspirations = resolvePendingRef(selectedInspirations, localNovel.inspirationSets);


        selectedWorldview.forEach(id => {
            const set = localNovel.worldviewSets?.find(s => s.id === id);
            if (set) refContext += `【参考世界观 (${set.name})】：\n${set.entries.map(e => `· ${e.item}: ${e.setting}`).join('\n')}\n`;
        });
        selectedCharacters.forEach(id => {
            const set = localNovel.characterSets?.find(s => s.id === id);
            if (set) refContext += `【参考角色 (${set.name})】：\n${set.characters.map(c => `· ${c.name}: ${c.bio}`).join('\n')}\n`;
        });
        selectedOutlines.forEach(id => {
            const set = localNovel.outlineSets?.find(s => s.id === id);
            if (set) refContext += `【参考粗纲 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.summary}`).join('\n')}\n`;
        });
        selectedInspirations.forEach(id => {
            const set = localNovel.inspirationSets?.find(s => s.id === id);
            if (set) refContext += `【参考灵感 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.content}`).join('\n')}\n`;
        });
        
        selectedFolders.forEach(folderId => {
            const folder = localNovel.referenceFolders?.find(f => f.id === folderId);
            if (folder) {
                const folderFiles = localNovel.referenceFiles?.filter(f => f.parentId === folderId) || [];
                if (folderFiles.length > 0) {
                    refContext += `【参考资料库文件夹 (${folder.name})】：\n`;
                    folderFiles.forEach(f => {
                        const isText = f.type.startsWith('text/') || f.name.endsWith('.md') || f.name.endsWith('.txt');
                        const isImage = f.type.startsWith('image/');
                        const isPdf = f.type === 'application/pdf';

                        if (isText) {
                            refContext += `· 文件: ${f.name}\n内容: ${f.content}\n---\n`;
                        } else if (isImage) {
                            refContext += `· 图片文件: ${f.name} (已作为附件发送)\n`;
                            attachments.push({ type: 'image', url: f.content, name: f.name });
                        } else if (isPdf) {
                            refContext += `· PDF文件: ${f.name} (已作为附件发送)\n`;
                            attachments.push({ type: 'pdf', url: f.content, name: f.name });
                        } else {
                            refContext += `· 文件: ${f.name} (非文本格式，仅供参考文件名)\n`;
                        }
                    });
                }
            }
        });

        // 3. 构建消息
        // 去重逻辑：如果上个节点的输出已经包含在参考资料中，则不再重复追加 lastNodeOutput
        const isDuplicate = lastNodeOutput && refContext.includes(lastNodeOutput.substring(0, 100)); // 取前100字符判断
        // 核心修复：将 nodeLoopContext (当前循环指令) 拼接到最终上下文中，而不是 accumContext
        const finalContext = `${refContext}${accumContext}${nodeLoopContext}${(!isDuplicate && lastNodeOutput) ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''}`;
        
        // 辅助函数：将 string 内容转换为 OpenAI 多模态 content 格式
        const formatContentWithAttachments = (text: string) => {
          if (attachments.length === 0) return text;
          const content: any[] = [{ type: 'text', text }];
          attachments.forEach(att => {
            if (att.type === 'image') {
              content.push({ type: 'image_url', image_url: { url: att.url } });
            } else if (att.type === 'pdf') {
              // 注意：并非所有模型都支持 PDF 附件，此处按 OpenAI 兼容格式或 base64 文本补充提示
              // 目前 OpenAI API 主要是通过 Vision 支持图片，PDF 通常需要提取文本或使用 Assistants API
              // 但为了满足用户“作为附件发送”的需求，我们尝试以多模态方式构造，或在 text 中补充说明
              // 如果模型不支持，会由 AI 接口返回报错。
              // 兼容性处理：对于 PDF，如果模型不支持，至少我们目前已经将文件名告知 AI 了。
              // 有些兼容 OpenAI 的多模态接口（如 Claude/Gemini）支持 PDF 附件。
              content.push({
                type: 'file',
                file_url: { url: att.url.startsWith('data:') ? att.url : `data:application/pdf;base64,${att.url}` }
              } as any);
            }
          });
          return content;
        };

        let messages: any[] = [];
        
        if (node.data.typeKey === 'aiChat' && !preset) {
            // AI 聊天且未选预设的情况，使用最简单的 User 消息
            messages = [{
              role: 'user',
              content: formatContentWithAttachments(`${finalContext}要求：${node.data.instruction || '请继续生成'}`)
            }];
        } else if (preset) {
          if (node.data.typeKey === 'chapter') {
            // 对话补全源 (CompletionPreset) 的处理
            const completionPreset = preset as any; // 转换类型
            const prompts = completionPreset.prompts || [];
            messages = prompts
              .filter((p: any) => p.active)
              .map((p: any) => {
                const content = p.content
                  .replace('{{context}}', finalContext);
                return {
                  role: p.role,
                  content: p.role === 'user' ? formatContentWithAttachments(content) : content
                };
              });
            // 始终将指令作为独立消息发送
            if (node.data.instruction) {
              messages.push({ role: 'user', content: formatContentWithAttachments(node.data.instruction) });
            }
          } else {
            // 普通生成预设 (GeneratorPreset) 的处理
            messages = (preset.prompts || [])
              .filter(p => p.enabled)
              .map(p => {
                const content = p.content
                  .replace('{{context}}', finalContext);
                return {
                  role: p.role,
                  content: p.role === 'user' ? formatContentWithAttachments(content) : content
                };
              });
            // 始终将指令作为独立消息发送
            if (node.data.instruction) {
              messages.push({ role: 'user', content: formatContentWithAttachments(node.data.instruction) });
            }
          }
        }

        if (messages.length === 0) messages.push({ role: 'user', content: node.data.instruction || '请生成内容' });

        // 4. 处理正文生成节点 (使用专用的 AutoWriteEngine，跳过通用的单次 AI 调用)
        if (node.data.typeKey === 'chapter') {
          if (!globalConfig) {
            throw new Error('缺失全局配置');
          }

          // 1. 寻找匹配的大纲集
          let selectedOutlineSetId = node.data.selectedOutlineSets && node.data.selectedOutlineSets.length > 0
            ? resolvePendingRef([node.data.selectedOutlineSets[0]], localNovel.outlineSets)[0]
            : null;

          // 如果节点没选大纲集，尝试自动匹配当前工作目录或节点自身关联目录对应的大纲集
          if (!selectedOutlineSetId || selectedOutlineSetId.startsWith('pending:')) {
             const targetFolder = currentWorkflowFolder || node.data.folderName;
             const matched = localNovel.outlineSets?.find(s => s.name === targetFolder);
             if (matched) {
               selectedOutlineSetId = matched.id;
             } else if (!targetFolder && localNovel.outlineSets && localNovel.outlineSets.length > 0) {
               // 如果没有任何目录上下文，且只有一个大纲集，则尝试兜底使用它
               if (localNovel.outlineSets.length === 1) {
                 selectedOutlineSetId = localNovel.outlineSets[0].id;
               }
             }
          }

          let currentSet = localNovel.outlineSets?.find(s => s.id === selectedOutlineSetId);
          
          if (node.data.typeKey === 'chapter') {
            if (!currentSet || !currentSet.items || currentSet.items.length === 0) {
              // 最后尝试：如果仍然没找到，但有正在执行的工作流目录，可能大纲集刚被创建但状态未同步
              const fallbackSet = localNovel.outlineSets?.find(s => s.name === (currentWorkflowFolder || node.data.folderName)) ||
                                 localNovel.outlineSets?.[localNovel.outlineSets.length - 1];
              
              if (fallbackSet && fallbackSet.items && fallbackSet.items.length > 0) {
                currentSet = fallbackSet;
                terminal.log(`[Workflow] Chapter node auto-recovered outline set: ${currentSet.name}`);
              } else {
                const folderDesc = currentWorkflowFolder ? `目录 "${currentWorkflowFolder}"` : (node.data.folderName ? `关联目录 "${node.data.folderName}"` : '未指定目录');
                throw new Error(`未关联大纲集或关联的大纲集内容为空 (${folderDesc})。请检查：1. 前置大纲节点是否已成功运行并产生内容 2. 节点属性中是否已勾选对应的大纲集 3. 目录名是否匹配`);
              }
            }
          }

          // 2. 确定最终分卷 ID (此处必须实时从 localNovel 中获取，确保能感知到刚创建的分卷)
          // 优先级 0: 检查上下文中的 Active Volume Anchor (由 SaveToVolume 节点设置)
          let finalVolumeId = workflowManager.getActiveVolumeAnchor() || '';
          
          // 获取最新的分卷列表（从执行中的内存状态获取）
          const latestVolumes = localNovel.volumes || [];

          // 验证 Anchor 有效性
          if (finalVolumeId) {
             if (!latestVolumes.some(v => v.id === finalVolumeId)) {
                terminal.warn(`[Workflow] Cached anchor ${finalVolumeId} is invalid. Clearing.`);
                finalVolumeId = ''; // Anchor 失效
             }
          }

          // 核心增强 (Bug 1 反馈修复)：回溯逻辑。
          // 如果当前没有锚点，向上回溯最近一个已存在的章节所属的分卷
          // 核心增强 (Bug 1 反馈修复)：回溯逻辑。
          // 如果当前没有锚点，向上回溯最近一个已存在的章节所属的分卷
          if (!finalVolumeId && localNovel.chapters && localNovel.chapters.length > 0) {
            for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
              const chapVolId = localNovel.chapters[k].volumeId;
              if (chapVolId) {
                finalVolumeId = chapVolId;
                workflowManager.setActiveVolumeAnchor(finalVolumeId);
                terminal.log(`[Workflow] Engine recovered volume anchor from existing chapters: ${finalVolumeId}`);
                break;
              }
            }
          }

          // 兼容性/兜底逻辑: 自动匹配逻辑 (针对“自动匹配分卷”模式)
          if (!finalVolumeId || finalVolumeId === '') {
            // 尝试匹配与当前工作流文件夹同名的分卷
            const matchedVol = latestVolumes.find(v => v.title === currentWorkflowFolder);
            if (matchedVol) {
              finalVolumeId = matchedVol.id;
              // 自动将找到的分卷设为 Anchor，以便后续节点复用
              workflowManager.setActiveVolumeAnchor(finalVolumeId);
            }
          }

          // 优先级 3: 最终兜底逻辑 (使用第一个分卷)
          if (!finalVolumeId || finalVolumeId === '') {
            if (latestVolumes.length > 0) {
              finalVolumeId = latestVolumes[0].id;
              workflowManager.setActiveVolumeAnchor(finalVolumeId);
            }
          }

          // 3. 确定配置 (优先使用节点配置，其次是预设配置)
          const nodeApiConfig = (preset as any)?.apiConfig || {};
          const engineConfig = {
            apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
            baseUrl: nodeApiConfig.baseUrl || globalConfig.baseUrl,
            model: node.data.overrideAiConfig && node.data.model ? node.data.model : (nodeApiConfig.model || globalConfig.model),
            contextLength: (preset as any)?.contextLength || globalConfig.contextLength,
            maxReplyLength: node.data.overrideAiConfig && node.data.maxTokens ? node.data.maxTokens : ((preset as any)?.maxReplyLength || globalConfig.maxReplyLength),
            temperature: node.data.overrideAiConfig && node.data.temperature !== undefined ? node.data.temperature : ((preset as any)?.temperature ?? globalConfig.temperature),
            topP: node.data.overrideAiConfig && node.data.topP !== undefined ? node.data.topP : ((preset as any)?.topP ?? globalConfig.topP),
            topK: node.data.overrideAiConfig && node.data.topK !== undefined ? node.data.topK : ((preset as any)?.topK ?? globalConfig.topK),
            stream: (preset as any)?.stream ?? globalConfig.stream,
            maxRetries: globalConfig.maxRetries,
            systemPrompt: (node.data.overrideAiConfig
              ? (node.data.promptItems && (node.data.promptItems as any[]).length > 0
                  ? (node.data.promptItems as any[]).filter(p => p.enabled !== false && p.role === 'system').map(p => p.content).join('\n\n')
                  : (node.data.systemPrompt as string || localNovel.systemPrompt || '你是一个专业的小说家。'))
              : (localNovel.systemPrompt || '你是一个专业的小说家。')) + nodeLoopContext,
            globalCreationPrompt: globalConfig.globalCreationPrompt,
            longTextMode: globalConfig.longTextMode,
            autoOptimize: globalConfig.autoOptimize,
            twoStepOptimization: globalConfig.twoStepOptimization,
            contextChapterCount: globalConfig.contextChapterCount,
            maxConcurrentOptimizations: globalConfig.maxConcurrentOptimizations,
            consecutiveChapterCount: globalConfig.consecutiveChapterCount || 1,
            smallSummaryInterval: globalConfig.smallSummaryInterval,
            bigSummaryInterval: globalConfig.bigSummaryInterval,
            smallSummaryPrompt: globalConfig.smallSummaryPrompt,
            bigSummaryPrompt: globalConfig.bigSummaryPrompt,
            outlineModel: globalConfig.outlineModel,
            optimizeModel: globalConfig.optimizeModel,
            analysisModel: globalConfig.analysisModel,
            optimizePresets: globalConfig.optimizePresets,
            activeOptimizePresetId: globalConfig.activeOptimizePresetId,
            analysisPresets: globalConfig.analysisPresets,
            activeAnalysisPresetId: globalConfig.activeAnalysisPresetId,
          };

          // 4. 初始化引擎
          const engine = new AutoWriteEngine({
            ...engineConfig,
            contextChapterCount: globalConfig.contextChapterCount,
          }, localNovel);

          // 4. 计算起始索引
          let writeStartIndex = 0;
          const items = currentSet?.items || [];
          for (let k = 0; k < items.length; k++) {
            const item = items[k];
            // 核心修复：全自动创作查重逻辑优化。
            // 如果标题符合“第X章”的标准格式，则进行全书查重，防止因分卷 ID 偏移导致的重复生成。
            // 如果是非标准标题，则维持分卷隔离。
            const isStandardChapter = /^第?\s*[0-9零一二两三四五六七八九十百千]+\s*[章节]/.test(item.title);
            const existingChapter = localNovel.chapters?.find(c => {
              if (isStandardChapter) {
                return c.title === item.title;
              }
              return (
                c.title === item.title &&
                ((finalVolumeId && c.volumeId === finalVolumeId) ||
                  (!finalVolumeId && (!c.volumeId || c.volumeId === '')))
              );
            });
            if (!existingChapter || !existingChapter.content || existingChapter.content.trim().length === 0) {
              writeStartIndex = k;
              break;
            }
            if (k === items.length - 1) writeStartIndex = items.length;
          }

          if (writeStartIndex >= items.length) {
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            continue;
          }

          // 4. 执行自动化创作
          await engine.run(
            items,
            writeStartIndex,
            globalConfig.prompts.filter(p => p.active),
            () => {
              // 核心修复：工作流执行时，必须根据当前节点所选的 AI 预设来合并正则脚本
              const baseScripts = globalConfig.getActiveScripts() || [];
              const presetScripts = (preset as any)?.regexScripts || [];
              return [...baseScripts, ...presetScripts];
            },
            (status) => {
              // 更新节点标签以显示进度，如果状态包含“完成”、“失败”、“跳过”等结束语，则直接显示
              const isTerminal = status.includes('完成') || status.includes('失败') || status.includes('跳过') || status.includes('错误');
              const displayStatus = isTerminal ? status : `创作中: ${status}`;
              updateNodeData(node.id, { label: displayStatus });
            },
            (updatedNovel) => {
              // 核心修复 4.2：增量合并逻辑 (Merge Delta)
              // 由于 Engine 现在仅发送发生变化的章节，我们需要在此处将其合并回 localNovel
              const allLocalChaptersMap = new Map((localNovel.chapters || []).map(c => [c.id, c]));
              
              for (const deltaChapter of (updatedNovel.chapters || [])) {
                const localChapter = allLocalChaptersMap.get(deltaChapter.id);
                if (localChapter) {
                  allLocalChaptersMap.set(deltaChapter.id, { ...localChapter, ...deltaChapter });
                } else {
                  allLocalChaptersMap.set(deltaChapter.id, deltaChapter);
                }
              }
              
              if (!checkActive()) return;
              localNovel = { ...localNovel, chapters: Array.from(allLocalChaptersMap.values()) };
              updateLocalAndGlobal(localNovel);
            },
            async (chapterId, content, updatedNovel) => {
              if (!checkActive()) return;
              if (updatedNovel) {
                localNovel = updatedNovel;
              }

              if (globalConfig.onChapterComplete) {
                // 核心修复 (Bug 2): PC 工作流总结任务也锁定 RunID
                const result = await (globalConfig.onChapterComplete as any)(chapterId, content, updatedNovel, false, startRunId);
                if (result && typeof result === 'object' && (result as Novel).chapters) {
                  localNovel = result as Novel;
                }
              }
              // 正文生成节点不再维护 outputEntries 列表，因为内容直接写入目录
              // 核心修复：必须将最新的 localNovel 返回给引擎
              return localNovel;
            },
            async (title) => {
              // --- 核心修复：提前进行分卷预检 ---
              const trigger = workflowManager.checkTriggerSplit(title);
              if (trigger) {
                terminal.log(`[Workflow] Triggering PRE-CHAPTER automatic volume split at "${trigger.chapterTitle}"`);
                const nextVolName = trigger.nextVolumeName || '新分卷';

                // 1. 核心修复：分卷创建幂等化。先查找是否已存在同名分卷，防止重复创建导致的 ID 偏移
                const existingVol = localNovel.volumes?.find(v => v.title === nextVolName);
                let targetVolId = '';
                let splitNovel = { ...localNovel };

                if (existingVol) {
                  targetVolId = existingVol.id;
                  terminal.log(`[Workflow] Reusing existing volume: ${nextVolName} (${targetVolId})`);
                } else {
                  // 只有不存在时才创建新 ID
                  const newVolume = {
                    id: `vol_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    title: nextVolName,
                    collapsed: false
                  };
                  targetVolId = newVolume.id;
                  splitNovel = {
                    ...localNovel,
                    volumes: [...(localNovel.volumes || []), newVolume]
                  };
                  terminal.log(`[Workflow] Created new volume: ${nextVolName} (${targetVolId})`);
                }

                // 2. 立即更新 UI 和内存快照
                await updateLocalAndGlobal(splitNovel);

                // 3. 设置为新的 Active Anchor，并标记该触发规则已处理
                workflowManager.setActiveVolumeAnchor(targetVolId);
                workflowManager.markSplitProcessed(trigger.chapterTitle);

                terminal.log(`[Workflow] Pre-chapter split complete. Target volume will be: ${nextVolName} (${targetVolId})`);
                
                // 4. 返回最新的小说对象和新的分卷 ID 给引擎，实现原子化同步
                return {
                  updatedNovel: splitNovel,
                  newVolumeId: targetVolId
                };
              }
            },
            finalVolumeId,
            true, // 核心修复 (Bug 3): 开启大纲注入开关，允许后续章节大纲发送给 AI
            selectedOutlineSetId,
            abortControllerRef.current?.signal,
            startRunId // 核心修复 (Bug 2): 透传锁定的 ID
          );

          // 核心修复 (Bug 2): 引擎运行结束后，再次校验 ID
          if (!checkActive()) {
            terminal.log('[Workflow] Engine returned but RunID is inactive. Silently stopping UI updates.');
            return;
          }

          await syncNodeStatus(node.id, {
            label: NODE_CONFIGS.chapter.defaultLabel,
            status: 'completed'
          }, i);

          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // 5. 调用 AI (针对设定生成、AI 聊天等节点)

        // V2: Global Interpolation for all messages before sending
        messages = messages.map(m => {
          if (typeof m.content === 'string') {
            return { ...m, content: workflowManager.interpolate(m.content) };
          }
          // Handle array content (multimodal) if needed
          if (Array.isArray(m.content)) {
             return {
                ...m,
                content: m.content.map((c: any) => {
                   if (c.type === 'text') return { ...c, text: workflowManager.interpolate(c.text) };
                   return c;
                })
             };
          }
          return m;
        });

        const nodeApiConfig = preset?.apiConfig || {};
        
        // 确定该功能模块对应的全局模型设置
        let featureModel = globalConfig.model;
        if (node.data.typeKey === 'outline') featureModel = globalConfig.outlineModel;
        else if (node.data.typeKey === 'characters') featureModel = globalConfig.characterModel;
        else if (node.data.typeKey === 'worldview') featureModel = globalConfig.worldviewModel;
        else if (node.data.typeKey === 'inspiration') featureModel = globalConfig.inspirationModel;
        else if (node.data.typeKey === 'plotOutline') featureModel = globalConfig.plotOutlineModel;

        const finalModel = (node.data.overrideAiConfig && node.data.model) ? node.data.model : (nodeApiConfig.model || featureModel || globalConfig.model);
        const finalTemperature = (node.data.overrideAiConfig && node.data.temperature !== undefined) ? node.data.temperature : (preset?.temperature ?? globalConfig.temperature);
        const finalTopP = (node.data.overrideAiConfig && node.data.topP !== undefined) ? node.data.topP : (preset?.topP ?? globalConfig.topP);
        const finalTopK = (node.data.overrideAiConfig && node.data.topK !== undefined) ? node.data.topK : ((preset as any)?.topK ?? globalConfig.topK);
        const finalMaxTokens = (node.data.overrideAiConfig && node.data.maxTokens) ? node.data.maxTokens : undefined;

        // 如果设置了节点特定的提示词条目，优先使用
        if (node.data.overrideAiConfig) {
          const nodePromptItems = (node.data.promptItems as GeneratorPrompt[]) || [];
          if (nodePromptItems.length > 0) {
            // 如果使用了多条目系统，则替换整个 messages 列表
            let hasContextPlaceholder = false;
            messages = nodePromptItems
              .filter(p => p.enabled !== false)
              .map(p => {
                if (p.content.includes('{{context}}')) hasContextPlaceholder = true;
                return {
                  role: p.role,
                  content: p.role === 'user' ? formatContentWithAttachments(p.content
                    .replace('{{context}}', finalContext)) : (p.content
                    .replace('{{context}}', finalContext))
                };
              });
            // 始终将指令作为独立消息发送
            if (node.data.instruction) {
              messages.push({ role: 'user', content: formatContentWithAttachments(node.data.instruction) });
            }
            
            // 如果用户自定义的提示词中完全没有包含 {{context}}，则为了满足用户“直接给”的需求，
            // 强制将 finalContext 作为一个单独的 User 消息插入到最前面，确保 AI 能接收到全局输入
            if (!hasContextPlaceholder && finalContext.trim()) {
              messages.unshift({
                role: 'user',
                content: formatContentWithAttachments(`【参考背景与全局输入】：\n${finalContext}`)
              });
            }
          } else if (node.data.systemPrompt) {
            // 兼容旧的单一 systemPrompt
            if (messages.length > 0 && messages[0].role === 'system') {
              messages[0] = { ...messages[0], content: node.data.systemPrompt as string };
            } else {
              messages.unshift({ role: 'system', content: node.data.systemPrompt as string });
            }
            
            // 同样，在这种模式下如果消息中没包含 context，也补充进去
            if (finalContext.trim() && !messages.some(m => m.content.includes(finalContext.substring(0, 20)))) {
               messages.push({ role: 'user', content: `上下文信息：\n${finalContext}` });
            }
          }
        }

        // debug: 在 F12 打印发送给 AI 的内容 (针对大纲、世界观、粗纲、角色集等)
        if (['outline', 'worldview', 'plotOutline', 'characters', 'inspiration', 'aiChat'].includes(node.data.typeKey as string)) {
          console.groupCollapsed(`[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}`);
          console.log('Messages:', messages);
          console.log('Config:', {
            model: finalModel,
            temperature: finalTemperature,
            topP: finalTopP,
            topK: finalTopK,
            maxTokens: finalMaxTokens
          });
          console.log('Constructed Context:', finalContext);
          console.groupEnd();
        }

        const openai = new OpenAI({
          apiKey: (node.data.overrideAiConfig && node.data.apiKey) ? node.data.apiKey : (nodeApiConfig.apiKey || globalConfig.apiKey),
          baseURL: (node.data.overrideAiConfig && node.data.baseUrl) ? node.data.baseUrl : (nodeApiConfig.baseUrl || globalConfig.baseUrl),
          dangerouslyAllowBrowser: true
        });

        let result = '';
        let entriesToStore: { title: string; content: string }[] = [];
        let retryCount = 0;
        const maxRetries = 2; // 总共尝试 3 次
        let isSuccess = false;

        // 增加“自动续写”内部循环支持
        let isNodeFullyCompleted = false;
        let nodeIterationCount = 0;
        let currentMessages = [...messages];
        let accumulatedNewEntries: OutputEntry[] = []; // 新增：记录本次执行产生的所有新条目
        const targetEndNum = extractTargetEndChapter(node.data.instruction as string || '') ||
                           (specificInstruction ? extractTargetEndChapter(specificInstruction) : null);

        while (retryCount <= maxRetries && !isNodeFullyCompleted) {
          if (retryCount > 0 && !isSuccess) {
            terminal.log(`[Workflow Retry] 节点 ${node.data.label} JSON 解析失败，正在进行第 ${retryCount} 次重试...`);
            // 给 UI 一点反馈
            updateNodeData(node.id, { label: `重试中(${retryCount}/${maxRetries}): ${node.data.typeLabel}` });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          terminal.log(`
>> AI REQUEST [工作流: ${node.data.typeLabel}] (尝试 ${retryCount + 1})
>> -----------------------------------------------------------
>> Model:       ${finalModel}
>> Temperature: ${finalTemperature}
>> Top P:       ${finalTopP}
>> Top K:       ${finalTopK}
>> Max Tokens:  ${finalMaxTokens || '默认'}
>> -----------------------------------------------------------
          `);

          const completion = await openai.chat.completions.create({
            model: finalModel,
            messages: currentMessages,
            temperature: finalTemperature,
            top_p: finalTopP,
            top_k: (finalTopK && finalTopK > 0) ? finalTopK : undefined,
            max_tokens: finalMaxTokens,
          } as any, { signal: abortControllerRef.current?.signal });

          result = completion.choices[0]?.message?.content || '';
          if (!result || result.trim().length === 0) {
            throw new Error('AI 返回内容为空，已终止工作流。请检查网络或模型配置。');
          }
          terminal.log(`[Workflow Output] ${node.data.typeLabel} - ${node.data.label}:\n${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`);
          
          // 6. 结构化解析 AI 输出并更新节点产物
          try {
            // 极致鲁棒的 JSON 提取与清理逻辑 (同步 MobileWorkflowEditor 逻辑)
            const cleanAndParseJSON = async (text: string) => {
              const startTime = Date.now();
              let processed = text.trim();
              
              // 1. 异步化的正则清理 (Yield thread)
              await new Promise(resolve => setTimeout(resolve, 0));
              processed = processed.replace(/```json\s*([\s\S]*?)```/gi, '$1')
                                   .replace(/```\s*([\s\S]*?)```/gi, '$1')
                                   .replace(/\[\/?JSON\]/gi, '');

              // 寻找 JSON 边界
              const firstBracket = processed.indexOf('[');
              const firstBrace = processed.indexOf('{');
              let start = -1;
              if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) start = firstBracket;
              else if (firstBrace !== -1) start = firstBrace;

              if (start !== -1) {
                const lastBracket = processed.lastIndexOf(']');
                const lastBrace = processed.lastIndexOf('}');
                const end = Math.max(lastBracket, lastBrace);
                if (end > start) {
                  processed = processed.substring(start, end + 1);
                }
              }

              // 增强纠偏：修复常见的 LLM JSON 语法错误
              const heuristicFix = (jsonStr: string) => {
                return jsonStr
                  .replace(/":\s*:/g, '":') // 修复双冒号 "::"
                  .replace(/,\s*([\]}])/g, '$1') // 移除末尾多余逗号
                  .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // 移除不可见控制字符
              };

              try {
                const parsed = JSON.parse(processed);
                const duration = Date.now() - startTime;
                if (duration > 20) {
                  terminal.log(`[PERF] WorkflowEditor.cleanAndParseJSON: ${duration}ms`);
                }
                return parsed;
              } catch (e: any) {
                const fixed = heuristicFix(processed);
                try {
                  const parsed = JSON.parse(fixed);
                  const duration = Date.now() - startTime;
                  if (duration > 20) {
                    terminal.log(`[PERF] WorkflowEditor.cleanAndParseJSON (with fix): ${duration}ms`);
                  }
                  return parsed;
                } catch (e2: any) {
                  // 如果不是强行 JSON 的节点，静默报错，平滑回退到纯文本处理
                  const jsonRequiredNodes = ['outline', 'plotOutline', 'characters', 'worldview'];
                  if (jsonRequiredNodes.includes(node.data.typeKey as string)) {
                    const errorPos = parseInt(e2.message.match(/at position (\d+)/)?.[1] || "0", 10);
                    const context = fixed.substring(Math.max(0, errorPos - 50), Math.min(fixed.length, errorPos + 50));
                    terminal.log(`[JSON Parse Error] ${e2.message}\nContext near error:\n...${context}...`);
                  }
                  throw e2;
                }
              }
            };

            const parsed = await cleanAndParseJSON(result);
            
            const extractEntries = async (data: any): Promise<{title: string, content: string}[]> => {
              if (!data) return [];
              
              // 递归处理嵌套对象（如 { "outline": [...] }）
              if (typeof data === 'object' && !Array.isArray(data)) {
                const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
                if (arrayKey) return await extractEntries(data[arrayKey]);
              }

              const items = Array.isArray(data) ? data : [data];
              const resultItems: {title: string, content: string}[] = [];
              
              for (let idx = 0; idx < items.length; idx++) {
                // 每处理 50 个条目 yield 一次
                if (idx > 0 && idx % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                
                const item = items[idx];
                if (typeof item === 'string') {
                  resultItems.push({ title: `条目 ${idx + 1}`, content: item });
                  continue;
                }
                if (typeof item !== 'object' || item === null) {
                  resultItems.push({ title: '未命名', content: String(item) });
                  continue;
                }
                
                const title = String(item.title || item.chapter || item.name || item.item || item.label || item.header || Object.values(item)[0] || '未命名');
                const content = String(item.summary || item.content || item.description || item.plot || item.setting || item.bio || item.value || Object.values(item)[1] || '');
                
                resultItems.push({ title, content });
              }
              return resultItems;
            };

            entriesToStore = await extractEntries(parsed);
            isSuccess = true; // 解析成功
          } catch (e) {
            // 解析失败，说明不是结构化 JSON
            const jsonRequiredNodes = ['outline', 'plotOutline', 'characters', 'worldview'];
            if (jsonRequiredNodes.includes(node.data.typeKey as string) && retryCount < maxRetries) {
              retryCount++;
              continue; // 触发重试
            }

            // 如果不需要强行 JSON 或者是最后一次重试，则按单条内容处理
            entriesToStore = [{
              title: `生成结果 ${new Date().toLocaleTimeString()}`,
              content: result
            }];
            isSuccess = true;
          }

          // --- 核心修复：工作流大纲/剧情粗纲节点自动续写判断 ---
          const isOutlineNode = node.data.typeKey === 'outline' || node.data.typeKey === 'plotOutline';
          
          // 转换为 OutputEntry 格式并存入累加器
          const currentIterationEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({
            id: `${Date.now()}-${nodeIterationCount}-${idx}`,
            title: e.title,
            content: e.content
          }));

          if (isSuccess && isOutlineNode && targetEndNum) {
            const lastEntry = entriesToStore[entriesToStore.length - 1];
            const currentLastNum = parseAnyNumber(lastEntry?.title || '');

            if (currentLastNum && currentLastNum < targetEndNum && nodeIterationCount < 5) {
              terminal.log(`[Workflow 续写] 大纲节点检测到截断：目标 ${targetEndNum}, 当前 ${currentLastNum}。准备接龙...`);
              
              // 核心修复：更新累加器，确保同步到设定集时包含此片段
              accumulatedNewEntries = [...accumulatedNewEntries, ...currentIterationEntries];

              // 1. 将已生成的产物先存起来（增量保存，使用 Ref 确保不覆盖历史）
              const latestNode = nodesRef.current.find(n => n.id === node.id);
              const historyEntries = latestNode?.data.outputEntries || [];
              // 注意：使用 [...history, ...new] 保持顺序
              await syncNodeStatus(node.id, { outputEntries: [...historyEntries, ...currentIterationEntries] }, i);

              nodeIterationCount++;
              // 构造续写指令并更新下一轮的消息列表
              const nextStart = currentLastNum + 1;
              const continuationPrompt = `(系统接龙：刚才你只生成到了第 ${currentLastNum} 章。请不要重复，直接从第 ${nextStart} 章开始继续生成大纲，直到第 ${targetEndNum} 章。请严格遵守 JSON 格式。)`;
              
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: result },
                { role: 'user', content: continuationPrompt }
              ];
              
              // 重置 isSuccess 触发下一轮 while 循环，但不增加 retryCount (因为这不是解析失败)
              isSuccess = false;
              continue;
            }
          }
          
          if (isSuccess) {
            accumulatedNewEntries = [...accumulatedNewEntries, ...currentIterationEntries];
            isNodeFullyCompleted = true;
          }
        }

        // 恢复节点原本的标签（如果被重试修改过）
        if (retryCount > 0) {
          await syncNodeStatus(node.id, { label: node.data.label }, i);
        }

        // V2: Capture Variables from output
        if (node.data.variableBinding && node.data.variableBinding.length > 0) {
           workflowManager.processVariableBindings(node.data.variableBinding, result);
        }

        // 核心修复：使用 syncNodeStatus 替代 updateNodeData，确保 Ref 立即更新且数据被持久化
        // 修正：从 nodesRef 获取最新历史，并将本次循环中尚未保存的累加结果合并进去
        const latestNodeFinal = nodesRef.current.find(n => n.id === node.id);
        const finalHistoryEntries = latestNodeFinal?.data.outputEntries || [];
        
        // 过滤掉已经保存过的条目（如果是通过续写逻辑保存过的）
        const alreadySavedIds = new Set(finalHistoryEntries.map(e => e.id));
        const unsavedEntries = accumulatedNewEntries.filter(e => !alreadySavedIds.has(e.id));

        if (unsavedEntries.length > 0) {
          await syncNodeStatus(node.id, { outputEntries: [...finalHistoryEntries, ...unsavedEntries] }, i);
        }

        // 7. 处理生成内容持久化存储
        // 核心修正：使用 accumulatedNewEntries 确保“接龙”生成的所有片段都能存入小说设定集
        const finalEntriesToStore = accumulatedNewEntries.length > 0 ? accumulatedNewEntries : entriesToStore;
        let updatedNovelState = { ...localNovel };
        let novelChanged = false;

        if (node.data.folderName || currentWorkflowFolder) {
          const folderName = node.data.folderName || currentWorkflowFolder;
          
          const findTargetSet = (sets: any[] | undefined) => {
            return sets?.find(s => s.name === folderName);
          };

          if (node.data.typeKey === 'worldview') {
            const targetSet = findTargetSet(updatedNovelState.worldviewSets);
            if (targetSet) {
              updatedNovelState = {
                ...updatedNovelState,
                worldviewSets: updatedNovelState.worldviewSets?.map(s => {
                  if (s.id === targetSet.id) {
                    const newEntries = [...s.entries];
                    finalEntriesToStore.forEach(e => {
                      const idx = newEntries.findIndex(ne => ne.item === e.title);
                      if (idx !== -1) newEntries[idx] = { item: e.title, setting: e.content };
                      else newEntries.push({ item: e.title, setting: e.content });
                    });
                    return { ...s, entries: newEntries };
                  }
                  return s;
                })
              };
              novelChanged = true;
            }
          } else if (node.data.typeKey === 'characters') {
            const targetSet = findTargetSet(updatedNovelState.characterSets);
            if (targetSet) {
              updatedNovelState = {
                ...updatedNovelState,
                characterSets: updatedNovelState.characterSets?.map(s => {
                  if (s.id === targetSet.id) {
                    const newChars = [...s.characters];
                    finalEntriesToStore.forEach(e => {
                      const idx = newChars.findIndex(nc => nc.name === e.title);
                      if (idx !== -1) newChars[idx] = { name: e.title, bio: e.content };
                      else newChars.push({ name: e.title, bio: e.content });
                    });
                    return { ...s, characters: newChars };
                  }
                  return s;
                })
              };
              novelChanged = true;
            }
          } else if (node.data.typeKey === 'outline') {
            const targetSet = findTargetSet(updatedNovelState.outlineSets);
            if (targetSet) {
              updatedNovelState = {
                ...updatedNovelState,
                outlineSets: updatedNovelState.outlineSets?.map(s => {
                  if (s.id === targetSet.id) {
                    const newItems = [...s.items];
                    finalEntriesToStore.forEach(e => {
                      const cleanTitle = (t: string) => t.replace(/\s+/g, '');
                      const targetClean = cleanTitle(e.title);
                      const idx = newItems.findIndex(ni => cleanTitle(ni.title) === targetClean || ni.title === e.title);
                      
                      if (idx !== -1) newItems[idx] = { ...newItems[idx], title: e.title, summary: e.content };
                      else newItems.push({ title: e.title, summary: e.content });
                    });
                    newItems.sort((a, b) => (parseAnyNumber(a.title) || 0) - (parseAnyNumber(b.title) || 0));
                    return { ...s, items: newItems };
                  }
                  return s;
                })
              };
              novelChanged = true;
            }
          } else if (node.data.typeKey === 'inspiration') {
            const targetSet = findTargetSet(updatedNovelState.inspirationSets);
            if (targetSet) {
              updatedNovelState = {
                ...updatedNovelState,
                inspirationSets: updatedNovelState.inspirationSets?.map(s => {
                  if (s.id === targetSet.id) {
                    const newItems = [...s.items];
                    finalEntriesToStore.forEach(e => {
                      const idx = newItems.findIndex(ni => ni.title === e.title);
                      if (idx !== -1) newItems[idx] = { title: e.title, content: e.content };
                      else newItems.push({ title: e.title, content: e.content });
                    });
                    return { ...s, items: newItems };
                  }
                  return s;
                })
              };
              novelChanged = true;
            }
          } else if (node.data.typeKey === 'plotOutline') {
            const targetSet = findTargetSet(updatedNovelState.plotOutlineSets);
            if (targetSet) {
              updatedNovelState = {
                ...updatedNovelState,
                plotOutlineSets: updatedNovelState.plotOutlineSets?.map(s => {
                  if (s.id === targetSet.id) {
                    const newItems = [...s.items];
                    finalEntriesToStore.forEach((e, idx) => {
                      const existIdx = newItems.findIndex(ni => ni.title === e.title);
                      if (existIdx !== -1) newItems[existIdx] = { ...newItems[existIdx], description: e.content };
                      else newItems.push({ id: `plot_${Date.now()}_${idx}`, title: e.title, description: e.content, type: 'scene' });
                    });
                    return { ...s, items: newItems };
                  }
                  return s;
                })
              };
              novelChanged = true;
            }
          }
        }

        if (novelChanged) {
          updateLocalAndGlobal(updatedNovelState);
        }
        
        // 6. 更新传递给下一个节点的上下文 (累加模式)
        lastNodeOutput += `【${node.data.typeLabel}输出】：\n${result}\n\n`;

        // 更新节点状态为已完成 (确保在 novel 更新后同步更新节点状态，避免竞争)
        await syncNodeStatus(node.id, { status: 'completed' }, i);

        // 停止入线动画
        setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));

        // 核心修复：自动回跳检测
        // 如果当前节点有输出连线指向一个“循环执行器”，且该循环执行器是在当前位置之前的（或就是当前节点）
        // 则必须强制跳转回循环执行器，由它来判定是继续下一轮还是彻底结束
        const currentOutEdges = edges.filter(e => e.source === node.id);
        const loopBackEdge = currentOutEdges.find(e => {
            const targetNode = nodesRef.current.find(n => n.id === e.target);
            return targetNode?.data.typeKey === 'loopNode';
        });

        if (loopBackEdge) {
            const targetIndex = sortedNodes.findIndex(n => n.id === loopBackEdge.target);
            if (targetIndex !== -1 && targetIndex <= i) {
                terminal.log(`[Loop] Detected back-link from ${node.data.label} to LoopNode, jumping back...`);
                
                // 物理回跳时也要增加循环计数（针对没有 loopNode 但有物理环路的情况）
                const currentLoopIdx = workflowManager.getContextVar('loop_index') || 1;
                workflowManager.setContextVar('loop_index', currentLoopIdx + 1);

                i = targetIndex - 1; // 减 1 是因为 for 循环末尾有 i++
                continue;
            }
        }
      }
      
      if (!stopRequestedRef.current) {
        workflowManager.stop();
        // 执行结束，彻底关闭所有连线动画
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
        keepAliveManager.disable();
      }
    } catch (e: any) {
      keepAliveManager.disable();
      const isAbort = e.name === 'AbortError' || /aborted/i.test(e.message);
      
      if (isAbort) {
        terminal.log('[Workflow] 用户中止或任务已取消');
        // 手动中止时，在全局状态记录暂停位置
        workflowManager.pause(workflowManager.getState().currentNodeIndex);
      } else {
        console.error(e);
        // 1. 设置全局错误状态 (会自动暂停并保留索引)
        workflowManager.setError(e.message);
        setError(`执行失败: ${e.message}`);

        // 2. 更新故障节点 UI
        // 核心修复：使用实时索引 realTimeIndex 而非滞后的 state.currentNodeIndex
        const realTimeIndex = workflowManager.getState().currentNodeIndex;
        const currentOrder = getOrderedNodes();
        const failedNode = currentOrder[realTimeIndex];
        
        if (failedNode) {
          const nextNodesFailed = nodesRef.current.map(n => n.id === failedNode.id ? { ...n, data: { ...n.data, status: 'failed' as const } } : n);
          nodesRef.current = nextNodesFailed;
          setNodes(nextNodesFailed);
        }
      }

      // 3. 清理视觉效果
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));
    }
  };

  const stopWorkflow = () => {
    terminal.log('[WORKFLOW] STOP requested by user.');
    
    // 获取实时进度索引
    const realTimeIndex = workflowManager.getState().currentNodeIndex;

    // 停止时显式更新工作流列表并保存
    const updatedWorkflows = workflows.map(w => {
      if (w.id === activeWorkflowId) {
        return {
          ...w,
          nodes: nodesRef.current,
          edges,
          currentNodeIndex: realTimeIndex,
          lastModified: Date.now(),
          contextSnapshot: workflowManager.getSnapshot()
        };
      }
      return w;
    });
    setWorkflows(updatedWorkflows);
    storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[WORKFLOW] 停止保存失败: ${e}`));
    
    setStopRequested(true);
    stopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // 全局暂停
    workflowManager.pause(realTimeIndex);
    // 强制清理执行状态，确保 UI 动画立即停止
    setNodes(nds => {
      const nextNodes = nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          status: n.data.status === 'executing' ? 'pending' : n.data.status as any
        }
      }));
      nodesRef.current = nextNodes; // 同步 Ref
      return nextNodes;
    });
    setEdges(eds => eds.map(e => ({ ...e, animated: false })));
    keepAliveManager.disable();
  };

  const resumeWorkflow = () => {
    if (currentNodeIndex !== -1) {
      runWorkflow(currentNodeIndex);
    }
  };

  const resetWorkflowStatus = () => {
    if (confirm('确定要重置当前工作流吗？\n\n1. 所有节点进度将归零\n2. 已生成的章节正文将保留（如需重新生成请手动删除正文）\n3. 正在运行的任务将被强制中止')) {
      // 1. 立即物理中断正在运行的异步循环和 AI 请求
      stopRequestedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const updatedNodes = nodes.map(n => {
        const updates: Partial<WorkflowNodeData> = {
          status: 'pending' as const,
          outputEntries: []
        };
        
        // 彻底清理执行期产生的动态关联
        if (n.data.typeKey === 'chapter') {
          // 不再重置 targetVolumeId，保留用户手动配置的结果
          updates.targetVolumeName = '';
          // 重置正文生成节点的显示名称为默认值
          updates.label = NODE_CONFIGS.chapter.defaultLabel;
        } else if (n.data.typeKey === 'saveToVolume') {
          // 核心修复：重置工作流时，清理分卷规划节点的多次分卷触发器内容
          updates.splitRules = [];
          updates.splitChapterTitle = '';
          updates.nextVolumeName = '';
          updates.volumeContent = '';
        }

        // 核心修复：手动重置时也需要将循环计数归零
        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = {
            ...n.data.loopConfig,
            currentIndex: 0
          };
        }
        
        return {
          ...n,
          data: {
            ...n.data,
            ...updates
          }
        };
      });

      // 2. 同步重置所有本地 UI 状态，确保不从旧索引处“继续”
      setNodes(updatedNodes);
      nodesRef.current = updatedNodes; // 同步 Ref
      setCurrentNodeIndex(-1);
      setIsPaused(false);
      setError(null);
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));

      // 3. 通知全局状态管理器停止
      workflowManager.stop();
      
      // 4. 同步更新持久化状态
      const updatedWorkflows = workflows.map(w => {
        if (w.id === activeWorkflowId) {
          return {
            ...w,
            nodes: updatedNodes,
            currentNodeIndex: -1,
            lastModified: Date.now(),
            contextSnapshot: undefined
          };
        }
        return w;
      });
      setWorkflows(updatedWorkflows);
      storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[WORKFLOW] 重置保存失败: ${e}`));
    }
  };

  if (!isOpen) return null;

  // 恢复旧版体验：移除全屏 Loading 遮罩，改为静默加载或局部状态
  // if (isLoadingWorkflows) { ... }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden relative">
        {/* 执行中状态提示 */}
        {isRunning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] bg-indigo-600/90 border border-indigo-400 pl-4 pr-2 py-2 rounded-full flex items-center gap-3 shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span className="text-xs font-bold text-white tracking-wide">
                正在执行: {currentNodeIndex === -1 ? '准备中...' : (getOrderedNodes()[currentNodeIndex]?.data.typeLabel || '...')}
              </span>
            </div>
            <div className="h-4 w-px bg-indigo-400/50 mx-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('是否强制停止当前任务？\n如果任务长时间卡在“准备中”，请点击确定。')) {
                  stopWorkflow();
                  // 强制兜底重置状态，防止 stopWorkflow 因异常未完全执行
                  setTimeout(() => {
                    setIsRunning(false);
                    workflowManager.stop();
                    keepAliveManager.disable();
                  }, 200);
                }
              }}
              className="p-1 hover:bg-white/20 rounded-full text-indigo-100 hover:text-white transition-colors"
              title="强制停止"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* 顶部报错 UI */}
        {error && (
          <div className="absolute top-0 left-0 right-0 z-[130] bg-red-900/90 border-b border-red-500 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300 backdrop-blur-md">
            <div className="flex items-center gap-3 text-red-100">
              <div className="p-1.5 bg-red-500 rounded-full shrink-0">
                <X className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">执行错误</span>
                <p className="text-sm font-medium">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-red-200 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gray-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 border-r border-gray-700 pr-4">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
                {isLoadingWorkflows ? (
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                   <Workflow className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-100 leading-tight">工作流编辑器</h3>
                <p className="text-xs text-gray-500">
                  {isLoadingWorkflows ? '正在同步数据...' : '串联多步骤自动化任务'}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2">
                {isEditingWorkflowName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newWorkflowName}
                      onChange={(e) => setNewWorkflowName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameWorkflow(activeWorkflowId, newWorkflowName);
                        if (e.key === 'Escape') setIsEditingWorkflowName(false);
                      }}
                      onBlur={() => renameWorkflow(activeWorkflowId, newWorkflowName)}
                      className="bg-gray-700 border border-indigo-500 rounded px-2 py-1 text-sm text-white outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowWorkflowMenu(!showWorkflowMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-all border border-gray-600/50"
                  >
                    <span className="font-bold text-indigo-400">
                      {workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showWorkflowMenu ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {!isEditingWorkflowName && (
                  <button
                    onClick={() => {
                      setNewWorkflowName(workflows.find(w => w.id === activeWorkflowId)?.name || '');
                      setIsEditingWorkflowName(true);
                    }}
                    className="p-1.5 text-gray-500 hover:text-indigo-400 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showWorkflowMenu && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-[150] animate-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-1 mb-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    切换工作流
                  </div>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {workflows.map(wf => (
                      <div
                        key={wf.id}
                        onClick={() => switchWorkflow(wf.id)}
                        className={`group px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${wf.id === activeWorkflowId ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{wf.name}</span>
                          <span className="text-[10px] opacity-50">{new Date(wf.lastModified).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`确定要重置工作流 "${wf.name}" 的进度吗？`)) return;

                              // 如果重置的是当前正在运行的工作流，必须先物理中断
                              if (wf.id === activeWorkflowId) {
                                stopRequestedRef.current = true;
                                if (abortControllerRef.current) {
                                  abortControllerRef.current.abort();
                                }
                              }

                              const targetIndex = -1;
                              const updatedNodes = wf.nodes.map(n => ({
                                ...n,
                                data: {
                                  ...n.data,
                                  status: 'pending' as const,
                                  // 重置正文生成节点的动态关联，保留用户配置
                                  targetVolumeName: n.data.typeKey === 'chapter' ? '' : n.data.targetVolumeName,
                                  label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
                                  // 核心修复：重置非当前工作流进度时也清理分卷规则
                                  splitRules: n.data.typeKey === 'saveToVolume' ? [] : n.data.splitRules,
                                  splitChapterTitle: n.data.typeKey === 'saveToVolume' ? '' : n.data.splitChapterTitle,
                                  nextVolumeName: n.data.typeKey === 'saveToVolume' ? '' : n.data.nextVolumeName,
                                }
                              }));

                              setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, nodes: updatedNodes, currentNodeIndex: targetIndex, lastModified: Date.now() } : w));
                              
                              if (wf.id === activeWorkflowId) {
                                setNodes(updatedNodes);
                                nodesRef.current = updatedNodes;
                                setCurrentNodeIndex(-1);
                                setIsPaused(false);
                                setError(null);
                                workflowManager.stop();
                              }
                              
                              // 显式保存至存储
                              storage.getWorkflows().then(allWfs => {
                                const nextWfs = allWfs.map((w: any) => w.id === wf.id ? { ...w, nodes: updatedNodes, currentNodeIndex: -1, lastModified: Date.now() } : w);
                                storage.saveWorkflows(nextWfs);
                              });
                            }}
                            className="p-1 hover:text-indigo-400 transition-colors"
                            title="重置进度"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => deleteWorkflow(wf.id, e)}
                            className="p-1 hover:text-red-400 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-700 px-2 space-y-1">
                    <button
                      onClick={createNewWorkflow}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-colors font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      创建新工作流
                    </button>
                    <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-colors font-bold cursor-pointer">
                      <Upload className="w-4 h-4" />
                      导入工作流
                      <input type="file" accept=".json" onChange={importWorkflow} className="hidden" />
                    </label>
                    <button
                      onClick={() => exportWorkflow(activeWorkflowId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-amber-600/10 rounded-lg transition-colors font-bold"
                    >
                      <Download className="w-4 h-4" />
                      导出当前工作流
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetWorkflowStatus}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all border border-gray-600 active:scale-95 mr-1"
              title="重置执行进度和节点状态"
            >
              <Repeat className="w-4 h-4" />
              重置工作流
            </button>

            {isRunning ? (
              <button
                onClick={stopWorkflow}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 shadow-red-900/20"
              >
                <Square className="w-4 h-4 fill-current" />
                终止执行
              </button>
            ) : isPaused && currentNodeIndex !== -1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={resumeWorkflow}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 shadow-blue-900/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  从停止处继续
                </button>
                <select
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>跳转至节点...</option>
                  {getOrderedNodes().map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>从指定节点开始...</option>
                  {getOrderedNodes().map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => runWorkflow(0)}
                  disabled={isRunning || nodes.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-green-900/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  全量运行
                </button>
              </div>
            )}
            <button
              onClick={handleSaveWorkflow}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600 active:scale-95"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors ml-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 relative bg-[#1a1a1a]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            isValidConnection={() => true}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            colorMode="dark"
          >
            <Background color="#333" gap={20} variant={BackgroundVariant.Dots} />
            <Controls />
            <Panel position="top-left" className="flex flex-col gap-2">
              <div className="relative">
                <button 
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white rounded-lg shadow-xl transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  添加模块
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
                </button>

                {showAddMenu && (
                  <div className="absolute top-full left-0 mt-2 w-52 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-2 z-[110] animate-in slide-in-from-top-2 duration-200">
                    {(Object.keys(NODE_CONFIGS) as Array<NodeTypeKey>).map((type) => {
                      const config = NODE_CONFIGS[type];
                      const isGenerator = type === 'workflowGenerator';
                      const isDisabled = (isGenerator && nodes.length > 0) || (!isGenerator && nodes.some(n => n.data.typeKey === 'workflowGenerator'));

                      return (
                        <button
                          key={type}
                          disabled={isDisabled}
                          onClick={() => addNewNode(type)}
                          className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors group ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                        >
                          <div className={`p-1.5 rounded bg-gray-900 group-hover:bg-gray-800 ${isGenerator ? 'ring-1 ring-red-500/30 shadow-[0_0_8px_rgba(248,113,113,0.2)]' : ''}`}>
                              <config.icon className="w-4 h-4" style={{ color: config.color }} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{config.typeLabel}</span>
                            {isGenerator && <span className="text-[9px] text-gray-500 leading-none mt-0.5">运行后替换整个画布</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={autoLayoutNodes}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-sm font-medium text-emerald-400 rounded-lg border border-emerald-500/30 transition-colors"
              >
                <LayoutList className="w-4 h-4" />
                整理布局
              </button>

              <button
                onClick={() => {
                  setNodes([]);
                  nodesRef.current = []; // 同步 Ref
                  setEdges([]);
                  setEditingNodeId(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-sm font-medium text-red-400 rounded-lg border border-red-900/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清空画布
              </button>
            </Panel>
          </ReactFlow>

        </div>

        {/* --- 节点属性弹窗 --- */}
        {editingNode && (
          <NodePropertiesModal
            node={editingNode}
            onClose={() => setEditingNodeId(null)}
            updateNodeData={(id, updates) => {
              if ((updates as any)._deleted) {
                setNodes((nds) => nds.filter(n => n.id !== id));
              } else {
                updateNodeData(id, updates);
              }
            }}
            toggleSetReference={toggleSetReference}
            activeNovel={activeNovel}
            allPresets={allPresets}
            pendingFolders={pendingFolders}
            globalConfig={globalConfig}
            addEntry={addEntry}
            removeEntry={removeEntry}
            updateEntryTitle={updateEntryTitle}
            updateEntryContent={updateEntryContent}
            setPreviewEntry={setPreviewEntry}
          />
        )}

        {/* --- 章节正文预览弹窗 --- */}
        {previewEntry && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div
              className="absolute inset-0"
              onClick={() => setPreviewEntry(null)}
            />
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-100">{previewEntry.title}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const chapterId = parseInt(previewEntry.id.replace('chapter-', ''), 10);
                      if (!isNaN(chapterId) && onSelectChapter) {
                        setEditingNodeId(null);
                        setPreviewEntry(null);
                        onSelectChapter(chapterId);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all active:scale-95"
                  >
                    跳转到编辑器
                  </button>
                  <button
                    onClick={() => setPreviewEntry(null)}
                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-900">
                <div className="max-w-2xl mx-auto">
                  <div className="prose prose-invert prose-indigo max-w-none">
                    {previewEntry.content.split('\n').map((para, i) => (
                      <p key={i} className="mb-4 text-gray-300 leading-relaxed text-lg text-justify">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-800 bg-gray-800/30 text-[10px] text-gray-500 flex justify-between">
                <span>预览模式 - 内容仅供参考</span>
                <span>共 {previewEntry.content.length} 字</span>
              </div>
            </div>
          </div>
        )}

        {/* --- 连线删除确认弹窗 --- */}
        {edgeToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-100">删除连线？</h4>
                  <p className="text-sm text-gray-400">确定要断开这两个模块之间的连接吗？</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEdgeToDelete(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteEdge}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-900/20 transition-all active:scale-95"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-2 border-t border-gray-700 bg-gray-800 flex justify-between items-center text-[10px] text-gray-500 shrink-0">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><Workflow className="w-3 h-3" /> 节点: {nodes.length}</span>
            <span className="flex items-center gap-1"><Plus className="w-3 h-3 rotate-45" /> 连接: {edges.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            工作流编辑器已就绪
          </div>
        </div>
      </div>
    </div>
  );
};

export const WorkflowEditor = (props: WorkflowEditorProps) => {
  return (
    <ReactFlowProvider>
      <WorkflowEditorContent {...props} />
    </ReactFlowProvider>
  );
};
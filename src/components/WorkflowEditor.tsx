import {
  addEdge,
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
  useNodesState,
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
  Play,
  Plus,
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
import { GeneratorPreset, GeneratorPrompt, Novel, PromptItem, RegexScript } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';
import { keepAliveManager } from '../utils/KeepAliveManager';
import { storage } from '../utils/storage';
import { workflowManager } from '../utils/WorkflowManager';

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
}

export type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowData {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  currentNodeIndex?: number;
  lastModified: number;
}

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
    <div className={`px-4 py-3 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '280px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
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
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded">
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


      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
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

type NodeTypeKey = 'createFolder' | 'reuseDirectory' | 'userInput' | 'aiChat' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline' | 'chapter' | 'workflowGenerator';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
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
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);
  const [isEditingPrompts, setIsEditingPrompts] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalLabel(node.data.label);
    setLocalFolderName(node.data.folderName);
    setLocalInstruction(node.data.instruction);
  }, [node.id]);

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
          <div className="flex items-center gap-4 text-indigo-400">
            <div className="flex items-center gap-2.5">
              {(() => {
                const Icon = NODE_CONFIGS[node.data.typeKey as NodeTypeKey]?.icon;
                return Icon && <Icon className="w-5 h-5" />;
              })()}
              <span className="font-bold text-gray-100 text-lg">配置: {localLabel}</span>
            </div>
            <button
              onClick={() => updateNodeData(node.id, { skipped: !node.data.skipped })}
              className={`text-[10px] px-2 py-1 rounded transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${node.data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'}`}
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
                className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
              />
            </div>
            <div className={`space-y-2.5 ${(node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') ? 'col-span-2' : ''}`}>
              <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
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
                  className="flex-1 bg-[#161922] border border-indigo-900/30 rounded-lg px-4 py-2.5 text-sm text-indigo-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
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

          {node.data.presetType && node.data.typeKey !== 'workflowGenerator' && (
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
                  {node.data.typeKey === 'aiChat'
                    ? Object.values(allPresets).flat().map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认模型'})</option>
                      ))
                    : (allPresets[node.data.presetType as string] || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认'})</option>
                      ))
                  }
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                * 选择预设将加载该预设定义的提示词和模型。
              </p>
            </div>
          )}

          {(node.data.typeKey === 'aiChat' || node.data.typeKey === 'workflowGenerator') && (
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
                      updates.promptItems = [
                        { id: 'sys-1', role: 'system', content: '你是一个专业的创作助手。', enabled: true },
                        { id: 'user-1', role: 'user', content: '{{context}}\n\n要求：{{input}}', enabled: true }
                      ];
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
                          {globalConfig?.modelList?.map((m: string) => (
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

          {node.data.typeKey === 'chapter' && activeNovel && (
            <div className="space-y-6 pt-6 border-t border-gray-700/30">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Library className="w-3 h-3" /> 保存至分卷
                  </label>
                  <div className="space-y-2">
                    <select
                      value={node.data.targetVolumeId as string}
                      onChange={(e) => updateNodeData(node.id, { targetVolumeId: e.target.value, targetVolumeName: '' })}
                      className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                    >
                      <option value="">{pendingFolders.length > 0 ? `-- 自动匹配分卷 (${pendingFolders[0]}) --` : '-- 未分卷 --'}</option>
                      <option value="NEW_VOLUME">+ 新建分卷...</option>
                      {activeNovel.volumes.map(v => (
                        <option key={v.id} value={v.id}>{v.title}</option>
                      ))}
                    </select>
                    {node.data.targetVolumeId === 'NEW_VOLUME' && (
                      <input
                        type="text"
                        value={node.data.targetVolumeName as string}
                        onChange={(e) => updateNodeData(node.id, { targetVolumeName: e.target.value })}
                        placeholder="输入新分卷名称..."
                        className="w-full bg-[#161922] border border-indigo-900/40 rounded-lg px-4 py-2 text-xs text-indigo-100 focus:border-indigo-500 outline-none transition-all"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {node.data.typeKey !== 'userInput' && activeNovel && (
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
                <p className="text-xs text-gray-500 mt-2 px-10 leading-relaxed">工作流执行过程中生成的正文会直接写入小说对应的分卷中，您可以在主界面左侧的目录树中点击查看、编辑或手动优化这些章节。</p>
              </div>
            </div>
          ) : (
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
                {((node.data.outputEntries || []) as OutputEntry[]).map((entry) => (
                  <div key={entry.id} className="bg-[#161922] border border-gray-700/50 rounded-xl overflow-hidden shadow-lg group/entry">
                    <div className="bg-[#1a1d29] px-4 py-2 border-b border-gray-700/50 flex items-center justify-between">
                      <input
                        value={entry.title}
                        onChange={(e) => updateEntryTitle(entry.id, e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-bold text-indigo-300 focus:text-white transition-colors flex-1"
                        placeholder="条目标题..."
                      />
                      <button onClick={() => removeEntry(entry.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover/entry:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      value={entry.content}
                      onChange={(e) => updateEntryContent(entry.id, e.target.value)}
                      placeholder="输入内容..."
                      className="w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-emerald-50 outline-none resize-none font-mono leading-relaxed"
                    />
                  </div>
                ))}
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
                          placeholder="输入提示词内容... 支持 {{context}} 和 {{input}} 变量"
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
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<WorkflowNode>([]);

  // 核心修复：包装 onNodesChange 以确保拖拽等操作也能同步 Ref 快照
  const onNodesChange = useCallback((changes: any) => {
    onNodesChangeInternal(changes);
    // 注意：React Flow 的 onNodesChange 是异步更新 state 的，
    // 这里我们直接从最新的变更计算出下个状态并同步 Ref，或者等待渲染同步。
    // 为了极致安全，我们在所有手动调用 setNodes 的地方都加了同步。
    // 对于拖拽，我们依赖 setNodes 的回调来捕捉最新状态。
  }, [onNodesChangeInternal]);
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
    const unsubscribe = workflowManager.subscribe((state) => {
      // 只有当本地状态与全局状态不一致且当前工作流 ID 匹配时才更新
      // 或者是刚刚打开界面（isInitialLoadRef 为 true）
      if (state.activeWorkflowId === activeWorkflowId || !activeWorkflowId || activeWorkflowId === 'default') {
        setIsRunning(state.isRunning);
        setIsPaused(state.isPaused);
        setCurrentNodeIndex(state.currentNodeIndex);
        if (state.error) setError(state.error);
      }
    });
    return () => { unsubscribe(); };
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
            lastModified: Date.now()
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
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning, isLoadingWorkflows]);

  const switchWorkflow = (id: string) => {
    setActiveWorkflowId(id);
    loadWorkflow(id, workflows);
    setShowWorkflowMenu(false);
  };

  const createNewWorkflow = () => {
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
    switchWorkflow(newId);
  };

  const deleteWorkflow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workflows.length <= 1) {
      setError('无法删除最后一个工作流');
      return;
    }
    if (confirm('确定要删除这个工作流吗？')) {
      const updated = workflows.filter(w => w.id !== id);
      setWorkflows(updated);
      if (activeWorkflowId === id) {
        switchWorkflow(updated[0].id);
      }
    }
  };

  const renameWorkflow = (id: string, newName: string) => {
    if (!newName.trim()) return;
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, name: newName } : w));
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

    const reader = new FileReader();
    reader.onload = (event) => {
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
        
        setWorkflows(prev => [...prev, newWf]);
        switchWorkflow(newId);
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
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds)),
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
                content: '我想写一本小说，我的需求是：{{input}}\n\n请以此为基础，为我生成一套完整的工作流。如果我开启了自动填写，请在每个节点的 instruction 字段中为我写好专业的引导提示词。',
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
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
        }
        
        // 如果是“创建目录”模块重命名，仅负责清空其他节点的产物（因为环境变了），不再维护冗余引用
        if (isRenameFolder) {
          return {
            ...node,
            data: {
              ...node.data,
              outputEntries: [],
            }
          };
        }
        return node;
      });

      // 核心修复：在更新 React 状态的同时，手动强制更新 Ref 快照
      // 解决用户输入到工作流引擎读取之间的同步缝隙
      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, [setNodes]);

  const toggleSetReference = useCallback((type: 'worldview' | 'character' | 'outline' | 'inspiration' | 'folder', setId: string) => {
    if (!editingNodeId) return;
    
    setNodes((nds) => nds.map(node => {
      if (node.id === editingNodeId) {
        const key = type === 'worldview' ? 'selectedWorldviewSets' :
                    type === 'character' ? 'selectedCharacterSets' :
                    type === 'outline' ? 'selectedOutlineSets' :
                    type === 'inspiration' ? 'selectedInspirationSets' : 'selectedReferenceFolders';
        
        const currentList = [...(node.data[key] as string[])];
        // 这里的 setId 可能是真实的 ID，也可能是 'pending:FolderName'
        const newList = currentList.includes(setId)
          ? currentList.filter(id => id !== setId)
          : [...currentList, setId];
          
        return {
          ...node,
          data: {
            ...node.data,
            [key]: newList
          }
        };
      }
      return node;
    }));
  }, [editingNodeId, setNodes]);

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
    const startNodes = validNodes.filter(n => (inDegree.get(n.id) || 0) === 0)
                           .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));
    
    startNodes.forEach(n => queue.push(n.id));
    
    const resultIds: string[] = [];
    const currentInDegree = new Map(inDegree);

    while (queue.length > 0) {
      const uId = queue.shift()!;
      resultIds.push(uId);
      
      const neighbors = adjacencyList.get(uId) || [];
      const sortedNeighbors = neighbors
        .map(id => validNodes.find(n => n.id === id)!)
        .filter(Boolean)
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));

      sortedNeighbors.forEach(v => {
        const newDegree = (currentInDegree.get(v.id) || 0) - 1;
        currentInDegree.set(v.id, newDegree);
        if (newDegree === 0) queue.push(v.id);
      });
    }
    
    const ordered = resultIds.map(id => validNodes.find(n => n.id === id)!);
    const remaining = validNodes.filter(n => !resultIds.includes(n.id))
                               .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));
    
    const finalNodes = [...ordered, ...remaining];
    const duration = Date.now() - startTime;
    if (duration > 15) {
      terminal.log(`[PERF] WorkflowEditor.orderedNodes recalculate: ${duration}ms (Nodes: ${nodes.length})`);
    }
    return finalNodes;
  }, [nodes, edges]);

  // 保持兼容性的 Getter
  const getOrderedNodes = useCallback(() => orderedNodes, [orderedNodes]);

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

    // 3. 显式持久化到存储
    const currentWfs = workflowsRef.current.map(w => {
      if (w.id === activeWorkflowId) {
        return {
          ...w,
          nodes: latestNodes,
          currentNodeIndex: currentIndex,
          lastModified: Date.now()
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
    
    workflowManager.start(activeWorkflowId, startIndex);
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
        currentActiveNovel?.volumes.forEach(v => volumeStateMap.set(v.id, v.collapsed));

        const mergedNovel: Novel = {
          ...newNovel,
          volumes: newNovel.volumes.map(v => ({
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
      
      // 重置后续节点的执行状态
      if (startIndex === 0) {
        terminal.warn(`[DEBUG] 工作流全量重置触发，清空历史执行数据`);
        
        // 核心修复：全量运行时，不仅清空 status，还要清空 targetVolumeId 等执行期产生的 ID 关联
        // 否则 Data Healing 会根据这些残留 ID 找回已删除的旧分卷
        const resetNodeData = (n: WorkflowNode): WorkflowNode => {
          const updates: Partial<WorkflowNodeData> = {
            status: 'pending',
            outputEntries: []
          };
          
          // 重置正文生成节点的显示名称
          if (n.data.typeKey === 'chapter') {
            updates.label = NODE_CONFIGS.chapter.defaultLabel;
          }

          // 不再重置 targetVolumeId，保留用户手动配置或上次运行自动匹配的结果
          // 仅在状态彻底损坏时通过 Data Healing 修复
          
          return { ...n, data: { ...n.data, ...updates } };
        };

        setNodes(nds => {
            const nextNodes = nds.map(resetNodeData);
            terminal.log(`[DEBUG] 重置后首个节点状态: ${nextNodes[0]?.data.status}`);
            nodesRef.current = nextNodes; // 同步 Ref
            return nextNodes;
        });
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
        
        // 同步更新本地排序后的副本，确保 loop 使用的是干净的数据
        sortedNodes = sortedNodes.map(resetNodeData);

        // 重新开始时仅清理节点内部产出状态，不再干涉全局资料集和分卷章节
      }

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
          if (prevNode.data.typeKey === 'createFolder') {
            currentWorkflowFolder = prevNode.data.folderName;
          } else if (prevNode.data.typeKey === 'userInput') {
            accumContext += `【全局输入】：\n${prevNode.data.instruction}\n\n`;
          }
          // 获取上一个执行完的节点的产出作为 lastNodeOutput
          if (prevNode.data.outputEntries && prevNode.data.outputEntries.length > 0) {
            lastNodeOutput += `【${prevNode.data.typeLabel}输出】：\n${prevNode.data.outputEntries[0].content}\n\n`;
          }
        }
      }
      
      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (stopRequestedRef.current) {
          workflowManager.pause(i);
          break;
        }

        const node = sortedNodes[i];
        workflowManager.updateProgress(i);

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

            // 自动创建与目录名称相同的分卷
            const volumeResult = createSetIfNotExist(updatedNovel.volumes, currentWorkflowFolder, () => ({
              id: `vol_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              title: currentWorkflowFolder,
              collapsed: false,
            }));
            if (volumeResult.isNew) {
              updatedNovel.volumes = [...(updatedNovel.volumes || []), volumeResult.set];
              changed = true;
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
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
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
          let genPreset = genPresets.find((p: any) => p.id === node.data.presetId) || genPresets[0];

          const openai = new OpenAI({
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
                  .replace('{{input}}', node.data.instruction || '请生成一个标准的小说创作流程')
              }));
          } else if (genPreset && genPreset.prompts) {
            // 使用预设提示词
            generatorMessages = genPreset.prompts
              .filter((p: any) => p.enabled)
              .map((p: any) => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', WORKFLOW_DSL_PROMPT)
                  .replace('{{input}}', node.data.instruction || '请生成一个标准的小说创作流程')
              }));
          } else {
            // 默认兜底消息
            generatorMessages = [
              { role: 'system', content: WORKFLOW_DSL_PROMPT },
              { role: 'user', content: `用户需求：${node.data.instruction || '请生成一个标准的长篇小说创作工作流'}\n\n是否自动填写内容：${node.data.autoFillContent ? '是' : '否'}` }
            ];
          }

          const completion = await openai.chat.completions.create({
            model: (node.data.overrideAiConfig && node.data.model) ? node.data.model : (genPreset?.apiConfig?.model || globalConfig.model),
            messages: generatorMessages,
            temperature: (node.data.overrideAiConfig && node.data.temperature !== undefined) ? node.data.temperature : (genPreset?.temperature ?? 0.7),
          });

          const aiResponse = completion.choices[0]?.message?.content || '';
          
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
                position: { x: idx * 320 + 100, y: 250 } // 水平自动布局
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
        const finalContext = `${refContext}${accumContext}${(!isDuplicate && lastNodeOutput) ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''}`;
        
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
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction);
                return {
                  role: p.role,
                  content: p.role === 'user' ? formatContentWithAttachments(content) : content
                };
              });
          } else {
            // 普通生成预设 (GeneratorPreset) 的处理
            messages = (preset.prompts || [])
              .filter(p => p.enabled)
              .map(p => {
                const content = p.content
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction);
                return {
                  role: p.role,
                  content: p.role === 'user' ? formatContentWithAttachments(content) : content
                };
              });
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

          // 如果节点没选大纲集，尝试自动匹配当前工作目录对应的大纲集
          if (!selectedOutlineSetId || selectedOutlineSetId.startsWith('pending:')) {
             const matched = localNovel.outlineSets?.find(s => s.name === currentWorkflowFolder);
             if (matched) selectedOutlineSetId = matched.id;
          }

          let currentSet = localNovel.outlineSets?.find(s => s.id === selectedOutlineSetId);
          
          if (node.data.typeKey === 'chapter') {
            if (!currentSet || !currentSet.items || currentSet.items.length === 0) {
              // 最后尝试：如果仍然没找到，但有正在执行的工作流目录，可能大纲集刚被创建但状态未同步
              const fallbackSet = localNovel.outlineSets?.[localNovel.outlineSets.length - 1];
              if (fallbackSet && fallbackSet.items && fallbackSet.items.length > 0 && (!currentWorkflowFolder || fallbackSet.name === currentWorkflowFolder)) {
                currentSet = fallbackSet;
              } else {
                throw new Error(`未关联大纲集或关联的大纲集(${currentSet?.name || '未知'})内容为空。请检查：1. 前置大纲节点是否已成功运行 2. 节点属性中是否已勾选对应的大纲集`);
              }
            }
          }

          // 2. 确定最终分卷 ID (此处必须实时从 localNovel 中获取，确保能感知到刚创建的分卷)
          let finalVolumeId = node.data.targetVolumeId as string;
          
          // 获取最新的分卷列表（从执行中的内存状态获取）
          const latestVolumes = localNovel.volumes || [];

          // 优先级 1: 如果节点已经显式关联了某个真实分卷 ID，且该分卷依然存在
          if (finalVolumeId && finalVolumeId !== 'NEW_VOLUME') {
            const exists = latestVolumes.some(v => v.id === finalVolumeId);
            if (!exists) finalVolumeId = ''; // 如果关联的分卷被删了，重置它
          }

          // 优先级 2: 自动匹配逻辑 (针对“自动匹配分卷”模式)
          if (!finalVolumeId || finalVolumeId === '') {
            // 尝试匹配与当前工作流文件夹同名的分卷
            const matchedVol = latestVolumes.find(v => v.title === currentWorkflowFolder);
            if (matchedVol) {
              finalVolumeId = matchedVol.id;
              // 关键：必须立即将匹配到的 ID 写回节点状态，确保 AutoWriteEngine 拿到的是确定值
              updateNodeData(node.id, { targetVolumeId: finalVolumeId });
            }
          }

          // 优先级 3: 兜底逻辑
          if (!finalVolumeId || finalVolumeId === '') {
            if (latestVolumes.length > 0) {
              finalVolumeId = latestVolumes[0].id;
              updateNodeData(node.id, { targetVolumeId: finalVolumeId });
            }
          }

          if (finalVolumeId === 'NEW_VOLUME' && node.data.targetVolumeName) {
            const newVolume = {
              id: `vol_${Date.now()}`,
              title: node.data.targetVolumeName as string,
              collapsed: false
            };
            const updatedNovel: Novel = {
              ...localNovel as Novel,
              volumes: [...(localNovel.volumes || []), newVolume]
            };
            finalVolumeId = newVolume.id;
            updateLocalAndGlobal(updatedNovel);
            // 同步更新节点数据，防止重复创建且让 UI 反馈正确
            updateNodeData(node.id, { targetVolumeId: finalVolumeId, targetVolumeName: '' });
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
            systemPrompt: node.data.overrideAiConfig
              ? (node.data.promptItems && (node.data.promptItems as any[]).length > 0
                  ? (node.data.promptItems as any[]).filter(p => p.enabled !== false && p.role === 'system').map(p => p.content).join('\n\n')
                  : (node.data.systemPrompt as string || localNovel.systemPrompt || '你是一个专业的小说家。'))
              : (localNovel.systemPrompt || '你是一个专业的小说家。'),
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
            // 核心修复：章节查重必须限制在目标分卷内，支持在不同分卷生成同一套大纲的内容
            const existingChapter = localNovel.chapters.find(c =>
              c.title === item.title &&
              (!finalVolumeId || c.volumeId === finalVolumeId)
            );
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
              
              localNovel = { ...localNovel, chapters: Array.from(allLocalChaptersMap.values()) };
              updateLocalAndGlobal(localNovel);
            },
            async (chapterId, content, updatedNovel) => {
              if (updatedNovel) {
                localNovel = updatedNovel;
              }
              if (globalConfig.onChapterComplete) {
                const result = await (globalConfig.onChapterComplete as any)(chapterId, content, updatedNovel);
                if (result && typeof result === 'object' && (result as Novel).chapters) {
                  localNovel = result as Novel;
                }
              }
              // 正文生成节点不再维护 outputEntries 列表，因为内容直接写入目录
              // 核心修复：必须将最新的 localNovel 返回给引擎
              return localNovel;
            },
            finalVolumeId,
            false,
            selectedOutlineSetId,
            abortControllerRef.current?.signal
          );

          await syncNodeStatus(node.id, {
            label: NODE_CONFIGS.chapter.defaultLabel,
            status: 'completed'
          }, i);

          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // 5. 调用 AI (针对设定生成、AI 聊天等节点)
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
                    .replace('{{context}}', finalContext)
                    .replace('{{input}}', node.data.instruction)) : (p.content
                    .replace('{{context}}', finalContext)
                    .replace('{{input}}', node.data.instruction))
                };
              });
            
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

        const openai = new OpenAI({
          apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
          baseURL: nodeApiConfig.baseUrl || globalConfig.baseUrl,
          dangerouslyAllowBrowser: true
        });

        let result = '';
        let entriesToStore: { title: string; content: string }[] = [];
        let retryCount = 0;
        const maxRetries = 2; // 总共尝试 3 次
        let isSuccess = false;

        while (retryCount <= maxRetries && !isSuccess) {
          if (retryCount > 0) {
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
            messages,
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
        }

        // 恢复节点原本的标签（如果被重试修改过）
        if (retryCount > 0) {
          updateNodeData(node.id, { label: node.data.label });
        }

        const newEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({
          id: `${Date.now()}-${idx}`,
          title: e.title,
          content: e.content
        }));

        updateNodeData(node.id, { outputEntries: [...newEntries, ...(node.data.outputEntries || [])] });

        // 7. 处理生成内容持久化存储
        let updatedNovelState = { ...localNovel };
        let novelChanged = false;

        if (node.data.folderName || currentWorkflowFolder) {
          const folderName = node.data.folderName || currentWorkflowFolder;
          
          // 查找匹配的设定集 ID（由于可能存在重名，优先通过逻辑关联）
          const findTargetSet = (sets: any[] | undefined) => {
            // 尝试通过名称匹配
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
                    entriesToStore.forEach(e => {
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
                    entriesToStore.forEach(e => {
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
                    entriesToStore.forEach(e => {
                      const idx = newItems.findIndex(ni => ni.title === e.title);
                      if (idx !== -1) newItems[idx] = { title: e.title, summary: e.content };
                      else newItems.push({ title: e.title, summary: e.content });
                    });
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
                    entriesToStore.forEach(e => {
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
                    entriesToStore.forEach((e, idx) => {
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
        console.log('Workflow execution aborted by user');
        return; // 用户主动中止，不显示错误弹窗
      }
      console.error(e);
      // 更新当前节点状态为失败
      const currentOrder = getOrderedNodes();
      const failedNode = currentOrder[currentNodeIndex];
      if (failedNode) {
        const nextNodesFailed = nodesRef.current.map(n => n.id === failedNode.id ? { ...n, data: { ...n.data, status: 'failed' as const } } : n);
        nodesRef.current = nextNodesFailed;
        setNodes(nextNodesFailed);
      }
      // 核心修复：发生错误时，务必清理所有连线动画，防止视觉卡死
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));
      // 将报错信息显示在 UI 上，而不是使用 alert
      setError(`执行失败: ${e.message}`);
      workflowManager.setError(e.message);
    }
  };

  const stopWorkflow = () => {
    terminal.log('[WORKFLOW] STOP requested by user.');
    // 停止时显式更新工作流列表并保存
    const updatedWorkflows = workflows.map(w => {
      if (w.id === activeWorkflowId) {
        return {
          ...w,
          nodes,
          edges,
          currentNodeIndex,
          lastModified: Date.now()
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
    workflowManager.pause(currentNodeIndex);
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
            lastModified: Date.now()
          };
        }
        return w;
      });
      setWorkflows(updatedWorkflows);
      storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[WORKFLOW] 重置保存失败: ${e}`));
    }
  };

  if (!isOpen) return null;

  if (isLoadingWorkflows) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4">
        <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border border-gray-700 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <div className="text-indigo-400 font-bold animate-pulse">正在从数据库恢复工作流状态...</div>
          <p className="text-xs text-gray-500">大型工作流可能需要几秒钟时间进行初始化</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden relative">
        {/* 执行中状态提示 */}
        {isRunning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] bg-indigo-600/90 border border-indigo-400 px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span className="text-xs font-bold text-white tracking-wide">
              正在执行: {currentNodeIndex === -1 ? '准备中...' : (getOrderedNodes()[currentNodeIndex]?.data.typeLabel || '...')}
            </span>
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
                <Workflow className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-100 leading-tight">工作流编辑器</h3>
                <p className="text-xs text-gray-500">串联多步骤自动化任务</p>
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
                <button
                  onClick={resetWorkflowStatus}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all"
                >
                  重置状态
                </button>
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
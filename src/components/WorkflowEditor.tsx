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
  FileText,
  Folder,
  FolderPlus,
  Globe,
  LayoutList,
  Library,
  Lightbulb,
  MessageSquare,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  Upload,
  User,
  Users,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, Novel, PromptItem, RegexScript } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';

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
  icon: any;
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
  autoOptimize?: boolean;
  twoStepOptimization?: boolean;
  asyncOptimize?: boolean;
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
  const Icon = data.icon;
  const color = data.color;

  const refCount = (data.selectedWorldviewSets?.length || 0) +
                   (data.selectedCharacterSets?.length || 0) +
                   (data.selectedOutlineSets?.length || 0) +
                   (data.selectedInspirationSets?.length || 0) +
                   (data.selectedReferenceFolders?.length || 0);

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return 'border-green-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
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
            {data.typeLabel}
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
            {data.status === 'completed' && <CheckSquare className="w-3 h-3 text-green-500" />}
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
      {/* 底部发光层 - 最宽且模糊 */}
      <path
        id={`${id}-glow-outer`}
        d={edgePath}
        fill="none"
        stroke={COLORS.glow}
        strokeWidth={selected ? 8 : 4}
        strokeOpacity={selected ? 0.3 : 0.15}
        style={{ filter: 'blur(6px)' }}
      />
      {/* 中间核心层 - 较窄且明亮 */}
      <path
        id={`${id}-glow-inner`}
        d={edgePath}
        fill="none"
        stroke={selected ? COLORS.highlight : COLORS.primary}
        strokeWidth={selected ? 4 : 2.5}
        strokeOpacity={selected ? 0.8 : 0.6}
        style={{ filter: 'blur(2px)' }}
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
      {/* 科技感动画粒子 - 仅在选中或运行状态下更明显，这里默认加一点微弱的流动感 */}
      <path
        d={edgePath}
        fill="none"
        stroke="#fff"
        strokeWidth={1.5}
        strokeDasharray="4, 16"
        strokeLinecap="round"
        className="animate-[dash_3s_linear_infinite]"
        style={{
          opacity: selected ? 0.8 : 0.3,
          filter: 'drop-shadow(0 0 2px #fff)',
        }}
      />
      
      {/* 如果是 animated (比如执行中)，添加一个快速流动的光点 */}
      {animated && (
        <circle r="3" fill="#fff" className="animate-[move_2s_linear_infinite]">
          <animateMotion path={edgePath} dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      <style>{`
        @keyframes dash {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes move {
          from { offset-distance: 0%; }
          to { offset-distance: 100%; }
        }
      `}</style>
    </>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CoolEdge,
};

// --- 配置定义 ---

type NodeTypeKey = 'createFolder' | 'reuseDirectory' | 'userInput' | 'aiChat' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline' | 'chapter';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
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
          <div className="flex items-center gap-2.5 text-indigo-400">
            {node.data.icon && <node.data.icon className="w-5 h-5" />}
            <span className="font-bold text-gray-100 text-lg">配置: {localLabel}</span>
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

          {node.data.presetType && (
            <div className="space-y-3 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" /> 调用系统预设
              </label>
              <div className="relative">
                <select
                  value={node.data.presetId as string}
                  onChange={(e) => {
                    const presets = allPresets[node.data.presetType as string] || [];
                    const preset = presets.find(p => p.id === e.target.value);
                    updateNodeData(node.id, {
                      presetId: e.target.value,
                      presetName: preset?.name || ''
                    });
                  }}
                  className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                >
                  <option value="">-- {node.data.typeKey === 'aiChat' ? '使用主设置模型' : '请选择生成预设'} --</option>
                  {node.data.typeKey === 'aiChat'
                    ? Object.values(allPresets).flat().map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认模型'})</option>
                      ))
                    : (allPresets[node.data.presetType as string] || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                  }
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
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
                <div className="flex flex-wrap items-end gap-2 pb-1">
                  <button
                    onClick={() => {
                      const newVal = !node.data.autoOptimize;
                      updateNodeData(node.id, { autoOptimize: newVal });
                      if (globalConfig?.updateAutoOptimize) {
                        globalConfig.updateAutoOptimize(newVal);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${node.data.autoOptimize ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                  >
                    <div className={`w-3 h-3 rounded-full ${node.data.autoOptimize ? 'bg-purple-500 animate-pulse' : 'bg-gray-600'}`} />
                    自动优化
                  </button>
                  <button
                    onClick={() => {
                      const newVal = !node.data.twoStepOptimization;
                      updateNodeData(node.id, { twoStepOptimization: newVal });
                      if (globalConfig?.updateTwoStepOptimization) {
                        globalConfig.updateTwoStepOptimization(newVal);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${node.data.twoStepOptimization ? 'bg-pink-500/20 text-pink-300 border-pink-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                  >
                    <div className={`w-3 h-3 rounded-full ${node.data.twoStepOptimization ? 'bg-pink-500 animate-pulse' : 'bg-gray-600'}`} />
                    两阶段优化
                  </button>
                  <button
                    onClick={() => {
                      const newVal = !node.data.asyncOptimize;
                      updateNodeData(node.id, { asyncOptimize: newVal });
                      if (globalConfig?.updateAsyncOptimize) {
                        globalConfig.updateAsyncOptimize(newVal);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${node.data.asyncOptimize ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                    title="优化和正文创作分开进行，提高效率"
                  >
                    <div className={`w-3 h-3 rounded-full ${node.data.asyncOptimize ? 'bg-indigo-500 animate-pulse' : 'bg-gray-600'}`} />
                    异步并行优化
                  </button>
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
                  {activeNovel.referenceFolders?.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => toggleSetReference('folder', folder.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${((node.data.selectedReferenceFolders || []) as string[]).includes(folder.id) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium' : 'bg-[#161922] hover:bg-gray-700 text-gray-400 border border-gray-700/50'}`}
                    >
                      {((node.data.selectedReferenceFolders || []) as string[]).includes(folder.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
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
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">额外指令 (USER PROMPT)</label>
            <textarea
              value={localInstruction}
              onChange={(e) => {
                setLocalInstruction(e.target.value);
                debouncedUpdate({ instruction: e.target.value });
              }}
              placeholder="输入该步骤的特定要求或引导词..."
              className="w-full h-32 bg-[#161922] border border-gray-700/80 rounded-lg p-4 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none font-mono leading-relaxed transition-all"
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-gray-700/30">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Workflow className="w-3.5 h-3.5" /> {node.data.typeKey === 'chapter' ? '章节生成列表' : '生成内容列表 (Output Entries)'}
              </label>
              {node.data.typeKey !== 'chapter' && (
                <button onClick={addEntry} className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                  <Plus className="w-3 h-3" /> 新增条目
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              {node.data.typeKey === 'chapter' && (
                <div className="grid grid-cols-1 gap-2">
                  {((node.data.outputEntries || []) as OutputEntry[]).map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-[#161922] border border-gray-700/50 rounded-lg p-3 hover:bg-[#1a1d29] transition-colors group/chapter cursor-pointer flex items-center justify-between"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPreviewEntry(entry);
                      }}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-200 truncate">{entry.title}</div>
                          <div className="text-[10px] text-gray-500 truncate">{entry.content.replace(/\s+/g, ' ').substring(0, 60)}...</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('确定要删除这条正文记录吗？')) {
                              removeEntry(entry.id);
                            }
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="px-3 py-1 bg-indigo-600/20 text-indigo-400 rounded text-[10px] font-bold group-hover/chapter:bg-indigo-600 group-hover/chapter:text-white transition-all whitespace-nowrap">
                          查看正文
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {node.data.typeKey !== 'chapter' && ((node.data.outputEntries || []) as OutputEntry[]).map((entry) => (
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
    </div>
  );
};

const WorkflowEditorContent = (props: WorkflowEditorProps) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, onStartAutoWrite, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(-1);
  const [stopRequested, setStopRequested] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);

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
  });

  // 加载预设
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat'];
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
    // 如果已经初始化过，且当前正在运行，不要重新从本地存储加载，避免覆盖内存中的执行状态
    if (!isInitialLoadRef.current && isRunning) return;
    if (!isOpen && !isInitialLoadRef.current) return;

    const savedWorkflows = localStorage.getItem('novel_workflows');
    const lastActiveId = localStorage.getItem('active_workflow_id');
    
    let loadedWorkflows: WorkflowData[] = [];
    if (savedWorkflows) {
      try {
        loadedWorkflows = JSON.parse(savedWorkflows);
      } catch (e) {
        console.error('Failed to load workflows', e);
      }
    }

    // 兼容旧版本数据
    if (loadedWorkflows.length === 0) {
      const oldWorkflow = localStorage.getItem('novel_workflow');
      if (oldWorkflow) {
        try {
          const { nodes: oldNodes, edges: oldEdges } = JSON.parse(oldWorkflow);
          loadedWorkflows = [{
            id: 'default',
            name: '默认工作流',
            nodes: oldNodes,
            edges: oldEdges,
            lastModified: Date.now()
          }];
        } catch (e) {}
      } else {
        loadedWorkflows = [{
          id: 'default',
          name: '默认工作流',
          nodes: [],
          edges: [],
          lastModified: Date.now()
        }];
      }
    }

    setWorkflows(loadedWorkflows);
    
    const targetId = lastActiveId && loadedWorkflows.find(w => w.id === lastActiveId)
      ? lastActiveId
      : loadedWorkflows[0].id;
    
    setActiveWorkflowId(targetId);
    loadWorkflow(targetId, loadedWorkflows);
    isInitialLoadRef.current = false;
  }, [isOpen, activeNovel]); // 增加 activeNovel 依赖，确保智能清理逻辑能根据最新数据执行

  const loadWorkflow = (id: string, workflowList: WorkflowData[]) => {
    // 如果工作流正在运行，不要从缓存恢复状态，避免覆盖内存中最新的执行进度
    if (isRunning) return;

    const workflow = workflowList.find(w => w.id === id);
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
            status: n.data.status,
            icon: NODE_CONFIGS[n.data.typeKey as NodeTypeKey]?.icon,
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

  // 自动持久化状态 - 增加防抖处理
  useEffect(() => {
    // 即使界面关闭，如果正在后台运行，也需要持续保存进度
    if ((!isOpen && !isRunning) || workflows.length === 0) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      setWorkflows(prevWorkflows => {
        const updatedWorkflows = prevWorkflows.map(w => {
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
        
        localStorage.setItem('novel_workflows', JSON.stringify(updatedWorkflows));
        localStorage.setItem('active_workflow_id', activeWorkflowId);
        
        return updatedWorkflows;
      });
    }, 1000); // 1秒防抖，避免高频写入

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning]);

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
      // 这里的清理函数在组件卸载时执行
      if (stopRequestedRef.current === false && isRunning) {
        stopWorkflow();
      }
    };
  }, [isRunning]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds)),
    [setEdges]
  );

  const addNewNode = useCallback((typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
    
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

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      data: {
        ...config,
        typeKey,
        label: config.defaultLabel,
        presetId: '',
        presetName: '',
        instruction: '',
        folderName: '',
        asyncOptimize: globalConfig?.asyncOptimize || false,
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        selectedReferenceFolders: [],
        outputEntries: [],
        targetVolumeId: activeNovel?.volumes[0]?.id || '',
        targetVolumeName: '',
        autoOptimize: false,
        twoStepOptimization: false,
      },
      position: {
        x: position.x - 140, // 减去节点宽度的一半 (280/2)
        y: position.y - 40   // 减去大概高度的一半
      },
    };
    setNodes((nds) => [...nds, newNode]);
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
      const oldFolderName = targetNode?.data.folderName;
      const newFolderName = updates.folderName;

      return nds.map((node) => {
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
  const getOrderedNodes = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    nodes.forEach(node => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });
    
    edges.forEach(edge => {
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });
    
    const queue: string[] = [];
    // 找到所有起始节点（入度为0），并按坐标排序作为初始顺序
    const startNodes = nodes.filter(n => (inDegree.get(n.id) || 0) === 0)
                           .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    
    startNodes.forEach(n => queue.push(n.id));
    
    const result: string[] = [];
    const currentInDegree = new Map(inDegree);

    while (queue.length > 0) {
      const uId = queue.shift()!;
      result.push(uId);
      
      const neighbors = adjacencyList.get(uId) || [];
      // 对邻居按坐标排序以保持执行稳定性
      const sortedNeighbors = neighbors
        .map(id => nodes.find(n => n.id === id)!)
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

      sortedNeighbors.forEach(v => {
        const newDegree = (currentInDegree.get(v.id) || 0) - 1;
        currentInDegree.set(v.id, newDegree);
        if (newDegree === 0) queue.push(v.id);
      });
    }
    
    // 补全那些因为循环引用或孤立而被遗漏的节点
    const orderedNodes = result.map(id => nodes.find(n => n.id === id)!);
    const remainingNodes = nodes.filter(n => !result.includes(n.id))
                               .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    
    return [...orderedNodes, ...remainingNodes];
  }, [nodes, edges]);

  // --- 自动化执行引擎 (AI 调用) ---
  const runWorkflow = async (startIndex: number = 0) => {
    if (!globalConfig?.apiKey) {
      setError('请先在主设置中配置 API Key');
      return;
    }
    
    setIsRunning(true);
    setIsPaused(false);
    setStopRequested(false);
    setError(null);
    stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();
    
    try {
      if (!activeNovel) return;

      // 使用 localNovel 跟踪执行过程中的最新状态，避免闭包捕获 stale props
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        localNovel = newNovel;
        // 强制触发持久化，确保在异步执行过程中数据不丢失
        if (onUpdateNovel) {
          onUpdateNovel(newNovel);
        }
      };

      let sortedNodes = getOrderedNodes();
      
      // 重置后续节点的执行状态
      if (startIndex === 0) {
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } })));
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
        // 同步清空快照
        sortedNodes = sortedNodes.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } }));

        // 重新开始时仅清理节点内部产出状态，不再干涉全局资料集和分卷章节
      }

      let accumContext = ''; // 累积全局和常驻上下文
      let lastNodeOutput = ''; // 累积的前序节点产出
      let currentWorkflowFolder = ''; // 当前工作流确定的文件夹名

      // 如果是从中间开始，需要重建上下文
      if (startIndex > 0) {
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
          setIsPaused(true);
          setCurrentNodeIndex(i);
          break;
        }

        const node = sortedNodes[i];
        setCurrentNodeIndex(i);
        
        // 更新节点状态为正在执行
        setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'executing' } } : n));
        
        // 让指向该节点的连线产生动画效果
        setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: true } : e));

        // 视觉反馈增强：为非 AI 调用节点增加最小执行感，确保用户能看到脉冲发光提示
        if (node.data.typeKey === 'userInput' || node.data.typeKey === 'createFolder') {
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
             setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
             continue;
          }

          if (currentWorkflowFolder) {
            const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
              const existing = sets?.find(s => s.name === name);
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
            setNodes(nds => nds.map(n => ({
              ...n,
              data: {
                ...n.data,
                // 仅自动将生成的章节关联到新创建的分卷，除非用户已手动指定
                targetVolumeId: (n.data.typeKey === 'chapter' && (!n.data.targetVolumeId || n.data.targetVolumeId === ''))
                  ? volumeResult.id
                  : n.data.targetVolumeId
              }
            })));
          }
          // 更新节点状态为已完成
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
          // 更新节点状态为已完成
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // 1. 获取对应类型的预设
        let typePresets = allPresets[node.data.presetType as string] || [];
        
        if (node.data.typeKey === 'aiChat') {
          const allAvailablePresets = Object.values(allPresets).flat();
          typePresets = allAvailablePresets;
        }

        let preset = typePresets.find(p => p.id === node.data.presetId);
        if (!preset && node.data.typeKey !== 'aiChat') {
          preset = typePresets[0];
          if (!preset) continue;
        }

        // 2. 构建参考资料上下文 (Context)
        let refContext = '';
        
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
                        // 简单处理：如果是文本类则包含内容，如果是图片/PDF则只列出文件名（因为大模型无法直接处理二进制content数据）
                        const isText = f.type.startsWith('text/') || f.name.endsWith('.md') || f.name.endsWith('.txt');
                        if (isText) {
                            refContext += `· 文件: ${f.name}\n内容: ${f.content}\n---\n`;
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
        let messages: any[] = [];
        
        if (node.data.typeKey === 'aiChat' && !preset) {
            // AI 聊天且未选预设的情况，使用最简单的 User 消息
            messages = [{ role: 'user', content: `${finalContext}要求：${node.data.instruction || '请继续生成'}` }];
        } else if (preset) {
          if (node.data.typeKey === 'chapter') {
            // 对话补全源 (CompletionPreset) 的处理
            const completionPreset = preset as any; // 转换类型
            const prompts = completionPreset.prompts || [];
            messages = prompts
              .filter((p: any) => p.active)
              .map((p: any) => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction)
              }));
          } else {
            // 普通生成预设 (GeneratorPreset) 的处理
            messages = (preset.prompts || [])
              .filter(p => p.enabled)
              .map(p => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction)
              }));
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

          // 3. 确定配置 (优先使用预设配置)
          const nodeApiConfig = (preset as any)?.apiConfig || {};
          const engineConfig = {
            apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
            baseUrl: nodeApiConfig.baseUrl || globalConfig.baseUrl,
            model: nodeApiConfig.model || globalConfig.model,
            contextLength: (preset as any)?.contextLength || globalConfig.contextLength,
            maxReplyLength: (preset as any)?.maxReplyLength || globalConfig.maxReplyLength,
            temperature: (preset as any)?.temperature ?? globalConfig.temperature,
            topP: (preset as any)?.topP ?? globalConfig.topP,
            topK: (preset as any)?.topK ?? globalConfig.topK,
            stream: (preset as any)?.stream ?? globalConfig.stream,
            maxRetries: globalConfig.maxRetries,
            systemPrompt: localNovel.systemPrompt || '你是一个专业的小说家。',
            globalCreationPrompt: globalConfig.globalCreationPrompt,
            longTextMode: globalConfig.longTextMode,
            autoOptimize: node.data.autoOptimize || globalConfig.autoOptimize,
            asyncOptimize: node.data.asyncOptimize || globalConfig.asyncOptimize,
            contextChapterCount: globalConfig.contextChapterCount,
            maxConcurrentOptimizations: globalConfig.maxConcurrentOptimizations,
            consecutiveChapterCount: globalConfig.consecutiveChapterCount || 1,
            smallSummaryInterval: globalConfig.smallSummaryInterval,
            bigSummaryInterval: globalConfig.bigSummaryInterval,
            smallSummaryPrompt: globalConfig.smallSummaryPrompt,
            bigSummaryPrompt: globalConfig.bigSummaryPrompt,
            outlineModel: globalConfig.outlineModel,
          };

          // 4. 初始化引擎
          const engine = new AutoWriteEngine({
            ...engineConfig,
            twoStepOptimization: node.data.twoStepOptimization,
            optimizePresets: globalConfig.optimizePresets,
            activeOptimizePresetId: globalConfig.activeOptimizePresetId,
            analysisPresets: globalConfig.analysisPresets,
            activeAnalysisPresetId: globalConfig.activeAnalysisPresetId,
            asyncOptimize: node.data.asyncOptimize || globalConfig.asyncOptimize,
            contextChapterCount: globalConfig.contextChapterCount,
            maxConcurrentOptimizations: globalConfig.maxConcurrentOptimizations,
          }, localNovel);

          // 4. 计算起始索引
          let writeStartIndex = 0;
          const items = currentSet?.items || [];
          for (let k = 0; k < items.length; k++) {
            const item = items[k];
            const existingChapter = localNovel.chapters.find(c => c.title === item.title);
            if (!existingChapter || !existingChapter.content || existingChapter.content.trim().length === 0) {
              writeStartIndex = k;
              break;
            }
            if (k === items.length - 1) writeStartIndex = items.length;
          }

          if (writeStartIndex >= items.length) {
            setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
            continue;
          }

          // 4. 执行自动化创作
          await engine.run(
            items,
            writeStartIndex,
            globalConfig.prompts.filter(p => p.active),
            globalConfig.getActiveScripts,
            (status) => {
              // 更新节点标签以显示进度，如果状态包含“优化”或“完成”则直接显示，否则增加“创作中”前缀
              const displayStatus = (status.includes('优化') || status.includes('完成')) ? status : `创作中: ${status}`;
              updateNodeData(node.id, { label: displayStatus });
            },
            (updatedNovel) => {
              localNovel = updatedNovel; // 实时同步本地副本
              updateLocalAndGlobal(updatedNovel);
            },
            async (chapterId, content, updatedNovel) => {
              if (updatedNovel) {
                localNovel = updatedNovel;
              }
              if (globalConfig.onChapterComplete) {
                const result = await globalConfig.onChapterComplete(chapterId, content);
                if (result && typeof result === 'object' && (result as Novel).chapters) {
                  localNovel = result as Novel;
                }
              }
              // 实时更新正文生成节点的 outputEntries，以便用户查看
              setNodes(nds => nds.map(n => {
                if (n.id === node.id) {
                  const novel = (localNovel as Novel);
                  
                  // --- 修复：在长文模式下，获取所有相关的章节和总结 ---
                  const targetVolId = n.data.targetVolumeId || finalVolumeId;
                  // 这里必须要包含 subtype 存在的章节（即小总结和大总结）
                  // 核心修复：仅展示内容不为空的章节。
                  // 这样在点击重新开始后（outputEntries已清空），只有新生成内容的章节才会出现在列表中，避免旧章节干扰。
                  const volumeChapters = novel.chapters.filter(c => c.volumeId === targetVolId && c.content && c.content.trim().length > 0);
                  
                  const newEntries: OutputEntry[] = volumeChapters.map(c => ({
                    // 注意：这里 ID 的构造必须和下方排序逻辑中的查找 ID 一致
                    id: (c.subtype === 'small_summary' || c.subtype === 'big_summary') ? `${c.subtype}-${c.id}` : `chapter-${c.id}`,
                    title: c.title,
                    content: c.content || '',
                    versions: c.versions,
                    analysisResult: c.analysisResult
                  }));

                  // 排序：根据小说中实际的章节顺序进行排序
                  const sortedEntries = newEntries.sort((a, b) => {
                    const indexA = novel.chapters.findIndex(c => {
                      const cid = (c.subtype === 'small_summary' || c.subtype === 'big_summary') ? `${c.subtype}-${c.id}` : `chapter-${c.id}`;
                      return cid === a.id;
                    });
                    const indexB = novel.chapters.findIndex(c => {
                      const cid = (c.subtype === 'small_summary' || c.subtype === 'big_summary') ? `${c.subtype}-${c.id}` : `chapter-${c.id}`;
                      return cid === b.id;
                    });
                    return indexA - indexB;
                  });

                  return {
                    ...n,
                    data: {
                      ...n.data,
                      outputEntries: sortedEntries
                    }
                  };
                }
                return n;
              }));
              
              // 核心修复：必须将最新的 localNovel 返回给引擎
              return localNovel;
            },
            finalVolumeId,
            false,
            selectedOutlineSetId,
            abortControllerRef.current?.signal
          );

          updateNodeData(node.id, { label: NODE_CONFIGS.chapter.defaultLabel });
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          // 停止入线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // 5. 调用 AI (针对设定生成、AI 聊天等节点)
        const nodeApiConfig = preset?.apiConfig || {};
        const openai = new OpenAI({
          apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
          baseURL: nodeApiConfig.baseUrl || globalConfig.baseUrl,
          dangerouslyAllowBrowser: true
        });

        terminal.log(`
>> AI REQUEST [工作流: ${node.data.typeLabel}]
>> -----------------------------------------------------------
>> Model:       ${nodeApiConfig.model || globalConfig.model}
>> Temperature: ${preset?.temperature ?? globalConfig.temperature}
>> Top P:       ${preset?.topP ?? globalConfig.topP}
>> Top K:       ${(preset as any)?.topK ?? globalConfig.topK}
>> -----------------------------------------------------------
        `);

        const completion = await openai.chat.completions.create({
          model: nodeApiConfig.model || globalConfig.model,
          messages,
          temperature: preset?.temperature ?? globalConfig.temperature,
          top_p: preset?.topP ?? globalConfig.topP,
          top_k: (preset as any)?.topK ?? globalConfig.topK,
        } as any, { signal: abortControllerRef.current?.signal });

        let result = completion.choices[0]?.message?.content || '';
        
        // 6. 结构化解析 AI 输出并更新节点产物
        let entriesToStore: { title: string; content: string }[] = [];
        
        try {
          // 增强型 JSON 提取逻辑：深度处理包含前置说明文字的情况
          let potentialJson = result.trim();
          
          // 1. 定位 JSON 结构边界
          const firstBracket = potentialJson.indexOf('[');
          const firstBrace = potentialJson.indexOf('{');
          let start = -1;
          let end = -1;

          if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            start = firstBracket;
            end = potentialJson.lastIndexOf(']');
          } else if (firstBrace !== -1) {
            start = firstBrace;
            end = potentialJson.lastIndexOf('}');
          }

          if (start !== -1 && end !== -1 && end > start) {
            potentialJson = potentialJson.substring(start, end + 1);
          }

          // 清理可能的 Markdown 标识
          potentialJson = potentialJson.replace(/```json\s*|```\s*/g, '').trim();

          const parsed = JSON.parse(potentialJson);
          
          // 深度标准化条目提取：精准匹配各设定集的字段名
          const extractEntries = (data: any): {title: string, content: string}[] => {
            if (!data) return [];
            
            // 如果是数组，根据内容结构智能提取
            if (Array.isArray(data)) {
              return data.map(item => {
                if (typeof item === 'string') return { title: `项 ${new Date().toLocaleTimeString()}`, content: item };
                if (typeof item !== 'object' || item === null) return { title: '未命名', content: String(item) };
                
                // 智能优先级匹配标题/键名
                const title = String(item.item || item.name || item.title || item.label || item.key || item.header || item.chapter || Object.keys(item)[0] || '未命名');
                // 智能优先级匹配内容/设定
                const content = String(item.setting || item.bio || item.summary || item.content || item.description || item.value || item.plot || (typeof item === 'object' ? JSON.stringify(item) : item));
                
                return { title, content };
              });
            }
            
            // 如果是对象，递归寻找数组，或者将对象本身视为单条记录/键值对
            if (typeof data === 'object') {
              // 某些模型会返回 { "entries": [...] } 或 { "characters": [...] }
              const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
              if (arrayKey) return extractEntries(data[arrayKey]);
              
              // 如果没有嵌套数组，则将对象的键值对视为条目
              return Object.entries(data).map(([k, v]) => ({
                title: k,
                content: typeof v === 'string' ? v : JSON.stringify(v)
              }));
            }
            return [];
          };

          entriesToStore = extractEntries(parsed);
        } catch (e) {
          // 解析失败，说明不是结构化 JSON，按单条内容处理
          entriesToStore = [{
            title: `生成结果 ${new Date().toLocaleTimeString()}`,
            content: result
          }];
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
        setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
        // 停止入线动画
        setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
      }
      
      if (!stopRequestedRef.current) {
        setCurrentNodeIndex(-1);
        setIsRunning(false);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('Workflow execution aborted by user');
        return; // 用户主动中止，不显示错误弹窗
      }
      console.error(e);
      // 更新当前节点状态为失败
      const currentOrder = getOrderedNodes();
      const failedNode = currentOrder[currentNodeIndex];
      if (failedNode) {
        setNodes(nds => nds.map(n => n.id === failedNode.id ? { ...n, data: { ...n.data, status: 'failed' } } : n));
      }
      // 将报错信息显示在 UI 上，而不是使用 alert
      setError(`执行失败: ${e.message}`);
      setIsRunning(false);
      setIsPaused(true);
    }
  };

  const stopWorkflow = () => {
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
    localStorage.setItem('novel_workflows', JSON.stringify(updatedWorkflows));
    
    setStopRequested(true);
    stopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  };

  const resumeWorkflow = () => {
    if (currentNodeIndex !== -1) {
      runWorkflow(currentNodeIndex);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden relative">
        {/* 执行中状态提示 */}
        {isRunning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] bg-indigo-600/90 border border-indigo-400 px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span className="text-xs font-bold text-white tracking-wide">
              正在执行: {getOrderedNodes()[currentNodeIndex]?.data.typeLabel}
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
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
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
                <button
                  onClick={() => runWorkflow(0)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all"
                >
                  重新开始
                </button>
              </div>
            ) : (
              <button
                onClick={() => runWorkflow(0)}
                disabled={isRunning || nodes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-green-900/20"
              >
                <Play className="w-4 h-4 fill-current" />
                运行工作流
              </button>
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
                      return (
                        <button
                          key={type}
                          onClick={() => addNewNode(type)}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3 transition-colors group"
                        >
                          <div className="p-1.5 rounded bg-gray-900 group-hover:bg-gray-800">
                              <config.icon className="w-4 h-4" style={{ color: config.color }} />
                          </div>
                          {config.typeLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button 
                onClick={() => {
                  setNodes([]);
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
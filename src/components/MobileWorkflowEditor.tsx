import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  Connection,
  Controls,
  Edge,
  getBezierPath,
  Handle,
  NodeProps,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  Copy,
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
  Settings2,
  Square,
  Trash2,
  Upload,
  User,
  Users,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, Novel } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';
import { WorkflowData, WorkflowEditorProps, WorkflowNode, WorkflowNodeData } from './WorkflowEditor';

// --- 类型定义 ---

// 结构化的生成内容条目
interface OutputEntry {
  id: string;
  title: string;
  content: string;
  versions?: any[];
  analysisResult?: string;
}

// --- 移动端优化节点组件 ---
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
    <div className={`px-3 py-2 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '180px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-0.5 flex items-center justify-between">
            {data.typeLabel}
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
            {data.status === 'completed' && <CheckSquare className="w-2.5 h-2.5 text-green-500" />}
          </div>
          <div className="text-[11px] font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      
      {refCount > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700/50 flex items-center gap-1 text-[8px] text-emerald-400">
          <Library className="w-2.5 h-2.5" />
          <span>引用 {refCount} 个资料集</span>
        </div>
      )}

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
}: any) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  const COLORS = {
    primary: 'var(--workflow-edge-color, var(--theme-color, #6366f1))',
    glow: selected ? 'var(--workflow-edge-color, var(--theme-color, #6366f1))' : 'var(--workflow-edge-color-dark, var(--theme-color-hover, #4f46e5))',
  };

  return (
    <>
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={COLORS.glow}
        strokeWidth={selected ? 6 : 3}
        strokeOpacity={0.2}
        style={{ filter: 'blur(4px)' }}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: COLORS.primary,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeOpacity: 0.8,
        }}
      />
      {(animated || selected) && (
        <circle r="2.5" fill="#fff" className="animate-[move_3s_linear_infinite]">
          <animateMotion path={edgePath} dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      <style>{`
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
  createFolder: { typeLabel: '目录', icon: FolderPlus, color: '#818cf8', defaultLabel: '初始化目录', presetType: null },
  reuseDirectory: { typeLabel: '复用', icon: Folder, color: '#fbbf24', defaultLabel: '切换目录节点', presetType: null },
  userInput: { typeLabel: '输入', icon: User, color: '#3b82f6', defaultLabel: '全局输入', presetType: null },
  aiChat: { typeLabel: '聊天', icon: MessageSquare, color: '#a855f7', defaultLabel: '自由对话', presetType: 'chat' },
  inspiration: { typeLabel: '灵感', icon: Lightbulb, color: '#eab308', defaultLabel: '生成灵感', presetType: 'inspiration' },
  worldview: { typeLabel: '世界观', icon: Globe, color: '#10b981', defaultLabel: '构建设定', presetType: 'worldview' },
  characters: { typeLabel: '角色', icon: Users, color: '#f97316', defaultLabel: '塑造人物', presetType: 'character' },
  plotOutline: { typeLabel: '粗纲', icon: LayoutList, color: '#ec4899', defaultLabel: '规划结构', presetType: 'plotOutline' },
  outline: { typeLabel: '大纲', icon: BookOpen, color: '#6366f1', defaultLabel: '细化章节', presetType: 'outline' },
  chapter: { typeLabel: '正文', icon: FileText, color: '#8b5cf6', defaultLabel: '生成章节正文', presetType: 'completion' },
};

// --- 性能优化输入组件 ---
const OptimizedInput = ({ value, onChange, className, placeholder, type = "text" }: any) => {
  // 使用 defaultValue 实现非受控组件，彻底避免打字时的 React 渲染干扰
  return (
    <input
      key={value} // 当值从外部彻底改变时（如切换节点）重新挂载
      type={type}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) {
          onChange(e.target.value);
        }
      }}
      className={className}
      placeholder={placeholder}
    />
  );
};

const OptimizedTextarea = ({ value, onChange, className, placeholder }: any) => {
  return (
    <textarea
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) {
          onChange(e.target.value);
        }
      }}
      className={className}
      placeholder={placeholder}
    />
  );
};

// --- 子组件：配置面板 (实现性能隔离) ---
interface ConfigPanelProps {
  editingNode: WorkflowNode;
  activeNovel: Novel | undefined;
  allPresets: Record<string, GeneratorPreset[]>;
  pendingFolders: string[];
  globalConfig: any;
  onUpdateNodeData: (nodeId: string, updates: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteOutputEntry: (nodeId: string, entryId: string) => void;
  onClose: () => void;
  onPreviewEntry: (entry: OutputEntry) => void;
}

const ConfigPanel = React.memo(({
  editingNode,
  activeNovel,
  allPresets,
  pendingFolders,
  globalConfig,
  onUpdateNodeData,
  onDeleteNode,
  onDeleteOutputEntry,
  onClose,
  onPreviewEntry
}: ConfigPanelProps) => {
  const handleUpdate = (updates: Partial<WorkflowNodeData>) => {
    onUpdateNodeData(editingNode.id, updates);
  };

  const toggleSetReference = (type: 'worldview' | 'character' | 'outline' | 'inspiration' | 'folder', setId: string) => {
    const key = type === 'worldview' ? 'selectedWorldviewSets' :
                type === 'character' ? 'selectedCharacterSets' :
                type === 'outline' ? 'selectedOutlineSets' :
                type === 'inspiration' ? 'selectedInspirationSets' : 'selectedReferenceFolders';
    
    const currentList = [...(editingNode.data[key] as string[])];
    const newList = currentList.includes(setId)
      ? currentList.filter(id => id !== setId)
      : [...currentList, setId];
      
    onUpdateNodeData(editingNode.id, { [key]: newList });
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-[130] flex flex-col animate-in slide-in-from-bottom duration-300">
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${editingNode.data.color}20`, color: editingNode.data.color }}>
            {(() => { const Icon = editingNode.data.icon; return <Icon className="w-5 h-5" /> })()}
          </div>
          <h3 className="font-bold text-gray-100 truncate max-w-[200px]">{editingNode.data.label}</h3>
        </div>
        <button onClick={onClose} className="p-2 bg-gray-700 rounded-full text-gray-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24 custom-scrollbar">
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">模块名称</label>
          <OptimizedInput
            value={editingNode.data.label}
            onChange={(val: string) => handleUpdate({ label: val })}
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-indigo-500 shadow-inner"
          />
        </div>

        {(editingNode.data.typeKey === 'createFolder' || editingNode.data.typeKey === 'reuseDirectory') && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" /> 关联目录名
            </label>
            <div className="flex gap-2">
              <OptimizedInput
                value={editingNode.data.folderName}
                onChange={(val: string) => handleUpdate({ folderName: val })}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-indigo-500"
                placeholder="输入文件夹名称..."
              />
              {editingNode.data.typeKey === 'reuseDirectory' && activeNovel && (
                <select
                  className="bg-gray-800 border border-gray-700 rounded-2xl px-2 text-xs text-gray-300 outline-none"
                  onChange={(e) => handleUpdate({ folderName: e.target.value })}
                  value=""
                >
                  <option value="" disabled>选择...</option>
                  {Array.from(new Set([
                    ...(activeNovel.volumes?.map(v => v.title) || []),
                    ...(activeNovel.worldviewSets?.map(s => s.name) || []),
                    ...(activeNovel.characterSets?.map(s => s.name) || []),
                    ...(activeNovel.outlineSets?.map(s => s.name) || [])
                  ])).filter(Boolean).map(name => (
                    <option key={name as string} value={name as string}>{name as string}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {editingNode.data.presetType && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5" /> AI 预设
            </label>
            <div className="relative">
              <select
                value={editingNode.data.presetId as string}
                onChange={(e) => onUpdateNodeData(editingNode.id, { presetId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
              >
                <option value="">-- 请选择预设 --</option>
                {(allPresets[editingNode.data.presetType as string] || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>
        )}

        {editingNode.data.typeKey === 'chapter' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <Library className="w-3.5 h-3.5" /> 保存至分卷
              </label>
              <select
                value={editingNode.data.targetVolumeId as string}
                onChange={(e) => onUpdateNodeData(editingNode.id, { targetVolumeId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
              >
                <option value="">-- 自动匹配同名分卷 --</option>
                <option value="NEW_VOLUME">+ 新建分卷...</option>
                {activeNovel?.volumes.map(v => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
              {editingNode.data.targetVolumeId === 'NEW_VOLUME' && (
                <OptimizedInput
                  value={editingNode.data.targetVolumeName}
                  onChange={(val: string) => handleUpdate({ targetVolumeName: val })}
                  placeholder="输入新分卷名称..."
                  className="w-full bg-gray-800 border border-indigo-900/40 rounded-2xl px-5 py-3 text-white text-xs outline-none focus:border-indigo-500"
                />
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">创作指令 (User Prompt)</label>
          <OptimizedTextarea
            value={editingNode.data.instruction}
            onChange={(val: string) => handleUpdate({ instruction: val })}
            className="w-full h-56 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
            placeholder="在此输入具体要求..."
          />
        </div>

        {editingNode.data.typeKey !== 'userInput' && activeNovel && (
          <div className="space-y-6 pt-6 border-t border-gray-800">
            <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5" /> 关联参考资料集
            </label>
            
            <div className="space-y-4">
              {[
                { label: '世界观', key: 'selectedWorldviewSets', sets: activeNovel.worldviewSets, icon: Globe, color: 'text-emerald-500' },
                { label: '角色', key: 'selectedCharacterSets', sets: activeNovel.characterSets, icon: Users, color: 'text-orange-500' },
                { label: '粗纲', key: 'selectedOutlineSets', sets: activeNovel.outlineSets, icon: LayoutList, color: 'text-pink-500' },
                { label: '灵感', key: 'selectedInspirationSets', sets: activeNovel.inspirationSets, icon: Lightbulb, color: 'text-yellow-500' }
              ].map(group => (
                <div key={group.key} className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                    <group.icon className={`w-3 h-3 ${group.color}`}/> {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {group.sets?.map(set => {
                      const isSelected = (editingNode.data[group.key] as string[]).includes(set.id);
                      return (
                        <button
                          key={set.id}
                          onClick={() => toggleSetReference(group.key.replace('selected', '').replace('Sets', '').toLowerCase() as any, set.id)}
                          className={`px-3 py-2 rounded-xl text-xs transition-all border ${isSelected ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50 font-bold' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                        >
                          {set.name}
                        </button>
                      );
                    })}
                    {/* 显示计划中的文件夹 */}
                    {pendingFolders.filter(name => !group.sets?.some((s: any) => s.name === name)).map(name => {
                      const pendingId = `pending:${name}`;
                      const isSelected = (editingNode.data[group.key] as string[]).includes(pendingId);
                      return (
                        <button
                          key={pendingId}
                          onClick={() => toggleSetReference(group.key.replace('selected', '').replace('Sets', '').toLowerCase() as any, pendingId)}
                          className={`px-3 py-2 rounded-xl text-xs transition-all border border-dashed ${isSelected ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50 font-bold' : 'bg-gray-800/40 text-gray-500 border-gray-700'}`}
                        >
                          {name} (计划中)
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-2">
                <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                  <Folder className="w-3 h-3 text-blue-500"/> 参考资料库文件夹
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {activeNovel.referenceFolders?.map(folder => {
                    const isSelected = (editingNode.data.selectedReferenceFolders as string[])?.includes(folder.id);
                    return (
                      <button
                        key={folder.id}
                        onClick={() => toggleSetReference('folder', folder.id)}
                        className={`px-3 py-2 rounded-xl text-xs transition-all border ${isSelected ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 font-bold' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                      >
                        {folder.name}
                      </button>
                    );
                  })}
                  {(!activeNovel.referenceFolders || activeNovel.referenceFolders.length === 0) && (
                    <div className="text-[10px] text-gray-600 italic">暂无文件夹</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {editingNode.data.typeKey === 'chapter' ? (
          <div className="space-y-4 pt-6 border-t border-gray-800">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> 生成产物说明
            </label>
            <div className="text-center py-10 bg-gray-800/50 rounded-[2.5rem] border border-dashed border-gray-700">
              <p className="text-sm text-gray-400">章节已保存至小说目录</p>
              <p className="text-[10px] text-gray-500 mt-1 px-10">请通过主界面的侧边栏查看和管理生成的章节内容。</p>
            </div>
          </div>
        ) : (editingNode.data.outputEntries as OutputEntry[])?.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-gray-800">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">产出 ({(editingNode.data.outputEntries as OutputEntry[]).length})</label>
            <div className="space-y-3">
              {(editingNode.data.outputEntries as OutputEntry[]).map(entry => (
                <div key={entry.id} className="p-4 bg-gray-800 border border-gray-700 rounded-2xl flex items-center justify-between active:bg-gray-700" onClick={() => onPreviewEntry(entry)}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-200 truncate">{entry.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定要删除这条产出吗？')) {
                          onDeleteOutputEntry(editingNode.id, entry.id);
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronDown className="w-4 h-4 text-gray-600 -rotate-90" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-gray-800 border-t border-gray-700 sticky bottom-0 z-10 flex gap-4">
        <button onClick={() => { if(confirm('确定要删除这个模块吗？')) { onDeleteNode(editingNode.id); } }} className="p-4 bg-red-900/20 text-red-400 rounded-2xl">
          <Trash2 className="w-6 h-6" />
        </button>
        <button onClick={onClose} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">
          确定并返回
        </button>
      </div>
    </div>
  );
});

export const MobileWorkflowEditor: React.FC<WorkflowEditorProps> = (props) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, onStartAutoWrite, globalConfig } = props;
  
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
  const [error, setError] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeNovelRef = useRef(activeNovel);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  // 获取工作流中所有“初始化目录”节点定义的文件夹名
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

  // 加载配置和数据
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat'];
    const loaded: Record<string, GeneratorPreset[]> = {};
    types.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        loaded[t] = saved ? JSON.parse(saved) : [];
      } catch (e) { loaded[t] = []; }
    });
    setAllPresets(loaded);

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
  }, [isOpen, activeNovel]);

  const loadWorkflow = (id: string, workflowList: WorkflowData[]) => {
    if (isRunning) return;
    const workflow = workflowList.find(w => w.id === id);
    if (workflow) {
      const restoredNodes = (workflow.nodes || []).map((n: WorkflowNode) => {
        const workflowFolderName = (workflow.nodes || []).find(node => node.data.typeKey === 'createFolder')?.data.folderName;
        const filterLegacyRefs = (list: string[] | undefined, type: 'worldview' | 'character' | 'outline' | 'inspiration') => {
          if (!list) return [];
          return list.filter(setId => {
            if (!setId || typeof setId !== 'string') return false;
            if (setId.startsWith('pending:')) return false;
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
      setEdges(workflow.edges || []);
      setCurrentNodeIndex(workflow.currentNodeIndex !== undefined ? workflow.currentNodeIndex : -1);
      setIsPaused(workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1);
    }
  };

  // 自动保存 - 增加防抖处理
  useEffect(() => {
    if (!isOpen || workflows.length === 0 || isInitialLoadRef.current) return;
    
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
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isOpen]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds)),
    [setEdges]
  );

  const addNewNode = (typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
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
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        outputEntries: [],
        targetVolumeId: activeNovel?.volumes[0]?.id || '',
        status: 'pending'
      },
      position: { x: 50, y: 100 + nodes.length * 100 },
    };
    setNodes([...nodes, newNode]);
    setShowAddMenu(false);
  };

  const cloneNode = (node: WorkflowNode) => {
    const newNode: WorkflowNode = {
      ...node,
      id: `node-${Date.now()}`,
      position: { x: node.position.x + 20, y: node.position.y + 20 },
      data: {
        ...node.data,
        label: `${node.data.label} (复用)`,
        status: 'pending',
        outputEntries: []
      }
    };
    setNodes([...nodes, newNode]);
  };

  const updateNodeData = (nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes((nds) => {
      const targetNode = nds.find(n => n.id === nodeId);
      const isRenameFolder = (targetNode?.data.typeKey === 'createFolder' || targetNode?.data.typeKey === 'reuseDirectory') && updates.folderName !== undefined && updates.folderName !== targetNode?.data.folderName;

      return nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
        }
        
        // 如果是目录节点重命名，清空其他节点的产物
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
  };

  const deleteOutputEntry = (nodeId: string, entryId: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            outputEntries: (n.data.outputEntries || []).filter(e => e.id !== entryId)
          }
        };
      }
      return n;
    }));
  };

  const handleSaveWorkflow = () => {
    // 同时更新 workflows 列表中的当前项并保存，确保双重保险
    const updatedWorkflows = workflows.map(w =>
      w.id === activeWorkflowId ? { ...w, nodes, edges, currentNodeIndex, lastModified: Date.now() } : w
    );
    setWorkflows(updatedWorkflows);
    localStorage.setItem('novel_workflows', JSON.stringify(updatedWorkflows));
    localStorage.setItem('active_workflow_id', activeWorkflowId);
    
    // 兼容旧版单一保存位置
    localStorage.setItem('novel_workflow', JSON.stringify({ nodes, edges }));
    
    setError('工作流已手动保存');
    setTimeout(() => setError(null), 2000);
  };

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

  const deleteWorkflow = (id: string) => {
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
    const exportData = {
      ...workflow,
      nodes: workflow.nodes.map(n => ({
        ...n,
        data: { ...n.data, status: 'pending', outputEntries: [] }
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
        if (!imported.nodes || !imported.edges) throw new Error('无效格式');
        const newId = `wf_imported_${Date.now()}`;
        const newWf: WorkflowData = { ...imported, id: newId, name: `${imported.name} (导入)`, lastModified: Date.now() };
        setWorkflows(prev => [...prev, newWf]);
        switchWorkflow(newId);
      } catch (err: any) { setError(`导入失败: ${err.message}`); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- 拓扑排序 ---
  const getOrderedNodes = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    nodes.forEach(node => { adjacencyList.set(node.id, []); inDegree.set(node.id, 0); });
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
    
    const orderedNodes = result.map(id => nodes.find(n => n.id === id)!);
    const remainingNodes = nodes.filter(n => !result.includes(n.id))
                               .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    
    return [...orderedNodes, ...remainingNodes];
  }, [nodes, edges]);

  // --- 执行引擎 ---
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

      // 使用 localNovel 跟踪执行过程中的最新状态
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        // 核心修复：合并状态时保留 UI 特有的折叠状态
        const currentActiveNovel = activeNovelRef.current;
        const mergedNovel: Novel = {
          ...newNovel,
          volumes: newNovel.volumes.map(v => {
            const existingVol = currentActiveNovel?.volumes.find(ev => ev.id === v.id);
            return existingVol ? { ...v, collapsed: existingVol.collapsed } : v;
          })
        };
        localNovel = mergedNovel;
        if (onUpdateNovel) {
          onUpdateNovel(mergedNovel);
        }
      };

      let sortedNodes = getOrderedNodes();
      
      // 重置后续节点的执行状态
      if (startIndex === 0) {
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } })));
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
        
        // 同步清空快照，防止历史记录累加
        sortedNodes = sortedNodes.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } }));

        // --- 核心修复：重新开始时清除关联目录下的内容 ---
        // 查找第一个定义了目录名的节点（无论是创建还是复用）
        const firstDirNode = getOrderedNodes().find(n => (n.data.typeKey === 'createFolder' || n.data.typeKey === 'reuseDirectory') && n.data.folderName);
        const workflowFolderName = firstDirNode?.data.folderName;

        if (workflowFolderName && onUpdateNovel) {
          const updatedNovel = { ...localNovel };
          let novelChanged = false;

          // 清理世界观
          if (updatedNovel.worldviewSets) {
            updatedNovel.worldviewSets = updatedNovel.worldviewSets.map(s =>
              s.name === workflowFolderName ? { ...s, entries: [] } : s
            );
            novelChanged = true;
          }
          // 清理角色
          if (updatedNovel.characterSets) {
            updatedNovel.characterSets = updatedNovel.characterSets.map(s =>
              s.name === workflowFolderName ? { ...s, characters: [] } : s
            );
            novelChanged = true;
          }
          // 清理粗纲
          if (updatedNovel.outlineSets) {
            updatedNovel.outlineSets = updatedNovel.outlineSets.map(s =>
              s.name === workflowFolderName ? { ...s, items: [] } : s
            );
            novelChanged = true;
          }
          // 清理灵感
          if (updatedNovel.inspirationSets) {
            updatedNovel.inspirationSets = updatedNovel.inspirationSets.map(s =>
              s.name === workflowFolderName ? { ...s, items: [] } : s
            );
            novelChanged = true;
          }
          // 清理剧情粗纲
          if (updatedNovel.plotOutlineSets) {
            updatedNovel.plotOutlineSets = updatedNovel.plotOutlineSets.map(s =>
              s.name === workflowFolderName ? { ...s, items: [] } : s
            );
            novelChanged = true;
          }
          // 清理相关章节 (根据分卷名称匹配)
          const targetVolume = updatedNovel.volumes?.find(v => v.title === workflowFolderName);
          if (targetVolume) {
            updatedNovel.chapters = (updatedNovel.chapters || []).filter(c => c.volumeId !== targetVolume.id);
            novelChanged = true;
          }

          if (novelChanged) {
            localNovel = updatedNovel;
            onUpdateNovel(updatedNovel);
          }
        }
      }

      const resolvePendingRef = (list: string[], sets: any[] | undefined) => {
        if (!list) return [];
        return list.map(id => {
          if (id && typeof id === 'string' && id.startsWith('pending:')) {
            const folderName = id.replace('pending:', '');
            const matched = sets?.find(s => s.name === folderName);
            return matched ? matched.id : id;
          }
          return id;
        });
      };

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

        // 视觉反馈增强
        if (node.data.typeKey === 'userInput' || node.data.typeKey === 'createFolder') {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // 处理创建文件夹节点
        if (node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          if (node.data.folderName) {
            currentWorkflowFolder = node.data.folderName;
          }
          
          if (node.data.typeKey === 'reuseDirectory') {
             setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
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

            setNodes(nds => nds.map(n => ({
              ...n,
              data: {
                ...n.data,
                targetVolumeId: (n.data.typeKey === 'chapter' && (!n.data.targetVolumeId || n.data.targetVolumeId === ''))
                  ? volumeResult.id
                  : n.data.targetVolumeId
              }
            })));
          }
          // 更新节点状态为已完成
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        // 获取对应类型的预设
        let typePresets = allPresets[node.data.presetType as string] || [];
        if (node.data.typeKey === 'aiChat') {
          typePresets = Object.values(allPresets).flat();
        }

        let preset = typePresets.find(p => p.id === node.data.presetId);
        if (!preset && node.data.typeKey !== 'aiChat') {
          preset = typePresets[0];
          if (!preset) continue;
        }

        // 构建参考资料上下文
        let refContext = '';
        let selectedWorldview = resolvePendingRef([...(node.data.selectedWorldviewSets || [])], localNovel.worldviewSets);
        let selectedCharacters = resolvePendingRef([...(node.data.selectedCharacterSets || [])], localNovel.characterSets);
        let selectedOutlines = resolvePendingRef([...(node.data.selectedOutlineSets || [])], localNovel.outlineSets);
        let selectedInspirations = resolvePendingRef([...(node.data.selectedInspirationSets || [])], localNovel.inspirationSets);
        let selectedFolders = [...(node.data.selectedReferenceFolders || [])];

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
                folderFiles.forEach(f => {
                    const isText = f.type.startsWith('text/') || f.name.endsWith('.md') || f.name.endsWith('.txt');
                    if (isText) refContext += `· 文件: ${f.name}\n内容: ${f.content}\n---\n`;
                });
            }
        });

        const isDuplicate = lastNodeOutput && refContext.includes(lastNodeOutput.substring(0, 100));
        const finalContext = `${refContext}${accumContext}${(!isDuplicate && lastNodeOutput) ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''}`;
        
        let messages: any[] = [];
        
        if (node.data.typeKey === 'aiChat' && !preset) {
            messages = [{ role: 'user', content: `${finalContext}要求：${node.data.instruction || '请继续生成'}` }];
        } else if (preset) {
          if (node.data.typeKey === 'chapter') {
            const completionPreset = preset as any;
            messages = (completionPreset.prompts || [])
              .filter((p: any) => p.active)
              .map((p: any) => ({
                role: p.role,
                content: p.content.replace('{{context}}', finalContext).replace('{{input}}', node.data.instruction)
              }));
          } else {
            messages = (preset.prompts || [])
              .filter(p => p.enabled)
              .map(p => ({
                role: p.role,
                content: p.content.replace('{{context}}', finalContext).replace('{{input}}', node.data.instruction)
              }));
          }
        }

        if (messages.length === 0) messages.push({ role: 'user', content: node.data.instruction || '请生成内容' });

        // 处理正文生成节点
        if (node.data.typeKey === 'chapter') {
          if (!globalConfig) throw new Error('缺失全局配置');

          let selectedOutlineSetId = node.data.selectedOutlineSets && node.data.selectedOutlineSets.length > 0
            ? resolvePendingRef([node.data.selectedOutlineSets[0]], localNovel.outlineSets)[0]
            : null;

          if (!selectedOutlineSetId || selectedOutlineSetId.startsWith('pending:')) {
             const matched = localNovel.outlineSets?.find(s => s.name === currentWorkflowFolder);
             if (matched) selectedOutlineSetId = matched.id;
          }

          let currentSet = localNovel.outlineSets?.find(s => s.id === selectedOutlineSetId);
          if (!currentSet || !currentSet.items || currentSet.items.length === 0) {
            const fallbackSet = localNovel.outlineSets?.[localNovel.outlineSets.length - 1];
            if (fallbackSet && fallbackSet.items && fallbackSet.items.length > 0 && (!currentWorkflowFolder || fallbackSet.name === currentWorkflowFolder)) {
              currentSet = fallbackSet;
            } else {
              throw new Error(`未关联大纲集或关联的大纲集内容为空`);
            }
          }

          let finalVolumeId = node.data.targetVolumeId as string;
          const latestVolumes = localNovel.volumes || [];
          if (finalVolumeId && finalVolumeId !== 'NEW_VOLUME') {
            const exists = latestVolumes.some(v => v.id === finalVolumeId);
            if (!exists) finalVolumeId = '';
          }
          if (!finalVolumeId || finalVolumeId === '') {
            const matchedVol = latestVolumes.find(v => v.title === currentWorkflowFolder);
            if (matchedVol) {
              finalVolumeId = matchedVol.id;
              updateNodeData(node.id, { targetVolumeId: finalVolumeId });
            }
          }
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
            const updatedNovel = { ...localNovel, volumes: [...(localNovel.volumes || []), newVolume] };
            finalVolumeId = newVolume.id;
            updateLocalAndGlobal(updatedNovel);
            updateNodeData(node.id, { targetVolumeId: finalVolumeId, targetVolumeName: '' });
          }

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
            autoOptimize: globalConfig.autoOptimize,
            twoStepOptimization: globalConfig.twoStepOptimization,
            asyncOptimize: globalConfig.asyncOptimize,
            consecutiveChapterCount: globalConfig.consecutiveChapterCount || 1,
            smallSummaryInterval: globalConfig.smallSummaryInterval,
            bigSummaryInterval: globalConfig.bigSummaryInterval,
            smallSummaryPrompt: globalConfig.smallSummaryPrompt,
            bigSummaryPrompt: globalConfig.bigSummaryPrompt,
            outlineModel: globalConfig.outlineModel,
            contextChapterCount: globalConfig.contextChapterCount,
            optimizeModel: globalConfig.optimizeModel,
            analysisModel: globalConfig.analysisModel,
            optimizePresets: globalConfig.optimizePresets,
            activeOptimizePresetId: globalConfig.activeOptimizePresetId,
            analysisPresets: globalConfig.analysisPresets,
            activeAnalysisPresetId: globalConfig.activeAnalysisPresetId,
            maxConcurrentOptimizations: globalConfig.maxConcurrentOptimizations,
          };

          const engine = new AutoWriteEngine({
            ...engineConfig,
            contextChapterCount: globalConfig.contextChapterCount,
          }, localNovel);

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

          await engine.run(items, writeStartIndex, globalConfig.prompts.filter(p => p.active),
            () => {
              // 核心修复：工作流执行时，必须根据当前节点所选的 AI 预设来合并正则脚本
              const baseScripts = globalConfig.getActiveScripts() || [];
              const presetScripts = (preset as any)?.regexScripts || [];
              return [...baseScripts, ...presetScripts];
            },
            (s) => {
              const displayStatus = s.includes('完成') ? s : `创作中: ${s}`;
              updateNodeData(node.id, { label: displayStatus });
            },
            (n) => {
              localNovel = n; // 实时同步本地副本
              updateLocalAndGlobal(n);
            },
            async (id, content, updatedNovel) => {
              // 1. 优先使用引擎传递的最新状态
              if (updatedNovel) {
                localNovel = updatedNovel;
              }
              // 2. 执行全局完成回调（触发总结生成等异步副作用）并捕获返回的最终状态
              if (globalConfig.onChapterComplete) {
                const result = await (globalConfig.onChapterComplete as any)(id, content, updatedNovel);
                if (result && typeof result === 'object' && (result as Novel).chapters) {
                  localNovel = result as Novel;
                }
              }
              // 正文生成节点不再维护 outputEntries 列表，因为内容直接写入目录

              // 核心修复：必须返回最新的 localNovel 给引擎，解决手机端状态覆盖问题
              return localNovel;
            },
            finalVolumeId, false, selectedOutlineSetId
          );
          updateNodeData(node.id, { label: NODE_CONFIGS.chapter.defaultLabel });
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }

        const nodeApiConfig = preset?.apiConfig || {};
        
        // 确定该功能模块对应的全局模型设置
        let featureModel = globalConfig.model;
        if (node.data.typeKey === 'outline') featureModel = globalConfig.outlineModel;
        else if (node.data.typeKey === 'characters') featureModel = globalConfig.characterModel;
        else if (node.data.typeKey === 'worldview') featureModel = globalConfig.worldviewModel;
        else if (node.data.typeKey === 'inspiration') featureModel = globalConfig.inspirationModel;
        else if (node.data.typeKey === 'plotOutline') featureModel = globalConfig.plotOutlineModel;

        const finalModel = nodeApiConfig.model || featureModel || globalConfig.model;

        const openai = new OpenAI({
          apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
          baseURL: nodeApiConfig.baseUrl || globalConfig.baseUrl,
          dangerouslyAllowBrowser: true
        });

        terminal.log(`
>> AI REQUEST [工作流(移动端): ${node.data.typeLabel}]
>> -----------------------------------------------------------
>> Model:       ${finalModel}
>> Temperature: ${preset?.temperature ?? globalConfig.temperature}
>> Top P:       ${preset?.topP ?? globalConfig.topP}
>> Top K:       ${(preset as any)?.topK ?? globalConfig.topK}
>> -----------------------------------------------------------
        `);

        const completion = await openai.chat.completions.create({
          model: finalModel,
          messages,
          temperature: preset?.temperature ?? globalConfig.temperature,
          top_p: preset?.topP ?? globalConfig.topP,
          top_k: (preset as any)?.topK ?? globalConfig.topK,
        } as any, { signal: abortControllerRef.current?.signal });

        const result = completion.choices[0]?.message?.content || '';
        if (!result || result.trim().length === 0) {
          throw new Error('AI 返回内容为空，已终止工作流。请检查网络或模型配置。');
        }
        terminal.log(`[Workflow Output] ${node.data.typeLabel} - ${node.data.label}:\n${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`);
        
        // 6. 结构化解析 AI 输出并更新节点产物
        let entriesToStore: { title: string; content: string }[] = [];
        
        try {
          // 增强型 JSON 提取逻辑
          let potentialJson = result.trim();
          
          // 1. 预处理：清理模型可能输出的废弃标记
          potentialJson = potentialJson.replace(/\[\/?JSON\]/gi, '').trim();

          // 2. 移除 Markdown 代码块标记（如果存在）
          potentialJson = potentialJson.replace(/```json\s*([\s\S]*?)```/g, '$1')
                                       .replace(/```\s*([\s\S]*?)```/g, '$1').trim();

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

          if (start !== -1 && end !== -1 && end >= start) {
            potentialJson = potentialJson.substring(start, end + 1);
          }

          let parsed;
          try {
            parsed = JSON.parse(potentialJson);
          } catch (e) {
            const match = potentialJson.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (match) {
              parsed = JSON.parse(match[0]);
            } else {
              throw e;
            }
          }
          
          const extractEntries = (data: any): {title: string, content: string}[] => {
            if (!data) return [];
            if (Array.isArray(data)) {
              return data.map(item => {
                if (typeof item === 'string') return { title: `项 ${new Date().toLocaleTimeString()}`, content: item };
                if (typeof item !== 'object' || item === null) return { title: '未命名', content: String(item) };
                const title = String(item.item || item.name || item.title || item.label || item.key || item.header || item.chapter || Object.keys(item)[0] || '未命名');
                const content = String(item.setting || item.bio || item.summary || item.content || item.description || item.value || item.plot || (typeof item === 'object' ? JSON.stringify(item) : item));
                return { title, content };
              });
            }
            if (typeof data === 'object') {
              const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
              if (arrayKey) return extractEntries(data[arrayKey]);
              return Object.entries(data).map(([k, v]) => ({
                title: k,
                content: typeof v === 'string' ? v : JSON.stringify(v)
              }));
            }
            return [];
          };

          entriesToStore = extractEntries(parsed);
        } catch (e) {
          entriesToStore = [{
            title: `生成结果 ${new Date().toLocaleTimeString()}`,
            content: result
          }];
        }

        const newEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({ id: `${Date.now()}-${idx}`, title: e.title, content: e.content }));
        updateNodeData(node.id, { status: 'completed', outputEntries: [...newEntries, ...(node.data.outputEntries || [])] });

        // 持久化到 Novel
        if (currentWorkflowFolder) {
          const folderName = currentWorkflowFolder;
          let updatedNovelState = { ...localNovel };
          let novelChanged = false;
          
          const updateSets = (sets: any[] | undefined, type: string) => {
            const targetSet = sets?.find(s => s.name === folderName);
            if (targetSet) {
              const newItems = [...(type === 'worldview' ? targetSet.entries : type === 'character' ? targetSet.characters : targetSet.items)];
              entriesToStore.forEach(e => {
                const titleKey = type === 'worldview' ? 'item' : type === 'character' ? 'name' : 'title';
                const contentKey = type === 'worldview' ? 'setting' : type === 'character' ? 'bio' : (type === 'plotOutline' ? 'description' : (type === 'inspiration' ? 'content' : 'summary'));
                const idx = newItems.findIndex((ni: any) => ni[titleKey] === e.title);
                const newItem = { [titleKey]: e.title, [contentKey]: e.content };
                if (type === 'plotOutline' && idx === -1) (newItem as any).id = `plot_${Date.now()}`;
                if (idx !== -1) newItems[idx] = { ...newItems[idx], ...newItem };
                else newItems.push(newItem);
              });
              novelChanged = true;
              return sets?.map(s => s.id === targetSet.id ? { ...s, [type === 'worldview' ? 'entries' : type === 'character' ? 'characters' : 'items']: newItems } : s);
            }
            return sets;
          };

          if (node.data.typeKey === 'worldview') updatedNovelState.worldviewSets = updateSets(updatedNovelState.worldviewSets, 'worldview');
          else if (node.data.typeKey === 'characters') updatedNovelState.characterSets = updateSets(updatedNovelState.characterSets, 'character');
          else if (node.data.typeKey === 'outline') updatedNovelState.outlineSets = updateSets(updatedNovelState.outlineSets, 'outline');
          else if (node.data.typeKey === 'inspiration') updatedNovelState.inspirationSets = updateSets(updatedNovelState.inspirationSets, 'inspiration');
          else if (node.data.typeKey === 'plotOutline') updatedNovelState.plotOutlineSets = updateSets(updatedNovelState.plotOutlineSets, 'plotOutline');

          if (novelChanged) await updateLocalAndGlobal(updatedNovelState);
        }

        lastNodeOutput += `【${node.data.typeLabel}输出】：\n${result}\n\n`;
      }
      
      // 强制清理所有节点的执行状态，确保动画停止
      setNodes(nds => nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          status: n.data.status === 'executing' ? 'completed' : n.data.status
        }
      })));
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));

      if (!stopRequestedRef.current) { setCurrentNodeIndex(-1); setIsRunning(false); }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(`执行失败: ${e.message}`);
      setIsRunning(false);
    }
  };

  const stopWorkflow = () => { stopRequestedRef.current = true; abortControllerRef.current?.abort(); setIsRunning(false); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col animate-in fade-in duration-200 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Workflow className="w-5 h-5 text-indigo-400 shrink-0" />
          <div className="relative min-w-0 flex-1">
            {isEditingWorkflowName ? (
              <input
                autoFocus
                type="text"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                onBlur={() => renameWorkflow(activeWorkflowId, newWorkflowName)}
                onKeyDown={(e) => e.key === 'Enter' && renameWorkflow(activeWorkflowId, newWorkflowName)}
                className="bg-gray-700 border border-indigo-500 rounded px-2 py-1 text-xs text-white outline-none w-full"
              />
            ) : (
              <div className="flex items-center gap-1 min-w-0">
                <button onClick={() => setShowWorkflowMenu(!showWorkflowMenu)} className="font-bold text-sm text-gray-100 flex items-center gap-1 min-w-0">
                  <span className="truncate">{workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                <button
                  onClick={() => {
                    setNewWorkflowName(workflows.find(w => w.id === activeWorkflowId)?.name || '');
                    setIsEditingWorkflowName(true);
                  }}
                  className="p-1 text-gray-500"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
            {showWorkflowMenu && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-in slide-in-from-top-2 duration-200">
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {workflows.map(wf => (
                    <div key={wf.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-700">
                      <button onClick={() => switchWorkflow(wf.id)} className={`flex-1 text-left text-sm truncate ${activeWorkflowId === wf.id ? 'text-indigo-400' : 'text-gray-300'}`}>{wf.name}</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }} className="p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-700 mt-2 pt-2 px-2 space-y-1">
                  <button onClick={createNewWorkflow} className="w-full text-left px-3 py-2 text-xs text-indigo-400 font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> 创建新工作流</button>
                  <label className="w-full text-left px-3 py-2 text-xs text-emerald-400 font-bold flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /> 导入工作流<input type="file" accept=".json" onChange={importWorkflow} className="hidden" /></label>
                  <button onClick={() => exportWorkflow(activeWorkflowId)} className="w-full text-left px-3 py-2 text-xs text-amber-400 font-bold flex items-center gap-2"><Download className="w-4 h-4" /> 导出当前工作流</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isRunning && (
            <button
              onClick={handleSaveWorkflow}
              className="p-2 bg-gray-700/50 text-indigo-400 rounded-lg border border-gray-600/50 active:scale-95 transition-all"
              title="保存"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
          {isRunning ? (
            <button onClick={stopWorkflow} className="bg-red-600/20 text-red-500 p-2 rounded-lg border border-red-500/20"><Square className="w-4 h-4 fill-current" /></button>
          ) : isPaused && currentNodeIndex !== -1 ? (
            <div className="flex items-center gap-1">
              <button onClick={() => runWorkflow(currentNodeIndex)} className="bg-blue-600/20 text-blue-500 p-2 rounded-lg border border-blue-500/20"><Play className="w-4 h-4 fill-current" /></button>
              <button onClick={() => runWorkflow(0)} className="text-[10px] text-gray-400 px-2">重开</button>
            </div>
          ) : (
            <button onClick={() => runWorkflow(0)} disabled={nodes.length === 0} className="bg-green-600/20 text-green-500 p-2 rounded-lg border border-green-500/20 disabled:opacity-50"><Play className="w-4 h-4 fill-current" /></button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-6 h-6" /></button>
        </div>
      </div>

      {/* 画布 */}
      <div className={`flex-1 relative bg-[#1a1a1a] ${editingNodeId ? 'invisible h-0' : 'visible'}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setEditingNodeId(node.id)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          colorMode="dark"
          defaultEdgeOptions={{ type: 'custom', animated: false }}
        >
          <Background color="#333" gap={25} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} position="bottom-right" className="m-4 scale-125" />
          <Panel position="top-left" className="m-3">
            <button onClick={() => setShowAddMenu(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-xs font-bold text-white rounded-full shadow-2xl active:scale-95 transition-all"><Plus className="w-4 h-4" /> 添加模块</button>
          </Panel>
        </ReactFlow>
      </div>

      {/* 底部浮动操作栏 */}
      {editingNode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-gray-800/90 backdrop-blur-xl border border-gray-600 rounded-2xl shadow-2xl p-2 flex items-center gap-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => setEditingNodeId(editingNode.id)} className="flex flex-col items-center gap-1 px-4 py-2 text-indigo-400 hover:bg-gray-700 rounded-xl transition-colors"><Settings2 className="w-5 h-5" /><span className="text-[10px] font-bold">配置</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => cloneNode(editingNode)} className="flex flex-col items-center gap-1 px-4 py-2 text-emerald-400 hover:bg-gray-700 rounded-xl transition-colors"><Copy className="w-5 h-5" /><span className="text-[10px] font-bold">克隆</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => { setNodes(nds => nds.filter(n => n.id !== editingNode.id)); setEditingNodeId(null); }} className="flex flex-col items-center gap-1 px-4 py-2 text-red-400 hover:bg-gray-700 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /><span className="text-[10px] font-bold">删除</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => setEditingNodeId(null)} className="p-2 text-gray-400 hover:bg-gray-700 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
      )}

      {/* 模块添加菜单 */}
      {showAddMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end justify-center p-0" onClick={() => setShowAddMenu(false)}>
          <div className="bg-gray-800 w-full rounded-t-[2.5rem] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-8" />
            <div className="grid grid-cols-3 gap-6">
              {(Object.keys(NODE_CONFIGS) as Array<NodeTypeKey>).map(type => (
                <button key={type} onClick={() => addNewNode(type)} className="flex flex-col items-center gap-3 active:scale-90 transition-transform">
                  <div className="p-4 rounded-3xl shadow-xl" style={{ backgroundColor: `${NODE_CONFIGS[type].color}20`, color: NODE_CONFIGS[type].color }}>
                    {(() => { const Icon = NODE_CONFIGS[type].icon; return <Icon className="w-7 h-7" /> })()}
                  </div>
                  <span className="text-xs font-bold text-gray-300">{NODE_CONFIGS[type].typeLabel}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddMenu(false)} className="w-full mt-10 py-4 bg-gray-700 text-gray-300 rounded-2xl font-bold">取消</button>
          </div>
        </div>
      )}

      {/* 配置面板 */}
      {editingNodeId && editingNode && (
        <ConfigPanel
          editingNode={editingNode}
          activeNovel={activeNovel}
          allPresets={allPresets}
          pendingFolders={pendingFolders}
          globalConfig={globalConfig}
          onUpdateNodeData={updateNodeData}
          onDeleteNode={(id) => {
            setNodes(nds => nds.filter(n => n.id !== id));
            setEditingNodeId(null);
          }}
          onDeleteOutputEntry={deleteOutputEntry}
          onClose={() => setEditingNodeId(null)}
          onPreviewEntry={setPreviewEntry}
        />
      )}

      {/* 预览预览 */}
      {previewEntry && (
        <div className="fixed inset-0 bg-gray-900 z-[200] flex flex-col animate-in fade-in duration-200">
          <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3 overflow-hidden"><FileText className="w-5 h-5 text-indigo-400 shrink-0" /><h3 className="font-bold text-gray-100 truncate pr-4">{previewEntry.title}</h3></div>
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
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold"
              >
                跳转
              </button>
              <button onClick={() => setPreviewEntry(null)} className="p-2 bg-gray-700 rounded-full"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">{previewEntry.content}</div>
          <div className="p-6 bg-gray-800 border-t border-gray-700 flex gap-4">
            <button onClick={() => { navigator.clipboard.writeText(previewEntry.content); }} className="flex-1 py-4 bg-gray-700 text-gray-200 rounded-2xl font-bold flex items-center justify-center gap-2"><Copy className="w-5 h-5" /> 复制内容</button>
            <button onClick={() => setPreviewEntry(null)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">关闭预览</button>
          </div>
        </div>
      )}
    </div>
  );
};
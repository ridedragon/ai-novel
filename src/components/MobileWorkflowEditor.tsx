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
  Wand2,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, GeneratorPrompt, Novel } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';
import { keepAliveManager } from '../utils/KeepAliveManager';
import { storage } from '../utils/storage';
import { workflowManager } from '../utils/WorkflowManager';
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
      {/* 核心修复 4.1：合并渲染层级，移除内联 <style> 以解决主进程内存爆炸 */}
      <path
        id={`${id}-glow-combined`}
        d={edgePath}
        fill="none"
        stroke={selected ? 'var(--workflow-edge-color-light, #818cf8)' : COLORS.primary}
        strokeWidth={selected ? 6 : 3}
        strokeOpacity={selected ? 0.3 : 0.15}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? '#fff' : 'var(--workflow-edge-color-light, #818cf8)',
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
  const [isEditingPrompts, setIsEditingPrompts] = useState(false);

  // 性能优化：缓存庞大的目录列表，避免每次渲染重新生成
  const directoryOptions = React.useMemo(() => {
    if (!activeNovel) return [];
    return Array.from(new Set([
      ...(activeNovel.volumes?.map(v => v.title) || []),
      ...(activeNovel.worldviewSets?.map(s => s.name) || []),
      ...(activeNovel.characterSets?.map(s => s.name) || []),
      ...(activeNovel.outlineSets?.map(s => s.name) || [])
    ])).filter(Boolean);
  }, [activeNovel?.volumes, activeNovel?.worldviewSets, activeNovel?.characterSets, activeNovel?.outlineSets]);

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
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex flex-col gap-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${editingNode.data.color}20`, color: editingNode.data.color }}>
              {(() => {
                const Icon = NODE_CONFIGS[editingNode.data.typeKey as NodeTypeKey]?.icon;
                return Icon && <Icon className="w-5 h-5" />;
              })()}
            </div>
            <h3 className="font-bold text-gray-100 truncate max-w-[150px]">{editingNode.data.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleUpdate({ skipped: !editingNode.data.skipped })}
              className={`text-[10px] px-3 py-1.5 rounded-full transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${editingNode.data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'}`}
            >
              {editingNode.data.skipped ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
              {editingNode.data.skipped ? '已跳过' : '执行'}
            </button>
            <button onClick={onClose} className="flex flex-col items-center justify-center p-1.5 bg-gray-700 rounded-xl text-gray-400 ml-2">
              <X className="w-4 h-4" />
              <span className="text-[8px] font-bold mt-0.5">返回</span>
            </button>
          </div>
        </div>
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
                  {directoryOptions.map(name => (
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
              <Cpu className="w-3.5 h-3.5" /> 基础模板 (调用系统预设)
            </label>
            <div className="relative">
              <select
                value={editingNode.data.presetId as string}
                onChange={(e) => {
                  const presets = Object.values(allPresets).flat();
                  const preset = presets.find(p => p.id === e.target.value);
                  onUpdateNodeData(editingNode.id, {
                    presetId: e.target.value,
                    presetName: preset?.name || ''
                  });
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
              >
                <option value="">-- 不使用预设模板 (使用主设置) --</option>
                {editingNode.data.typeKey === 'aiChat'
                  ? Object.values(allPresets).flat().map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认'})</option>
                    ))
                  : (allPresets[editingNode.data.presetType as string] || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认'})</option>
                    ))
                }
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <p className="text-[8px] text-gray-500 italic px-1">* 预设包含其定义的提示词和模型设置。</p>
          </div>
        )}

        {editingNode.data.typeKey === 'aiChat' && (
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" /> 强制自定义 (覆盖所有)
              </label>
              <button
                onClick={() => {
                  const newVal = !editingNode.data.overrideAiConfig;
                  const updates: any = { overrideAiConfig: newVal };
                  // 开启自定义时，如果提示词列表为空，自动初始化包含上下文占位符的默认模版
                  // 这样可以确保“全局输入”和“参考资料”能直接传递给 AI
                  if (newVal && (!editingNode.data.promptItems || (editingNode.data.promptItems as any[]).length === 0)) {
                    updates.promptItems = [
                      { id: 'sys-1', role: 'system', content: '你是一个专业的创作助手。', enabled: true },
                      { id: 'user-1', role: 'user', content: '{{context}}\n\n要求：{{input}}', enabled: true }
                    ];
                  }
                  onUpdateNodeData(editingNode.id, updates);
                }}
                className={`text-[10px] px-3 py-1.5 rounded-full transition-all font-bold ${editingNode.data.overrideAiConfig ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-700 text-gray-400'}`}
              >
                {editingNode.data.overrideAiConfig ? '已开启重写' : '开启自定义'}
              </button>
            </div>

            {editingNode.data.overrideAiConfig && (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200 bg-gray-800/30 p-4 rounded-3xl border border-gray-700/50">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-400 uppercase">模型 (Model)</label>
                  <div className="relative">
                    <select
                      value={editingNode.data.model as string || ''}
                      onChange={(e) => onUpdateNodeData(editingNode.id, { model: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-xs text-white outline-none appearance-none"
                    >
                      <option value="">跟随系统默认 (或模板设置)</option>
                      {globalConfig?.modelList?.map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-400">多样性: {editingNode.data.temperature ?? 0.7}</label>
                    <input
                      type="range" min="0" max="2" step="0.1"
                      value={editingNode.data.temperature ?? 0.7}
                      onChange={(e) => onUpdateNodeData(editingNode.id, { temperature: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-400">核采样: {editingNode.data.topP ?? 1}</label>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={editingNode.data.topP ?? 1}
                      onChange={(e) => onUpdateNodeData(editingNode.id, { topP: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-400">最大 Token</label>
                    <OptimizedInput
                      type="number"
                      value={editingNode.data.maxTokens as number || ''}
                      onChange={(val: string) => onUpdateNodeData(editingNode.id, { maxTokens: parseInt(val) || undefined })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                      placeholder="默认"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-400">Top K</label>
                    <OptimizedInput
                      type="number"
                      value={editingNode.data.topK as number || ''}
                      onChange={(val: string) => onUpdateNodeData(editingNode.id, { topK: parseInt(val) || undefined })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                      placeholder="默认"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-gray-400 uppercase tracking-widest">对话提示词 (Prompts)</label>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setIsEditingPrompts(true); }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold p-2 -m-2"
                    >
                      <Edit2 className="w-3 h-3" /> 编辑管理
                    </button>
                  </div>
                  <div
                    onClick={() => setIsEditingPrompts(true)}
                    className="w-full h-24 bg-gray-800 border border-gray-700 rounded-2xl p-4 text-xs text-gray-400 overflow-hidden font-mono"
                  >
                    {editingNode.data.promptItems && (editingNode.data.promptItems as any[]).length > 0 ? (
                      (editingNode.data.promptItems as any[]).map((p, i) => (
                        <div key={i} className="truncate mb-1 last:mb-0">
                          <span className="text-indigo-500 font-bold">[{p.role}]</span> {p.content}
                        </div>
                      ))
                    ) : editingNode.data.systemPrompt ? (
                      <div className="truncate"><span className="text-indigo-500 font-bold">[system]</span> {editingNode.data.systemPrompt as string}</div>
                    ) : (
                      <span className="italic opacity-50">未设置提示词，点击管理...</span>
                    )}
                  </div>
                </div>
              </div>
            )}
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
        <button onClick={() => { if(confirm('确定要删除这个模块吗？')) { onDeleteNode(editingNode.id); } }} className="flex flex-col items-center justify-center px-6 bg-red-900/20 text-red-400 rounded-2xl">
          <Trash2 className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">删除</span>
        </button>
        <button onClick={onClose} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">
          确定并返回
        </button>
      </div>

      {/* --- 提示词条目管理弹窗 (移动端全屏适配) --- */}
      {isEditingPrompts && (
        <div className="fixed inset-0 z-[160] flex flex-col bg-[#1e2230] animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-[#1a1d29] border-b border-gray-700/50 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2.5 text-indigo-400">
              <Wand2 className="w-5 h-5" />
              <span className="font-bold text-gray-100 text-base">编辑对话提示词</span>
            </div>
            <button
              onClick={() => setIsEditingPrompts(false)}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-700 rounded-xl text-gray-400"
            >
              <X className="w-4 h-4" />
              <span className="text-[8px] font-bold mt-0.5">返回</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#1e2230] pb-24">
            {(() => {
              const items = (editingNode.data.promptItems as GeneratorPrompt[]) || (editingNode.data.systemPrompt ? [{ id: 'default', role: 'system', content: editingNode.data.systemPrompt as string, enabled: true }] : []);
              
              return (
                <>
                  {items.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-2xl">
                      <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">暂无自定义提示词条目</p>
                    </div>
                  )}
                  
                  {items.map((item, idx) => (
                    <div key={item.id || idx} className="bg-[#161922] border border-gray-700 rounded-xl overflow-hidden shadow-lg">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700/50">
                        <div className="flex items-center gap-3">
                          <select
                            value={item.role}
                            onChange={(e) => {
                              const newItems = [...items];
                              newItems[idx] = { ...newItems[idx], role: e.target.value as any };
                              onUpdateNodeData(editingNode.id, { promptItems: newItems });
                            }}
                            className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/30 rounded px-2 py-1.5 outline-none"
                          >
                            <option value="system">System</option>
                            <option value="user">User</option>
                            <option value="assistant">Assistant</option>
                          </select>
                          <label className="flex items-center gap-2 cursor-pointer active:opacity-70">
                            <input
                              type="checkbox"
                              checked={item.enabled !== false}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[idx] = { ...newItems[idx], enabled: e.target.checked };
                                onUpdateNodeData(editingNode.id, { promptItems: newItems });
                              }}
                              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">启用</span>
                          </label>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('确定要删除此提示词条目吗？')) {
                              const newItems = items.filter((_, i) => i !== idx);
                              onUpdateNodeData(editingNode.id, { promptItems: newItems });
                            }
                          }}
                          className="p-2 text-gray-500 active:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        defaultValue={item.content}
                        onBlur={(e) => {
                          if (e.target.value !== item.content) {
                            const newItems = [...items];
                            newItems[idx] = { ...newItems[idx], content: e.target.value };
                            onUpdateNodeData(editingNode.id, { promptItems: newItems });
                          }
                        }}
                        placeholder="输入内容... 支持 {{context}} 和 {{input}}"
                        className="w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-white outline-none resize-none font-mono leading-relaxed"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => {
                      const newItems = [...items, { id: `prompt-${Date.now()}`, role: 'user' as const, content: '', enabled: true }];
                      onUpdateNodeData(editingNode.id, { promptItems: newItems });
                    }}
                    className="w-full py-5 border-2 border-dashed border-gray-700 rounded-2xl text-gray-500 active:text-indigo-400 active:border-indigo-500/50 active:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                  >
                    <Plus className="w-5 h-5" />
                    添加提示词条目
                  </button>
                </>
              );
            })()}
          </div>

          <div className="p-6 bg-[#1a1d29] border-t border-gray-700/50 sticky bottom-0 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
            <button
              onClick={() => setIsEditingPrompts(false)}
              className="w-full py-4 bg-indigo-600 active:bg-indigo-500 text-white rounded-2xl text-base font-bold shadow-lg shadow-indigo-900/40 transition-all active:scale-95"
            >
              完成编辑
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const MobileWorkflowEditorContent: React.FC<WorkflowEditorProps> = (props) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, onStartAutoWrite, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
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

  // 性能监控埋点
  const renderStartTimeRef = useRef<number>(0);
  renderStartTimeRef.current = performance.now();

  useEffect(() => {
    const renderDuration = performance.now() - renderStartTimeRef.current;
    if (renderDuration > 16) { // 超过 1 帧 (16ms)
      terminal.log(`[PERF] MobileWorkflowEditor 渲染耗时过长: ${renderDuration.toFixed(2)}ms (警告: 可能造成 UI 卡顿)`);
    }
  });

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeNovelRef = useRef(activeNovel);
  const nodesRef = useRef(nodes);
  const workflowsRef = useRef(workflows);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  // 同步全局工作流状态
  useEffect(() => {
    const unsubscribe = workflowManager.subscribe((state) => {
      if (state.activeWorkflowId === activeWorkflowId || !activeWorkflowId || activeWorkflowId === 'default') {
        setIsRunning(state.isRunning);
        setIsPaused(state.isPaused);
        setCurrentNodeIndex(state.currentNodeIndex);
        if (state.error) setError(state.error);
      }
    });
    return () => { unsubscribe(); };
  }, [activeWorkflowId]);

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

    const initWorkflows = async () => {
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
        console.error('[MOBILE WORKFLOW] 加载失败', e);
      } finally {
        setIsLoadingWorkflows(false);
        isInitialLoadRef.current = false;
      }
    };
    
    initWorkflows();
  }, [isOpen]);

  const loadWorkflow = (id: string, workflowList: WorkflowData[]) => {
    // 核心修复：解除加载死锁。如果是初次挂载（nodes为空），即使在运行中也允许加载初始结构
    if (isRunning && nodesRef.current.length > 0) return;
    const workflow = workflowList.find(w => w.id === id);
    const globalIsRunning = workflowManager.getState().isRunning;
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
            // 核心修复：数据自愈
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
      setEdges(workflow.edges || []);
      setCurrentNodeIndex(workflow.currentNodeIndex !== undefined ? workflow.currentNodeIndex : -1);
      setIsPaused(workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1);
    }
  };

  // 自动保存 - 增加防抖处理 (支持异步 IndexedDB)
  useEffect(() => {
    if (isLoadingWorkflows) return;
    // 核心修复：防止多实例竞争导致的任务回滚。
    // 仅在 UI 打开时允许由 React 触发保存。
    // 后台运行时的保存由 runWorkflow 内部的 syncNodeStatus 保证。
    if (!isOpen || workflows.length === 0 || isInitialLoadRef.current) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const startTime = Date.now();
      
      const currentWorkflows = workflows.map(w => {
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

      try {
        await storage.saveWorkflows(currentWorkflows);
        await storage.setActiveWorkflowId(activeWorkflowId);
        setWorkflows(currentWorkflows);
        
        terminal.log(`[PERF] Mobile AutoSave to IDB: ${Date.now() - startTime}ms`);
      } catch (e) {
        terminal.error(`[WORKFLOW] 移动端保存失败: ${e}`);
      }
    }, 5000); // 移动端 5秒防抖

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isOpen, isLoadingWorkflows]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds)),
    [setEdges]
  );

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

  const addNewNode = (typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
    
    // 计算视口中心位置
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
        outputEntries: [],
        targetVolumeId: typeKey === 'chapter' ? '' : (activeNovel?.volumes[0]?.id || ''),
        status: 'pending'
      },
      position: {
        x: position.x - 90, // 移动端节点宽度是 180px，减去一半
        y: position.y - 40
      },
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
    const updatedWorkflows = workflows.map(w =>
      w.id === activeWorkflowId ? { ...w, nodes, edges, currentNodeIndex, lastModified: Date.now() } : w
    );
    setWorkflows(updatedWorkflows);
    storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[MOBILE] 手动保存失败: ${e}`));
    storage.setActiveWorkflowId(activeWorkflowId).catch(e => terminal.error(`[MOBILE] ID保存失败: ${e}`));
    
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

  // --- 拓扑排序 (性能优化：使用 useMemo 避免渲染阻塞) ---
  const orderedNodes = React.useMemo(() => {
    const startTime = Date.now();
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
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
        .sort((a: any, b: any) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));

      sortedNeighbors.forEach((v: any) => {
        const newDegree = (currentInDegree.get(v.id) || 0) - 1;
        currentInDegree.set(v.id, newDegree);
        if (newDegree === 0) queue.push(v.id);
      });
    }
    
    const ordered = resultIds.map(id => validNodes.find(n => n.id === id)!).filter(Boolean);
    const remaining = validNodes.filter(n => !resultIds.includes(n.id))
                          .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0));
    
    const finalNodes = [...ordered, ...remaining];
    const duration = Date.now() - startTime;
    if (duration > 15) {
      terminal.log(`[PERF] MobileWorkflowEditor.orderedNodes recalculated: ${duration}ms`);
    }
    return finalNodes;
  }, [nodes, edges]);

  // 辅助函数：同步节点状态并强制持久化到磁盘
  const syncNodeStatus = async (nodeId: string, updates: Partial<WorkflowNodeData>, currentIndex: number) => {
    if (abortControllerRef.current?.signal.aborted) return;

    // 1. 更新 React 状态
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));

    // 2. 构造最新的节点列表并同步给 Ref
    const latestNodes = nodesRef.current.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n);
    
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
      setWorkflows(currentWfs);
    } catch (e) {
      terminal.error(`[MOBILE WORKFLOW] 持久化失败: ${e}`);
    }
  };

  // --- 执行引擎 ---
  const runWorkflow = async (startIndex: number = 0) => {
    // --- 性能调查：监控工作流执行期间的内存情况 ---
    const logMemory = () => {
      if ((performance as any).memory) {
        const mem = (performance as any).memory;
        terminal.log(`[MEM] Used: ${Math.round(mem.usedJSHeapSize / 1048576)}MB, Total: ${Math.round(mem.totalJSHeapSize / 1048576)}MB, Limit: ${Math.round(mem.jsHeapSizeLimit / 1048576)}MB`);
      }
    };

    if (!globalConfig?.apiKey) {
      setError('请先在主设置中配置 API Key');
      return;
    }
    
    workflowManager.start(activeWorkflowId, startIndex);
    setStopRequested(false);
    setError(null);
    stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();

    // 开启保活
    try {
      await keepAliveManager.enable();
    } catch (e) {
      console.warn('[Mobile Workflow] KeepAlive failed:', e);
    }
    
    try {
      if (!activeNovel) return;

      // 使用 localNovel 跟踪执行过程中的最新状态
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        // 优化：合并状态时保留 UI 特有的折叠状态。
        // 使用 Map 优化搜索效率，解决章节/分卷多时的卡顿
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
        if (isRunning) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        if (onUpdateNovel) {
          onUpdateNovel(mergedNovel);
        }
      };

      let sortedNodes = orderedNodes;
      
      // 重置后续节点的执行状态
      if (startIndex === 0) {
        setNodes(nds => nds.map(n => {
          const updates: any = { status: 'pending', outputEntries: [] };
          // 重置正文生成节点的显示名称
          if (n.data.typeKey === 'chapter') {
            updates.label = NODE_CONFIGS.chapter.defaultLabel;
          }
          // 不再重置 targetVolumeId，保留用户配置
          return { ...n, data: { ...n.data, ...updates } };
        }));
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
        
        // 同步清空快照，防止历史记录累加
        sortedNodes = sortedNodes.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } }));

        // 重新开始时仅清理节点内部产出状态，不再干涉全局资料集和分卷章节
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
          workflowManager.pause(i);
          break;
        }

        // 核心修复：执行时从 Ref 中获取最新的节点数据，防止使用启动时的陈旧快照
        // 这样如果上一次执行停止后，用户修改了分卷名称或其他配置，这里能立即感知到
        const currentNode = nodesRef.current.find(n => n.id === sortedNodes[i].id);
        if (!currentNode) continue;

        const node = currentNode;
        workflowManager.updateProgress(i);
        
        terminal.log(`[WORKFLOW] Executing Node: ${node.data.label} (${node.data.typeLabel})`);
        logMemory();

        if (node.data.skipped) {
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
          // 确保跳过时也清理连线动画
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          continue;
        }
        
        // 更新节点状态为正在执行并同步磁盘
        await syncNodeStatus(node.id, { status: 'executing' }, i);
        
        // 让指向该节点的连线产生动画效果，并关闭其他节点的动画
        setEdges(eds => eds.map(e => {
          if (e.target === node.id) return { ...e, animated: true };
          if (e.animated) return { ...e, animated: false };
          return e;
        }));

        // 核心修复：强制 yield 确保 React 渲染 executing 状态
        await new Promise(resolve => setTimeout(resolve, 50));

        // 视觉反馈增强
        if (node.data.typeKey === 'userInput' || node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // 处理创建文件夹节点
        if (node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          if (node.data.folderName) {
            currentWorkflowFolder = node.data.folderName;
          }
          
          if (node.data.typeKey === 'reuseDirectory') {
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
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdges(eds => eds.map(e => e.target === node.id ? { ...e, animated: false } : e));
          await new Promise(resolve => setTimeout(resolve, 50));
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
            const updatedNovel = { ...localNovel, volumes: [...(localNovel.volumes || []), newVolume] };
            finalVolumeId = newVolume.id;
            updateLocalAndGlobal(updatedNovel);
            updateNodeData(node.id, { targetVolumeId: finalVolumeId, targetVolumeName: '' });
          }

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

          terminal.log(`[DEBUG] MobileWorkflow: Preparing to run engine. finalVolumeId=${finalVolumeId}, currentWorkflowFolder=${currentWorkflowFolder}`);

          let writeStartIndex = 0;
          const items = currentSet?.items || [];
          for (let k = 0; k < items.length; k++) {
            const item = items[k];
            // 核心修复：查重逻辑限制在目标分卷内
            const existingChapter = localNovel.chapters.find(c =>
              c.title === item.title &&
              (
                (finalVolumeId && c.volumeId === finalVolumeId) ||
                (!finalVolumeId && (!c.volumeId || c.volumeId === ''))
              )
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

          terminal.log(`[DEBUG] MobileWorkflow: engine.run starting from index ${writeStartIndex}`);

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
              // 核心修复 4.2：支持增量更新合并，防止 localNovel 被 deltaChapters 覆盖而丢失历史章节
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
              
              // 在增量上报时，主进程内存压力主要来自 JSON 序列化
              // 移动端由于 IPC 性能更弱，这里显式记录上报的章节数
              if ((updatedNovel.chapters || []).length > 0) {
                // terminal.log(`[IPC] Mobile Delta Report: ${(updatedNovel.chapters || []).length} chapters`);
              }
              
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

        const finalModel = (node.data.overrideAiConfig && node.data.model) ? node.data.model : (nodeApiConfig.model || featureModel || globalConfig.model);
        const finalTemperature = (node.data.overrideAiConfig && node.data.temperature !== undefined) ? node.data.temperature : (preset?.temperature ?? globalConfig.temperature);
        const finalTopP = (node.data.overrideAiConfig && node.data.topP !== undefined) ? node.data.topP : (preset?.topP ?? globalConfig.topP);
        const finalTopK = (node.data.overrideAiConfig && node.data.topK !== undefined) ? node.data.topK : ((preset as any)?.topK ?? globalConfig.topK);
        const finalMaxTokens = (node.data.overrideAiConfig && node.data.maxTokens) ? node.data.maxTokens : ((preset as any)?.maxReplyLength || globalConfig.maxReplyLength);

        // 如果设置了节点特定的提示词条目，优先使用
        if (node.data.overrideAiConfig) {
          const nodePromptItems = (node.data.promptItems as any[]) || [];
          if (nodePromptItems.length > 0) {
            // 如果使用了多条目系统，则替换整个 messages 列表
            let hasContextPlaceholder = false;
            messages = nodePromptItems
              .filter(p => p.enabled !== false)
              .map(p => {
                if (p.content.includes('{{context}}')) hasContextPlaceholder = true;
                return {
                  role: p.role,
                  content: p.content
                    .replace('{{context}}', finalContext)
                    .replace('{{input}}', node.data.instruction)
                };
              });
            
            // 满足用户“直接给”的需求：如果提示词中没有占位符，强制注入上下文
            if (!hasContextPlaceholder && finalContext.trim()) {
              messages.unshift({ role: 'user', content: `【参考背景与全局输入】：\n${finalContext}` });
            }
          } else if (node.data.systemPrompt) {
            // 兼容旧的单一 systemPrompt
            if (messages.length > 0 && messages[0].role === 'system') {
              messages[0] = { ...messages[0], content: node.data.systemPrompt as string };
            } else {
              messages.unshift({ role: 'system', content: node.data.systemPrompt as string });
            }
            
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

        terminal.log(`
>> AI REQUEST [工作流(移动端): ${node.data.typeLabel}]
>> -----------------------------------------------------------
>> Model:       ${finalModel}
>> Temperature: ${finalTemperature}
>> Top P:       ${finalTopP}
>> Top K:       ${finalTopK}
>> Max Tokens:  ${finalMaxTokens || '默认'}
>> -----------------------------------------------------------
        `);

        let result = '';
        let entriesToStore: { title: string; content: string }[] = [];
        let retryCount = 0;
        const maxRetries = 2; // 总共尝试 3 次
        let isSuccess = false;

        while (retryCount <= maxRetries && !isSuccess) {
          if (retryCount > 0) {
            terminal.log(`[Mobile Workflow Retry] 节点 ${node.data.label} JSON 解析失败，正在进行第 ${retryCount} 次重试...`);
            updateNodeData(node.id, { label: `重试中(${retryCount}/${maxRetries}): ${node.data.typeLabel}` });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // 调试：F12 打印发送给 AI 的全部内容
          console.group(`[AI REQUEST] 移动端工作流 - ${node.data.label} (${node.data.typeLabel})`);
          console.log('Messages:', messages);
          console.groupEnd();

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
            // 极致鲁棒的 JSON 提取与清理逻辑 (同步 PC 端异步优化逻辑，解决大型 JSON 造成的 UI 假死)
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
                  terminal.log(`[PERF] Mobile Workflow.cleanAndParseJSON: ${duration}ms`);
                }
                return parsed;
              } catch (e: any) {
                const fixed = heuristicFix(processed);
                try {
                  const parsed = JSON.parse(fixed);
                  return parsed;
                } catch (e2: any) {
                  // 如果是聊天节点，解析失败是预期的（AI 返回了纯文本），不作为错误上报
                  const jsonRequiredNodes = ['outline', 'plotOutline', 'characters', 'worldview'];
                  if (jsonRequiredNodes.includes(node.data.typeKey as string)) {
                    const errorPos = parseInt(e2.message.match(/at position (\d+)/)?.[1] || "0", 10);
                    const context = fixed.substring(Math.max(0, errorPos - 50), Math.min(fixed.length, errorPos + 50));
                    terminal.log(`[Mobile JSON Parse Error] ${e2.message}\nContext near error:\n...${context}...`);
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
                // 每处理 50 个条目 yield 一次，确保移动端 UI 响应
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
                
                // 拓宽键名匹配范围
                const title = String(item.title || item.chapter || item.name || item.item || item.label || item.header || Object.values(item)[0] || '未命名');
                const content = String(item.summary || item.content || item.description || item.plot || item.setting || item.bio || item.value || Object.values(item)[1] || '');
                
                resultItems.push({ title, content });
              }
              return resultItems;
            };

            entriesToStore = await extractEntries(parsed);
            isSuccess = true;
          } catch (e) {
            const jsonRequiredNodes = ['outline', 'plotOutline', 'characters', 'worldview'];
            if (jsonRequiredNodes.includes(node.data.typeKey as string) && retryCount < maxRetries) {
              retryCount++;
              continue; // 触发重试
            }
            entriesToStore = [{
              title: `生成结果 ${new Date().toLocaleTimeString()}`,
              content: result
            }];
            isSuccess = true;
          }
        }

        if (retryCount > 0) {
          updateNodeData(node.id, { label: node.data.label });
        }

        const newEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({ id: `${Date.now()}-${idx}`, title: e.title, content: e.content }));
        await syncNodeStatus(node.id, { status: 'completed', outputEntries: [...newEntries, ...(node.data.outputEntries || [])] }, i);

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

      if (!stopRequestedRef.current) {
        workflowManager.stop();
        keepAliveManager.disable();
      }
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || /aborted/i.test(e.message);
      if (!isAbort) {
        setError(`执行失败: ${e.message}`);
        workflowManager.setError(e.message);
        // 错误时将当前节点标记为失败
        const failedNodeId = orderedNodes[currentNodeIndex]?.id;
        if (failedNodeId) {
          setNodes(nds => nds.map(n => n.id === failedNodeId ? { ...n, data: { ...n.data, status: 'failed' } } : n));
        }
      }
      // 错误时清理所有连线动画
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));
      keepAliveManager.disable();
    }
  };

  const stopWorkflow = () => {
    terminal.log('[MOBILE WORKFLOW] STOP requested by user.');
    keepAliveManager.disable();
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
    storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[MOBILE] 停止保存失败: ${e}`));
    
    setStopRequested(true);
    stopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    workflowManager.pause(currentNodeIndex);
    // 强制清理执行状态，确保 UI 动画立即停止
    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        status: n.data.status === 'executing' ? 'pending' : n.data.status
      }
    })));
    setEdges(eds => eds.map(e => ({ ...e, animated: false })));
  };

  if (!isOpen) return null;

  if (isLoadingWorkflows) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <div className="text-indigo-400 font-bold animate-pulse text-sm">加载工作流中...</div>
      </div>
    );
  }

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
                <button onClick={() => setShowWorkflowMenu(!showWorkflowMenu)} className="flex flex-col items-start min-w-0">
                  <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider">当前工作流</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-bold text-sm text-gray-100 truncate">{workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                  </div>
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
        <div className="flex items-center gap-1.5 shrink-0">
          {!isRunning && (
            <button
              onClick={handleSaveWorkflow}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-700/50 text-indigo-400 rounded-lg border border-gray-600/50 active:scale-95 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold mt-0.5">保存</span>
            </button>
          )}
          
          {isRunning ? (
            <button
              onClick={stopWorkflow}
              className="flex flex-col items-center justify-center bg-red-600/20 text-red-500 p-1.5 rounded-lg border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] font-bold mt-0.5">停止</span>
            </button>
          ) : isPaused && currentNodeIndex !== -1 ? (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[7px] text-gray-500 font-bold uppercase pl-1">跳转执行</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-1.5 py-1 text-[9px] text-gray-300 outline-none max-w-[80px]"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>选择节点...</option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={() => runWorkflow(currentNodeIndex)}
                className="flex flex-col items-center justify-center bg-blue-600/20 text-blue-500 p-1.5 rounded-lg border border-blue-500/20 shadow-lg"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="text-[8px] font-bold mt-0.5">继续</span>
              </button>
              
              <button
                onClick={() => {
                  if (confirm('确定要重置当前工作流吗？\n\n1. 所有节点进度将归零\n2. 已生成的章节正文将保留\n3. 正在运行的任务将被强制中止')) {
                    // 1. 立即物理中断
                    stopRequestedRef.current = true;
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                    }

                    const updatedNodes = nodes.map(n => ({
                      ...n,
                      data: {
                        ...n.data,
                        status: 'pending' as const,
                        label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
                        outputEntries: [],
                        // 不再重置 targetVolumeId，保留用户配置
                        targetVolumeName: ''
                      }
                    }));

                    // 2. 同步 UI 状态
                    setNodes(updatedNodes);
                    setCurrentNodeIndex(-1);
                    setIsPaused(false);
                    setError(null);
                    
                    // 3. 停止全局管理
                    workflowManager.stop();
                    
                    // 4. 持久化
                    setWorkflows(prev => prev.map(w => w.id === activeWorkflowId ? { ...w, nodes: updatedNodes, currentNodeIndex: -1 } : w));
                  }
                }}
                className="flex flex-col items-center justify-center p-1.5 bg-gray-700/50 text-gray-400 rounded-lg border border-gray-600/50"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span className="text-[8px] font-bold mt-0.5">重置</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
               <div className="flex flex-col gap-0.5">
                <span className="text-[7px] text-gray-500 font-bold uppercase pl-1">起始节点</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-1.5 py-1 text-[9px] text-gray-300 outline-none max-w-[80px]"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>从头开始</option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => runWorkflow(0)}
                disabled={nodes.length === 0}
                className="flex flex-col items-center justify-center bg-green-600/20 text-green-500 p-1.5 rounded-lg border border-green-500/20 shadow-lg disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="text-[8px] font-bold mt-0.5">运行</span>
              </button>
            </div>
          )}
          <div className="w-px h-6 bg-gray-700 mx-0.5" />
          <button onClick={onClose} className="p-1 text-gray-400 flex flex-col items-center">
            <X className="w-5 h-5" />
            <span className="text-[8px] font-bold">关闭</span>
          </button>
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
          onEdgeClick={onEdgeClick}
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
          <button onClick={() => setEditingNodeId(null)} className="flex flex-col items-center gap-1 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-xl transition-colors"><X className="w-5 h-5" /><span className="text-[10px] font-bold">关闭</span></button>
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
    </div>
  );
};

export const MobileWorkflowEditor: React.FC<WorkflowEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <MobileWorkflowEditorContent {...props} />
    </ReactFlowProvider>
  );
};
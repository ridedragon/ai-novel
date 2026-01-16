import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  CheckSquare,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Edit2,
  FileText,
  Folder,
  LayoutList,
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
  Wand2,
  Workflow,
  X
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneratorPreset, GeneratorPrompt, LoopInstruction, Novel } from '../types';
import { workflowManager } from '../utils/WorkflowManager';
import { ModelConfigPanel } from './Workflow/components/NodeProperties/Shared/ModelConfigPanel';
import { ReferenceSelector } from './Workflow/components/NodeProperties/Shared/ReferenceSelector';
import { WorkflowEdge } from './Workflow/components/WorkflowEdge';
import { MobileWorkflowNode } from './Workflow/components/WorkflowNode';
import { NODE_CONFIGS, WORKFLOW_DSL_PROMPT } from './Workflow/constants';
import { useWorkflowEngine } from './Workflow/hooks/useWorkflowEngine';
import { useWorkflowLayout } from './Workflow/hooks/useWorkflowLayout';
import { useWorkflowStorage } from './Workflow/hooks/useWorkflowStorage';
import {
  NodeTypeKey,
  OutputEntry,
  WorkflowData,
  WorkflowEditorProps,
  WorkflowNode,
  WorkflowNodeData,
} from './Workflow/types';


// 常量和类型已移至 ./Workflow/ 目录下

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

  // 整合所有分类 API 模型并去重
  const consolidatedModelList = React.useMemo(() => {
    const list = [...(globalConfig?.modelList || [])];
    if (globalConfig?.model) list.push(globalConfig.model);
    if (globalConfig?.outlineModel) list.push(globalConfig.outlineModel);
    if (globalConfig?.characterModel) list.push(globalConfig.characterModel);
    if (globalConfig?.worldviewModel) list.push(globalConfig.worldviewModel);
    if (globalConfig?.inspirationModel) list.push(globalConfig.inspirationModel);
    if (globalConfig?.plotOutlineModel) list.push(globalConfig.plotOutlineModel);
    if (globalConfig?.optimizeModel) list.push(globalConfig.optimizeModel);
    if (globalConfig?.analysisModel) list.push(globalConfig.analysisModel);
    
    // 核心增强：整合所有预设方案中定义的模型 (手机端)
    // 显式扫描 localStorage 确保覆盖所有分类
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
    
    // 过滤空值并去重
    return Array.from(new Set(list.filter(Boolean)));
  }, [globalConfig, allPresets]);

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
              className={`text-[10px] px-3 py-1.5 rounded-full transition-all font-bold uppercase tracking-wider flex items-center gap-1 ${editingNode.data.skipped ? 'bg-gray-600 text-gray-300' : 'bg-primary/20 text-primary border border-primary/30'}`}
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
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-primary shadow-inner"
          />
        </div>

        {(editingNode.data.typeKey === 'createFolder' || editingNode.data.typeKey === 'reuseDirectory') && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" /> 关联目录名
            </label>
            <div className="flex gap-2">
              <OptimizedInput
                value={editingNode.data.folderName}
                onChange={(val: string) => handleUpdate({ folderName: val })}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-primary"
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

        {editingNode.data.presetType && editingNode.data.typeKey !== 'saveToVolume' && editingNode.data.typeKey !== 'aiChat' && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5" /> 基础模板 (调用系统预设)
            </label>
            <div className="relative">
              <select
                value={editingNode.data.presetId as string}
                onChange={(e) => {
                  const presets = Object.values(allPresets).flat();
                  const preset = presets?.find(p => p.id === e.target.value);
                  onUpdateNodeData(editingNode.id, {
                    presetId: e.target.value,
                    presetName: preset?.name || ''
                  });
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
              >
                <option value="">-- 不使用预设模板 (使用主设置) --</option>
                {(allPresets[editingNode.data.presetType as string] || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认'})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <p className="text-[8px] text-gray-500 italic px-1">* 预设包含其定义的提示词和模型设置。</p>
          </div>
        )}

        {(editingNode.data.typeKey === 'aiChat' || editingNode.data.typeKey === 'workflowGenerator' || editingNode.data.typeKey === 'saveToVolume') && (
          <div className="space-y-4 pt-4 border-t border-gray-800">
            {editingNode.data.typeKey === 'workflowGenerator' && (
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs">
                    <Wand2 className="w-4 h-4" /> 架构师模式
                  </div>
                  <button
                    onClick={() => {
                      const configToSave = {
                        instruction: editingNode.data.instruction,
                        autoFillContent: editingNode.data.autoFillContent,
                        overrideAiConfig: editingNode.data.overrideAiConfig,
                        promptItems: editingNode.data.promptItems,
                        model: editingNode.data.model,
                        temperature: editingNode.data.temperature,
                        topP: editingNode.data.topP,
                        topK: editingNode.data.topK,
                        maxTokens: editingNode.data.maxTokens,
                        apiKey: editingNode.data.apiKey,
                        baseUrl: editingNode.data.baseUrl,
                      };
                      localStorage.setItem('workflow_generator_default_config', JSON.stringify(configToSave));
                      alert('配置已保存。');
                    }}
                    className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-full font-bold flex items-center gap-1"
                  >
                    <Save className="w-2.5 h-2.5" /> 保存默认
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">此节点将根据需求生成整个画布。</p>
                <div className="mt-3 pt-3 border-t border-indigo-500/10">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${editingNode.data.autoFillContent ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${editingNode.data.autoFillContent ? 'left-4.5' : 'left-0.5'}`} />
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={editingNode.data.autoFillContent}
                      onChange={(e) => onUpdateNodeData(editingNode.id, { autoFillContent: e.target.checked })}
                    />
                    <span className="text-[10px] text-gray-300 font-medium">AI 自动填写节点内容</span>
                  </label>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" /> 强制自定义 (覆盖所有)
              </label>
              <button
                onClick={() => {
                  const newVal = !editingNode.data.overrideAiConfig;
                  const updates: any = { overrideAiConfig: newVal };
                  if (newVal && (!editingNode.data.promptItems || (editingNode.data.promptItems as any[]).length === 0)) {
                    if (editingNode.data.typeKey === 'saveToVolume') {
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
                  onUpdateNodeData(editingNode.id, updates);
                }}
                className={`text-[10px] px-3 py-1.5 rounded-full transition-all font-bold ${editingNode.data.overrideAiConfig ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-700 text-gray-400'}`}
              >
                {editingNode.data.overrideAiConfig ? '已开启重写' : '开启自定义'}
              </button>
            </div>

            {editingNode.data.overrideAiConfig && (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
                <ModelConfigPanel
                  data={editingNode.data}
                  onUpdate={handleUpdate}
                  globalConfig={globalConfig}
                  allPresets={allPresets}
                  consolidatedModelList={consolidatedModelList}
                  isMobile={true}
                />

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

        {editingNode.data.typeKey === 'saveToVolume' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-teal-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> 分卷规划内容
              </label>
              <OptimizedTextarea
                value={editingNode.data.volumeContent || ''}
                onChange={(val: string) => handleUpdate({ volumeContent: val })}
                className="w-full h-48 bg-gray-800 border border-teal-500/30 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
                placeholder="AI 生成的内容将出现在这里..."
              />
            </div>

            {/* 多次分卷触发器 UI (移动端优化) */}
            <div className="space-y-4 p-5 bg-teal-500/5 border border-teal-500/20 rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-teal-400 font-bold text-[10px] uppercase tracking-wider">
                  <Repeat className="w-3.5 h-3.5" /> 自动分卷触发器 (多次)
                </div>
                <button
                  onClick={() => {
                    const currentRules = (editingNode.data.splitRules || []) as any[];
                    const legacyRule = (!currentRules.length && editingNode.data.splitChapterTitle)
                      ? [{ id: 'legacy', chapterTitle: editingNode.data.splitChapterTitle, nextVolumeName: editingNode.data.nextVolumeName || '新分卷' }]
                      : [];
                    
                    const nextRules = [
                      ...(currentRules.length ? currentRules : legacyRule),
                      { id: Date.now().toString(), chapterTitle: '', nextVolumeName: '新分卷' }
                    ];
                    onUpdateNodeData(editingNode.id, {
                      splitRules: nextRules,
                      splitChapterTitle: '',
                      nextVolumeName: ''
                    });
                  }}
                  className="px-2.5 py-1.5 bg-teal-600/20 text-teal-400 rounded-xl text-[10px] font-bold border border-teal-500/30"
                >
                  <Plus className="w-3 h-3 inline mr-1" /> 添加规则
                </button>
              </div>
              
              <div className="space-y-3">
                {(() => {
                  const rules = (editingNode.data.splitRules || []) as any[];
                  if (rules.length === 0 && editingNode.data.splitChapterTitle) {
                    rules.push({ id: 'legacy', chapterTitle: editingNode.data.splitChapterTitle, nextVolumeName: editingNode.data.nextVolumeName || '新分卷' });
                  }

                  return rules.map((rule, idx) => (
                    <div key={rule.id} className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">规则 #{idx + 1}</span>
                        <button
                          onClick={() => {
                            const nextRules = rules.filter((_, i) => i !== idx);
                            onUpdateNodeData(editingNode.id, { splitRules: nextRules });
                          }}
                          className="p-1 text-gray-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">触发章节 (如: 第一章/1)</label>
                        <OptimizedInput
                          value={rule.chapterTitle}
                          onChange={(val: string) => {
                            const nextRules = [...rules];
                            nextRules[idx] = { ...rule, chapterTitle: val };
                            onUpdateNodeData(editingNode.id, { splitRules: nextRules });
                          }}
                          placeholder="例如: 第一章 或 1"
                          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">新分卷命名</label>
                        <OptimizedInput
                          value={rule.nextVolumeName}
                          onChange={(val: string) => {
                            const nextRules = [...rules];
                            nextRules[idx] = { ...rule, nextVolumeName: val };
                            onUpdateNodeData(editingNode.id, { splitRules: nextRules });
                          }}
                          placeholder="例如：第二卷..."
                          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                        />
                      </div>
                    </div>
                  ));
                })()}
                
                {(!editingNode.data.splitRules || (editingNode.data.splitRules as any[]).length === 0) && !editingNode.data.splitChapterTitle && (
                  <div className="text-center py-6 border border-dashed border-gray-700 rounded-3xl">
                    <p className="text-[10px] text-gray-600">未设置自动分卷触发器。</p>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-gray-600 leading-relaxed px-1">
                * 工作流运行中，每当生成到指定章节，将自动创建并切换至新分卷。
              </p>
            </div>

            <p className="text-[10px] text-gray-500 leading-relaxed mt-2 px-1">
              * 此节点之后生成的正文内容将自动保存到该分卷中，直到遇到下一个分卷节点。
            </p>
          </div>
        )}

        {editingNode.data.typeKey !== 'pauseNode' && editingNode.data.typeKey !== 'saveToVolume' && (
          <>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {editingNode.data.typeKey === 'workflowGenerator' ? '工作流需求描述' : '创作指令 (User Prompt)'}
              </label>
              <OptimizedTextarea
                value={editingNode.data.instruction}
                onChange={(val: string) => handleUpdate({ instruction: val })}
                className="w-full h-56 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
                placeholder={editingNode.data.typeKey === 'workflowGenerator' ? "描述你想要的工作流结构..." : "在此输入具体要求..."}
              />
            </div>

            {/* 循环指令配置 */}
            <div className="space-y-4 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Repeat className="w-3.5 h-3.5" /> 循环特定指令
                </label>
                <button
                  onClick={() => {
                    const currentInstructions = (editingNode.data.loopInstructions as LoopInstruction[]) || [];
                    const nextIndex = currentInstructions.length > 0 ? Math.max(...currentInstructions.map(i => i.index)) + 1 : 1;
                    const newInstructions = [...currentInstructions, { index: nextIndex, content: '' }];
                    handleUpdate({ loopInstructions: newInstructions });
                  }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> 添加轮次
                </button>
              </div>
              {((editingNode.data.loopInstructions as LoopInstruction[]) || []).map((inst, idx) => (
                <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-700/30 border-b border-gray-700/50">
                    <span className="text-[10px] font-bold text-gray-400">第 {inst.index} 次循环</span>
                    <button
                      onClick={() => {
                        const newInstructions = ((editingNode.data.loopInstructions as LoopInstruction[]) || []).filter((_, i) => i !== idx);
                        handleUpdate({ loopInstructions: newInstructions });
                      }}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <OptimizedTextarea
                    value={inst.content}
                    onChange={(val: string) => {
                      const newInstructions = [...((editingNode.data.loopInstructions as LoopInstruction[]) || [])];
                      newInstructions[idx] = { ...inst, content: val };
                      handleUpdate({ loopInstructions: newInstructions });
                    }}
                    className="w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none"
                    placeholder="输入该轮次特定指令..."
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {editingNode.data.typeKey === 'loopNode' && (
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <label className="text-[10px] font-bold text-sky-500 uppercase tracking-widest flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5" /> 循环控制器配置
            </label>
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-sky-300 font-bold uppercase">循环次数</label>
                <OptimizedInput
                  type="number"
                  value={editingNode.data.loopConfig?.count || 1}
                  onChange={(val: string) => {
                    const count = parseInt(val) || 1;
                    handleUpdate({
                      loopConfig: {
                        ...(editingNode.data.loopConfig || { enabled: true }),
                        count,
                        enabled: true
                      }
                    });
                  }}
                  className="w-full bg-gray-800 border border-sky-500/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>
              <p className="text-[10px] text-sky-400/70 leading-relaxed">
                此节点作为循环控制器。当执行到此节点时，如果未达到指定次数，将跳转回循环起始位置（通过连线闭环）。
                可以使用 <code>{'{{loop_index}}'}</code> 变量。
              </p>
            </div>
          </div>
        )}

        {editingNode.data.typeKey === 'pauseNode' && (
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <PauseCircle className="w-3.5 h-3.5" /> 暂停节点说明
            </label>
            <div className="bg-slate-700/20 border border-slate-600/30 rounded-2xl p-4">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                当工作流执行到此节点时，将自动暂停并进入等待状态。
                <br/><br/>
                您可以在确认内容或进行人工操作后，点击顶部工具栏的
                <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30 text-[10px] font-bold"><Play className="w-2 h-2" /> 继续</span>
                按钮以继续执行。
              </p>
            </div>
          </div>
        )}

        {editingNode.data.typeKey !== 'userInput' && editingNode.data.typeKey !== 'pauseNode' && editingNode.data.typeKey !== 'saveToVolume' && activeNovel && (
          <ReferenceSelector
            data={editingNode.data}
            activeNovel={activeNovel}
            pendingFolders={pendingFolders}
            onToggle={toggleSetReference}
            isMobile={true}
          />
        )}

        {editingNode.data.typeKey === 'chapter' ? (
          <div className="space-y-4 pt-6 border-t border-gray-800">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> 生成产物说明
            </label>
            <div className="text-center py-10 bg-gray-800/50 rounded-[2.5rem] border border-dashed border-gray-700">
              <p className="text-sm text-gray-400">章节已保存至小说目录</p>
              <p className="text-[10px] text-gray-500 mt-1 px-10">正文将保存至上一个“保存至分卷”节点指定的分卷中。</p>
            </div>
          </div>
        ) : editingNode.data.typeKey !== 'pauseNode' && editingNode.data.typeKey !== 'saveToVolume' && (editingNode.data.outputEntries as OutputEntry[])?.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-gray-800">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">产出 ({(editingNode.data.outputEntries as OutputEntry[]).length})</label>
            <div className="space-y-3">
              {(() => {
                const entries = (editingNode.data.outputEntries || []) as OutputEntry[];
                return entries.map((entry, idx) => {
                  const isFirst = idx === 0;
                  // 移动端使用简化的折叠逻辑，非首项折叠
                  // 由于移动端 onPreviewEntry 是弹窗，我们这里直接展示列表项，点击弹窗预览
                  return (
                    <div
                      key={entry.id}
                      className={`p-4 bg-gray-800 border border-gray-700 rounded-2xl flex items-center justify-between active:bg-gray-700 transition-all ${!isFirst ? 'opacity-80 scale-95' : ''}`}
                      onClick={() => onPreviewEntry(entry)}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-gray-200 truncate">{entry.title}</div>
                          {!isFirst && <div className="text-[10px] text-gray-500 truncate">历史版本 (点击查看)</div>}
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
                        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${!isFirst ? '-rotate-90' : ''}`} />
                      </div>
                    </div>
                  );
                });
              })()}
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
                        placeholder="输入内容... 支持 {{context}} 变量"
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
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const nodesRef = useRef(nodes);
  const workflowsRef = useRef<WorkflowData[]>([]);

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

  // 1. 存储与加载逻辑
  const {
    workflows,
    isLoading: isLoadingWorkflows,
    refreshWorkflows,
    autoSave,
    createWorkflow,
    deleteWorkflow: storageDeleteWorkflow,
    renameWorkflow: storageRenameWorkflow,
    exportWorkflow,
    importWorkflowData,
    healWorkflowData
  } = useWorkflowStorage(isOpen, activeWorkflowId, setActiveWorkflowId, activeNovel);

  // 2. 布局逻辑 (Mobile)
  const { orderedNodes, getMobileLayout } = useWorkflowLayout(nodes, edges);

  // 3. 执行引擎逻辑
  const {
    isRunning,
    isPaused,
    currentNodeIndex,
    error,
    setError,
    runWorkflow,
    stopWorkflow,
    resumeWorkflow,
    resetWorkflowStatus
  } = useWorkflowEngine({
    activeNovel,
    globalConfig,
    allPresets,
    activeWorkflowId,
    nodesRef,
    workflowsRef,
    setNodes,
    setEdges,
    onUpdateNovel,
    getOrderedNodes: () => orderedNodes,
    isMobile: true
  });

  // 获取工作流中所有“初始化目录”节点定义的文件夹名
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

  // 性能优化：显式使用 useMemo 锁定 nodeTypes 和 edgeTypes，消除 React Flow 的重绘警告
  const nodeTypes = useMemo(() => ({
    custom: MobileWorkflowNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    custom: WorkflowEdge,
  }), []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  const editingNode = nodes?.find(n => n.id === editingNodeId) || null;

  // 加载配置
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat', 'generator'];
    const loaded: Record<string, GeneratorPreset[]> = {};
    types.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        loaded[t] = saved ? JSON.parse(saved) : [];
      } catch (e) { loaded[t] = []; }
    });
    setAllPresets(loaded);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      refreshWorkflows().then(({ loadedWorkflows, finalId }) => {
        const wf = loadedWorkflows.find(w => w.id === finalId);
        if (wf) {
          const globalIsRunning = workflowManager.getState().isRunning;
          if (!globalIsRunning || nodesRef.current.length === 0) {
            const healed = healWorkflowData(wf, globalIsRunning, activeNovel);
            setNodes(healed.nodes);
            setEdges(healed.edges);
          }
        }
      });
    }
  }, [isOpen]);

  useEffect(() => {
    autoSave(nodes, edges, currentNodeIndex);
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning]);

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
    
    // 互斥检查
    if (typeKey === 'workflowGenerator' && nodes.length > 0) {
      alert('“智能生成工作流”节点只能在空画布上创建。');
      return;
    }
    if (nodes.some(n => n.data.typeKey === 'workflowGenerator')) {
      alert('画布中已存在生成节点。');
      return;
    }

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
          } catch (e) {}
          return {
            overrideAiConfig: true,
            autoFillContent: true,
            promptItems: [
              {
                id: 'sys-1',
                role: 'system',
                content: WORKFLOW_DSL_PROMPT,
                enabled: true
              },
              {
                id: 'user-1',
                role: 'user',
                content: '请以此为基础，为我生成一套完整的工作流。',
                enabled: true
              }
            ]
          };
        })() : {})
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
      const targetNode = nds?.find(n => n.id === nodeId);
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
    autoSave(nodes, edges, currentNodeIndex);
    setError('工作流已手动保存');
    setTimeout(() => setError(null), 2000);
  };

  const switchWorkflow = (id: string) => {
    if (isRunning) {
        alert('请先停止当前工作流再切换');
        return;
    }
    setActiveWorkflowId(id);
    const wf = workflows.find(w => w.id === id);
    if (wf) {
      const healed = healWorkflowData(wf, isRunning, activeNovel);
      setNodes(healed.nodes);
      setEdges(healed.edges);
    }
    setShowWorkflowMenu(false);
  };

  // 自动整理布局逻辑 (移动端垂直单列)
  const autoLayoutNodes = useCallback(() => {
    const nextNodes = getMobileLayout(nodes);
    setNodes(nextNodes);
  }, [nodes, getMobileLayout, setNodes]);

  const handleImportWorkflow = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isRunning) {
        alert('请先停止当前工作流');
        return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        const newId = await importWorkflowData(imported);
        switchWorkflow(newId);
      } catch (err: any) {
        setError(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [isRunning, importWorkflowData, switchWorkflow, setError]);

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
                onBlur={() => storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
                onKeyDown={(e) => e.key === 'Enter' && storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
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
                      <button onClick={(e) => { e.stopPropagation(); storageDeleteWorkflow(wf.id); }} className="p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-700 mt-2 pt-2 px-2 space-y-1">
                  <button onClick={createWorkflow} className="w-full text-left px-3 py-2 text-xs text-indigo-400 font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> 创建新工作流</button>
                  <label className="w-full text-left px-3 py-2 text-xs text-emerald-400 font-bold flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /> 导入工作流<input type="file" accept=".json" onChange={handleImportWorkflow} className="hidden" /></label>
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
              onClick={() => {
                if (confirm('是否强制停止当前任务？\n如果任务长时间卡在“准备中”，请点击确定。')) {
                  stopWorkflow();
                  // 强制兜底重置状态，防止 stopWorkflow 因异常未完全执行
                  setTimeout(() => {
                    workflowManager.stop();
                  }, 200);
                }
              }}
              className="flex flex-col items-center justify-center bg-red-600/20 text-red-500 p-1.5 rounded-lg border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] font-bold mt-0.5">停止</span>
            </button>
          ) : (
            <button
              onClick={autoLayoutNodes}
              className="flex flex-col items-center justify-center p-1.5 bg-emerald-600/10 text-emerald-400 rounded-lg border border-emerald-500/20 active:scale-95 transition-all"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold mt-0.5">整理</span>
            </button>
          )}

          <button
            onClick={resetWorkflowStatus}
            className="flex flex-col items-center justify-center p-1.5 bg-gray-700/50 text-gray-400 rounded-lg border border-gray-600/50 active:scale-95"
            title="重置执行进度和节点状态"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="text-[8px] font-bold mt-0.5">重置</span>
          </button>

          {isRunning ? null : isPaused && currentNodeIndex !== -1 ? (
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
                  onClick={resumeWorkflow}
                  className="flex flex-col items-center justify-center bg-blue-600/20 text-blue-500 p-1.5 rounded-lg border border-blue-500/20 shadow-lg"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span className="text-[8px] font-bold mt-0.5">继续</span>
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

      {/* 错误提示栏 */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2 shrink-0">
          <span className="text-[10px] text-red-400 font-bold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </span>
          <button
            onClick={() => setError(null)}
            className="p-1 text-red-400/50 hover:text-red-400 active:scale-90 transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

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
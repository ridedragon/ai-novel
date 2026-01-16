import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Node,
  Panel,
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
  FileText,
  Folder,
  FolderPlus,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneratorPreset, GeneratorPrompt, LoopInstruction, Novel } from '../types';
import { storage } from '../utils/storage';
import { workflowManager } from '../utils/WorkflowManager';
import { ModelConfigPanel } from './Workflow/components/NodeProperties/Shared/ModelConfigPanel';
import { ReferenceSelector } from './Workflow/components/NodeProperties/Shared/ReferenceSelector';
import { WorkflowEdge } from './Workflow/components/WorkflowEdge';
import { WorkflowNode as CustomWorkflowNode } from './Workflow/components/WorkflowNode';
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
  WorkflowNodeData
} from './Workflow/types';


// 常量和 Props 接口已移动至 ./Workflow/types 和 constants

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
  consolidatedModelList
}: {
  node: WorkflowNode;
  onClose: () => void;
  updateNodeData: (nodeId: string, updates: Partial<WorkflowNodeData>) => void;
  toggleSetReference: (type: any, setId: string) => void;
  activeNovel: Novel | undefined;
  allPresets: Record<string, GeneratorPreset[]>;
  pendingFolders: string[];
  globalConfig: any;
  consolidatedModelList: string[];
  addEntry: () => void;
  removeEntry: (entryId: string) => void;
  updateEntryTitle: (entryId: string, title: string) => void;
  updateEntryContent: (entryId: string, content: string) => void;
}) => {
  const [localLabel, setLocalLabel] = useState(node.data.label);
  const [localFolderName, setLocalFolderName] = useState(node.data.folderName);
  const [localInstruction, setLocalInstruction] = useState(node.data.instruction);
  const [localVolumeContent, setLocalVolumeContent] = useState(node.data.volumeContent || '');
  const [isEditingPrompts, setIsEditingPrompts] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalLabel(node.data.label);
    setLocalFolderName(node.data.folderName);
    setLocalInstruction(node.data.instruction);
    setLocalVolumeContent(node.data.volumeContent || '');
  }, [node.id, node.data.volumeContent]);

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
                  <ModelConfigPanel
                    data={node.data}
                    onUpdate={(updates) => updateNodeData(node.id, updates)}
                    globalConfig={globalConfig}
                    allPresets={allPresets}
                    consolidatedModelList={consolidatedModelList}
                  />

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
            <ReferenceSelector
              data={node.data}
              activeNovel={activeNovel}
              pendingFolders={pendingFolders}
              onToggle={toggleSetReference}
            />
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
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const nodesRef = useRef<WorkflowNode[]>([]);
  const workflowsRef = useRef<WorkflowData[]>([]);

  // 性能优化：将 allPresets 移到 Engine 之前，防止初始化引用错误
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
    setWorkflows,
    healWorkflowData
  } = useWorkflowStorage(isOpen, activeWorkflowId, setActiveWorkflowId, activeNovel);

  // 2. 布局逻辑
  const { orderedNodes, getDesktopLayout } = useWorkflowLayout(nodes, edges);

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
    resetWorkflowStatus,
    getConsolidatedModelList
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
    isMobile: false
  });

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => {
      const nextNodes = applyNodeChanges(changes, nds) as WorkflowNode[];
      const mergedNodes = nextNodes.map(n => {
        const refNode = nodesRef.current.find(r => r.id === n.id);
        return refNode ? { ...n, data: { ...n.data, ...refNode.data } } : n;
      });
      nodesRef.current = mergedNodes;
      return mergedNodes;
    });
  }, []);

  // 性能优化：显式使用 useMemo 锁定 nodeTypes 和 edgeTypes，消除 React Flow 的重绘警告
  const nodeTypes = useMemo(() => ({
    custom: CustomWorkflowNode,
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

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  const consolidatedModelList = useMemo(() => getConsolidatedModelList(), [getConsolidatedModelList]);

  // 获取工作流中所有“初始化目录”节点定义的文件夹名（即便尚未运行创建）
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

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

  const switchWorkflow = useCallback((id: string) => {
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
  }, [isRunning, workflows, healWorkflowData, activeNovel, setNodes, setEdges]);

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

  // 只有在组件真正卸载（如切换页面）时才中止执行
  // 关闭弹窗（isOpen 变为 false）不应停止执行，实现后台运行

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
        const refNode = nodesRef.current.find(n => n.id === node.id);
        let baseData = node.data;
        if (refNode) {
            if (refNode.data.status !== node.data.status) baseData = { ...baseData, status: refNode.data.status };
            if ((refNode.data.outputEntries?.length || 0) > (node.data.outputEntries?.length || 0)) baseData = { ...baseData, outputEntries: refNode.data.outputEntries };
            if (refNode.data.loopConfig) baseData = { ...baseData, loopConfig: refNode.data.loopConfig };
            if (refNode.data.label && refNode.data.label !== node.data.label) baseData = { ...baseData, label: refNode.data.label };
        }

        if (node.id === nodeId) return { ...node, data: { ...baseData, ...updates } };
        if (isRenameFolder) return { ...node, data: { ...baseData, outputEntries: [] } };
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
    autoSave(nodes, edges, currentNodeIndex);
  };

  const autoLayoutNodes = useCallback(() => {
    const nextNodes = getDesktopLayout(nodes);
    setNodes(nextNodes);
    nodesRef.current = nextNodes;
  }, [nodes, getDesktopLayout, setNodes]);

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
                正在执行: {currentNodeIndex === -1 ? '准备中...' : (orderedNodes[currentNodeIndex]?.data.typeLabel || '...')}
              </span>
            </div>
            <div className="h-4 w-px bg-indigo-400/50 mx-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('是否强制停止当前任务？\n如果任务长时间卡在“准备中”，请点击确定。')) {
                  stopWorkflow();
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
                        if (e.key === 'Enter') storageRenameWorkflow(activeWorkflowId, newWorkflowName);
                        if (e.key === 'Escape') setIsEditingWorkflowName(false);
                      }}
                      onBlur={() => storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
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
                              if (wf.id === activeWorkflowId && isRunning) {
                                stopWorkflow();
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
                            onClick={() => storageDeleteWorkflow(wf.id)}
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
                      onClick={createWorkflow}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-colors font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      创建新工作流
                    </button>
                    <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-colors font-bold cursor-pointer">
                      <Upload className="w-4 h-4" />
                      导入工作流
                      <input type="file" accept=".json" onChange={handleImportWorkflow} className="hidden" />
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
                  {orderedNodes.map((n, idx) => (
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
                  {orderedNodes.map((n, idx) => (
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
            consolidatedModelList={consolidatedModelList}
            addEntry={addEntry}
            removeEntry={removeEntry}
            updateEntryTitle={updateEntryTitle}
            updateEntryContent={updateEntryContent}
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
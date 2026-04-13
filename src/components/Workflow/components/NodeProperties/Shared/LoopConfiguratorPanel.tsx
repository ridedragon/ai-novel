import { useState } from 'react';
import { Bot, ChevronDown, Cpu, Edit3, GripVertical, Plus, Repeat, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { LoopConfig, LoopInstruction } from '../../../../../types';
import { WorkflowNodeData } from '../../../types';
import { DEFAULT_LOOP_CONFIGURATOR_PROMPTS } from '../../../constants';
import { SharedInput } from '../../Shared/SharedInput';

interface LoopConfiguratorPanelProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
  globalConfig?: any;
  allPresets?: any;
  consolidatedModelList?: string[];
}

export const LoopConfiguratorPanel = ({ 
  data, 
  onUpdate, 
  isMobile = false,
  globalConfig,
  allPresets,
  consolidatedModelList = []
}: LoopConfiguratorPanelProps) => {
  const containerClass = isMobile ? 'space-y-6' : 'space-y-6';

  const inputClass = isMobile
    ? 'w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none'
    : 'w-full bg-[#161922] border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-cyan-500 transition-all';

  const globalLoopConfig = data.globalLoopConfig || { enabled: true, count: 1 };
  const globalLoopInstructions = (data.globalLoopInstructions || []) as LoopInstruction[];
  const useAiGeneration = data.useAiGeneration !== false;
  const overrideAiConfig = data.overrideAiConfig || false;
  const promptItems = (data.promptItems || []) as { id: string; role: 'system' | 'user' | 'assistant'; content: string; enabled: boolean }[];

  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [draggedPromptIndex, setDraggedPromptIndex] = useState<number | null>(null);

  const updateLoopConfig = (updates: Partial<LoopConfig>) => {
    onUpdate({
      globalLoopConfig: { ...globalLoopConfig, ...updates },
    });
  };

  const addLoopInstruction = () => {
    const nextIndex = globalLoopInstructions.length > 0
      ? Math.max(...globalLoopInstructions.map(i => i.index)) + 1
      : 1;
    
    const newInstruction: LoopInstruction = {
      index: nextIndex,
      content: '',
    };

    onUpdate({
      globalLoopInstructions: [...globalLoopInstructions, newInstruction],
    });
  };

  const updateLoopInstruction = (idx: number, content: string) => {
    const newInstructions = [...globalLoopInstructions];
    newInstructions[idx] = { ...newInstructions[idx], content };
    onUpdate({ globalLoopInstructions: newInstructions });
  };

  const removeLoopInstruction = (idx: number) => {
    const newInstructions = globalLoopInstructions.filter((_, i) => i !== idx);
    onUpdate({ globalLoopInstructions: newInstructions });
  };

  const addPromptItem = () => {
    const newItem = {
      id: `prompt_${Date.now()}`,
      role: 'user' as const,
      content: '',
      enabled: true,
    };
    onUpdate({ promptItems: [...promptItems, newItem] });
  };

  const updatePromptItem = (idx: number, updates: Partial<typeof promptItems[0]>) => {
    const newItems = [...promptItems];
    newItems[idx] = { ...newItems[idx], ...updates };
    onUpdate({ promptItems: newItems });
  };

  const removePromptItem = (idx: number) => {
    const newItems = promptItems.filter((_, i) => i !== idx);
    onUpdate({ promptItems: newItems });
  };

  const movePromptItem = (fromIndex: number, toIndex: number) => {
    const newItems = [...promptItems];
    const [removed] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, removed);
    onUpdate({ promptItems: newItems });
  };

  const onDragStart = (_e: React.DragEvent, index: number) => {
    setDraggedPromptIndex(index);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPromptIndex === null) return;
    if (draggedPromptIndex !== index) {
      movePromptItem(draggedPromptIndex, index);
      setDraggedPromptIndex(index);
    }
  };

  const onDragEnd = () => {
    setDraggedPromptIndex(null);
    setIsDragEnabled(false);
  };

  return (
    <div
      className={isMobile ? 'space-y-6 pt-6 border-t border-gray-800' : 'space-y-6 pt-6 border-t border-gray-700/30'}
    >
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5" /> 循环配置器
        </label>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          此节点用于配置后续所有节点的循环特定指令和循环次数。支持AI智能生成或手动配置。
        </p>
      </div>

      <div className={containerClass}>
        {/* AI生成模式开关 */}
        <div
          className={
            isMobile
              ? 'bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-2xl p-5 space-y-4'
              : 'bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-xl p-4 space-y-3'
          }
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold text-cyan-300 uppercase">AI 智能生成</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useAiGeneration}
                onChange={e => onUpdate({ useAiGeneration: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>

          {useAiGeneration && (
            <div className="space-y-4 pt-3 border-t border-cyan-500/20">
              {/* 用户指令输入 */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-cyan-300/80 font-bold uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI 生成指令
                </label>
                <textarea
                  value={data.instruction || ''}
                  onChange={e => onUpdate({ instruction: e.target.value })}
                  placeholder="描述你对循环配置的要求，例如：根据大纲章节生成10次循环，每次循环需要推进主线剧情..."
                  className={
                    isMobile
                      ? 'w-full h-24 bg-gray-900/50 border border-cyan-500/30 rounded-xl p-3 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-400 resize-none'
                      : 'w-full h-20 bg-[#0d1117] border border-cyan-500/30 rounded-lg p-2.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-cyan-400 resize-none'
                  }
                />
                <p className="text-[9px] text-cyan-400/60 leading-relaxed">
                  AI将根据前置节点产出和后续节点列表，智能生成循环配置。留空则自动分析生成。
                </p>
              </div>

              {/* API 配置开关 */}
              <div className="space-y-3 pt-3 border-t border-cyan-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-bold text-violet-300 uppercase">自定义 API 配置</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideAiConfig}
                      onChange={e => onUpdate({ overrideAiConfig: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
                  </label>
                </div>

                {overrideAiConfig && (
                  <div className={isMobile ? 'space-y-4 bg-gray-900/30 p-4 rounded-xl' : 'space-y-3 bg-gray-900/30 p-3 rounded-lg'}>
                    {/* API 快速选择器 */}
                    {globalConfig && allPresets && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">快速同步 API 设置</label>
                        <div className="relative">
                          <select
                            className={inputClass}
                            value=""
                            onChange={e => {
                              const [key, url, model] = e.target.value.split('|');
                              if (key && url) {
                                const updates: any = { apiKey: key, baseUrl: url };
                                if (model) {
                                  updates.model = model;
                                }
                                onUpdate(updates);
                              }
                            }}
                          >
                            <option value="" disabled>从现有配置中选择...</option>
                            {(() => {
                              const apis: any[] = [];
                              if (globalConfig?.apiKey) apis.push({ name: '主设置 API', key: globalConfig.apiKey, url: globalConfig.baseUrl, model: globalConfig.model });
                              // 添加全局 API 预设
                              if (globalConfig?.apiPresets) {
                                globalConfig.apiPresets.forEach((preset: any) => {
                                  if (preset.apiKey && preset.baseUrl) {
                                    apis.push({ name: `API预设: ${preset.name}`, key: preset.apiKey, url: preset.baseUrl, model: preset.defaultModel });
                                  }
                                });
                              }
                              // 添加节点类型预设
                              Object.values(allPresets).flat().forEach((p: any) => {
                                if (p.apiConfig?.apiKey && p.apiConfig?.baseUrl) {
                                  apis.push({ name: `预设: ${p.name}`, key: p.apiConfig.apiKey, url: p.apiConfig.baseUrl, model: p.apiConfig.model });
                                }
                              });
                              return apis.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i).map((api, idx) => (
                                <option key={idx} value={`${api.key}|${api.url}|${api.model || ''}`}>{api.name} ({api.url})</option>
                              ));
                            })()}
                          </select>
                          {isMobile && <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />}
                        </div>
                      </div>
                    )}

                    <div className={isMobile ? 'space-y-4' : 'grid grid-cols-2 gap-3'}>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">API Key</label>
                        <SharedInput
                          type="password"
                          value={data.apiKey || ''}
                          onValueChange={val => onUpdate({ apiKey: val })}
                          placeholder="不填则使用全局设置..."
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">API Base URL</label>
                        <SharedInput
                          value={data.baseUrl || ''}
                          onValueChange={val => onUpdate({ baseUrl: val })}
                          placeholder="例如: https://api.openai.com/v1"
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">执行模型</label>
                        <div className="flex gap-2">
                          <SharedInput
                            value={data.model || ''}
                            onValueChange={val => onUpdate({ model: val })}
                            placeholder="手动输入..."
                            className={`flex-1 ${inputClass} font-mono`}
                          />
                          <select
                            className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 text-[10px] text-gray-400 outline-none cursor-pointer"
                            onChange={e => onUpdate({ model: e.target.value })}
                            value={data.model || ""}
                          >
                            <option value="" disabled>快速选择...</option>
                            {consolidatedModelList.map((m: string) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">Temperature: {data.temperature ?? 0.7}</label>
                        <input
                          type="range" min="0" max="2" step="0.1"
                          value={data.temperature ?? 0.7}
                          onChange={e => onUpdate({ temperature: parseFloat(e.target.value) })}
                          className="w-full accent-cyan-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-gray-400 font-bold uppercase">Max Tokens</label>
                        <SharedInput
                          type="number"
                          value={data.maxTokens || ''}
                          onValueChange={val => onUpdate({ maxTokens: parseInt(val) || undefined })}
                          placeholder="默认"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 提示词预设编辑 */}
              <div className="space-y-3 pt-3 border-t border-cyan-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-300 uppercase">提示词预设</span>
                  </div>
                  <button
                    onClick={addPromptItem}
                    className={
                      isMobile
                        ? 'px-2.5 py-1.5 bg-amber-600/20 text-amber-400 rounded-xl text-[10px] font-bold border border-amber-500/30'
                        : 'px-2 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-md text-[10px] font-bold border border-amber-500/30 transition-all'
                    }
                  >
                    <Plus className="w-3 h-3 inline mr-1" /> 添加条目
                  </button>
                </div>

                <div className="space-y-2">
                  {promptItems.map((item, idx) => (
                    <div
                      key={item.id}
                      draggable={isDragEnabled}
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={onDragEnd}
                      className={
                        isMobile
                          ? `bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden ${draggedPromptIndex === idx ? 'opacity-50' : ''}`
                          : `bg-[#161922] border border-gray-700/50 rounded-lg overflow-hidden ${draggedPromptIndex === idx ? 'opacity-50' : ''}`
                      }
                    >
                      <div
                        className={
                          isMobile
                            ? 'flex items-center justify-between px-3 py-2 bg-gray-700/30 border-b border-gray-700/50'
                            : 'flex items-center justify-between bg-gray-800/50 px-3 py-1.5 border-b border-gray-700/30'
                        }
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="cursor-grab active:cursor-grabbing p-1 text-gray-600 hover:text-gray-400"
                            onMouseEnter={() => setIsDragEnabled(true)}
                            onMouseLeave={() => setIsDragEnabled(false)}
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <select
                            value={item.role}
                            onChange={e => updatePromptItem(idx, { role: e.target.value as 'system' | 'user' | 'assistant' })}
                            className="bg-transparent text-[10px] text-gray-300 font-bold uppercase outline-none cursor-pointer"
                          >
                            <option value="system">System</option>
                            <option value="user">User</option>
                            <option value="assistant">Assistant</option>
                          </select>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.enabled}
                              onChange={e => updatePromptItem(idx, { enabled: e.target.checked })}
                              className="w-3 h-3 rounded accent-cyan-500"
                            />
                            <span className="text-[9px] text-gray-500">启用</span>
                          </label>
                        </div>
                        <button
                          onClick={() => removePromptItem(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <textarea
                        value={item.content}
                        onChange={e => updatePromptItem(idx, { content: e.target.value })}
                        placeholder="输入提示词内容... 可使用 {{previous_context}}, {{subsequent_nodes}}, {{user_instruction}} 变量"
                        className="w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none font-mono"
                      />
                    </div>
                  ))}

                  {promptItems.length === 0 && (
                    <div className="space-y-3">
                      {/* 显示默认预设内容 */}
                      <div className="text-[9px] text-amber-400 font-bold uppercase flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> 默认预设（只读）
                      </div>
                      {DEFAULT_LOOP_CONFIGURATOR_PROMPTS.map((preset, idx) => (
                        <div
                          key={preset.id}
                          className={
                            isMobile
                              ? 'bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden'
                              : 'bg-[#0d1117] border border-gray-700/30 rounded-lg overflow-hidden'
                          }
                        >
                          <div
                            className={
                              isMobile
                                ? 'flex items-center justify-between px-3 py-2 bg-gray-700/20 border-b border-gray-700/30'
                                : 'flex items-center justify-between px-3 py-1.5 bg-gray-800/30 border-b border-gray-700/20'
                            }
                          >
                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                              {preset.role === 'system' ? 'System' : 'User'}
                            </span>
                            <span className="text-[9px] text-emerald-400">✓ 默认启用</span>
                          </div>
                          <pre className="p-3 text-[9px] text-gray-400 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                            {preset.content}
                          </pre>
                        </div>
                      ))}
                      <button
                        onClick={() => onUpdate({ promptItems: [...DEFAULT_LOOP_CONFIGURATOR_PROMPTS] })}
                        className={
                          isMobile
                            ? 'w-full py-2 bg-amber-600/20 text-amber-400 rounded-xl text-[10px] font-bold border border-amber-500/30'
                            : 'w-full py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-md text-[10px] font-bold border border-amber-500/30 transition-all'
                        }
                      >
                        <Edit3 className="w-3 h-3 inline mr-1" /> 编辑预设（复制为可编辑）
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 生成结果预览 */}
              {data.generatedLoopConfig && (
                <div className="space-y-1.5 pt-3 border-t border-cyan-500/10">
                  <label className="text-[9px] text-emerald-400 font-bold uppercase">上次生成结果</label>
                  <div
                    className={
                      isMobile
                        ? 'bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 max-h-32 overflow-y-auto'
                        : 'bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 max-h-28 overflow-y-auto'
                    }
                  >
                    <pre className="text-[9px] text-emerald-300 whitespace-pre-wrap font-mono">
                      {data.generatedLoopConfig}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 手动配置区域（AI生成关闭时显示） */}
        {!useAiGeneration && (
          <div
            className={
              isMobile
                ? 'bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5 space-y-4'
                : 'bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-5 space-y-4'
            }
          >
            <div className="space-y-2">
              <label className="text-[10px] text-cyan-300 font-bold uppercase flex items-center gap-2">
                <Repeat className="w-3 h-3" /> 全局循环次数
              </label>
              <SharedInput
                type="number"
                min="1"
                max="100"
                value={globalLoopConfig.count?.toString() || '1'}
                onValueChange={val => {
                  const count = parseInt(val) || 1;
                  updateLoopConfig({ count, enabled: true });
                }}
                className={inputClass}
              />
              <p className="text-[9px] text-cyan-400/70 leading-relaxed">
                设置后续循环执行器的默认循环次数。
              </p>
            </div>

            <div className="pt-4 border-t border-cyan-500/20">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] text-cyan-300 font-bold uppercase flex items-center gap-2">
                  <Repeat className="w-3 h-3" /> 全局循环特定指令
                </label>
                <button
                  onClick={addLoopInstruction}
                  className={
                    isMobile
                      ? 'px-2.5 py-1.5 bg-cyan-600/20 text-cyan-400 rounded-xl text-[10px] font-bold border border-cyan-500/30'
                      : 'px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-md text-[10px] font-bold border border-cyan-500/30 transition-all'
                  }
                >
                  <Plus className="w-3 h-3 inline mr-1" /> 添加轮次
                </button>
              </div>

              <div className="space-y-3">
                {globalLoopInstructions.map((inst, idx) => (
                  <div
                    key={idx}
                    className={
                      isMobile
                        ? 'bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden'
                        : 'bg-[#161922] border border-gray-700/50 rounded-lg overflow-hidden'
                    }
                  >
                    <div
                      className={
                        isMobile
                          ? 'flex items-center justify-between px-3 py-2 bg-gray-700/30 border-b border-gray-700/50'
                          : 'flex items-center justify-between bg-gray-800/50 px-3 py-1.5 border-b border-gray-700/30'
                      }
                    >
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        第 {inst.index} 次循环指令
                      </span>
                      <button
                        onClick={() => removeLoopInstruction(idx)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <textarea
                      value={inst.content}
                      onChange={e => updateLoopInstruction(idx, e.target.value)}
                      placeholder="输入该轮次特定的额外指令..."
                      className="w-full h-20 bg-transparent p-3 text-xs text-gray-300 focus:text-white outline-none resize-none"
                    />
                  </div>
                ))}

                {globalLoopInstructions.length === 0 && (
                  <div
                    className={
                      isMobile
                        ? 'text-center py-6 border border-dashed border-gray-700 rounded-2xl'
                        : 'text-center py-6 border border-dashed border-gray-700 rounded-xl'
                    }
                  >
                    <p className="text-[10px] text-gray-600">
                      未配置循环特定指令。点击"添加轮次"开始配置。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 当前配置预览（AI生成模式时显示） */}
        {useAiGeneration && (globalLoopConfig?.count || globalLoopInstructions.length > 0) && (
          <div className="bg-gray-900/30 border border-gray-700/30 rounded-lg p-3">
            <label className="text-[9px] text-gray-400 font-bold uppercase mb-2 block">当前配置预览</label>
            <div className="space-y-1.5">
              {globalLoopConfig?.count && (
                <p className="text-[10px] text-gray-300">
                  循环次数: <span className="text-cyan-400 font-bold">{globalLoopConfig.count}</span>
                </p>
              )}
              {globalLoopInstructions.length > 0 && (
                <p className="text-[10px] text-gray-300">
                  循环指令: <span className="text-cyan-400 font-bold">{globalLoopInstructions.length}</span> 条
                </p>
              )}
            </div>
          </div>
        )}

        <div className="bg-gray-900/30 border border-gray-700/30 rounded-lg p-4">
          <p className="text-[9px] text-gray-500 leading-relaxed">
            <strong className="text-cyan-400">使用说明：</strong>
            <br />
            1. <strong>AI生成模式</strong>：AI将根据前置节点产出和后续节点列表，智能生成循环配置。
            <br />
            2. <strong>自定义API</strong>：开启后可配置独立的API Key、模型等参数。
            <br />
            3. <strong>提示词预设</strong>：可自定义提示词条目，支持变量替换。
            <br />
            4. <strong>重试机制</strong>：解析失败时自动重试，最多2次。
          </p>
        </div>
      </div>
    </div>
  );
};

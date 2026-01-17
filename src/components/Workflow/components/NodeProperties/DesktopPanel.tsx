import { BookOpen, ChevronDown, Cpu, FileText, PauseCircle, Play, Trash2, Wand2 } from 'lucide-react';
import { useRef } from 'react';
import { GeneratorPreset, Novel } from '../../../../types';
import { WorkflowNode, WorkflowNodeData } from '../../types';
import { BasicNodeInfo, NodeHeader } from './Shared/BasicNodeInfo';
import { LoopConfigPanel, LoopInstructionsPanel } from './Shared/LoopConfigPanel';
import { ModelConfigPanel } from './Shared/ModelConfigPanel';
import { OutputList } from './Shared/OutputList';
import { PromptEditor } from './Shared/PromptEditor';
import { ReferenceSelector } from './Shared/ReferenceSelector';
import { VolumeConfigPanel } from './Shared/VolumeConfigPanel';

interface DesktopPanelProps {
  node: WorkflowNode;
  onClose: () => void;
  updateNodeData: (nodeId: string, updates: Partial<WorkflowNodeData>) => void;
  toggleSetReference: (type: any, setId: string) => void;
  activeNovel: Novel | undefined;
  allPresets: Record<string, GeneratorPreset[]>;
  pendingFolders: string[];
  globalConfig: any;
  consolidatedModelList: string[];
}

export const DesktopPanel = ({
  node,
  onClose,
  updateNodeData,
  toggleSetReference,
  activeNovel,
  allPresets,
  pendingFolders,
  globalConfig,
  consolidatedModelList,
}: DesktopPanelProps) => {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 防抖更新函数
  const debouncedUpdate = (updates: Partial<WorkflowNodeData>) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    updateNodeData(node.id, updates);
    // 注意：原始代码中的 setTimeout 其实没有起到真正的延迟更新到 React Flow 的作用，
    // 因为这里直接调用了 props 传进来的 updateNodeData。
    // 如果需要极致性能，应该在本地维护 state，然后 debounced 同步到上层。
    // 但鉴于拆分组件后，本地状态已分散，这里直接调用以保持逻辑简单。
  };

  // 简化的更新封装
  const handleUpdate = (updates: Partial<WorkflowNodeData>) => {
    updateNodeData(node.id, updates);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[650px] bg-[#1e2230] rounded-xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <NodeHeader data={node.data} onUpdate={handleUpdate} onClose={onClose} />

        <div className="p-8 space-y-8 custom-scrollbar max-h-[80vh] overflow-y-auto bg-[#1e2230]">
          <BasicNodeInfo data={node.data} onUpdate={handleUpdate} activeNovel={activeNovel} />

          {node.data.presetType &&
            node.data.typeKey !== 'workflowGenerator' &&
            node.data.typeKey !== 'saveToVolume' &&
            node.data.typeKey !== 'aiChat' && (
              <div className="space-y-3 pt-6 border-t border-gray-700/30">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" /> 基础模板 (调用系统预设)
                </label>
                <div className="relative">
                  <select
                    value={node.data.presetId as string}
                    onChange={e => {
                      const presets = Object.values(allPresets).flat();
                      const preset = presets.find(p => p.id === e.target.value);
                      handleUpdate({
                        presetId: e.target.value,
                        presetName: preset?.name || '',
                      });
                    }}
                    className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                  >
                    <option value="">-- 不使用预设模板 (使用主设置) --</option>
                    {(allPresets[node.data.presetType as string] || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.apiConfig?.model || '默认'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">* 选择预设将加载该预设定义的提示词和模型。</p>
              </div>
            )}

          {(node.data.typeKey === 'aiChat' ||
            node.data.typeKey === 'workflowGenerator' ||
            node.data.typeKey === 'saveToVolume') && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              {node.data.typeKey === 'workflowGenerator' && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-4">
                  {/* ... 架构师模式说明保持原样，也可以进一步抽离 ... */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                      <Wand2 className="w-4 h-4" /> 架构师模式说明
                    </div>
                    {/* ... 省略保存/重置按钮逻辑 ... */}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    此节点运行后将<b>根据需求重新生成整个画布</b>。 完成后此节点会消失，替换为完整的工作流。
                  </p>
                  <div className="mt-3 pt-3 border-t border-indigo-500/10">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div
                        className={`w-8 h-4 rounded-full relative transition-colors ${node.data.autoFillContent ? 'bg-indigo-600' : 'bg-gray-700'}`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${node.data.autoFillContent ? 'left-4.5' : 'left-0.5'}`}
                        />
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={node.data.autoFillContent}
                        onChange={e => handleUpdate({ autoFillContent: e.target.checked })}
                      />
                      <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">
                        AI 自动填写节点内容 (指令/配置)
                      </span>
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
                    if (newVal && (!node.data.promptItems || (node.data.promptItems as any[]).length === 0)) {
                      // 初始化默认 Prompts 逻辑 (保持不变)
                      if (node.data.typeKey === 'saveToVolume') {
                        updates.promptItems = [
                          {
                            id: 'sys-1',
                            role: 'system',
                            content: '你是一名拥有丰富经验的网文作家和架构师...',
                            enabled: true,
                          },
                          {
                            id: 'user-1',
                            role: 'user',
                            content: '我已理解你的角色和任务...\n\n{{context}}',
                            enabled: true,
                          },
                        ];
                      } else {
                        updates.promptItems = [
                          { id: 'sys-1', role: 'system', content: '你是一个专业的创作助手。', enabled: true },
                          { id: 'user-1', role: 'user', content: '{{context}}', enabled: true },
                        ];
                      }
                    }
                    handleUpdate(updates);
                  }}
                  className={`text-[10px] px-2 py-1 rounded transition-all font-bold uppercase tracking-wider ${node.data.overrideAiConfig ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                >
                  {node.data.overrideAiConfig ? '已开启重写' : '开启自定义'}
                </button>
              </div>

              {node.data.typeKey === 'workflowGenerator' && (
                <div className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg">
                  {/* JSON 示例保持不变 */}
                  <div className="text-[10px] text-gray-500 font-bold uppercase mb-2 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> AI 返回协议示例 (Expected JSON)
                  </div>
                  <pre className="text-[9px] text-emerald-400 font-mono overflow-x-auto leading-relaxed">
                    {`{
  "nodes": [ ... ],
  "edges": [ ... ]
}`}
                  </pre>
                </div>
              )}

              {node.data.overrideAiConfig && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <ModelConfigPanel
                    data={node.data}
                    onUpdate={handleUpdate}
                    globalConfig={globalConfig}
                    allPresets={allPresets}
                    consolidatedModelList={consolidatedModelList}
                  />

                  <PromptEditor data={node.data} onUpdate={handleUpdate} />
                </div>
              )}
            </div>
          )}

          {node.data.typeKey === 'saveToVolume' && activeNovel && (
            <VolumeConfigPanel data={node.data} onUpdate={handleUpdate} />
          )}

          {node.data.typeKey !== 'userInput' &&
            node.data.typeKey !== 'pauseNode' &&
            node.data.typeKey !== 'saveToVolume' &&
            activeNovel && (
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
                  {node.data.typeKey === 'workflowGenerator'
                    ? '工作流需求描述 (Architecture Requirements)'
                    : '额外指令 (USER PROMPT)'}
                </label>
                <textarea
                  value={node.data.instruction}
                  onChange={e => handleUpdate({ instruction: e.target.value })}
                  placeholder={
                    node.data.typeKey === 'workflowGenerator'
                      ? '描述你想要的工作流结构，例如：先写灵感，再写世界观和角色，最后生成大纲和正文...'
                      : '输入该步骤的特定要求或引导词...'
                  }
                  className="w-full h-32 bg-[#161922] border border-gray-700/80 rounded-lg p-4 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none font-mono leading-relaxed transition-all"
                />
              </div>

              <LoopInstructionsPanel data={node.data} onUpdate={handleUpdate} />
            </>
          )}

          {node.data.typeKey === 'loopNode' && <LoopConfigPanel data={node.data} onUpdate={handleUpdate} />}

          {node.data.typeKey === 'pauseNode' && (
            <div className="space-y-4 pt-6 border-t border-gray-700/30">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <PauseCircle className="w-3.5 h-3.5" /> 暂停节点说明
              </label>
              <div className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-lg">
                <p className="text-xs text-slate-300 leading-relaxed">
                  当工作流执行到此节点时，将自动暂停并进入等待状态。
                  <br />
                  <br />
                  您可以在确认内容或进行人工操作后，点击顶部工具栏的
                  <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded border border-blue-500/30 text-[10px] font-bold">
                    <Play className="w-2 h-2" /> 从停止处继续
                  </span>
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
                <p className="text-xs text-gray-500 mt-2 px-10 leading-relaxed">
                  工作流执行过程中生成的正文会直接写入小说对应的分卷中（由前置的“保存至分卷”节点决定），您可以在主界面左侧的目录树中点击查看、编辑或手动优化这些章节。
                </p>
              </div>
            </div>
          ) : (
            node.data.typeKey !== 'pauseNode' &&
            node.data.typeKey !== 'saveToVolume' && <OutputList data={node.data} onUpdate={handleUpdate} />
          )}
        </div>

        <div className="p-5 border-t border-gray-700/50 bg-[#1a1d29]">
          <button
            onClick={() => {
              handleUpdate({ _deleted: true } as any);
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

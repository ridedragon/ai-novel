import { ChevronDown, Cpu, FileText, PauseCircle, Trash2, Wand2 } from 'lucide-react';
import React from 'react';
import { GeneratorPreset, Novel } from '../../../../types';
import { OutputEntry, WorkflowNode, WorkflowNodeData } from '../../types';
import { SharedTextarea } from '../Shared/SharedInput';
import { BasicNodeInfo, NodeHeader } from './Shared/BasicNodeInfo';
import { LoopConfigPanel, LoopInstructionsPanel } from './Shared/LoopConfigPanel';
import { ModelConfigPanel } from './Shared/ModelConfigPanel';
import { OutputList } from './Shared/OutputList';
import { PromptEditor } from './Shared/PromptEditor';
import { ReferenceSelector } from './Shared/ReferenceSelector';
import { VolumeConfigPanel } from './Shared/VolumeConfigPanel';

interface MobilePanelProps {
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

export const MobilePanel = React.memo(
  ({
    editingNode,
    activeNovel,
    allPresets,
    pendingFolders,
    globalConfig,
    onUpdateNodeData,
    onDeleteNode,
    onDeleteOutputEntry,
    onClose,
    onPreviewEntry,
  }: MobilePanelProps) => {
    // 整合所有分类 API 模型并去重
    const consolidatedModelList = React.useMemo(() => {
      const list = [...(globalConfig?.modelList || [])];
      if (globalConfig?.model) list.push(globalConfig.model);

      // 整合预设
      const presetTypes = [
        'outline',
        'character',
        'worldview',
        'inspiration',
        'plotOutline',
        'completion',
        'optimize',
        'analysis',
        'chat',
        'generator',
      ];
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

      Object.values(allPresets)
        .flat()
        .forEach(p => {
          if (p.apiConfig?.model) list.push(p.apiConfig.model);
        });

      return Array.from(new Set(list.filter(Boolean)));
    }, [globalConfig, allPresets]);

    const handleUpdate = (updates: Partial<WorkflowNodeData>) => {
      onUpdateNodeData(editingNode.id, updates);
    };

    const toggleSetReference = (type: any, setId: string) => {
      const key =
        type === 'worldview'
          ? 'selectedWorldviewSets'
          : type === 'character'
            ? 'selectedCharacterSets'
            : type === 'outline'
              ? 'selectedOutlineSets'
              : type === 'inspiration'
                ? 'selectedInspirationSets'
                : 'selectedReferenceFolders';

      const currentList = [...(editingNode.data[key] as string[])];
      const newList = currentList.includes(setId) ? currentList.filter(id => id !== setId) : [...currentList, setId];

      onUpdateNodeData(editingNode.id, { [key]: newList });
    };

    return (
      <div className="fixed inset-0 bg-gray-900 z-[130] flex flex-col animate-in slide-in-from-bottom duration-300">
        <NodeHeader data={editingNode.data} onUpdate={handleUpdate} onClose={onClose} isMobile={true} />

        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24 custom-scrollbar">
          <BasicNodeInfo data={editingNode.data} onUpdate={handleUpdate} activeNovel={activeNovel} isMobile={true} />

          {editingNode.data.presetType &&
            editingNode.data.typeKey !== 'saveToVolume' &&
            editingNode.data.typeKey !== 'aiChat' && (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" /> 基础模板 (调用系统预设)
                </label>
                <div className="relative">
                  <select
                    value={editingNode.data.presetId as string}
                    onChange={e => {
                      const presets = Object.values(allPresets).flat();
                      const preset = presets?.find(p => p.id === e.target.value);
                      handleUpdate({
                        presetId: e.target.value,
                        presetName: preset?.name || '',
                      });
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
                  >
                    <option value="">-- 不使用预设模板 (使用主设置) --</option>
                    {(allPresets[editingNode.data.presetType as string] || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.apiConfig?.model || '默认'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
                <p className="text-[8px] text-gray-500 italic px-1">* 预设包含其定义的提示词和模型设置。</p>
              </div>
            )}

          {(editingNode.data.typeKey === 'aiChat' ||
            editingNode.data.typeKey === 'workflowGenerator' ||
            editingNode.data.typeKey === 'saveToVolume') && (
            <div className="space-y-4 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" /> 强制自定义 (覆盖所有)
                </label>
                <button
                  onClick={() => {
                    const newVal = !editingNode.data.overrideAiConfig;
                    const updates: any = { overrideAiConfig: newVal };
                    if (
                      newVal &&
                      (!editingNode.data.promptItems || (editingNode.data.promptItems as any[]).length === 0)
                    ) {
                      // 初始化默认 Prompts (简化版)
                      updates.promptItems = [
                        { id: 'sys-1', role: 'system', content: '你是一个专业的创作助手。', enabled: true },
                        { id: 'user-1', role: 'user', content: '{{context}}', enabled: true },
                      ];
                    }
                    handleUpdate(updates);
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

                  <PromptEditor data={editingNode.data} onUpdate={handleUpdate} isMobile={true} />
                </div>
              )}
            </div>
          )}

          {editingNode.data.typeKey === 'saveToVolume' && (
            <VolumeConfigPanel data={editingNode.data} onUpdate={handleUpdate} isMobile={true} />
          )}

          {editingNode.data.typeKey !== 'pauseNode' && editingNode.data.typeKey !== 'saveToVolume' && (
            <>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  {editingNode.data.typeKey === 'workflowGenerator' ? '工作流需求描述' : '创作指令 (User Prompt)'}
                </label>
                <SharedTextarea
                  value={editingNode.data.instruction}
                  onValueChange={(val: string) => handleUpdate({ instruction: val })}
                  className="w-full h-56 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
                  placeholder={
                    editingNode.data.typeKey === 'workflowGenerator'
                      ? '描述你想要的工作流结构...'
                      : '在此输入具体要求...'
                  }
                />
              </div>

              <LoopInstructionsPanel data={editingNode.data} onUpdate={handleUpdate} isMobile={true} />
            </>
          )}

          {editingNode.data.typeKey === 'loopNode' && (
            <LoopConfigPanel data={editingNode.data} onUpdate={handleUpdate} isMobile={true} />
          )}

          {editingNode.data.typeKey === 'pauseNode' && (
            <div className="space-y-4 pt-4 border-t border-gray-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <PauseCircle className="w-3.5 h-3.5" /> 暂停节点说明
              </label>
              <div className="bg-slate-700/20 border border-slate-600/30 rounded-2xl p-4">
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  当工作流执行到此节点时，将自动暂停并进入等待状态。
                  <br />
                  <br />
                  您可以在确认内容或进行人工操作后，点击顶部工具栏的继续按钮。
                </p>
              </div>
            </div>
          )}

          {editingNode.data.typeKey !== 'userInput' &&
            editingNode.data.typeKey !== 'pauseNode' &&
            editingNode.data.typeKey !== 'saveToVolume' &&
            activeNovel && (
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
          ) : (
            editingNode.data.typeKey !== 'pauseNode' &&
            editingNode.data.typeKey !== 'saveToVolume' && (
              <OutputList data={editingNode.data} onUpdate={handleUpdate} onPreview={onPreviewEntry} isMobile={true} />
            )
          )}
        </div>

        <div className="p-6 bg-gray-800 border-t border-gray-700 sticky bottom-0 z-10 flex gap-4">
          <button
            onClick={() => {
              if (confirm('确定要删除这个模块吗？')) {
                onDeleteNode(editingNode.id);
              }
            }}
            className="flex flex-col items-center justify-center px-6 bg-red-900/20 text-red-400 rounded-2xl"
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px] font-bold mt-1">删除</span>
          </button>
          <button onClick={onClose} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">
            确定并返回
          </button>
        </div>
      </div>
    );
  },
);

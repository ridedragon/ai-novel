import { ChevronDown, Cpu, Expand, FileText, PauseCircle, Trash2, Wand2, X, BookOpen } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { GeneratorPreset, Novel } from '../../../../types';
import { workflowManager } from '../../../../utils/WorkflowManager';
import { OutputEntry, WorkflowNode, WorkflowNodeData } from '../../types';
import { SharedTextarea } from '../Shared/SharedInput';
import { BasicNodeInfo, NodeHeader } from './Shared/BasicNodeInfo';
import { ChapterStartSelector } from './Shared/ChapterStartSelector';
import { CreationInfoPanel } from './Shared/CreationInfoPanel';
import { LoopConfigPanel, LoopInstructionsPanel } from './Shared/LoopConfigPanel';
import { LoopConfiguratorPanel } from './Shared/LoopConfiguratorPanel';
import { ModelConfigPanel } from './Shared/ModelConfigPanel';
import { MultiFolderConfigPanel } from './Shared/MultiFolderConfigPanel';
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
  nodes?: WorkflowNode[];
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
    nodes,
  }: MobilePanelProps) => {
    const [isInstructionExpanded, setIsInstructionExpanded] = useState(false);

    const consolidatedModelList = React.useMemo(() => {
      const list = [...(globalConfig?.modelList || [])];
      if (globalConfig?.model) list.push(globalConfig.model);

      // 添加 API 预设中的模型
      if (globalConfig?.apiPresets) {
        globalConfig.apiPresets.forEach((preset: any) => {
          if (preset.modelList) {
            preset.modelList.forEach((model: string) => {
              list.push(model);
            });
          }
        });
      }

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

    const creationInfoVolumeInfo = useMemo(() => {
      const activeVolumeId = workflowManager.getActiveVolumeAnchor();
      const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
      // 优先使用 workflowManager 中存储的总分卷数，否则使用已创建的分卷数
      const totalVolumes = workflowManager.getTotalVolumes() || activeNovel?.volumes?.length || 0;
      
      let currentVolumeName = '';
      if (activeVolumeId && activeNovel?.volumes) {
        const activeVolume = activeNovel.volumes.find(v => v.id === activeVolumeId);
        if (activeVolume) {
          currentVolumeName = activeVolume.title;
        }
      }
      
      if (!currentVolumeName && activeNovel?.volumes && currentVolumeIndex < totalVolumes) {
        currentVolumeName = activeNovel.volumes[currentVolumeIndex]?.title || '';
      }
      
      return {
        currentVolumeName,
        volumeIndex: currentVolumeIndex,
        totalVolumes,
      };
    }, [activeNovel, editingNode.id, nodes]);

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
      <>
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

          {editingNode.data.typeKey === 'multiCreateFolder' && (
            <MultiFolderConfigPanel data={editingNode.data} onUpdate={handleUpdate} isMobile={true} />
          )}

          {editingNode.data.typeKey === 'loopConfigurator' && (
            <LoopConfiguratorPanel 
              data={editingNode.data} 
              onUpdate={handleUpdate} 
              isMobile={true}
              globalConfig={globalConfig}
              allPresets={allPresets}
              consolidatedModelList={consolidatedModelList}
            />
          )}

          {editingNode.data.typeKey === 'creationInfo' && (
            <CreationInfoPanel data={editingNode.data} onUpdate={handleUpdate} isMobile={true} volumeInfo={creationInfoVolumeInfo} />
          )}

          {editingNode.data.typeKey !== 'pauseNode' &&
            editingNode.data.typeKey !== 'saveToVolume' &&
            editingNode.data.typeKey !== 'multiCreateFolder' &&
            editingNode.data.typeKey !== 'loopConfigurator' &&
            editingNode.data.typeKey !== 'creationInfo' &&
            editingNode.data.typeKey !== 'outlineAndChapter' && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    {editingNode.data.typeKey === 'workflowGenerator' ? '工作流需求描述' : '创作指令 (User Prompt)'}
                  </label>
                  <button
                    onClick={() => setIsInstructionExpanded(true)}
                    className="p-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Expand className="w-3 h-3" /> 放大编辑
                  </button>
                </div>
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
            editingNode.data.typeKey !== 'multiCreateFolder' &&
            editingNode.data.typeKey !== 'loopConfigurator' &&
            editingNode.data.typeKey !== 'creationInfo' &&
            activeNovel && (
              <ReferenceSelector
                data={editingNode.data}
                activeNovel={activeNovel}
                pendingFolders={pendingFolders}
                onToggle={toggleSetReference}
                isMobile={true}
              />
            )}

          {editingNode.data.typeKey === 'outlineAndChapter' ? (
            <div className="space-y-6 pt-4 border-t border-gray-800">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" /> 大纲预设
                </label>
                <div className="relative">
                  <select
                    value={editingNode.data.outlinePresetId as string || ''}
                    onChange={e => {
                      const outlinePresets = allPresets['outline'] || [];
                      const preset = outlinePresets.find(p => p.id === e.target.value);
                      handleUpdate({
                        outlinePresetId: e.target.value,
                        outlinePresetName: preset?.name || '',
                      });
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
                  >
                    <option value="">-- 选择大纲预设 --</option>
                    {(allPresets['outline'] || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.apiConfig?.model || '默认'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> 正文预设
                </label>
                <div className="relative">
                  <select
                    value={editingNode.data.chapterPresetId as string || ''}
                    onChange={e => {
                      const chapterPresets = allPresets['completion'] || [];
                      const preset = chapterPresets.find(p => p.id === e.target.value);
                      handleUpdate({
                        chapterPresetId: e.target.value,
                        chapterPresetName: preset?.name || '',
                      });
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none"
                  >
                    <option value="">-- 选择正文预设 --</option>
                    {(allPresets['completion'] || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.apiConfig?.model || '默认'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  大纲AI指令
                </label>
                <SharedTextarea
                  value={editingNode.data.outlineInstruction || ''}
                  onValueChange={(val: string) => handleUpdate({ outlineInstruction: val })}
                  className="w-full h-40 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
                  placeholder="输入给大纲AI的特定指令..."
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  正文AI指令
                </label>
                <SharedTextarea
                  value={editingNode.data.chapterInstruction || ''}
                  onValueChange={(val: string) => handleUpdate({ chapterInstruction: val })}
                  className="w-full h-40 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
                  placeholder="输入给正文AI的特定指令..."
                />
              </div>
              <OutputList data={editingNode.data} onUpdate={handleUpdate} onPreview={onPreviewEntry} isMobile={true} />
            </div>
          ) : editingNode.data.typeKey === 'chapter' ? (
            <>
              <ChapterStartSelector 
                data={editingNode.data} 
                activeNovel={activeNovel} 
                onUpdate={handleUpdate} 
                isMobile={true}
              />
              <div className="space-y-4 pt-6 border-t border-gray-800">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" /> 生成产物说明
                </label>
                <div className="text-center py-10 bg-gray-800/50 rounded-[2.5rem] border border-dashed border-gray-700">
                  <p className="text-sm text-gray-400">章节已保存至小说目录</p>
                  <p className="text-[10px] text-gray-500 mt-1 px-10">正文将保存至上一个"保存至分卷"节点指定的分卷中。</p>
                </div>
              </div>
            </>
          ) : (
            editingNode.data.typeKey !== 'pauseNode' &&
            editingNode.data.typeKey !== 'saveToVolume' &&
            editingNode.data.typeKey !== 'multiCreateFolder' &&
            editingNode.data.typeKey !== 'loopConfigurator' &&
            editingNode.data.typeKey !== 'creationInfo' && (
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

      {isInstructionExpanded && (
        <div className="fixed inset-0 z-[160] flex flex-col bg-[#1e2230] animate-in slide-in-from-right duration-300">
          <div className="p-4 bg-[#1a1d29] border-b border-gray-700/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Expand className="w-5 h-5" />
              <span className="font-bold text-gray-100 text-base">
                {editingNode.data.typeKey === 'workflowGenerator'
                  ? '放大编辑工作流需求描述'
                  : '放大编辑创作指令 (USER PROMPT)'}
              </span>
            </div>
            <button
              onClick={() => setIsInstructionExpanded(false)}
              className="flex flex-col items-center justify-center p-1.5 bg-gray-700 rounded-xl text-gray-400"
            >
              <X className="w-4 h-4" />
              <span className="text-[8px] font-bold mt-0.5">返回</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#1e2230]">
            <textarea
              value={editingNode.data.instruction}
              onChange={e => handleUpdate({ instruction: e.target.value })}
              placeholder={
                editingNode.data.typeKey === 'workflowGenerator'
                  ? '描述你想要的工作流结构...'
                  : '在此输入具体要求...'
              }
              className="w-full h-full min-h-[60vh] bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed"
            />
          </div>
          <div className="p-4 bg-[#1a1d29] border-t border-gray-700/50 shrink-0">
            <button
              onClick={() => setIsInstructionExpanded(false)}
              className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold text-base shadow-lg shadow-amber-900/20 active:scale-95 transition-all"
            >
              完成编辑
            </button>
          </div>
        </div>
      )}
    </>
  );
},
);

import { FolderPlus, Plus, Trash2 } from 'lucide-react';
import { VolumeFolderConfig } from '../../../types';
import { WorkflowNodeData } from '../../../types';
import { SharedInput } from '../../Shared/SharedInput';

interface MultiFolderConfigPanelProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
}

export const MultiFolderConfigPanel = ({ data, onUpdate, isMobile = false }: MultiFolderConfigPanelProps) => {
  const containerClass = isMobile
    ? 'space-y-4'
    : 'space-y-4';

  const ruleItemClass = isMobile
    ? 'bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 space-y-3'
    : 'bg-gray-900/40 p-4 rounded-lg border border-gray-700/30 space-y-3';

  const inputClass = isMobile
    ? 'w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none'
    : 'w-full bg-[#161922] border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-violet-500 transition-all';

  const volumeFolderConfigs = (data.volumeFolderConfigs || []) as VolumeFolderConfig[];

  const addVolumeConfig = () => {
    const nextStartChapter = volumeFolderConfigs.length > 0
      ? (volumeFolderConfigs[volumeFolderConfigs.length - 1].endChapter || volumeFolderConfigs[volumeFolderConfigs.length - 1].startChapter) + 1
      : 1;
    
    const newConfig: VolumeFolderConfig = {
      id: `vol_config_${Date.now()}`,
      volumeName: `第${volumeFolderConfigs.length + 1}卷`,
      startChapter: nextStartChapter,
      endChapter: nextStartChapter + 9,
      folderName: `第${volumeFolderConfigs.length + 1}卷`,
      processed: false,
    };

    onUpdate({
      volumeFolderConfigs: [...volumeFolderConfigs, newConfig],
    });
  };

  const updateVolumeConfig = (index: number, updates: Partial<VolumeFolderConfig>) => {
    const newConfigs = [...volumeFolderConfigs];
    newConfigs[index] = { ...newConfigs[index], ...updates };
    onUpdate({ volumeFolderConfigs: newConfigs });
  };

  const removeVolumeConfig = (index: number) => {
    const newConfigs = volumeFolderConfigs.filter((_, i) => i !== index);
    onUpdate({ volumeFolderConfigs: newConfigs });
  };

  return (
    <div
      className={isMobile ? 'space-y-6 pt-6 border-t border-gray-800' : 'space-y-6 pt-6 border-t border-gray-700/30'}
    >
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-2">
          <FolderPlus className="w-3.5 h-3.5" /> 多分卷目录配置
        </label>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          配置多个分卷的目录初始化。每个分卷将独立创建世界观、角色、大纲等集合，实现分卷独立创作。
        </p>
      </div>

      <div className={containerClass}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            分卷配置列表 ({volumeFolderConfigs.length} 个)
          </span>
          <button
            onClick={addVolumeConfig}
            className={
              isMobile
                ? 'px-2.5 py-1.5 bg-violet-600/20 text-violet-400 rounded-xl text-[10px] font-bold border border-violet-500/30'
                : 'px-2 py-1 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-md text-[10px] font-bold border border-violet-500/30 transition-all'
            }
          >
            <Plus className="w-3 h-3 inline mr-1" /> 添加分卷
          </button>
        </div>

        {volumeFolderConfigs.map((config, idx) => (
          <div key={config.id} className={ruleItemClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-violet-300 uppercase">
                分卷 #{idx + 1}: {config.volumeName}
              </span>
              <button
                onClick={() => removeVolumeConfig(idx)}
                className="p-1 text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={isMobile ? 'space-y-3' : 'grid grid-cols-2 gap-3'}>
              <div className="space-y-1.5">
                <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">分卷名称</label>
                <SharedInput
                  value={config.volumeName}
                  onValueChange={val => updateVolumeConfig(idx, { volumeName: val })}
                  placeholder="例如: 第一卷"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">目录名称</label>
                <SharedInput
                  value={config.folderName}
                  onValueChange={val => updateVolumeConfig(idx, { folderName: val })}
                  placeholder="例如: 第一卷"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">起始章节号</label>
                <SharedInput
                  type="number"
                  min="1"
                  value={config.startChapter.toString()}
                  onValueChange={val => updateVolumeConfig(idx, { startChapter: parseInt(val) || 1 })}
                  placeholder="1"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">终止章节号 (可选)</label>
                <SharedInput
                  type="number"
                  min="1"
                  value={config.endChapter?.toString() || ''}
                  onValueChange={val => updateVolumeConfig(idx, { endChapter: parseInt(val) || undefined })}
                  placeholder="留空则不限制"
                  className={inputClass}
                />
              </div>
            </div>

            {config.processed && (
              <div className="text-[9px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                已处理
              </div>
            )}
          </div>
        ))}

        {volumeFolderConfigs.length === 0 && (
          <div
            className={
              isMobile
                ? 'text-center py-8 border border-dashed border-gray-700 rounded-3xl'
                : 'text-center py-8 border border-dashed border-gray-700 rounded-xl'
            }
          >
            <p className="text-[10px] text-gray-600">
              未配置分卷目录。点击"添加分卷"开始配置。
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          当前处理进度
        </label>
        <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-300">
            当前分卷索引: <span className="text-violet-400 font-bold">{data.currentVolumeIndex || 0}</span>
            {volumeFolderConfigs[data.currentVolumeIndex || 0] && (
              <span className="text-gray-500 ml-2">
                ({volumeFolderConfigs[data.currentVolumeIndex || 0].volumeName})
              </span>
            )}
          </p>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 leading-relaxed px-1">
        * 工作流执行时，将按顺序处理每个分卷配置。完成一个分卷的终止章节后，自动切换到下一个分卷并重置世界观、角色等节点内容。
      </p>
    </div>
  );
};

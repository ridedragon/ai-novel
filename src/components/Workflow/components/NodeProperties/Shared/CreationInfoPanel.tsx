import { Info, BookOpen } from 'lucide-react';
import { WorkflowNodeData } from '../../../types';

interface CreationInfoPanelProps {
  data: WorkflowNodeData;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
  volumeInfo?: {
    currentVolumeName: string;
    volumeIndex: number;
    totalVolumes: number;
    startChapter?: number;
    endChapter?: number;
    chapterCount?: number;
  };
}

export const CreationInfoPanel = ({ data, onUpdate, isMobile = false, volumeInfo }: CreationInfoPanelProps) => {
  const containerClass = isMobile
    ? 'space-y-6 pt-6 border-t border-gray-800'
    : 'space-y-6 pt-6 border-t border-gray-700/30';

  const infoBoxClass = isMobile
    ? 'p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl'
    : 'p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl';

  const textareaClass = isMobile
    ? 'w-full h-40 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed'
    : 'w-full h-40 bg-[#161922] border border-gray-700 rounded-lg p-4 text-sm text-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none resize-none font-mono leading-relaxed transition-all';

  const currentVolumeName = volumeInfo?.currentVolumeName || `第${(volumeInfo?.volumeIndex ?? 0) + 1}卷`;

  return (
    <div className={containerClass}>
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" /> 当前创作分卷
        </label>
        <div className={infoBoxClass}>
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <div className="text-lg font-bold text-emerald-300">
                {currentVolumeName}
              </div>
              {volumeInfo && (
                <div className="text-xs text-emerald-500/80 mt-1">
                  第 {volumeInfo.volumeIndex + 1} 卷 / 共 {volumeInfo.totalVolumes} 卷
                  {volumeInfo.startChapter && volumeInfo.endChapter && (
                    <span className="ml-2">· 第 {volumeInfo.startChapter}-{volumeInfo.endChapter} 章</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> 用户自定义指令 (可选)
        </label>
        <textarea
          value={data.instruction || ''}
          onChange={e => onUpdate({ instruction: e.target.value })}
          placeholder="在此输入针对当前分卷的特定创作要求，例如：&#10;- 本卷重点描写主角的成长历程&#10;- 需要引入新的反派角色&#10;- 注意与前文伏笔的呼应..."
          className={textareaClass}
        />
        <p className="text-[9px] text-gray-500 leading-relaxed px-1">
          * 您可以在此添加针对当前分卷的个性化创作指令，这些指令将与分卷信息一起传递给 AI。
        </p>
      </div>
    </div>
  );
};

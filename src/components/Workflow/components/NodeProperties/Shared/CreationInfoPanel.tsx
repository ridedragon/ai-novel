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

  const generatePromptContent = () => {
    if (!volumeInfo) {
      return '暂无分卷信息。请确保工作流中存在分卷规划节点或分卷目录节点。';
    }

    const { currentVolumeName, volumeIndex, totalVolumes, startChapter, endChapter, chapterCount } = volumeInfo;
    
    let content = `当前正在创作：${currentVolumeName || `第${volumeIndex + 1}卷`}\n`;
    content += `分卷进度：第 ${volumeIndex + 1} 卷 / 共 ${totalVolumes} 卷\n`;
    
    if (startChapter && endChapter) {
      content += `章节范围：第 ${startChapter} 章 - 第 ${endChapter} 章\n`;
    } else if (startChapter) {
      content += `起始章节：第 ${startChapter} 章\n`;
    }
    
    if (chapterCount) {
      content += `本卷章节数：${chapterCount} 章\n`;
    }

    return content;
  };

  return (
    <div className={containerClass}>
      <div className="space-y-3">
        <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> 分卷创作提示 (自动生成)
        </label>
        <div className={infoBoxClass}>
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed">
                {generatePromptContent()}
              </pre>
            </div>
          </div>
          <p className="text-[9px] text-emerald-500/70 mt-3 pt-3 border-t border-emerald-500/20">
            * 以上信息将在工作流执行时自动注入到 AI 上下文中，帮助 AI 了解当前创作进度。
          </p>
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

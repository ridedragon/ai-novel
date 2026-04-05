import { BookOpen, Layers } from 'lucide-react';
import React from 'react';

interface ChapterNumberingModeSwitchProps {
  currentMode: 'global' | 'perVolume';
  onModeChange: (mode: 'global' | 'perVolume') => void;
}

export const ChapterNumberingModeSwitch: React.FC<ChapterNumberingModeSwitchProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="p-3 border-t border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#12151e]/40 shrink-0">
      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-500 tracking-[0.15em] uppercase mb-2">
        章节编号模式
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onModeChange('global')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${
            currentMode === 'global'
              ? 'bg-[var(--theme-color)] border-[var(--theme-color)] text-white shadow-sm'
              : 'bg-white dark:bg-[#09090b] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
          title="全书连续编号"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[10px] font-medium">全书编号</span>
        </button>
        <button
          onClick={() => onModeChange('perVolume')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${
            currentMode === 'perVolume'
              ? 'bg-[var(--theme-color)] border-[var(--theme-color)] text-white shadow-sm'
              : 'bg-white dark:bg-[#09090b] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
          title="分卷内独立编号"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-medium">分卷编号</span>
        </button>
      </div>
      <div className="mt-2 text-[9px] text-slate-500 dark:text-slate-500 leading-relaxed">
        {currentMode === 'global' 
          ? '章节编号全书连续递增' 
          : '每卷从第1章开始重新编号'}
      </div>
    </div>
  );
};

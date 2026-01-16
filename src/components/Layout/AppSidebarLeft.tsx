import {
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  Folder,
  FolderPlus,
  Plus,
  Trash2
} from 'lucide-react';
import React from 'react';
import { Chapter, NovelVolume } from '../../types';

interface AppSidebarLeftProps {
  chapters: Chapter[];
  volumes: NovelVolume[];
  chaptersByVolume: Record<string, Chapter[]>;
  activeChapterId: number | null;
  setActiveChapterId: (id: number | null) => void;
  setShowOutline: (show: boolean) => void;
  handleAddVolume: () => void;
  handleToggleVolumeCollapse: (volumeId: string) => void;
  addNewChapter: (volumeId?: string) => void;
  handleExportVolume: (volumeId: string) => void;
  handleRenameVolume: (volumeId: string, currentTitle: string) => void;
  handleDeleteVolume: (volumeId: string) => void;
  handleDeleteChapter: (chapterId: number) => void;
}

export const AppSidebarLeft: React.FC<AppSidebarLeftProps> = ({
  chapters,
  volumes,
  chaptersByVolume,
  activeChapterId,
  setActiveChapterId,
  setShowOutline,
  handleAddVolume,
  handleToggleVolumeCollapse,
  addNewChapter,
  handleExportVolume,
  handleRenameVolume,
  handleDeleteVolume,
  handleDeleteChapter,
}) => {
  return (
    <>
      <div className="p-5 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-[0.2em] uppercase">
          Chapters ({chapters.length})
        </span>
        <button className="text-primary hover:text-primary-hover dark:hover:text-white transition-colors" onClick={handleAddVolume}>
          <FolderPlus className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 custom-scrollbar">
        {volumes.map(volume => (
          <div key={volume.id} className="mb-1">
            <div
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-500 cursor-pointer hover:text-slate-900 dark:hover:text-slate-300 group"
              onClick={() => handleToggleVolumeCollapse(volume.id)}
            >
              {volume.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <Folder className="w-3.5 h-3.5 text-yellow-600/70" />
              <span className="font-medium truncate flex-1">{volume.title}</span>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); addNewChapter(volume.id); }} className="p-1 hover:text-slate-900 dark:hover:text-white" title="添加章节"><Plus className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleExportVolume(volume.id); }} className="p-1 hover:text-slate-900 dark:hover:text-white" title="导出此分卷"><Download className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleRenameVolume(volume.id, volume.title); }} className="p-1 hover:text-slate-900 dark:hover:text-white" title="重命名分卷"><Edit3 className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteVolume(volume.id); }} className="p-1 hover:text-red-500 dark:hover:text-red-400" title="删除分卷"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
            {!volume.collapsed && (
              <div className="ml-4 space-y-0.5 border-l border-slate-200 dark:border-[#1e2433]">
                {(chaptersByVolume[String(volume.id)] || []).map(chapter => (
                  <div
                    key={chapter.id}
                    onClick={() => { setActiveChapterId(chapter.id); setShowOutline(false); }}
                    className={`group px-4 py-2 flex items-center gap-3 cursor-pointer text-xs transition-colors rounded-r ${activeChapterId === chapter.id ? 'bg-primary/10 dark:bg-primary/15 text-primary border-l-2 border-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                  >
                    <FileText className={`w-[14px] h-[14px] ${chapter.subtype === 'small_summary' ? 'text-primary' : chapter.subtype === 'big_summary' ? 'text-amber-500 dark:text-amber-400' : ''}`} />
                    <span className="truncate flex-1">{chapter.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id); }}
                      className="md:opacity-0 group-hover:opacity-100 p-1.5 md:p-1 text-slate-400 hover:text-red-500 transition-all"
                      title="删除章节"
                    >
                      <Trash2 className="w-4 h-4 md:w-3 md:h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="mt-2">
          {volumes.length > 0 && <div className="px-3 py-1 text-[10px] text-slate-500 dark:text-slate-600 font-bold uppercase tracking-wider">未分卷章节</div>}
          {(chaptersByVolume['uncategorized'] || []).map(chapter => (
            <div
              key={chapter.id}
              onClick={() => { setActiveChapterId(chapter.id); setShowOutline(false); }}
              className={`group px-4 py-2 flex items-center gap-3 cursor-pointer text-xs transition-colors rounded-r ${activeChapterId === chapter.id ? 'bg-primary/10 dark:bg-primary/15 text-primary border-l-2 border-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'}`}
            >
              <FileText className="w-[14px] h-[14px]" />
              <span className="truncate flex-1">{chapter.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id); }}
                className="md:opacity-0 group-hover:opacity-100 p-1.5 md:p-1 text-slate-400 hover:text-red-500 transition-all"
                title="删除章节"
              >
                <Trash2 className="w-4 h-4 md:w-3 md:h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 border-t border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#12151e]/40 shrink-0 custom-bg-transition">
        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 rounded-lg text-slate-500 dark:text-slate-400 text-xs transition-all font-medium custom-input-bg"
          onClick={() => addNewChapter()}
        >
          <Plus className="w-[18px] h-[18px]" />
          <span>添加新章节</span>
        </button>
      </div>
    </>
  );
};
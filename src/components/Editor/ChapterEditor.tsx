import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileText,
  Save,
  Settings,
  StopCircle,
  Wand2
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import terminal from 'virtual:terminal';
import { Chapter, ChapterVersion } from '../../types';

interface ChapterEditorProps {
  activeChapter: Chapter | undefined;
  activeChapterId: number | null;
  isEditingChapter: boolean;
  onToggleEdit: (content?: string) => void;
  onChapterContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onOptimize: (targetId?: number, initialContent?: string) => Promise<void>;
  onStopOptimize: (chapterId: number) => void;
  optimizingChapterIds: Set<number>;
  activeOptimizePresetId: string;
  autoOptimize: boolean;
  setAutoOptimize: (val: boolean) => void;
  onShowAnalysisResult: () => void;
  onShowOptimizeSettings: () => void;
  onPrevVersion: () => void;
  onNextVersion: () => void;
  onSwitchVersion: (version: ChapterVersion) => void;
}

export const ChapterEditor: React.FC<ChapterEditorProps> = React.memo(({
  activeChapter,
  activeChapterId,
  isEditingChapter,
  onToggleEdit,
  onChapterContentChange,
  onOptimize,
  onStopOptimize,
  optimizingChapterIds,
  autoOptimize,
  setAutoOptimize,
  onShowAnalysisResult,
  onShowOptimizeSettings,
  onPrevVersion,
  onNextVersion,
  onSwitchVersion,
}) => {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [localContent, setLocalContent] = useState('');
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 当章节切换或进入编辑模式时，初始化本地状态
  useEffect(() => {
    if (activeChapter) {
      setLocalContent(activeChapter.content || '');
    }
    
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
  }, [activeChapterId, isEditingChapter]);

  // 处理输入：仅更新本地状态，解除全局渲染锁定
  const handleLocalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalContent(newValue);

    // 采用 500ms 防抖同步回全局状态，保证后台保存
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      terminal.log(`[EDITOR] 正在同步内容到全局状态: ${activeChapter?.title} (字数: ${newValue.length})`);
      onChapterContentChange(e);
    }, 500);
  };

  // 退出编辑时立即同步
  const handleToggleEditWithSync = () => {
    if (isEditingChapter) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      // 显式传入最新内容进行保存
      onToggleEdit(localContent);
    } else {
      onToggleEdit();
    }
  };

  if (!activeChapter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <FileText className="w-16 h-16 mb-4 opacity-10" />
        <p>暂无章节</p>
        <p className="text-sm mt-2">请点击左侧"添加章节"开始创作</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="h-14 md:h-16 px-2 md:px-10 border-b border-white/5 flex flex-row items-center justify-between bg-[#0f172a] shrink-0 gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-8 flex-1">
          {/* 版本切换 */}
          <div className="flex items-center bg-slate-800/50 rounded-lg border border-white/5 overflow-hidden p-0.5 h-9 md:h-10">
            <button
              onClick={onPrevVersion}
              disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
              className="px-1.5 h-full text-slate-500 hover:text-white transition-colors disabled:opacity-20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-1.5 text-[10px] md:text-[11px] font-medium text-slate-300 flex items-center gap-1 whitespace-nowrap">
              <span>
                {(() => {
                  const v = activeChapter.versions?.find(v => v.id === activeChapter.activeVersionId);
                  if (!v) return '当前';
                  if (v.type === 'original') return '原文';
                  if (v.type === 'optimized') {
                    const optimizedVersions = activeChapter.versions?.filter(ver => ver.type === 'optimized') || [];
                    const optIdx = optimizedVersions.findIndex(ver => ver.id === v.id);
                    return `优化 ${optIdx !== -1 ? optIdx + 1 : ''}`;
                  }
                  return '编辑';
                })()}
              </span>
              <span className="text-slate-600 font-mono text-[9px]">
                ({(() => {
                  const versions = activeChapter.versions || [];
                  const idx = versions.findIndex(v => v.id === activeChapter.activeVersionId);
                  return `${idx !== -1 ? idx + 1 : 1}/${Math.max(1, versions.length)}`;
                })()})
              </span>
            </div>
            <button
              onClick={onNextVersion}
              disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
              className="px-1.5 h-full text-slate-500 hover:text-white transition-colors disabled:opacity-20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Auto开关 */}
          <div className="flex items-center gap-1.5 px-2 h-9 md:h-10 bg-white/5 rounded-lg border border-white/5">
            <div
              onClick={() => setAutoOptimize(!autoOptimize)}
              className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors ${autoOptimize ? 'bg-primary/40' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${autoOptimize ? 'right-0.5' : 'left-0.5'}`}></div>
            </div>
            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Auto</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-4">
          {/* 润色按钮组 */}
          <div className="flex items-center h-9 md:h-10 overflow-hidden">
            {activeChapter && optimizingChapterIds.has(activeChapter.id) ? (
              <button
                onClick={() => onStopOptimize(activeChapter.id)}
                className="bg-red-600 hover:bg-red-500 h-full text-white transition-all flex items-center justify-center px-3 rounded-l-lg text-[11px] font-bold gap-1.5 shadow-lg shadow-red-900/10"
              >
                <StopCircle className="w-4 h-4" />
                <span>停止</span>
              </button>
            ) : (
              <button
                onClick={() => onOptimize(activeChapter.id, localContent)}
                className="bg-[#8b5cf6] hover:bg-violet-500 h-full text-white transition-all flex items-center justify-center px-3 rounded-l-lg text-[11px] font-bold gap-1.5 shadow-lg shadow-primary/10"
              >
                <Wand2 className="w-4 h-4" />
                <span className="whitespace-nowrap">润色</span>
              </button>
            )}
            <button
              onClick={onShowOptimizeSettings}
              className="bg-primary/90 hover:bg-primary h-full w-9 flex items-center justify-center rounded-r-lg border-l border-white/10 text-white"
              title="润色设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* 右侧工具 */}
          <div className="flex items-center gap-1 h-9 md:h-10">
            <button
              onClick={onShowAnalysisResult}
              className="w-9 h-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
              title="查看分析"
            >
              <BarChart2 className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={handleToggleEditWithSync}
              className={`w-9 h-full flex items-center justify-center hover:bg-white/5 rounded-lg transition-all ${isEditingChapter ? 'text-primary bg-primary/10' : 'text-slate-500 hover:text-white'}`}
              title={isEditingChapter ? "保存" : "编辑"}
            >
              {isEditingChapter ? <Save className="w-4.5 h-4.5" /> : <Edit className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-10 pt-10 md:pt-20 pb-40 custom-scrollbar bg-[#0a0c12]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 md:mb-16 text-center">
            <h1 className="text-2xl md:text-5xl font-serif font-bold text-slate-100 tracking-wide mb-4 md:mb-6 px-4">
              {activeChapter.title}
            </h1>
            <div className="flex items-center justify-center gap-2 md:gap-4 text-slate-500/60">
              <div className="h-[1px] w-8 md:w-16 bg-[#1e2433]"></div>
              <span className="text-[9px] md:text-[11px] font-mono uppercase tracking-[0.2em] md:tracking-[0.3em]">
                {activeChapter.content ? activeChapter.content.length : 0} Words
              </span>
              <div className="h-[1px] w-8 md:w-16 bg-[#1e2433]"></div>
            </div>
          </div>

          {isEditingChapter ? (
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleLocalChange}
              className="w-full h-[500px] md:h-[600px] bg-transparent text-[18px] md:text-[21px] text-slate-200/90 leading-[1.8] outline-none resize-none font-serif selection:bg-[#8b5cf6]/30 px-2 md:px-0"
              placeholder="在此处输入章节正文..."
            />
          ) : (
            <article
              ref={contentScrollRef}
              className="writing-area text-[18px] md:text-[21px] text-slate-200/90 selection:bg-[#8b5cf6]/30 font-serif leading-[1.8] px-2 md:px-0"
            >
              {activeChapter.content ? (
                <div className="prose prose-invert prose-2xl max-w-none [&_p]:mb-0 [&_p]:mt-0">
                  <ReactMarkdown>
                    {activeChapter.content
                      .replace(/<[^>]+>/g, '')
                      .split('\n')
                      .map(line => line.trim())
                      .filter(line => line)
                      .join('\n\n')}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-slate-500 italic text-center py-20">
                  {activeChapter && optimizingChapterIds.has(activeChapter.id)
                    ? "AI 正在分析并准备润色，请稍候..."
                    : "暂无内容，请开始创作..."}
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
});
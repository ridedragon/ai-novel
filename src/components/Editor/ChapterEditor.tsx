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
  const [showModeDropdown, setShowModeDropdown] = useState(false);
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
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0c12]">
      <style>{`
        .writing-area {
            font-family: 'Noto Serif SC', serif;
            line-height: 1.85;
        }
        .writing-area p {
            margin: 0 !important;
            padding: 0 !important;
            text-indent: 2em;
        }
        .glass-dropdown {
            background: rgba(18, 21, 30, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>

      {/* Mobile Second Toolbar (Sub-header) */}
      <div className="h-11 flex md:hidden items-center px-3 gap-3 bg-[#12151e]/40 border-b border-white/5 relative shrink-0">
        <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-md border border-white/5 whitespace-nowrap">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Auto</span>
          <div
            onClick={() => setAutoOptimize(!autoOptimize)}
            className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors ${autoOptimize ? 'bg-blue-500/40' : 'bg-slate-700'}`}
          >
            <div className={`absolute top-0.5 w-2 h-2 bg-blue-500 rounded-full transition-all ${autoOptimize ? 'right-0.5' : 'left-0.5'}`}></div>
          </div>
        </div>
        <div className="h-4 w-[1px] bg-[#1e2433] shrink-0"></div>
        <div className="flex items-center gap-4 relative">
          <div className="relative">
            <button
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="flex items-center gap-1 text-[#8b5cf6]"
            >
              <span className="material-symbols-outlined !text-[16px]">chrome_reader_mode</span>
              <span className="text-[10px] font-bold uppercase tracking-wider">长文</span>
              <span className={`material-symbols-outlined !text-[14px] transition-transform ${showModeDropdown ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            
            {showModeDropdown && (
              <div className="absolute left-0 top-full mt-2 w-48 glass-dropdown rounded-xl py-1.5 shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-200">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">模式选择</div>
                <button className="flex w-full items-center px-3 py-2.5 text-[11px] text-slate-200 hover:bg-white/10 transition-colors">
                  <span className="material-symbols-outlined !text-[16px] mr-3 text-[#8b5cf6]">check_circle</span>
                  标准模式
                </button>
                <button className="flex w-full items-center px-3 py-2.5 text-[11px] text-slate-400 hover:bg-white/10 transition-colors">
                  <span className="material-symbols-outlined !text-[16px] mr-3 text-slate-600">rocket_launch</span>
                  超长文模式
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={onShowAnalysisResult} className="text-slate-500 hover:text-slate-300">
            <span className="material-symbols-outlined !text-[18px]">analytics</span>
          </button>
          <button onClick={onShowOptimizeSettings} className="text-slate-500 hover:text-slate-300">
            <span className="material-symbols-outlined !text-[18px]">tune</span>
          </button>
        </div>
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:flex h-16 px-10 border-b border-white/5 items-center justify-between bg-[#0a0c12] shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center bg-slate-800 rounded-xl border border-white/5 overflow-hidden p-0.5">
            <button
              onClick={onPrevVersion}
              disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
              className="p-1.5 text-slate-500 hover:text-white transition-colors disabled:opacity-20"
            >
              <ChevronLeft className="w-[18px] h-[18px]" />
            </button>
            <div className="px-4 text-[11px] font-medium text-slate-300 flex items-center gap-2">
              <span>
                {(() => {
                  const v = activeChapter.versions?.find(v => v.id === activeChapter.activeVersionId);
                  if (!v) return '当前版本';
                  if (v.type === 'original') return '原文';
                  if (v.type === 'optimized') {
                    const optimizedVersions = activeChapter.versions?.filter(ver => ver.type === 'optimized') || [];
                    const optIdx = optimizedVersions.findIndex(ver => ver.id === v.id);
                    return `优化版本 ${optIdx !== -1 ? optIdx + 1 : ''}`;
                  }
                  return '编辑版';
                })()}
              </span>
              <span className="text-slate-600 font-mono">
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
              className="p-1.5 text-slate-500 hover:text-white transition-colors disabled:opacity-20"
            >
              <ChevronRight className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-2.5 py-1 bg-white/5 rounded-full border border-white/5">
            <div
              onClick={() => setAutoOptimize(!autoOptimize)}
              className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors ${autoOptimize ? 'bg-[#8b5cf6]/40' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${autoOptimize ? 'right-0.5' : 'left-0.5'}`}></div>
            </div>
            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Auto</span>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center">
            {activeChapter && optimizingChapterIds.has(activeChapter.id) ? (
              <button
                onClick={() => onStopOptimize(activeChapter.id)}
                className="bg-red-600 hover:bg-red-500 text-white transition-all flex items-center justify-center px-8 py-2 rounded-l-lg text-[12px] font-bold gap-2 shadow-lg shadow-red-900/20"
              >
                <StopCircle className="w-[18px] h-[18px]" />
                <span>停止</span>
              </button>
            ) : (
              <button
                onClick={() => onOptimize(activeChapter.id, localContent)}
                className="bg-[#8b5cf6] hover:bg-violet-500 text-white transition-all flex items-center justify-center px-8 py-2 rounded-l-lg text-[12px] font-bold gap-2 shadow-lg shadow-primary/10"
              >
                <Wand2 className="w-[18px] h-[18px]" />
                <span>润色</span>
              </button>
            )}
            <button
              onClick={onShowOptimizeSettings}
              className="bg-[#8b5cf6]/90 hover:bg-[#8b5cf6] p-2 rounded-r-xl border-l border-white/10 text-white"
              title="润色设置"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onShowAnalysisResult}
              className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
              title="查看本章分析"
            >
              <BarChart2 className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={handleToggleEditWithSync}
              className={`p-2 hover:bg-white/5 rounded-lg transition-all ${isEditingChapter ? 'text-[#8b5cf6]' : 'text-slate-500 hover:text-white'}`}
              title={isEditingChapter ? "保存/退出编辑" : "编辑模式"}
            >
              {isEditingChapter ? <Save className="w-[18px] h-[18px]" /> : <Edit className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto px-0 pt-8 md:pt-20 pb-40 custom-scrollbar bg-[#0a0c12]">
        <div className="max-w-screen-sm mx-auto min-h-full flex flex-col">
          <div className="px-6 mb-6 text-center">
            <h1 className="text-2xl md:text-5xl font-serif font-bold text-slate-100 leading-tight mb-4 md:mb-6">
              {activeChapter.title}
            </h1>
            <div className="mt-3 flex justify-center">
              <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-[#8b5cf6]/40 to-transparent"></div>
            </div>
            <div className="mt-2 text-[9px] font-mono text-slate-600 uppercase tracking-[0.2em]">
              {activeChapter.content ? activeChapter.content.length : 0} Words • {isEditingChapter ? 'Editing' : 'Reading Mode'}
            </div>
          </div>

          {isEditingChapter ? (
            <div className="px-6">
              <textarea
                ref={textareaRef}
                value={localContent}
                onChange={handleLocalChange}
                className="w-full min-h-[60vh] bg-transparent text-[18px] md:text-[21px] text-slate-200/90 leading-[1.85] outline-none resize-none font-serif selection:bg-[#8b5cf6]/30"
                placeholder="在此处输入章节正文..."
              />
            </div>
          ) : (
            <article
              ref={contentScrollRef}
              className="writing-area text-[18px] md:text-[21px] text-slate-200/90 selection:bg-[#8b5cf6]/30 px-6"
            >
              {activeChapter.content ? (
                <div className="prose prose-invert prose-2xl max-w-none">
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
      </main>

      {/* Floating Action Button (Mobile Only) */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden flex flex-col gap-3">
        {activeChapter && optimizingChapterIds.has(activeChapter.id) ? (
          <button
            onClick={() => onStopOptimize(activeChapter.id)}
            className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
          >
            <StopCircle className="w-6 h-6" />
          </button>
        ) : (
          <button
            onClick={() => onOptimize(activeChapter.id, localContent)}
            className="w-12 h-12 bg-[#8b5cf6] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all active-glow"
          >
            <span className="material-symbols-outlined fill-[1]">auto_fix_high</span>
          </button>
        )}
        <button
          onClick={handleToggleEditWithSync}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all ${isEditingChapter ? 'bg-green-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 backdrop-blur-md'}`}
        >
          {isEditingChapter ? <Save className="w-6 h-6" /> : <Edit className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
});
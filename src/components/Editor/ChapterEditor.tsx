import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
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
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <FileText className="w-16 h-16 mb-4 opacity-10" />
        <p>暂无章节</p>
        <p className="text-sm mt-2">请点击左侧"添加章节"开始创作</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-100 break-words">{activeChapter.title}</h1>
          <span className="text-xs text-gray-500">
            字数: {activeChapter.content ? activeChapter.content.length : 0}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Version Switcher */}
          {activeChapter.versions && activeChapter.versions.length > 1 && (
            <div className="bg-gray-800 border border-gray-600 rounded-lg flex items-center p-0.5 gap-1 mr-2">
              <button
                onClick={onPrevVersion}
                disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
                className="p-1.5 text-gray-400 hover:text-[var(--theme-color)] disabled:opacity-30 transition-colors"
                title="上一版本"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative group">
                <button className="text-xs font-medium text-gray-300 px-2 py-1 hover:bg-gray-700 rounded transition-colors flex items-center gap-1">
                  <span className="max-w-[100px] truncate">
                    {(() => {
                      const v = activeChapter.versions?.find(v => v.id === activeChapter.activeVersionId);
                      if (!v) return '当前版本';
                      if (v.type === 'original') return '原文';
                      if (v.type === 'optimized') {
                        const optimizedVersions = activeChapter.versions?.filter(ver => ver.type === 'optimized') || [];
                        const optIdx = optimizedVersions.findIndex(ver => ver.id === v.id);
                        return `优化版 ${optIdx !== -1 ? optIdx + 1 : ''}`;
                      }
                      return '编辑版';
                    })()}
                  </span>
                  <span className="text-gray-500">
                    ({(() => {
                      const versions = activeChapter.versions || [];
                      const idx = versions.findIndex(v => v.id === activeChapter.activeVersionId);
                      return `${idx !== -1 ? idx + 1 : 1}/${Math.max(1, versions.length)}`;
                    })()})
                  </span>
                </button>

                {/* Dropdown on Hover */}
                <div className="absolute top-full right-0 mt-1 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-30">
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {activeChapter.versions?.map((v, idx) => (
                      <button
                        key={v.id}
                        onClick={() => onSwitchVersion(v)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-0 ${activeChapter.activeVersionId === v.id ? 'text-[var(--theme-color)] bg-gray-700/30' : 'text-gray-300'}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {(() => {
                              if (v.type === 'original') return '原文';
                              if (v.type === 'optimized') {
                                const optimizedVersions = activeChapter.versions?.filter(ver => ver.type === 'optimized') || [];
                                const optIdx = optimizedVersions.findIndex(ver => ver.id === v.id);
                                return `优化版 ${optIdx !== -1 ? optIdx + 1 : ''}`;
                              }
                              return '用户编辑';
                            })()}
                          </span>
                          <span className="text-gray-500 text-[10px]">{new Date(v.timestamp).toLocaleTimeString()} · {v.content.length}字</span>
                        </div>
                        {activeChapter.activeVersionId === v.id && <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-color)]"></div>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={onNextVersion}
                disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
                className="p-1.5 text-gray-400 hover:text-[var(--theme-color)] disabled:opacity-30 transition-colors"
                title="下一版本"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div
            onClick={() => setAutoOptimize(!autoOptimize)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors select-none mr-2 ${autoOptimize ? 'bg-purple-500/10' : 'hover:bg-gray-800'
              }`}
            title="写作完成后自动进行优化"
          >
            <div className={`w-7 h-4 rounded-full relative transition-colors duration-200 ${autoOptimize ? 'bg-purple-500' : 'bg-gray-600'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${autoOptimize ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className={`text-xs font-medium ${autoOptimize ? 'text-purple-300' : 'text-gray-500'}`}>自动</span>
          </div>

          {activeChapter && optimizingChapterIds.has(activeChapter.id) ? (
            <button
              onClick={() => onStopOptimize(activeChapter.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm border border-transparent bg-red-600 hover:bg-red-500 text-white shadow-red-500/20 border-red-500"
              title="停止优化"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>停止</span>
            </button>
          ) : (
            <button
              onClick={() => onOptimize(activeChapter.id, localContent)}
              // 修正：点击润色时，显式传入 localContent 以确保未防抖同步的内容也被捕捉
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm border border-transparent bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20 border-purple-500 hover:shadow-purple-500/30 hover:-translate-y-0.5 active:translate-y-0"
              title="优化当前章节 (基于原文)"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>润色</span>
            </button>
          )}

          <button
            onClick={onShowOptimizeSettings}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="优化提示词设置"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onShowAnalysisResult}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="查看本章分析"
          >
            <Eye className="w-5 h-5" />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1"></div>
          <button
            onClick={handleToggleEditWithSync}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title={isEditingChapter ? "保存/退出编辑" : "编辑章节内容"}
          >
            {isEditingChapter ? <Save className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col min-h-0">
        {isEditingChapter ? (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={handleLocalChange}
            className="w-full h-full bg-gray-900 p-4 text-base leading-relaxed text-gray-200 outline-none resize-none font-mono"
            placeholder="在此处输入章节正文..."
          />
        ) : (
          <div ref={contentScrollRef} className="prose prose-invert prose-lg max-w-none overflow-y-auto custom-scrollbar pr-4 md:pr-24 [&_p]:my-0 [&_p]:min-h-[1rem] text-justify">
            {activeChapter.content ? (
              <ReactMarkdown>
                {activeChapter.content
                  .replace(/<[^>]+>/g, '')
                  .split('\n')
                  .map(line => line.trim())
                  .filter(line => line)
                  .join('\n\n')}
              </ReactMarkdown>
            ) : (
              <div className="text-gray-500 italic">
                {activeChapter && optimizingChapterIds.has(activeChapter.id)
                  ? "AI 正在分析并准备润色，请稍候..."
                  : "暂无内容，请在下方输入要求开始创作..."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
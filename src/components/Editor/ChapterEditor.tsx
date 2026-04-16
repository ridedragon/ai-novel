import {
  BarChart2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Edit,
  Edit2,
  FileText,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
  Wand2,
  Send,
  X,
  Check,
  RotateCcw,
} from 'lucide-react';
import { GeneratorPreset } from '../../types';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import terminal from 'virtual:terminal';
import { Chapter } from '../../types';
import { extractChapterName } from '../../utils/chapterNumbering';
import { TypewriterEffect } from '../UI/TypewriterEffect';
import { getApiConfig } from '../../utils/aiHelpers';
import { resolveEditPresetMacros } from '../../utils/editPresetMacros';

interface ChapterEditorProps {
  activeChapter: Chapter | undefined;
  activeChapterId: number | null;
  isEditingChapter: boolean;
  onToggleEdit: (content?: string) => void;
  onChapterContentChange: (content: string) => void;
  onOptimize: (targetId?: number, initialContent?: string) => Promise<void>;
  onStopOptimize: (chapterId: number) => void;
  onRegenerate: (chapterId: number) => Promise<void>;
  optimizingChapterIds: Set<number>;
  activeOptimizePresetId: string;
  autoOptimize: boolean;
  setAutoOptimize: (val: boolean) => void;
  longTextMode: boolean;
  setLongTextMode: (val: boolean) => void;
  contextScope: string;
  setContextScope: (scope: string) => void;
  onShowAnalysisResult: () => void;
  onShowOptimizeSettings: () => void;
  onPrevVersion: () => void;
  onNextVersion: () => void;
  _onSwitchVersion?: (version: any) => void;
  showChainOfThought: boolean;
  setShowChainOfThought: (show: boolean) => void;
  chainOfThoughtContent: string;
  isStreaming?: boolean;

  onDeleteChapter: (chapterId: number) => void;
  
  editModel: string;
  apiKey: string;
  baseUrl: string;
  apiPresets: any[];
  activeApiPresetId: string;
  maxRetries: number;
  onError?: (msg: string) => void;
  
  // 文本编辑预设
  editPresets: GeneratorPreset[];
  activeEditPresetId: string;
  setActiveEditPresetId: (id: string) => void;
  onShowEditPresetSettings: () => void;
}

export const ChapterEditor: React.FC<ChapterEditorProps> = React.memo(
  ({
    activeChapter,
    activeChapterId,
    isEditingChapter,
    onToggleEdit,
    onChapterContentChange,
    onOptimize,
    onStopOptimize,
    onRegenerate,
    optimizingChapterIds,
    activeOptimizePresetId,
    autoOptimize,
    setAutoOptimize,
    longTextMode,
    setLongTextMode,
    contextScope,
    setContextScope,
    onShowAnalysisResult,
    onShowOptimizeSettings,
    onPrevVersion,
    onNextVersion,
    _onSwitchVersion,
    showChainOfThought,
    setShowChainOfThought,
    chainOfThoughtContent,
    isStreaming = false,
    onDeleteChapter,
    editModel,
    apiKey,
    baseUrl,
    apiPresets,
    activeApiPresetId,
    maxRetries,
    onError,
    editPresets,
    activeEditPresetId,
    setActiveEditPresetId,
    onShowEditPresetSettings,
  }) => {
    const contentScrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [localContent, setLocalContent] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
    const syncTimeoutRef = useRef<number | null>(null);
    const isDirtyRef = useRef(false);

    const [selectedText, setSelectedText] = useState('');
    const [selectionStart, setSelectionStart] = useState(-1);
    const [selectionEnd, setSelectionEnd] = useState(-1);
    const [selections, setSelections] = useState<Array<{ start: number; end: number; text: string; color: string }>>([]);
    const selectionColors = ['bg-blue-100 dark:bg-blue-900/30', 'bg-green-100 dark:bg-green-900/30', 'bg-yellow-100 dark:bg-yellow-900/30', 'bg-purple-100 dark:bg-purple-900/30', 'bg-pink-100 dark:bg-pink-900/30'];
    const [aiEditPrompt, setAiEditPrompt] = useState('');
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [retryData, setRetryData] = useState<{ prompt: string; selections: Array<{ start: number; end: number; text: string; color: string }> } | null>(null);

    const [showEditPresetDropdown, setShowEditPresetDropdown] = useState(false);

    const activeEditPreset = editPresets.find(p => p.id === activeEditPresetId);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.edit-preset-dropdown')) {
          setShowEditPresetDropdown(false);
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
      if (activeChapter) {
        setLocalContent(activeChapter.content || '');
        if (!isStreaming && !isEditingChapter) {
          isDirtyRef.current = false;
          setHasUnsavedChanges(false);
        }
      }

      if (!isStreaming) {
        requestAnimationFrame(() => {
          if (contentScrollRef.current) {
            contentScrollRef.current.scrollTop = 0;
          }
          if (textareaRef.current) {
            textareaRef.current.scrollTop = 0;
          }
        });
      }
    }, [activeChapterId, isEditingChapter, activeChapter?.content, isStreaming]);

    // 当localContent变化时，更新高亮显示
    useEffect(() => {
      if (isEditingChapter && textareaRef.current) {
        // 重新设置内容以更新高亮
        textareaRef.current.innerHTML = getHighlightedContent(localContent) || '<p>在此处输入章节正文...</p>';
      }
    }, [localContent, selections, isEditingChapter]);

    useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isDirtyRef.current) {
          e.preventDefault();
          e.returnValue = '您有未保存的更改，确定要离开吗？';
          return e.returnValue;
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const handleLocalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setLocalContent(newValue);
      isDirtyRef.current = true;
      setHasUnsavedChanges(true);

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        terminal.log(`[EDITOR] 正在同步内容到全局状态: ${activeChapter?.title} (字数: ${newValue.length})`);
        onChapterContentChange(newValue);
        isDirtyRef.current = false;
        setHasUnsavedChanges(false);
        setLastSavedTime(new Date());
      }, 500) as unknown as number;
    };

    const handleToggleEditWithSync = () => {
      if (isEditingChapter) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        onToggleEdit(localContent);
      } else {
        onToggleEdit();
      }
    };

    const handleSelectionChange = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      setSelectionStart(start);
      setSelectionEnd(end);
      const selectedText = localContent.substring(start, end);
      setSelectedText(selectedText);
      
      // 添加新选择到多选列表
      if (start !== end) {
        const colorIndex = selections.length % selectionColors.length;
        const color = selectionColors[colorIndex];
        const newSelection = { start, end, text: selectedText, color };
        // 检查是否已经存在相同的选择
        const exists = selections.some(s => s.start === start && s.end === end);
        if (!exists) {
          setSelections([...selections, newSelection]);
        }
      }
    }
  };

  // 生成带有高亮的文本
  const getHighlightedContent = (content: string) => {
    if (selections.length === 0) return content;
    
    // 按照开始位置排序
    const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
    
    let result = '';
    let lastIndex = 0;
    
    sortedSelections.forEach((selection, index) => {
      // 添加选择之前的文本
      result += content.substring(lastIndex, selection.start);
      // 添加带有高亮的选择文本
      result += `<mark class="${selection.color}">${content.substring(selection.start, selection.end)}</mark>`;
      // 更新lastIndex
      lastIndex = selection.end;
    });
    
    // 添加最后一个选择之后的文本
    result += content.substring(lastIndex);
    
    return result;
  };

    const handleAiEdit = async () => {
      if (!aiEditPrompt.trim() || selections.length === 0) {
        onError?.('请先选择要修改的文本并输入修改要求');
        return;
      }

      if (!activeEditPreset) {
        onError?.('请先选择一个编辑预设');
        return;
      }

      const config = getApiConfig(
        null, 
        editModel, 
        apiKey, 
        baseUrl, 
        '', 
        apiPresets
      );
      if (!config.apiKey || !config.model) {
        onError?.('请先配置 API Key 和编辑模型');
        return;
      }

      setIsAiProcessing(true);
      setAiError(null);
      setRetryData(null);

      const originalSelections = [...selections];

      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
          dangerouslyAllowBrowser: true,
        });

        // 构建请求消息，包含所有选择的文本
        const selectionsText = originalSelections.map((sel, index) => {
          return `选择 ${index + 1}: ${sel.text}`;
        }).join('\n\n');

        // 构建宏解析上下文
        const macroContext = {
          currentChapterContent: localContent,
          currentChapterTitle: activeChapter?.title
        };

        // 使用预设中的提示词，并解析宏
        const presetMessages = activeEditPreset.prompts
          .filter(p => p.enabled)
          .map(p => ({
            role: p.role as 'system' | 'user' | 'assistant',
            content: resolveEditPresetMacros(p.content, macroContext)
          }));

        // 添加用户的修改要求和选择的文本
        const messages = [
          ...presetMessages,
          {
            role: 'user' as const,
            content: `修改要求：${aiEditPrompt}\n\n${selectionsText}`
          }
        ];

        // 使用预设中的参数
        const temperature = activeEditPreset.temperature ?? 0.7;
        const topP = activeEditPreset.topP ?? 1.0;
        const topK = activeEditPreset.topK ?? 200;

        // 详细日志：文本编辑模型请求
        const requestStartTime = Date.now();
        terminal.log(`
>> AI REQUEST [文本编辑模型]
>> -----------------------------------------------------------
>> Model:       ${config.model}
>> Base URL:    ${config.baseUrl}
>> Temperature: ${temperature}
>> Top P:       ${topP}
>> Top K:       ${topK}
>> API Key:     ${config.apiKey ? '***' : 'Missing'}
>> Selections:  ${selections.length}
>> Request Time: ${new Date().toISOString()}
>> -----------------------------------------------------------
>> Messages Details:
${messages.map((msg, idx) => `>> ${idx + 1}. ${msg.role}: ${msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}`).join('\n')}
>> -----------------------------------------------------------
        `);

        let attempt = 0;
        let success = false;
        let result = '';

        while (attempt < maxRetries + 1 && !success) {
          try {
            const completion = await openai.chat.completions.create({
            model: config.model,
            messages,
            temperature: temperature,
            top_p: topP,
            // 注意：OpenAI SDK 不直接支持 topK 参数，我们这里只使用 temperature 和 topP
          });

            result = completion.choices[0]?.message?.content || '';
            
            if (!result) throw new Error('Empty response');
            
            // 详细日志：文本编辑模型响应
            const requestEndTime = Date.now();
            const responseTime = requestEndTime - requestStartTime;
            terminal.log(`
>> AI RESPONSE [文本编辑模型]
>> -----------------------------------------------------------
>> Status:      SUCCESS
>> Response Time: ${responseTime}ms
>> Content Length: ${result.length} characters
>> Response Time: ${new Date().toISOString()}
>> -----------------------------------------------------------
>> Response Content:
>> ${result.length > 500 ? result.slice(0, 500) + '...' : result}
>> -----------------------------------------------------------
            `);
            
            success = true;
          } catch (err) {
            attempt++;
            if (attempt > maxRetries) throw err;
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        // 解析JSON结果
        let edits: Array<{ index: number; content: string }> = [];
        try {
          const parsed = JSON.parse(result);
          // 检查是否是包含 edits 数组的对象
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.edits)) {
            edits = parsed.edits;
          } else if (Array.isArray(parsed)) {
            // 兼容旧格式：直接返回数组
            edits = parsed;
          } else {
            throw new Error('Invalid JSON format: expected object with edits array or array');
          }
        } catch (parseError) {
          terminal.error(`[Text Edit] JSON parse error: ${parseError.message}`);
          terminal.error(`[Text Edit] Response content: ${result}`);
          throw new Error('Failed to parse AI response as JSON');
        }

        // 按照选择的结束位置从后往前排序，避免替换时位置偏移
        const sortedSelections = [...originalSelections].sort((a, b) => b.end - a.end);

        // 应用修改
        let newContent = localContent;
        edits.forEach(edit => {
          const selection = originalSelections[edit.index];
          if (selection) {
            newContent = newContent.substring(0, selection.start) + edit.content + newContent.substring(selection.end);
          }
        });

        setLocalContent(newContent);
        onChapterContentChange(newContent);

        // 清空选择和输入
        setSelectionStart(-1);
        setSelectionEnd(-1);
        setSelectedText('');
        setSelections([]);
        setAiEditPrompt('');

      } catch (error: any) {
        setAiError(error.message || 'AI 编辑失败');
        setRetryData({ prompt: aiEditPrompt, selections: originalSelections });
        onError?.(error.message || 'AI 编辑失败');
      } finally {
        setIsAiProcessing(false);
      }
    };

    const handleRetry = () => {
      if (retryData) {
        setAiEditPrompt(retryData.prompt);
        setSelections(retryData.selections);
        // 设置最后一个选择为当前选择
        if (retryData.selections.length > 0) {
          const lastSelection = retryData.selections[retryData.selections.length - 1];
          setSelectionStart(lastSelection.start);
          setSelectionEnd(lastSelection.end);
          setSelectedText(lastSelection.text);
        }
        setAiError(null);
        setRetryData(null);
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
        <div className="min-h-[3.5rem] h-auto md:h-16 px-1.5 md:px-10 border-b border-slate-200 dark:border-white/5 flex flex-row flex-wrap md:flex-nowrap items-center justify-between bg-white dark:bg-[#09090b] shrink-0 gap-y-2 md:gap-y-0 gap-x-1 md:gap-x-0 py-2 md:py-0 custom-header-transition overflow-visible">
          <div className="flex items-center gap-1 md:gap-8 min-w-0 shrink-0">
            <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 overflow-hidden p-0.5 h-9 md:h-10 shrink-0">
              <button
                onClick={onPrevVersion}
                disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
                className="px-1 h-full text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-20"
                title="回退到更早版本"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="px-1 text-[9px] md:text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-0.5 whitespace-nowrap">
                <span className="max-w-[40px] truncate hidden md:inline">
                  {(() => {
                    const v = activeChapter.versions?.find(v => v.id === activeChapter.activeVersionId);
                    if (!v) return '当前';
                    if (v.type === 'original') return '原文';
                    if (v.type === 'optimized') {
                      const optimizedVersions = activeChapter.versions?.filter(ver => ver.type === 'optimized') || [];
                      const optIdx = optimizedVersions.findIndex(ver => ver.id === v.id);
                      return `优${optIdx !== -1 ? optIdx + 1 : ''}`;
                    }
                    return '编辑';
                  })()}
                </span>
                <span className="text-slate-400 dark:text-slate-600 font-mono text-[8px] scale-90" title="版本序号/总版本数">
                  {(() => {
                    const versions = activeChapter.versions || [];
                    const idx = versions.findIndex(v => v.id === activeChapter.activeVersionId);
                    return `${idx !== -1 ? idx + 1 : 1}/${Math.max(1, versions.length)}`;
                  })()}
                </span>
              </div>
              <button
                onClick={onNextVersion}
                disabled={!activeChapter.versions || activeChapter.versions.length <= 1}
                className="px-1 h-full text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-20"
                title="前进到更新版本"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`flex items-center bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 overflow-hidden p-0.5 h-9 md:h-10 shrink-0 transition-all duration-300 ${longTextMode ? 'w-auto opacity-100 mr-2' : 'w-0 opacity-0 p-0 border-0'}`}
              >
                <button
                  onClick={() => setContextScope('all')}
                  className={`px-2 h-full text-[10px] md:text-xs font-medium rounded-md transition-all whitespace-nowrap ${contextScope === 'all' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                  title="回顾整本书的剧情摘要"
                >
                  整书
                </button>
                <button
                  onClick={() => setContextScope('currentVolume')}
                  className={`px-2 h-full text-[10px] md:text-xs font-medium rounded-md transition-all whitespace-nowrap ${contextScope === 'currentVolume' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                  title="仅回顾当前卷的剧情摘要"
                >
                  本卷
                </button>
              </div>

              <div
                className="flex items-center gap-1.5 md:gap-2 px-2 h-9 md:h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 shrink-0"
                title="长文模式：开启后将自动进行章节总结"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-500 md:hidden" />
                <span className="text-[10px] text-slate-500 font-medium hidden md:inline">长文模式</span>
                <div
                  onClick={() => setLongTextMode(!longTextMode)}
                  className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors ${longTextMode ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-all shadow-sm ${longTextMode ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 md:gap-2 px-2 h-9 md:h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 shrink-0"
                title="自动润色：开启后将自动对新内容进行润色"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-500 md:hidden" />
                <span className="text-[10px] text-slate-500 font-medium hidden md:inline">自动润色</span>
                <div
                  onClick={() => setAutoOptimize(!autoOptimize)}
                  className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors ${autoOptimize ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-all shadow-sm ${autoOptimize ? 'translate-x-3' : ''}`}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-4 ml-auto">
            <div className="flex items-center h-9 md:h-10 overflow-hidden shrink-0">
              {activeChapter && optimizingChapterIds.has(activeChapter.id) ? (
                <button
                  onClick={() => onStopOptimize(activeChapter.id)}
                  className="bg-red-600 hover:bg-red-500 h-full text-white transition-all flex items-center justify-center px-2 rounded-l-lg text-[10px] font-bold gap-1 shadow-lg shadow-red-900/10"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">停止</span>
                </button>
              ) : (
                <button
                  onClick={() => onOptimize(activeChapter.id, localContent)}
                  className="bg-primary hover:bg-primary-hover h-full text-white transition-all flex items-center justify-center px-2 rounded-l-lg text-[10px] font-bold gap-1 shadow-lg shadow-primary/10"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline whitespace-nowrap">润色</span>
                </button>
              )}
              <button
                onClick={onShowOptimizeSettings}
                className="bg-primary/90 hover:bg-primary h-full w-8 flex items-center justify-center rounded-r-lg border-l border-white/10 text-white"
                title="润色设置"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center h-9 md:h-10 overflow-hidden shrink-0">
              <button
                onClick={() => activeChapter && onRegenerate(activeChapter.id)}
                className="bg-indigo-600 hover:bg-indigo-500 h-full text-white transition-all flex items-center justify-center px-2 rounded-lg text-[10px] font-bold gap-1 shadow-lg shadow-indigo-900/10"
                title="重新生成本章内容"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden md:inline whitespace-nowrap">重新生成</span>
              </button>
            </div>

            <div className="flex items-center gap-1 h-9 md:h-10 shrink-0">
              <button
                onClick={onShowAnalysisResult}
                className="w-8 h-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all"
                title="查看分析"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowChainOfThought(!showChainOfThought)}
                className={`w-8 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all ${showChainOfThought ? 'text-primary bg-primary/10' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                title="查看思维链"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
              <button
                onClick={handleToggleEditWithSync}
                className={`w-8 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all ${isEditingChapter ? 'text-primary bg-primary/10' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                title={isEditingChapter ? '保存' : '编辑'}
              >
                {isEditingChapter ? <Save className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
              </button>
              <button
                onClick={() => activeChapter && onDeleteChapter(activeChapter.id)}
                className="w-8 md:w-10 h-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                title="删除本章"
              >
                <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-10 pt-10 md:pt-20 pb-40 custom-scrollbar bg-white dark:bg-[#09090b] custom-bg-transition">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8 md:mb-16 text-center">
                <h1 className="text-2xl md:text-5xl font-serif font-bold text-slate-900 dark:text-slate-100 tracking-wide mb-4 md:mb-6 px-4">
                  {(() => {
                    if ((activeChapter.subtype === 'small_summary' || activeChapter.subtype === 'big_summary')) {
                      const isVolumeMode = contextScope === 'currentVolume';
                      const targetRange = isVolumeMode ? (activeChapter.summaryRangeVolume || activeChapter.summaryRange) : activeChapter.summaryRange;
                      const prefix = activeChapter.subtype === 'small_summary' ? '🔹小总结' : '🔸大总结';
                      return `${prefix} (${targetRange})`;
                    }
                    const chapterName = extractChapterName(activeChapter.title);
                    return chapterName || activeChapter.title;
                  })()}
                </h1>
                <div className="flex items-center justify-center gap-2 md:gap-4 text-slate-300 dark:text-slate-500/60">
                  <div className="h-[1px] w-8 md:w-16 bg-slate-200 dark:bg-[#1e2433]"></div>
                  <span className="text-[9px] md:text-[11px] font-mono uppercase tracking-[0.2em] md:tracking-[0.3em]">
                    {activeChapter.content ? activeChapter.content.length : 0} Words
                  </span>
                  {hasUnsavedChanges && (
                    <span className="text-[9px] text-amber-500 font-medium animate-pulse">保存中...</span>
                  )}
                  {!hasUnsavedChanges && lastSavedTime && (
                    <span className="text-[9px] text-green-500/60 font-medium" title={`最后保存: ${lastSavedTime.toLocaleTimeString()}`}>
                      已保存
                    </span>
                  )}
                  <div className="h-[1px] w-8 md:w-16 bg-slate-200 dark:bg-[#1e2433]"></div>
                </div>
              </div>

              {isEditingChapter ? (
                <div
                  ref={textareaRef}
                  contentEditable
                  onInput={(e) => {
                    const target = e.target as HTMLElement;
                    handleLocalChange({ target: { value: target.innerText } } as any);
                  }}
                  onSelect={handleSelectionChange}
                  className="w-full h-full min-h-[500px] md:min-h-[600px] bg-transparent text-[18px] md:text-[21px] text-slate-800 dark:text-slate-200/90 leading-[1.8] outline-none font-serif selection:bg-primary/30 px-2 md:px-0 placeholder-slate-400"
                  dangerouslySetInnerHTML={{ __html: getHighlightedContent(localContent) || '<p>在此处输入章节正文...</p>' }}
                />
              ) : (
                <article
                  ref={contentScrollRef}
                  className="writing-area text-[18px] md:text-[21px] text-slate-800 dark:text-slate-200/90 selection:bg-primary/30 font-serif leading-[1.8] px-2 md:px-0"
                >
                  {activeChapter.content ? (
                    <div className="prose dark:prose-invert prose-2xl max-w-none [&_p]:mb-0 [&_p]:mt-0">
                      {isStreaming ? (
                        <TypewriterEffect text={activeChapter.content} isStreaming={isStreaming} className="whitespace-pre-wrap" />
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: getHighlightedContent(activeChapter.content.replace(/<[^>]+>/g, '')) }} />
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-500 italic text-center py-20">
                      {activeChapter && optimizingChapterIds.has(activeChapter.id)
                        ? 'AI 正在分析并准备润色，请稍候...'
                        : '暂无内容，请开始创作...'}
                    </div>
                  )}
                </article>
              )}
            </div>

            {showChainOfThought && (
              <div className="mt-8 border-t border-slate-200 dark:border-white/5 pt-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  思维链
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-300 font-mono whitespace-pre-wrap">
                  {chainOfThoughtContent || '暂无思维链内容'}
                </div>
              </div>
            )}
          </div>

          {isEditingChapter && (
            <div className="border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#09090b] p-3 md:p-4 custom-bg-transition safe-area-bottom">
              <div className="max-w-4xl mx-auto">
                {/* 预设选择器 */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative edit-preset-dropdown">
                    <button
                      onClick={() => setShowEditPresetDropdown(!showEditPresetDropdown)}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg text-sm transition-colors hover:bg-slate-200 dark:hover:bg-white/10"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="truncate max-w-[150px]">{activeEditPreset?.name || '选择预设'}</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showEditPresetDropdown && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {editPresets.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => {
                                setActiveEditPresetId(preset.id);
                                setShowEditPresetDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                preset.id === activeEditPresetId
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={onShowEditPresetSettings}
                    className="flex items-center gap-1 px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-sm transition-colors hover:bg-primary/20"
                    title="编辑预设"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="hidden sm:inline">编辑</span>
                  </button>
                </div>

                {selections.length > 0 && (
                  <div className="mb-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Check className="w-3 h-3" />
                    <span>已选中 {selections.length} 个文本片段</span>
                  </div>
                )}
                
                {selections.length > 0 && (
                  <div className="mb-3 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="flex flex-wrap gap-2">
                      {selections.map((selection, index) => (
                        <div 
                          key={`${selection.start}-${selection.end}`}
                          className={`${selection.color} px-2 py-1 rounded-md flex items-center gap-1 text-xs`}
                        >
                          <span className="max-w-[200px] truncate">{selection.text.substring(0, 50)}{selection.text.length > 50 ? '...' : ''}</span>
                          <button
                            onClick={() => {
                              setSelections(selections.filter((_, i) => i !== index));
                              // 如果删除的是当前选择，重置选择状态
                              if (selectionStart >= selection.start && selectionEnd <= selection.end) {
                                setSelectionStart(-1);
                                setSelectionEnd(-1);
                                setSelectedText('');
                              }
                            }}
                            className="text-slate-500 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    value={aiEditPrompt}
                    onChange={(e) => setAiEditPrompt(e.target.value)}
                    placeholder="请输入修改要求（如：让这段更有画面感..."
                    className="flex-1 px-3 py-3 md:py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    disabled={isAiProcessing}
                  />
                  <div className="flex flex-col md:flex-row gap-2">
                    {aiError && (
                      <button
                        onClick={handleRetry}
                        className="px-4 py-3 md:py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="hidden sm:inline">重试</span>
                      </button>
                    )}
                    <button
                      onClick={handleAiEdit}
                      disabled={isAiProcessing || !aiEditPrompt.trim() || selections.length === 0}
                      className="px-4 py-3 md:py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAiProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline">处理中...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span className="hidden sm:inline">发送</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {aiError && (
                  <div className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <X className="w-3 h-3" />
                    {aiError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

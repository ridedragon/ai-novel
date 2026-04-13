import OpenAI from 'openai';
import { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { Chapter, ChapterVersion, GeneratorPreset, Novel, OutlineItem, PromptItem, RegexScript } from '../types';
import { processTextWithRegex } from '../utils/aiHelpers';
import { AutoWriteEngine } from '../utils/auto-write';
import { workflowManager } from '../utils/WorkflowManager';

export function useAutoWriteManager() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoWriting, setIsAutoWriting] = useState(false);
  const [autoWriteStatus, setAutoWriteStatus] = useState('');

  // 优化特定状态
  const [optimizingChapterIds, setOptimizingChapterIds] = useState<Set<number>>(new Set());
  const [optimizationQueue, setOptimizationQueue] = useState<number[]>([]);
  const optimizationQueueRef = useRef<number[]>([]);
  useEffect(() => {
    optimizationQueueRef.current = optimizationQueue;
  }, [optimizationQueue]);

  // 各种任务的中止控制器引用
  const isAutoWritingRef = useRef(false);
  const autoWriteAbortControllerRef = useRef<AbortController | null>(null);
  const outlineAbortControllerRef = useRef<AbortController | null>(null);
  const characterAbortControllerRef = useRef<AbortController | null>(null);
  const worldviewAbortControllerRef = useRef<AbortController | null>(null);
  const inspirationAbortControllerRef = useRef<AbortController | null>(null);
  const optimizeAbortControllersRef = useRef<Map<number, AbortController>>(new Map());
  const generateAbortControllerRef = useRef<AbortController | null>(null);

  // 引擎引用
  const engineRef = useRef<AutoWriteEngine | null>(null);

  // 同步 ref 标志
  useEffect(() => {
    isAutoWritingRef.current = isAutoWriting;
  }, [isAutoWriting]);

  const stopAutoWriting = useCallback(() => {
    setIsAutoWriting(false);
    isAutoWritingRef.current = false;
    engineRef.current?.stop();
    autoWriteAbortControllerRef.current?.abort();
    setAutoWriteStatus('创作已停止');
  }, []);

  const stopOutlineGeneration = useCallback(() => {
    outlineAbortControllerRef.current?.abort();
  }, []);

  const stopOptimize = useCallback((chapterId: number) => {
    const controller = optimizeAbortControllersRef.current.get(chapterId);
    if (controller) {
      controller.abort();
      optimizeAbortControllersRef.current.delete(chapterId);
    }
    setOptimizingChapterIds(prev => {
      const next = new Set(prev);
      next.delete(chapterId);
      return next;
    });
  }, []);

  // 核心校验函数
  const checkActive = useCallback((runId?: string | null) => {
    if (!isAutoWritingRef.current) return false;
    if (runId && !workflowManager.isRunActive(runId)) {
      terminal.warn(`[AutoWrite] 侦测到过时任务 (RunID: ${runId})，正在静默退出。`);
      return false;
    }
    return true;
  }, []);

  /**
   * 执行全自动写作循环
   */
  const startAutoWriteLoop = useCallback(
    async (params: {
      novel: Novel;
      outline: OutlineItem[];
      startIndex: number;
      promptsToUse: PromptItem[];
      config: any;
      getActiveScripts: () => RegexScript[];
      onNovelUpdate: (novel: Novel) => void;
      onChapterComplete: (
        chapterId: number,
        content: string,
        updatedNovel?: Novel,
        forceFinal?: boolean,
        runId?: string | null,
      ) => Promise<Novel | void>;
      targetVolumeId?: string;
      includeFullOutline?: boolean;
      outlineSetId?: string | null;
      runId?: string | null;
    }) => {
      setIsAutoWriting(true);
      setAutoWriteStatus('准备引擎...');

      const engine = new AutoWriteEngine(params.config, params.novel);
      engineRef.current = engine;

      try {
        await engine.run(
          params.outline,
          params.startIndex,
          params.promptsToUse,
          params.getActiveScripts,
          status => setAutoWriteStatus(status),
          params.onNovelUpdate,
          params.onChapterComplete,
          undefined, // onBeforeChapter
          params.targetVolumeId,
          params.includeFullOutline,
          params.outlineSetId,
          undefined, // signal 内部已处理
          params.runId,
        );
      } catch (err) {
        terminal.error('[useAutoWriteManager] AutoWrite failed', err);
      } finally {
        setIsAutoWriting(false);
        engineRef.current = null;
      }
    },
    [],
  );

  /**
   * 优化/润色章节逻辑 (从 App.tsx 迁移)
   */
  const handleOptimize = useCallback(
    async (params: {
      targetId: number;
      initialContent?: string;
      activeNovelId: string | null;
      novelsRef: React.MutableRefObject<Novel[]>;
      optimizePresets: GeneratorPreset[];
      activeOptimizePresetId: string;
      optimizeModel: string;
      apiKey: string;
      baseUrl: string;
      maxRetries: number;
      twoStepOptimization: boolean;
      analysisPresets: GeneratorPreset[];
      activeAnalysisPresetId: string;
      analysisModel: string;
      setChapters: (value: Chapter[] | ((prev: Chapter[]) => Chapter[])) => void;
      getActiveScripts: () => RegexScript[];
      onAnalysisResult?: (result: string) => void;
      onError: (msg: string) => void;
      onStreamingStatusChange?: (isStreaming: boolean) => void;
    }) => {
      const { targetId, activeNovelId, novelsRef, setChapters } = params;

      terminal.log('[Optimize] handleOptimize called:', { targetId, activeNovelId });

      const activePreset =
        params.optimizePresets.find(p => p.id === params.activeOptimizePresetId) || params.optimizePresets[0];
      const finalApiKey = activePreset.apiConfig?.apiKey || params.apiKey;
      const finalBaseUrl = activePreset.apiConfig?.baseUrl || params.baseUrl;
      const finalModel = activePreset.apiConfig?.model || params.optimizeModel;

      terminal.log('[Optimize] API Config:', { 
        hasApiKey: !!finalApiKey, 
        baseUrl: finalBaseUrl, 
        model: finalModel,
        presetId: activePreset?.id 
      });

      if (!finalApiKey) {
        terminal.error('[Optimize] No API Key configured');
        params.onError('请先配置 API Key');
        return;
      }

      if (optimizingChapterIds.has(targetId)) {
        terminal.warn('[Optimize] Chapter already being optimized:', targetId);
        return;
      }

      const currentNovel = novelsRef.current.find(n => n.id === activeNovelId);
      const latestChapter = currentNovel?.chapters?.find(c => c.id === targetId);

      let sourceContentToUse = params.initialContent || latestChapter?.content;
      if (!sourceContentToUse || !sourceContentToUse.trim()) {
        const originalVer = latestChapter?.versions?.find(v => v.type === 'original');
        if (originalVer?.content) sourceContentToUse = originalVer.content;
      }

      if (!sourceContentToUse || !sourceContentToUse.trim()) {
        terminal.error('[Optimize] Error: No content found to optimize.');
        params.onError('没有找到可优化的内容，请先输入章节正文');
        return;
      }

      terminal.log('[Optimize] Starting optimization, content length:', sourceContentToUse.length);

      setOptimizingChapterIds(prev => new Set(prev).add(targetId));
      const abortController = new AbortController();
      optimizeAbortControllersRef.current.set(targetId, abortController);

      const baseTime = Date.now();
      let reusableVersionId: string | null = null;
      if (latestChapter?.versions?.length) {
        const lastVer = latestChapter.versions[latestChapter.versions.length - 1];
        if (lastVer.type === 'optimized' && !lastVer.content.trim()) reusableVersionId = lastVer.id;
      }
      const newVersionId = reusableVersionId || `opt_${baseTime}`;

      const buildVersions = (currentVersions: ChapterVersion[] | undefined, newContent: string): ChapterVersion[] => {
        let versions = currentVersions ? [...currentVersions] : [];
        const originalIndex = versions.findIndex(v => v.type === 'original');
        if (originalIndex === -1) {
          versions.unshift({
            id: `v_${baseTime}_orig`,
            content: sourceContentToUse || '',
            timestamp: baseTime,
            type: 'original',
          });
        } else if (!versions[originalIndex].content.trim() && sourceContentToUse?.trim()) {
          versions[originalIndex].content = sourceContentToUse;
          versions[originalIndex].timestamp = Date.now();
        }

        const existingOptIndex = versions.findIndex(v => v.id === newVersionId);
        if (existingOptIndex !== -1) {
          versions[existingOptIndex] = { ...versions[existingOptIndex], content: newContent, timestamp: baseTime };
        } else {
          versions.push({ id: newVersionId, content: newContent, timestamp: baseTime + 1, type: 'optimized' });
        }
        return versions;
      };

      setChapters(prev =>
        prev.map(c => {
          if (c.id === targetId) {
            return { ...c, versions: buildVersions(c.versions, ''), activeVersionId: newVersionId, content: c.content };
          }
          return c;
        }),
      );

      let currentAnalysisResult = '';
      if (params.twoStepOptimization) {
        try {
          const analysisPreset =
            params.analysisPresets.find(p => p.id === params.activeAnalysisPresetId) || params.analysisPresets[0];
          const anaModel = analysisPreset.apiConfig?.model || params.analysisModel;
          const anaApiKey = analysisPreset.apiConfig?.apiKey || params.apiKey;
          const anaBaseUrl = analysisPreset.apiConfig?.baseUrl || params.baseUrl;

          terminal.log(`
>> AI REQUEST [手动润色: 优化前分析]
>> -----------------------------------------------------------
>> Model:       ${anaModel}
>> Base URL:    ${anaBaseUrl}
>> Temperature: ${analysisPreset.temperature ?? 1.0}
>> Top P:       ${analysisPreset.topP ?? 1.0}
>> Top K:       ${analysisPreset.topK ?? 200}
>> Chapter ID:  ${targetId}
>> -----------------------------------------------------------
          `);

          const openai = new OpenAI({ apiKey: anaApiKey, baseURL: anaBaseUrl, dangerouslyAllowBrowser: true });
          const messages: any[] = analysisPreset.prompts
            .filter(p => p.enabled)
            .map(p => ({ role: p.role, content: p.content.replace('{{content}}', sourceContentToUse!) }))
            .filter(m => m.content?.trim());

          console.group(`[AI REQUEST] 手动润色 - 优化前分析 - Chapter ${targetId}`);
          console.log('Messages:', messages);
          console.groupEnd();

          let requestParams: any = {
            model: anaModel,
            messages,
            temperature: analysisPreset.temperature ?? 1.0,
            top_p: analysisPreset.topP ?? 1.0,
          };
          let fallbackMode = 0;
          if (analysisPreset.topK && analysisPreset.topK > 0 && fallbackMode < 1) {
            requestParams.top_k = analysisPreset.topK;
          }
          
          let completion;
          let apiCallSuccess = false;
          while (!apiCallSuccess && fallbackMode <= 2) {
            try {
              completion = await openai.chat.completions.create(
                requestParams,
                { signal: abortController.signal },
              );
              apiCallSuccess = true;
            } catch (apiError: any) {
              if (apiError.status === 400) {
                const errorBody = apiError.error?.message || apiError.message || 'Unknown error';
                terminal.warn(`API 400 错误: ${errorBody}`);
                
                if (requestParams.top_k && fallbackMode < 1) {
                  terminal.warn('尝试移除 top_k 参数重试');
                  delete requestParams.top_k;
                  fallbackMode = 1;
                } else if (fallbackMode < 2) {
                  terminal.warn('尝试简化参数重试 (移除 top_p)');
                  delete requestParams.top_p;
                  requestParams.temperature = 1.0;
                  fallbackMode = 2;
                } else {
                  throw apiError;
                }
              } else {
                throw apiError;
              }
            }
          }
          currentAnalysisResult = completion.choices[0]?.message?.content || '';
          
          terminal.log(
            `[Analysis Result] chapter ${targetId}:\n${currentAnalysisResult.slice(0, 500)}${
              currentAnalysisResult.length > 500 ? '...' : ''
            }`,
          );
          
          if (params.onAnalysisResult) params.onAnalysisResult(currentAnalysisResult);
          setChapters(prev => prev.map(c => (c.id === targetId ? { ...c, analysisResult: currentAnalysisResult } : c)));
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            terminal.error('[Optimize] Analysis phase failed', e);
            if (e.status) {
              terminal.error(`[Optimize] Analysis error status: ${e.status}`);
              terminal.error(`[Optimize] Analysis error details: ${JSON.stringify(e, null, 2)}`);
            }
          }
        }
      }

      if (abortController.signal.aborted) {
        stopOptimize(targetId);
        return;
      }

      // Phase 2: Actual Optimization
      try {
        terminal.log(`
>> AI REQUEST [手动润色: 正文优化]
>> -----------------------------------------------------------
>> Model:       ${finalModel}
>> Base URL:    ${finalBaseUrl}
>> Temperature: ${activePreset.temperature ?? 1.0}
>> Top P:       ${activePreset.topP ?? 1.0}
>> Top K:       ${activePreset.topK ?? 200}
>> Chapter ID:  ${targetId}
>> -----------------------------------------------------------
        `);

        const openai = new OpenAI({ apiKey: finalApiKey, baseURL: finalBaseUrl, dangerouslyAllowBrowser: true });
        let isAnalysisUsed = false;
        const messages: any[] = activePreset.prompts
          .filter(p => p.enabled)
          .map(p => {
            let content = p.content.replace('{{content}}', sourceContentToUse!);
            if (currentAnalysisResult && content.includes('{{analysis}}')) {
              content = content.replace('{{analysis}}', currentAnalysisResult);
              isAnalysisUsed = true;
            }
            return { role: p.role, content };
          })
          .filter(m => m.content?.trim());

        if (currentAnalysisResult && !isAnalysisUsed) {
          const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
          if (lastUserIdx !== -1) messages[lastUserIdx].content += `\n\n【AI 修改建议】：\n${currentAnalysisResult}`;
          else messages.push({ role: 'user', content: `请基于以下建议优化正文：\n\n${currentAnalysisResult}` });
        }

        console.group(`[AI REQUEST] 手动润色 - 正文优化 - Chapter ${targetId}`);
        console.log('Messages:', messages);
        console.groupEnd();

        let requestParams: any = {
            model: finalModel,
            messages,
            temperature: activePreset.temperature ?? 1.0,
            top_p: activePreset.topP ?? 1.0,
            stream: true,
          };
          let fallbackMode = 0;
          if (activePreset.topK && activePreset.topK > 0 && fallbackMode < 1) {
            requestParams.top_k = activePreset.topK;
          }
          
          // 开始流式输出
        params.onStreamingStatusChange?.(true);
        let stream;
        let apiCallSuccess = false;
        while (!apiCallSuccess && fallbackMode <= 2) {
          try {
            stream = await openai.chat.completions.create(
              requestParams,
              { signal: abortController.signal },
            );
            apiCallSuccess = true;
          } catch (apiError: any) {
            // 出错时关闭流式状态
            params.onStreamingStatusChange?.(false);
            if (apiError.status === 400) {
              const errorBody = apiError.error?.message || apiError.message || 'Unknown error';
              terminal.warn(`API 400 错误: ${errorBody}`);
              
              if (requestParams.top_k && fallbackMode < 1) {
                terminal.warn('尝试移除 top_k 参数重试');
                delete requestParams.top_k;
                fallbackMode = 1;
              } else if (fallbackMode < 2) {
                terminal.warn('尝试简化参数重试 (移除 top_p)');
                delete requestParams.top_p;
                requestParams.temperature = 1.0;
                fallbackMode = 2;
              } else {
                throw apiError;
              }
            } else {
              throw apiError;
            }
          }
        }

        let newContent = '';
        let lastUpdateTime = 0;
        for await (const chunk of stream as any) {
          if (abortController.signal.aborted) {
            // 中止时关闭流式状态
            params.onStreamingStatusChange?.(false);
            throw new Error('Aborted');
          }
          const content = chunk.choices[0]?.delta?.content || '';
          newContent += content;

          const now = Date.now();
          // 节流处理：每 50ms 更新一次 UI，实现流畅的流式输出效果
          if (now - lastUpdateTime > 50) {
            lastUpdateTime = now;
            setChapters(prev =>
              prev.map(c => {
                if (c.id === targetId) {
                  return {
                    ...c,
                    content: newContent,
                    versions: buildVersions(c.versions, newContent),
                    activeVersionId: newVersionId,
                  };
                }
                return c;
              }),
            );
          }
        }

        // 流式输出结束
        params.onStreamingStatusChange?.(false);

        const scripts = params.getActiveScripts();
        const processed = await processTextWithRegex(newContent, scripts, 'output');
        
        terminal.log(
          `[Optimization Result] chapter ${targetId} length: ${processed.length}${
            processed.length > 0 ? `\n预览: ${processed.slice(0, 300)}...` : ''
          }`,
        );
        
        console.group(`[AI RESPONSE] 手动润色结果 - Chapter ${targetId}`);
        console.log('Content Length:', processed.length);
        console.log('Content Preview:', processed.slice(0, 500));
        console.groupEnd();
        
        setChapters(prev =>
          prev.map(c => {
            if (c.id === targetId) {
              const versions = buildVersions(c.versions, processed);
              return { ...c, content: processed, versions, activeVersionId: newVersionId };
            }
            return c;
          }),
        );
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          params.onError(err.message || '优化出错');
          if (err.status) {
            terminal.error(`[Optimize] Optimization error status: ${err.status}`);
            terminal.error(`[Optimize] Optimization error details: ${JSON.stringify(err, null, 2)}`);
          }
        }
      } finally {
        stopOptimize(targetId);
      }
    },
    [optimizingChapterIds, stopOptimize],
  );

  return {
    isLoading,
    setIsLoading,
    isAutoWriting,
    setIsAutoWriting,
    isAutoWritingRef,
    autoWriteStatus,
    setAutoWriteStatus,
    optimizingChapterIds,
    setOptimizingChapterIds,
    optimizationQueue,
    setOptimizationQueue,
    autoWriteAbortControllerRef,
    outlineAbortControllerRef,
    characterAbortControllerRef,
    worldviewAbortControllerRef,
    inspirationAbortControllerRef,
    optimizeAbortControllersRef,
    generateAbortControllerRef,
    stopAutoWriting,
    stopOutlineGeneration,
    stopOptimize,
    checkActive,
    startAutoWriteLoop,
    handleOptimize,
  };
}

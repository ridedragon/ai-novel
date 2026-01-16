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
    }) => {
      const { targetId, activeNovelId, novelsRef, setChapters } = params;

      const activePreset =
        params.optimizePresets.find(p => p.id === params.activeOptimizePresetId) || params.optimizePresets[0];
      const finalApiKey = activePreset.apiConfig?.apiKey || params.apiKey;
      const finalBaseUrl = activePreset.apiConfig?.baseUrl || params.baseUrl;
      const finalModel = activePreset.apiConfig?.model || params.optimizeModel;

      if (!finalApiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      if (optimizingChapterIds.has(targetId)) return;

      const currentNovel = novelsRef.current.find(n => n.id === activeNovelId);
      const latestChapter = currentNovel?.chapters?.find(c => c.id === targetId);

      let sourceContentToUse = params.initialContent || latestChapter?.content;
      if (!sourceContentToUse || !sourceContentToUse.trim()) {
        const originalVer = latestChapter?.versions?.find(v => v.type === 'original');
        if (originalVer?.content) sourceContentToUse = originalVer.content;
      }

      if (!sourceContentToUse || !sourceContentToUse.trim()) {
        terminal.error('[Optimize] Error: No content found to optimize.');
        return;
      }

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
        } else {
          const activeVersion = versions.find(v => v.id === latestChapter?.activeVersionId);
          if (sourceContentToUse && activeVersion && sourceContentToUse !== activeVersion.content) {
            versions.push({
              id: `v_${Date.now()}_manual`,
              content: sourceContentToUse,
              timestamp: Date.now() - 1,
              type: 'user_edit',
            });
          }
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

          const openai = new OpenAI({ apiKey: anaApiKey, baseURL: anaBaseUrl, dangerouslyAllowBrowser: true });
          const messages: any[] = analysisPreset.prompts
            .filter(p => p.enabled)
            .map(p => ({ role: p.role, content: p.content.replace('{{content}}', sourceContentToUse!) }))
            .filter(m => m.content?.trim());

          const completion = await openai.chat.completions.create(
            {
              model: anaModel,
              messages,
              temperature: analysisPreset.temperature ?? 1.0,
              top_p: analysisPreset.topP ?? 1.0,
            },
            { signal: abortController.signal },
          );
          currentAnalysisResult = completion.choices[0]?.message?.content || '';
          if (params.onAnalysisResult) params.onAnalysisResult(currentAnalysisResult);
          setChapters(prev => prev.map(c => (c.id === targetId ? { ...c, analysisResult: currentAnalysisResult } : c)));
        } catch (e: any) {
          if (e.name !== 'AbortError') terminal.error('[Optimize] Analysis phase failed', e);
        }
      }

      if (abortController.signal.aborted) {
        stopOptimize(targetId);
        return;
      }

      // Phase 2: Actual Optimization
      try {
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

        const stream = await openai.chat.completions.create(
          {
            model: finalModel,
            messages,
            temperature: activePreset.temperature ?? 1.0,
            top_p: activePreset.topP ?? 1.0,
            stream: true,
          },
          { signal: abortController.signal },
        );

        let newContent = '';
        let lastUpdateTime = 0;
        for await (const chunk of stream as any) {
          if (abortController.signal.aborted) throw new Error('Aborted');
          const content = chunk.choices[0]?.delta?.content || '';
          newContent += content;

          const now = Date.now();
          if (now - lastUpdateTime > 150) {
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

        const scripts = params.getActiveScripts();
        const processed = await processTextWithRegex(newContent, scripts, 'output');
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
        if (err.name !== 'AbortError') params.onError(err.message || '优化出错');
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

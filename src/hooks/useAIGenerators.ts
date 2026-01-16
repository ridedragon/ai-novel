import OpenAI from 'openai';
import { useCallback, useState } from 'react';
import { Chapter, GeneratorPreset, Novel, PlotOutlineItem, PresetApiConfig, PromptItem, RegexScript } from '../types';
import {
  buildReferenceContext,
  buildWorldInfoMessages,
  extractTargetEndChapter,
  getStoryChapters,
  logAiParams,
  normalizeGeneratorResult,
  parseAnyNumber,
  processTextWithRegex,
} from '../utils/aiHelpers';
import { getChapterContextMessages } from '../utils/auto-write/core';
import { ensureChapterVersions } from '../utils/chapterUtils';
import { safeParseJSONArray } from '../utils/jsonUtils';
import { workflowManager } from '../utils/WorkflowManager';

export function useAIGenerators() {
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [outlineStatus, setOutlineStatus] = useState('');
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  const [isGeneratingWorldview, setIsGeneratingWorldview] = useState(false);
  const [isGeneratingInspiration, setIsGeneratingInspiration] = useState(false);
  const [isGeneratingPlotOutline, setIsGeneratingPlotOutline] = useState(false);
  const [regeneratingOutlineItemIndices, setRegeneratingOutlineItemIndices] = useState<Set<number>>(new Set());

  const getApiConfig = (
    presetConfig: any,
    featureModel: string,
    globalApiKey: string,
    globalBaseUrl: string,
    globalModel: string,
  ) => {
    const finalApiKey = presetConfig?.apiKey || globalApiKey;
    const finalBaseUrl = presetConfig?.baseUrl || globalBaseUrl;
    let finalModel = presetConfig?.model || featureModel || globalModel;
    return { apiKey: finalApiKey, baseUrl: finalBaseUrl, model: finalModel };
  };

  /**
   * 迁移自 App.tsx: handleGenerateOutline
   */
  const handleGenerateOutline = useCallback(
    async (params: {
      mode: 'append' | 'replace' | 'chat';
      source: 'module' | 'chat';
      activeNovel: Novel | undefined;
      activeOutlineSetId: string | null;
      activeOutlinePresetId: string;
      lastNonChatOutlinePresetId: string;
      outlinePresets: GeneratorPreset[];
      outlineModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalModel: string;
      globalCreationPrompt: string;
      maxRetries: number;
      userPrompt: string;
      activeChapter?: Chapter;
      contextLength: number;
      selectedRefs: any; // 包含各种选中项
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onStatusUpdate?: (status: string) => void;
      onError: (msg: string) => void;
      onSuccess: () => void;
      outlineAbortControllerRef: React.MutableRefObject<AbortController | null>;
      forcedTargetEnd?: number;
    }) => {
      const { mode, source, activeNovel, activeOutlineSetId, outlineAbortControllerRef } = params;
      let currentPresetId = params.activeOutlinePresetId;
      if (mode === 'chat') currentPresetId = 'chat';
      else if (currentPresetId === 'chat') currentPresetId = params.lastNonChatOutlinePresetId;

      const activePreset = params.outlinePresets.find(p => p.id === currentPresetId) || params.outlinePresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.outlineModel,
        params.globalApiKey,
        params.globalBaseUrl,
        params.globalModel,
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      setIsGeneratingOutline(true);
      setOutlineStatus('准备请求 AI...');
      outlineAbortControllerRef.current = new AbortController();

      let targetSetId = activeOutlineSetId;
      let targetSet = activeNovel?.outlineSets?.find(s => s.id === targetSetId);
      if (!targetSet && activeNovel?.outlineSets?.length) {
        targetSet = activeNovel.outlineSets[0];
        targetSetId = targetSet.id;
      }
      if (!targetSet) {
        setIsGeneratingOutline(false);
        return;
      }

      let attempt = 0;
      const maxAttempts = params.maxRetries + 1;

      while (attempt < maxAttempts) {
        try {
          if (outlineAbortControllerRef.current?.signal.aborted) break;
          const currentSet = activeNovel?.outlineSets?.find(s => s.id === targetSetId);
          const startNum = mode === 'append' ? (currentSet?.items.length || 0) + 1 : 1;
          let statusMsg = `正在生成第 ${startNum} 章起的大纲`;
          if (params.forcedTargetEnd) statusMsg += ` (目标至第 ${params.forcedTargetEnd} 章)`;
          setOutlineStatus(statusMsg);

          const storyChapters = getStoryChapters(activeNovel?.chapters || []);
          const totalCount = storyChapters.length;
          const continuityNote =
            totalCount > 0
              ? `\n**注意：当前全书已创作至第 ${totalCount} 章，请务必从“第 ${totalCount + 1} 章”开始续写大纲。**\n`
              : '';

          logAiParams(
            '章节大纲生成',
            apiConfig.model,
            activePreset.temperature ?? 1.0,
            activePreset.topP ?? 1.0,
            activePreset.topK ?? 200,
          );
          const openai = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const referenceContext = buildReferenceContext(
            activeNovel,
            params.selectedRefs.worldviewSetId,
            params.selectedRefs.worldviewIndices,
            params.selectedRefs.characterSetId,
            params.selectedRefs.characterIndices,
            params.selectedRefs.inspirationSetId,
            params.selectedRefs.inspirationIndices,
            params.selectedRefs.outlineSetId,
            params.selectedRefs.outlineIndices,
          );

          let outlineContext = currentSet?.items?.length
            ? '\n【现有大纲列表】：\n' + JSON.stringify(currentSet.items, null, 2) + '\n'
            : '';
          let chatContext = currentSet?.chatHistory?.length
            ? '\n【对话历史】：\n' + currentSet.chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\n'
            : '';
          let mainChatContext =
            source === 'chat' && params.activeChapter?.content
              ? `\n【当前聊天记录】：\n${params.activeChapter.content.slice(
                  -Math.max(1000, params.contextLength - 5000),
                )}\n`
              : '';

          const messages: any[] = activePreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content
                .replace(
                  '{{context}}',
                  `${referenceContext}\n${outlineContext}\n${chatContext}\n${mainChatContext}\n${continuityNote}`,
                )
                .replace('{{notes}}', currentSet?.userNotes || ''),
            }))
            .filter(m => m.content?.trim());

          if (params.globalCreationPrompt.trim())
            messages.unshift({ role: 'system', content: params.globalCreationPrompt });
          if (totalCount > 0)
            messages.unshift({
              role: 'system',
              content: `【全书创作进度指令】：当前全书已完成创作至第 ${totalCount} 章。请务必从“第 ${
                totalCount + 1
              } 章”开始续写大纲。`,
            });
          if (!messages.some(m => m.role === 'user'))
            messages.push({ role: 'user', content: params.userPrompt || '请生成新的大纲章节。' });

          const completion = await openai.chat.completions.create(
            {
              model: apiConfig.model,
              messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            } as any,
            { signal: outlineAbortControllerRef.current.signal },
          );

          const content = completion.choices[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');

          if (mode === 'chat') {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      outlineSets: (n.outlineSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          }

          const rawData = safeParseJSONArray(content);
          const outlineData = normalizeGeneratorResult(rawData, 'outline');
          if (Array.isArray(outlineData) && outlineData.length > 0) {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      outlineSets: (n.outlineSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              items: mode === 'replace' ? outlineData : [...s.items, ...outlineData],
                              userNotes:
                                (s.userNotes || '') +
                                `\n[${new Date().toLocaleTimeString()}] (${mode === 'replace' ? '重新生成' : '追加'}) ${
                                  params.userPrompt
                                }`,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );

            setOutlineStatus('成功解析大纲数据');
            const lastItem = outlineData[outlineData.length - 1];
            const currentLastNum = parseAnyNumber(lastItem.title);
            const finalTargetEnd = params.forcedTargetEnd || extractTargetEndChapter(params.userPrompt);

            if (finalTargetEnd && currentLastNum && currentLastNum < finalTargetEnd) {
              setTimeout(() => {
                handleGenerateOutline({
                  ...params,
                  mode: 'append',
                  userPrompt: `(系统接龙：请从第 ${currentLastNum + 1} 章开始继续，直到第 ${finalTargetEnd} 章)`,
                  forcedTargetEnd: finalTargetEnd,
                });
              }, 1500);
              return;
            }
            params.onSuccess();
            break;
          } else throw new Error('Invalid format');
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          attempt++;
          if (attempt >= maxAttempts) params.onError(err.message || '生成大纲出错');
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsGeneratingOutline(false);
    },
    [],
  );

  /**
   * 迁移自 App.tsx: handleRegenerateOutlineItem
   */
  const handleRegenerateOutlineItem = useCallback(
    async (params: {
      index: number;
      activeNovel: Novel | undefined;
      activeNovelId: string | null;
      activeOutlineSetId: string | null;
      activeOutlinePresetId: string;
      outlinePresets: GeneratorPreset[];
      outlineModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalCreationPrompt: string;
      selectedRefs: any;
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onError: (msg: string) => void;
    }) => {
      const { index, activeNovel, activeNovelId, activeOutlineSetId, activeOutlinePresetId } = params;
      const activePreset = params.outlinePresets.find(p => p.id === activeOutlinePresetId) || params.outlinePresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.outlineModel,
        params.globalApiKey,
        params.globalBaseUrl,
        '',
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      const targetSet = activeNovel?.outlineSets?.find(s => s.id === activeOutlineSetId);
      if (!targetSet) return;

      setRegeneratingOutlineItemIndices(prev => new Set(prev).add(index));

      try {
        logAiParams(
          '单章大纲重生成',
          apiConfig.model,
          activePreset.temperature ?? 1.0,
          activePreset.topP ?? 1.0,
          activePreset.topK ?? 200,
        );
        const openai = new OpenAI({
          apiKey: apiConfig.apiKey,
          baseURL: apiConfig.baseUrl,
          dangerouslyAllowBrowser: true,
        });

        const itemToRegenerate = targetSet.items[index];
        const referenceContext = buildReferenceContext(
          activeNovel,
          params.selectedRefs.worldviewSetId,
          params.selectedRefs.worldviewIndices,
          params.selectedRefs.characterSetId,
          params.selectedRefs.characterIndices,
          params.selectedRefs.inspirationSetId,
          params.selectedRefs.inspirationIndices,
          params.selectedRefs.outlineSetId,
          params.selectedRefs.outlineIndices,
        );

        const contextStr = `【待修改章节标题】：${itemToRegenerate.title}\n【待修改章节摘要】：${itemToRegenerate.summary}\n\n【全书参考上下文】：\n${referenceContext}`;

        const messages: any[] = activePreset.prompts
          .filter(p => p.enabled)
          .map(p => ({
            role: p.role,
            content: p.content.replace('{{context}}', contextStr).replace('{{notes}}', targetSet.userNotes || ''),
          }))
          .filter(m => m.content?.trim());

        if (params.globalCreationPrompt.trim())
          messages.unshift({ role: 'system', content: params.globalCreationPrompt });
        messages.push({
          role: 'user',
          content: `请重新生成第 ${index + 1} 章的大纲内容。只需返回 JSON 数组格式。`,
        });

        const completion = await openai.chat.completions.create({
          model: apiConfig.model,
          messages,
          temperature: activePreset.temperature ?? 1.0,
          top_p: activePreset.topP ?? 1.0,
        } as any);

        const content = completion.choices[0]?.message?.content || '';
        const rawData = safeParseJSONArray(content);
        const outlineData = normalizeGeneratorResult(rawData, 'outline');

        if (Array.isArray(outlineData) && outlineData.length > 0) {
          const newItem = outlineData[0];
          params.onNovelsUpdate(prev =>
            prev.map(n => {
              if (n.id === activeNovelId) {
                const newSets = (n.outlineSets || []).map(s => {
                  if (s.id === activeOutlineSetId) {
                    const newItems = [...s.items];
                    newItems[index] = newItem;
                    return { ...s, items: newItems };
                  }
                  return s;
                });
                return { ...n, outlineSets: newSets };
              }
              return n;
            }),
          );
        }
      } catch (err: any) {
        params.onError(err.message || '重生成失败');
      } finally {
        setRegeneratingOutlineItemIndices(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [],
  );

  /**
   * 角色集生成逻辑
   */
  const handleGenerateCharacters = useCallback(
    async (params: {
      mode: 'generate' | 'chat';
      source: 'module' | 'chat';
      activeNovel: Novel | undefined;
      activeCharacterSetId: string | null;
      activeCharacterPresetId: string;
      lastNonChatCharacterPresetId: string;
      characterPresets: GeneratorPreset[];
      characterModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalModel: string;
      globalCreationPrompt: string;
      maxRetries: number;
      userPrompt: string;
      activeChapter?: Chapter;
      contextLength: number;
      selectedRefs: any;
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onError: (msg: string) => void;
      onSuccess: () => void;
      characterAbortControllerRef: React.MutableRefObject<AbortController | null>;
    }) => {
      const { mode, source, activeNovel, activeCharacterSetId, characterAbortControllerRef } = params;
      let currentPresetId = params.activeCharacterPresetId;
      if (mode === 'chat') currentPresetId = 'chat';
      else if (currentPresetId === 'chat') currentPresetId = params.lastNonChatCharacterPresetId;

      const activePreset = params.characterPresets.find(p => p.id === currentPresetId) || params.characterPresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.characterModel,
        params.globalApiKey,
        params.globalBaseUrl,
        params.globalModel,
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      setIsGeneratingCharacters(true);
      characterAbortControllerRef.current = new AbortController();

      let targetSetId = activeCharacterSetId;
      let targetSet = activeNovel?.characterSets?.find(s => s.id === targetSetId);
      if (!targetSet && activeNovel?.characterSets?.length) {
        targetSet = activeNovel.characterSets[0];
        targetSetId = targetSet.id;
      }
      if (!targetSet) {
        setIsGeneratingCharacters(false);
        return;
      }

      let attempt = 0;
      const maxAttempts = params.maxRetries + 1;

      while (attempt < maxAttempts) {
        try {
          if (characterAbortControllerRef.current?.signal.aborted) break;
          logAiParams(
            '角色档案生成',
            apiConfig.model,
            activePreset.temperature ?? 1.0,
            activePreset.topP ?? 1.0,
            activePreset.topK ?? 200,
          );
          const openai = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const referenceContext = buildReferenceContext(
            activeNovel,
            params.selectedRefs.worldviewSetId,
            params.selectedRefs.worldviewIndices,
            params.selectedRefs.characterSetId,
            params.selectedRefs.characterIndices,
            params.selectedRefs.inspirationSetId,
            params.selectedRefs.inspirationIndices,
            params.selectedRefs.outlineSetId,
            params.selectedRefs.outlineIndices,
          );

          let chatContext = targetSet.chatHistory?.length
            ? '\n【对话历史】：\n' + targetSet.chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\n'
            : '';
          let mainChatContext =
            source === 'chat' && params.activeChapter?.content
              ? `\n【当前聊天记录】：\n${params.activeChapter.content.slice(
                  -Math.max(1000, params.contextLength - 5000),
                )}\n`
              : '';

          const contextStr = `${JSON.stringify(
            targetSet.characters,
            null,
            2,
          )}\n${referenceContext}\n${chatContext}\n${mainChatContext}`;

          const messages: any[] = activePreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{context}}', contextStr).replace('{{notes}}', targetSet?.userNotes || ''),
            }))
            .filter(m => m.content?.trim());

          if (params.globalCreationPrompt.trim())
            messages.unshift({ role: 'system', content: params.globalCreationPrompt });
          if (!messages.some(m => m.role === 'user'))
            messages.push({ role: 'user', content: params.userPrompt || '请生成新的角色卡。' });

          const completion = await openai.chat.completions.create(
            {
              model: apiConfig.model,
              messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            } as any,
            { signal: characterAbortControllerRef.current.signal },
          );

          const content = completion.choices[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');

          if (mode === 'chat') {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      characterSets: (n.characterSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          }

          const rawData = safeParseJSONArray(content);
          const charData = normalizeGeneratorResult(rawData, 'character');
          if (Array.isArray(charData) && charData.length > 0) {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      characterSets: (n.characterSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              characters: [...s.characters, ...charData],
                              userNotes:
                                (s.userNotes || '') + `\n[${new Date().toLocaleTimeString()}] ${params.userPrompt}`,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          } else throw new Error('Invalid format');
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          attempt++;
          if (attempt >= maxAttempts) params.onError(err.message || '生成角色出错');
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsGeneratingCharacters(false);
    },
    [],
  );

  /**
   * 世界观生成逻辑
   */
  const handleGenerateWorldview = useCallback(
    async (params: {
      mode: 'generate' | 'chat';
      source: 'module' | 'chat';
      activeNovel: Novel | undefined;
      activeWorldviewSetId: string | null;
      activeWorldviewPresetId: string;
      lastNonChatWorldviewPresetId: string;
      worldviewPresets: GeneratorPreset[];
      worldviewModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalModel: string;
      globalCreationPrompt: string;
      maxRetries: number;
      userPrompt: string;
      activeChapter?: Chapter;
      contextLength: number;
      selectedRefs: any;
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onError: (msg: string) => void;
      onSuccess: () => void;
      worldviewAbortControllerRef: React.MutableRefObject<AbortController | null>;
    }) => {
      const { mode, source, activeNovel, activeWorldviewSetId, worldviewAbortControllerRef } = params;
      let currentPresetId = params.activeWorldviewPresetId;
      if (mode === 'chat') currentPresetId = 'chat';
      else if (currentPresetId === 'chat') currentPresetId = params.lastNonChatWorldviewPresetId;

      const activePreset = params.worldviewPresets.find(p => p.id === currentPresetId) || params.worldviewPresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.worldviewModel,
        params.globalApiKey,
        params.globalBaseUrl,
        params.globalModel,
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      setIsGeneratingWorldview(true);
      worldviewAbortControllerRef.current = new AbortController();

      let targetSetId = activeWorldviewSetId;
      let targetSet = activeNovel?.worldviewSets?.find(s => s.id === targetSetId);
      if (!targetSet && activeNovel?.worldviewSets?.length) {
        targetSet = activeNovel.worldviewSets[0];
        targetSetId = targetSet.id;
      }
      if (!targetSet) {
        setIsGeneratingWorldview(false);
        return;
      }

      let attempt = 0;
      const maxAttempts = params.maxRetries + 1;

      while (attempt < maxAttempts) {
        try {
          if (worldviewAbortControllerRef.current?.signal.aborted) break;
          logAiParams(
            '世界观设定生成',
            apiConfig.model,
            activePreset.temperature ?? 1.0,
            activePreset.topP ?? 1.0,
            activePreset.topK ?? 200,
          );
          const openai = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const referenceContext = buildReferenceContext(
            activeNovel,
            params.selectedRefs.worldviewSetId,
            params.selectedRefs.worldviewIndices,
            params.selectedRefs.characterSetId,
            params.selectedRefs.characterIndices,
            params.selectedRefs.inspirationSetId,
            params.selectedRefs.inspirationIndices,
            params.selectedRefs.outlineSetId,
            params.selectedRefs.outlineIndices,
          );

          let chatContext = targetSet.chatHistory?.length
            ? '\n【对话历史】：\n' + targetSet.chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\n'
            : '';
          let mainChatContext =
            source === 'chat' && params.activeChapter?.content
              ? `\n【当前聊天记录】：\n${params.activeChapter.content.slice(
                  -Math.max(1000, params.contextLength - 5000),
                )}\n`
              : '';

          const contextStr = `${JSON.stringify(
            targetSet.entries,
            null,
            2,
          )}\n${referenceContext}\n${chatContext}\n${mainChatContext}`;

          const messages: any[] = activePreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{context}}', contextStr).replace('{{notes}}', targetSet?.userNotes || ''),
            }))
            .filter(m => m.content?.trim());

          if (params.globalCreationPrompt.trim())
            messages.unshift({ role: 'system', content: params.globalCreationPrompt });
          if (!messages.some(m => m.role === 'user'))
            messages.push({ role: 'user', content: params.userPrompt || '请生成新的世界观设定。' });

          const completion = await openai.chat.completions.create(
            {
              model: apiConfig.model,
              messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            } as any,
            { signal: worldviewAbortControllerRef.current.signal },
          );

          const content = completion.choices[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');

          if (mode === 'chat') {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      worldviewSets: (n.worldviewSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          }

          const rawData = safeParseJSONArray(content);
          const worldData = normalizeGeneratorResult(rawData, 'worldview');
          if (Array.isArray(worldData) && worldData.length > 0) {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      worldviewSets: (n.worldviewSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              entries: [...s.entries, ...worldData],
                              userNotes:
                                (s.userNotes || '') + `\n[${new Date().toLocaleTimeString()}] ${params.userPrompt}`,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          } else throw new Error('Invalid format');
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          attempt++;
          if (attempt >= maxAttempts) params.onError(err.message || '生成世界观出错');
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsGeneratingWorldview(false);
    },
    [],
  );

  /**
   * 灵感生成逻辑
   */
  const handleGenerateInspiration = useCallback(
    async (params: {
      mode: 'generate' | 'chat';
      source: 'module' | 'chat';
      activeNovel: Novel | undefined;
      activeInspirationSetId: string | null;
      activeInspirationPresetId: string;
      lastNonChatInspirationPresetId: string;
      inspirationPresets: GeneratorPreset[];
      inspirationModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalModel: string;
      globalCreationPrompt: string;
      maxRetries: number;
      userPrompt: string;
      activeChapter?: Chapter;
      contextLength: number;
      selectedRefs: any;
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onError: (msg: string) => void;
      onSuccess: () => void;
      inspirationAbortControllerRef: React.MutableRefObject<AbortController | null>;
    }) => {
      const { mode, source, activeNovel, activeInspirationSetId, inspirationAbortControllerRef } = params;
      let currentPresetId = params.activeInspirationPresetId;
      if (mode === 'chat') currentPresetId = 'chat';
      else if (currentPresetId === 'chat') currentPresetId = params.lastNonChatInspirationPresetId;

      const activePreset =
        params.inspirationPresets.find(p => p.id === currentPresetId) || params.inspirationPresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.inspirationModel,
        params.globalApiKey,
        params.globalBaseUrl,
        params.globalModel,
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      setIsGeneratingInspiration(true);
      inspirationAbortControllerRef.current = new AbortController();

      let targetSetId = activeInspirationSetId;
      let targetSet = activeNovel?.inspirationSets?.find(s => s.id === targetSetId);
      if (!targetSet && activeNovel?.inspirationSets?.length) {
        targetSet = activeNovel.inspirationSets[0];
        targetSetId = targetSet.id;
      }
      if (!targetSet) {
        setIsGeneratingInspiration(false);
        return;
      }

      let attempt = 0;
      const maxAttempts = params.maxRetries + 1;

      while (attempt < maxAttempts) {
        try {
          if (inspirationAbortControllerRef.current?.signal.aborted) break;
          logAiParams(
            '灵感脑洞生成',
            apiConfig.model,
            activePreset.temperature ?? 1.0,
            activePreset.topP ?? 1.0,
            activePreset.topK ?? 200,
          );
          const openai = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const referenceContext = buildReferenceContext(
            activeNovel,
            params.selectedRefs.worldviewSetId,
            params.selectedRefs.worldviewIndices,
            params.selectedRefs.characterSetId,
            params.selectedRefs.characterIndices,
            params.selectedRefs.inspirationSetId,
            params.selectedRefs.inspirationIndices,
            params.selectedRefs.outlineSetId,
            params.selectedRefs.outlineIndices,
          );

          let chatContext = targetSet.chatHistory?.length
            ? '\n【对话历史】：\n' + targetSet.chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\n'
            : '';
          let mainChatContext =
            source === 'chat' && params.activeChapter?.content
              ? `\n【当前聊天记录】：\n${params.activeChapter.content.slice(
                  -Math.max(1000, params.contextLength - 5000),
                )}\n`
              : '';

          const contextStr = `${JSON.stringify(
            targetSet.items,
            null,
            2,
          )}\n${referenceContext}\n${chatContext}\n${mainChatContext}`;

          const messages: any[] = activePreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{context}}', contextStr).replace('{{notes}}', targetSet?.userNotes || ''),
            }))
            .filter(m => m.content?.trim());

          if (params.globalCreationPrompt.trim())
            messages.unshift({ role: 'system', content: params.globalCreationPrompt });
          if (!messages.some(m => m.role === 'user'))
            messages.push({ role: 'user', content: params.userPrompt || '请生成新的灵感。' });

          const completion = await openai.chat.completions.create(
            {
              model: apiConfig.model,
              messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            } as any,
            { signal: inspirationAbortControllerRef.current.signal },
          );

          const content = completion.choices[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');

          if (mode === 'chat') {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      inspirationSets: (n.inspirationSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          }

          const rawData = safeParseJSONArray(content);
          const inspirationData = normalizeGeneratorResult(rawData, 'inspiration');
          if (Array.isArray(inspirationData) && inspirationData.length > 0) {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      inspirationSets: (n.inspirationSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              items: [...s.items, ...inspirationData],
                              userNotes:
                                (s.userNotes || '') + `\n[${new Date().toLocaleTimeString()}] ${params.userPrompt}`,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          } else throw new Error('Invalid format');
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          attempt++;
          if (attempt >= maxAttempts) params.onError(err.message || '生成灵感出错');
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsGeneratingInspiration(false);
    },
    [],
  );

  /**
   * 剧情粗纲生成逻辑
   */
  const handleGeneratePlotOutline = useCallback(
    async (params: {
      mode: 'generate' | 'chat';
      source: 'module' | 'chat';
      activeNovel: Novel | undefined;
      activePlotOutlineSetId: string | null;
      activePlotOutlinePresetId: string;
      lastNonChatPlotOutlinePresetId: string;
      plotOutlinePresets: GeneratorPreset[];
      plotOutlineModel: string;
      globalApiKey: string;
      globalBaseUrl: string;
      globalModel: string;
      globalCreationPrompt: string;
      maxRetries: number;
      userPrompt: string;
      selectedRefs: any;
      onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
      onError: (msg: string) => void;
      onSuccess: () => void;
      generateAbortControllerRef: React.MutableRefObject<AbortController | null>;
    }) => {
      const { mode, activeNovel, activePlotOutlineSetId, generateAbortControllerRef } = params;
      let currentPresetId = params.activePlotOutlinePresetId;
      if (mode === 'chat') currentPresetId = 'chat';
      else if (currentPresetId === 'chat') currentPresetId = params.lastNonChatPlotOutlinePresetId;

      const activePreset =
        params.plotOutlinePresets.find(p => p.id === currentPresetId) || params.plotOutlinePresets[0];
      const apiConfig = getApiConfig(
        activePreset.apiConfig,
        params.plotOutlineModel,
        params.globalApiKey,
        params.globalBaseUrl,
        params.globalModel,
      );

      if (!apiConfig.apiKey) {
        params.onError('请先配置 API Key');
        return;
      }

      setIsGeneratingPlotOutline(true);
      generateAbortControllerRef.current = new AbortController();

      let targetSetId = activePlotOutlineSetId;
      let targetSet = activeNovel?.plotOutlineSets?.find(s => s.id === targetSetId);
      if (!targetSet && activeNovel?.plotOutlineSets?.length) {
        targetSet = activeNovel.plotOutlineSets[0];
        targetSetId = targetSet.id;
      }
      if (!targetSet) {
        setIsGeneratingPlotOutline(false);
        return;
      }

      let attempt = 0;
      const maxAttempts = params.maxRetries + 1;

      while (attempt < maxAttempts) {
        try {
          if (generateAbortControllerRef.current?.signal.aborted) break;
          logAiParams(
            '剧情粗纲生成',
            apiConfig.model,
            activePreset.temperature ?? 1.0,
            activePreset.topP ?? 1.0,
            activePreset.topK ?? 200,
          );
          const openai = new OpenAI({
            apiKey: apiConfig.apiKey,
            baseURL: apiConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const referenceContext = buildReferenceContext(
            activeNovel,
            params.selectedRefs.worldviewSetId,
            params.selectedRefs.worldviewIndices,
            params.selectedRefs.characterSetId,
            params.selectedRefs.characterIndices,
            params.selectedRefs.inspirationSetId,
            params.selectedRefs.inspirationIndices,
            params.selectedRefs.outlineSetId,
            params.selectedRefs.outlineIndices,
          );

          const contextStr = `${JSON.stringify(targetSet.items, null, 2)}\n${referenceContext}`;

          const messages: any[] = activePreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{context}}', contextStr).replace('{{notes}}', targetSet?.userNotes || ''),
            }))
            .filter(m => m.content?.trim());

          if (params.globalCreationPrompt.trim())
            messages.unshift({ role: 'system', content: params.globalCreationPrompt });
          if (!messages.some(m => m.role === 'user'))
            messages.push({ role: 'user', content: params.userPrompt || '请生成剧情粗纲。' });

          const completion = await openai.chat.completions.create(
            {
              model: apiConfig.model,
              messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            } as any,
            { signal: generateAbortControllerRef.current.signal },
          );

          const content = completion.choices[0]?.message?.content || '';
          if (!content) throw new Error('Empty response');

          if (mode === 'chat') {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      plotOutlineSets: (n.plotOutlineSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              chatHistory: [
                                ...(s.chatHistory || []),
                                { role: 'user', content: params.userPrompt },
                                { role: 'assistant', content },
                              ],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          }

          const rawData = safeParseJSONArray(content);
          const processItems = (items: any[]): PlotOutlineItem[] => {
            if (!Array.isArray(items)) return [];
            return items
              .map(item => {
                if (typeof item !== 'object' || !item) return null;
                return {
                  id:
                    item.id ||
                    (typeof crypto.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : Date.now().toString(36) + Math.random().toString(36).substring(2)),
                  title: item.title || item.name || item.header || item.label || '未命名',
                  description: item.description || item.content || item.setting || item.summary || item.plot || '',
                  type: item.type || '剧情',
                  children: item.children ? processItems(item.children) : [],
                } as PlotOutlineItem;
              })
              .filter((i): i is PlotOutlineItem => i !== null);
          };
          const plotData = processItems(rawData);

          if (Array.isArray(plotData) && plotData.length > 0) {
            params.onNovelsUpdate(prev =>
              prev.map(n =>
                n.id === activeNovel?.id
                  ? {
                      ...n,
                      plotOutlineSets: (n.plotOutlineSets || []).map(s =>
                        s.id === targetSetId
                          ? {
                              ...s,
                              items: [...s.items, ...plotData],
                              chatHistory: [...(s.chatHistory || []), { role: 'assistant', content }],
                            }
                          : s,
                      ),
                    }
                  : n,
              ),
            );
            params.onSuccess();
            break;
          } else throw new Error('Invalid format');
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          attempt++;
          if (attempt >= maxAttempts) params.onError(err.message || '生成剧情粗纲出错');
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsGeneratingPlotOutline(false);
    },
    [],
  );

  return {
    isLoading,
    isGeneratingOutline,
    outlineStatus,
    isGeneratingCharacters,
    isGeneratingWorldview,
    isGeneratingInspiration,
    isGeneratingPlotOutline,
    regeneratingOutlineItemIndices,
    handleGenerateOutline,
    handleGenerateCharacters,
    handleGenerateWorldview,
    handleGenerateInspiration,
    handleGeneratePlotOutline,
    handleRegenerateOutlineItem,
    /**
     * 对话续写生成逻辑 (迁移自 App.tsx: handleGenerate)
     */
    handleGenerate: useCallback(
      async (params: {
        activeChapter: Chapter | undefined;
        activeNovel: Novel | undefined;
        activeOutlineSetId: string | null;
        apiKey: string;
        baseUrl: string;
        contextLength: number;
        includeFullOutlineInAutoWrite: boolean;
        systemPrompt: string;
        prompts: PromptItem[];
        userPrompt: string;
        temperature: number;
        topP: number;
        topK: number;
        stream: boolean;
        presencePenalty: number;
        frequencyPenalty: number;
        maxReplyLength: number;
        maxRetries: number;
        outlineModel: string;
        model: string;
        presetApiConfig: PresetApiConfig | undefined;
        longTextMode: boolean;
        contextScope: string;
        contextChapterCount: number;
        autoOptimize: boolean;
        onNovelsUpdate: (updater: (prev: Novel[]) => Novel[]) => void;
        setChapters: (updater: (prev: Chapter[]) => Chapter[]) => void;
        onSuccess: () => void;
        onError: (msg: string) => void;
        getActiveScripts: () => RegexScript[];
        checkAndGenerateSummary: (
          id: number,
          content: string,
          nid: string,
          updatedNovel?: Novel,
          signal?: AbortSignal,
          forceFinal?: boolean,
          rid?: string | null,
        ) => Promise<any>;
        handleOptimize: (id: number, content: string) => Promise<void>;
        generateAbortControllerRef: React.MutableRefObject<AbortController | null>;
      }) => {
        const { apiKey, activeChapter, activeNovel, generateAbortControllerRef } = params;

        if (!apiKey) {
          params.onError('请先在设置中配置 API Key');
          return;
        }

        if (!activeChapter) {
          params.onError('请先选择或创建一个章节');
          return;
        }

        setIsLoading(true);
        generateAbortControllerRef.current = new AbortController();

        let currentContent = activeChapter.content;
        if (currentContent) currentContent += '\n\n';

        const contextMessages = getChapterContextMessages(activeNovel || undefined, activeChapter, {
          longTextMode: params.longTextMode,
          contextScope: params.contextScope,
          contextChapterCount: params.contextChapterCount,
        });

        let attempt = 0;
        const maxAttempts = params.maxRetries + 1;

        while (attempt < maxAttempts) {
          try {
            if (generateAbortControllerRef.current?.signal.aborted) break;
            const config = getApiConfig(params.presetApiConfig, '', params.apiKey, params.baseUrl, params.model);

            logAiParams('对话续写生成', config.model, params.temperature, params.topP, params.topK);

            const openai = new OpenAI({
              apiKey: config.apiKey,
              baseURL: config.baseUrl,
              dangerouslyAllowBrowser: true,
            });

            const scripts = params.getActiveScripts();
            const worldInfoMessages = buildWorldInfoMessages(activeNovel || undefined, params.activeOutlineSetId);

            const referenceLibraryStr = buildReferenceContext(activeNovel, null, [], null, [], null, [], null, []);

            let outlineContent = '';
            if (params.activeOutlineSetId) {
              const currentOutlineSet = activeNovel?.outlineSets?.find(s => s.id === params.activeOutlineSetId);
              if (currentOutlineSet && currentOutlineSet.items.length > 0) {
                if (params.includeFullOutlineInAutoWrite) {
                  outlineContent = currentOutlineSet.items
                    .map((item, idx) => `${idx + 1}. ${item.title}: ${item.summary}`)
                    .join('\n');
                } else {
                  const matchedItem = currentOutlineSet.items.find(item => item.title === activeChapter?.title);
                  if (matchedItem) outlineContent = `${matchedItem.title}: ${matchedItem.summary}`;
                  else
                    outlineContent = currentOutlineSet.items
                      .slice(0, 5)
                      .map((item, idx) => `${idx + 1}. ${item.title}: ${item.summary}`)
                      .join('\n');
                }
              }
            }

            const messages: any[] = [{ role: 'system', content: params.systemPrompt }];
            messages.push(...worldInfoMessages);
            if (referenceLibraryStr)
              messages.push({ role: 'system', content: `【写作参考资料】：\n${referenceLibraryStr}` });
            if (outlineContent)
              messages.push({ role: 'system', content: `【本章大纲/剧情走向】：\n${outlineContent}` });

            for (const p of params.prompts.filter(p => p.active && !p.isFixed)) {
              if (p.content && p.content.trim()) messages.push({ role: p.role, content: p.content });
            }

            messages.push(...contextMessages);
            const chapterTitle = activeChapter?.title || '当前章节';
            const currentChapterContent = activeChapter.content || '';
            if (currentChapterContent) {
              messages.push({
                role: 'system',
                content: `【当前章节 - ${chapterTitle} (已写部分)】：\n${currentChapterContent}`,
              });
            }

            const processedUserPrompt = await processTextWithRegex(params.userPrompt, scripts, 'input');
            messages.push({
              role: 'user',
              content: processedUserPrompt || '请根据大纲和前文，继续撰写后续正文。文笔要生动流畅，保持风格一致。',
            });

            const response = (await openai.chat.completions.create(
              {
                model: config.model,
                messages,
                stream: params.stream,
                temperature: params.temperature,
                top_p: params.topP,
                top_k: params.topK > 0 ? params.topK : 200,
                presence_penalty: params.presencePenalty,
                frequency_penalty: params.frequencyPenalty,
                max_tokens: params.maxReplyLength,
              } as any,
              {
                signal: generateAbortControllerRef.current.signal,
              },
            )) as any;

            let newGeneratedContent = '';
            let hasReceivedContent = false;

            if (params.stream) {
              let lastUpdateTime = 0;
              for await (const chunk of response) {
                if (generateAbortControllerRef.current?.signal.aborted) throw new Error('Aborted');
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) hasReceivedContent = true;
                newGeneratedContent += content;

                const now = Date.now();
                if (now - lastUpdateTime > 150) {
                  lastUpdateTime = now;
                  const fullRawContent = currentContent + newGeneratedContent;
                  params.setChapters(prev =>
                    prev.map(c => {
                      if (c.id === activeChapter.id) {
                        let chapterWithHistory = ensureChapterVersions(c);
                        const continueId = `v_continue_${c.id}`;
                        let versions = [...(chapterWithHistory.versions || [])];
                        let verIdx = versions.findIndex(v => v.id === continueId);
                        if (verIdx !== -1) versions[verIdx] = { ...versions[verIdx], content: fullRawContent };
                        else
                          versions.push({
                            id: continueId,
                            content: fullRawContent,
                            timestamp: Date.now(),
                            type: 'user_edit',
                          });
                        return { ...c, content: fullRawContent, versions, activeVersionId: continueId };
                      }
                      return c;
                    }),
                  );
                }
              }
            } else {
              if (generateAbortControllerRef.current?.signal.aborted) throw new Error('Aborted');
              newGeneratedContent = response.choices[0]?.message?.content || '';
              if (newGeneratedContent) hasReceivedContent = true;
            }

            if (!hasReceivedContent) throw new Error('Empty response received');

            const originalFullContent = currentContent + newGeneratedContent;
            const processedFullContent =
              currentContent + (await processTextWithRegex(newGeneratedContent, scripts, 'output'));

            params.setChapters(prev =>
              prev.map(c => {
                if (c.id === activeChapter.id) {
                  return ensureChapterVersions({
                    ...c,
                    content: processedFullContent,
                    sourceContent: originalFullContent,
                  });
                }
                return c;
              }),
            );

            if (params.longTextMode) {
              const continueRunId = workflowManager.registerManualRun('continue');
              params.checkAndGenerateSummary(
                activeChapter.id,
                processedFullContent,
                params.activeNovel?.id || '',
                undefined,
                generateAbortControllerRef.current?.signal,
                false,
                continueRunId,
              );
            }

            if (params.autoOptimize) {
              await params.handleOptimize(activeChapter.id, processedFullContent);
            }

            params.onSuccess();
            break;
          } catch (err: any) {
            if (err.name === 'AbortError') break;
            attempt++;
            if (attempt >= maxAttempts) params.onError(err.message || '生成出错');
            else await new Promise(r => setTimeout(r, 1000));
          }
        }
        setIsLoading(false);
      },
      [],
    ),
    setIsGeneratingCharacters,
    setIsGeneratingWorldview,
    setIsGeneratingInspiration,
    setIsGeneratingPlotOutline,
    setIsGeneratingOutline,
    setOutlineStatus,
    setRegeneratingOutlineItemIndices,
  };
}

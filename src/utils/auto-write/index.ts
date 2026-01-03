import OpenAI from 'openai';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel, OutlineItem, PromptItem, RegexScript } from '../../types';
import { buildWorldInfoContext, getChapterContext, processTextWithRegex } from './core';
import { AutoWriteConfig } from './types';

export class AutoWriteEngine {
  private config: AutoWriteConfig;
  private novel: Novel;
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;
  private activeOptimizationTasks = new Map<number, AbortController>();

  constructor(config: AutoWriteConfig, novel: Novel) {
    this.config = config;
    this.novel = novel;
  }

  public stop() {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    // 中止所有正在进行的异步优化任务
    this.activeOptimizationTasks.forEach(controller => controller.abort());
    this.activeOptimizationTasks.clear();
  }

  public async run(
    outline: OutlineItem[],
    startIndex: number,
    activePrompts: PromptItem[],
    getActiveScripts: () => RegexScript[],
    onStatusUpdate: (status: string) => void,
    onNovelUpdate: (novel: Novel) => void,
    onChapterComplete: (chapterId: number, content: string, updatedNovel?: Novel) => Promise<Novel | void>,
    targetVolumeId?: string,
    includeFullOutline: boolean = false,
    outlineSetId: string | null = null,
    signal?: AbortSignal,
  ) {
    this.isRunning = true;
    this.abortController = new AbortController();

    // 监听外部停止信号
    if (signal) {
      if (signal.aborted) {
        this.stop();
        return;
      }
      signal.addEventListener('abort', () => this.stop());
    }

    if (startIndex >= outline.length) {
      onStatusUpdate('创作完成！');
      this.isRunning = false;
      return;
    }

    const maxBatchSize = this.config.consecutiveChapterCount > 1 ? this.config.consecutiveChapterCount : 1;

    while (startIndex < outline.length && this.isRunning) {
      const batchItems: { item: OutlineItem; idx: number; id: number }[] = [];

      for (let i = 0; i < maxBatchSize; i++) {
        const currIdx = startIndex + i;
        if (currIdx >= outline.length) break;

        const item = outline[currIdx];
        const existingChapter = this.novel.chapters.find(c => c.title === item.title);

        if (existingChapter && existingChapter.content && existingChapter.content.trim().length > 0) {
          if (batchItems.length === 0) {
            console.log(`[AutoWrite] Skipping existing chapter: ${item.title}`);
            startIndex++;
            continue;
          } else {
            break;
          }
        }

        batchItems.push({
          item,
          idx: currIdx,
          id: existingChapter ? existingChapter.id : Date.now() + Math.floor(Math.random() * 100000),
        });
      }

      if (batchItems.length === 0) {
        if (startIndex >= outline.length) break;
        continue;
      }

      // Apply placeholders
      const newChapters = [...this.novel.chapters];
      batchItems.forEach(batchItem => {
        const existingById = newChapters.find(c => c.id === batchItem.id);
        const existingByTitle = newChapters.find(c => c.title === batchItem.item.title);

        if (!existingById && !existingByTitle) {
          newChapters.push({
            id: batchItem.id,
            title: batchItem.item.title,
            content: '',
            volumeId: targetVolumeId,
          });
        } else if (existingByTitle) {
          batchItem.id = existingByTitle.id;
          // 深度修复：即便章节已存在，如果它处于“未分卷”状态，且当前生成任务明确了目标分卷，
          // 则在执行时将其归类到该分卷中。这解决了用户看到的“空卷”且章节在“未分卷”中的问题。
          if ((!existingByTitle.volumeId || existingByTitle.volumeId === '') && targetVolumeId) {
            existingByTitle.volumeId = targetVolumeId;
          }
        }
      });
      this.novel = { ...this.novel, chapters: newChapters };
      onNovelUpdate(this.novel);

      const batchStatusStr = batchItems.map(b => b.item.title).join('、');
      onStatusUpdate(`正在创作：${batchStatusStr}`);

      let attempt = 0;
      const maxAttempts = this.config.maxRetries + 1;
      let success = false;

      while (attempt < maxAttempts && this.isRunning) {
        try {
          terminal.log(`
>> AI REQUEST [全自动正文创作]
>> -----------------------------------------------------------
>> Model:       ${this.config.model}
>> Temperature: ${this.config.temperature}
>> Top P:       ${this.config.topP}
>> Top K:       ${this.config.topK}
>> -----------------------------------------------------------
          `);

          const openai = new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const firstChapterInBatch = this.novel.chapters.find(c => c.id === batchItems[0].id);
          if (!firstChapterInBatch) throw new Error('Chapter placeholder missing');

          const rawContext = getChapterContext(this.novel, firstChapterInBatch, {
            longTextMode: this.config.longTextMode,
            contextScope: 'all', // Default to all for now
            contextChapterCount: this.config.contextChapterCount,
          });

          const scripts = getActiveScripts();
          const processedContext = processTextWithRegex(rawContext, scripts, 'input');
          const contextMsg = processedContext ? `【前文剧情回顾】：\n${processedContext}\n\n` : '';

          const fullOutlineContext = includeFullOutline
            ? `【全书粗纲参考】：\n${outline
                .map((item, i) => `${i + 1}. ${item.title}: ${item.summary}`)
                .join('\n')}\n\n`
            : '';

          const worldInfo = buildWorldInfoContext(this.novel, outlineSetId);

          let taskDescription = '';
          if (batchItems.length > 1) {
            taskDescription = `请一次性撰写以下 ${batchItems.length} 章的内容。\n**重要：请严格使用 "### 章节标题" 作为每一章的分隔符。**\n\n`;
            batchItems.forEach((b, idx) => {
              taskDescription += `第 ${idx + 1} 部分：\n标题：${b.item.title}\n大纲：${b.item.summary}\n\n`;
            });
            taskDescription += `\n请开始撰写，确保内容连贯，不要包含任何多余的解释，直接输出正文。格式示例：\n### ${batchItems[0].item.title}\n(第一章正文...)\n### ${batchItems[1].item.title}\n(第二章正文...)\n`;
          } else {
            taskDescription = `当前章节：${batchItems[0].item.title}\n本章大纲：${batchItems[0].item.summary}\n\n请根据大纲和前文剧情，撰写本章正文。文笔要生动流畅。`;
          }

          const mainPrompt = `${worldInfo}${contextMsg}${fullOutlineContext}你正在创作小说《${this.novel.title}》。\n${taskDescription}`;

          const messages: any[] = [{ role: 'system', content: this.config.systemPrompt }];

          activePrompts.forEach(p => {
            if (!p.isFixed && p.content && p.content.trim()) {
              messages.push({ role: p.role, content: p.content });
            }
          });
          messages.push({ role: 'user', content: mainPrompt });

          const batchMaxTokens =
            this.config.maxReplyLength * batchItems.length > 128000
              ? 128000
              : this.config.maxReplyLength * (batchItems.length > 1 ? 1.5 : 1);

          const response = (await openai.chat.completions.create(
            {
              model: this.config.model,
              messages: messages,
              stream: this.config.stream,
              temperature: this.config.temperature,
              top_p: this.config.topP,
              top_k: this.config.topK,
              max_tokens: Math.round(batchMaxTokens),
            } as any,
            {
              signal: this.abortController?.signal,
            },
          )) as any;

          let fullGeneratedContent = '';

          if (this.config.stream) {
            for await (const chunk of response) {
              if (!this.isRunning) throw new Error('Aborted');
              const content = chunk.choices[0]?.delta?.content || '';
              fullGeneratedContent += content;

              // Intermediate update for first chapter
              this.novel = {
                ...this.novel,
                chapters: this.novel.chapters.map(c =>
                  c.id === batchItems[0].id ? { ...c, content: fullGeneratedContent } : c,
                ),
              };
              onNovelUpdate(this.novel);
            }
          } else {
            fullGeneratedContent = response.choices[0]?.message?.content || '';
          }

          if (!fullGeneratedContent) throw new Error('Empty response received');

          // Split logic
          let finalContents: string[] = [];
          if (batchItems.length > 1) {
            const ranges: { start: number; id: number }[] = [];
            for (let i = 0; i < batchItems.length; i++) {
              const title = batchItems[i].item.title;
              const regex = new RegExp(`###\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
              const match = fullGeneratedContent.match(regex);
              if (match && match.index !== undefined) {
                ranges.push({ start: match.index, id: batchItems[i].id });
              }
            }

            if (ranges.length < batchItems.length) {
              finalContents = fullGeneratedContent
                .split(/(?:\r\n|\r|\n|^)###\s*[^\n]*\n/)
                .filter(p => p.trim().length > 0);
            } else {
              ranges.sort((a, b) => a.start - b.start);
              for (let i = 0; i < ranges.length; i++) {
                const nextStart = i < ranges.length - 1 ? ranges[i + 1].start : fullGeneratedContent.length;
                const r = ranges[i];
                const newlineIdx = fullGeneratedContent.indexOf('\n', r.start);
                const contentStart = newlineIdx !== -1 ? newlineIdx + 1 : r.start;
                finalContents[i] = fullGeneratedContent.substring(contentStart, nextStart).trim();
              }
            }
            while (finalContents.length < batchItems.length) {
              finalContents.push(`(生成错误：未能解析到此章节内容)`);
            }
          } else {
            finalContents = [fullGeneratedContent];
          }

          finalContents = finalContents.map(c => processTextWithRegex(c, scripts, 'output'));

          // 这里的更新逻辑非常关键，需要初始化 versions
          const baseTime = Date.now();
          this.novel = {
            ...this.novel,
            chapters: this.novel.chapters.map(c => {
              const bIdx = batchItems.findIndex(b => b.id === c.id);
              if (bIdx !== -1) {
                const content = finalContents[bIdx] || '';
                const originalVersion: ChapterVersion = {
                  id: `v_${baseTime}_orig_${c.id}`,
                  content: content,
                  timestamp: baseTime,
                  type: 'original',
                };
                return {
                  ...c,
                  content: content,
                  versions: [originalVersion],
                  activeVersionId: originalVersion.id,
                };
              }
              return c;
            }),
          };
          onNovelUpdate(this.novel);

          // 执行优化逻辑
          for (let i = 0; i < batchItems.length; i++) {
            const chapterId = batchItems[i].id;
            const content = finalContents[i];

            if (content && content.trim() && (this.config.autoOptimize || this.config.twoStepOptimization)) {
              if (this.config.asyncOptimize) {
                // 异步模式：不等待优化完成，立即进行下一章或上报完成
                this.optimizeChapter(chapterId, content, onStatusUpdate, onNovelUpdate);
                await onChapterComplete(chapterId, content, this.novel);
              } else {
                // 线性模式：等待优化完成
                await this.optimizeChapter(chapterId, content, onStatusUpdate, onNovelUpdate);
                const updatedChapter = this.novel.chapters.find(c => c.id === chapterId);
                await onChapterComplete(chapterId, updatedChapter?.content || content, this.novel);
              }
            } else {
              await onChapterComplete(chapterId, content, this.novel);
            }
          }

          success = true;
          startIndex += batchItems.length;
          break;
        } catch (err: any) {
          if (err.name === 'AbortError' || !this.isRunning) return;
          attempt++;
          if (attempt >= maxAttempts) {
            onStatusUpdate(`生成失败：${err.message}`);
            this.isRunning = false;
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 等待所有异步优化任务完成，确保节点状态正确结束
    if (this.activeOptimizationTasks.size > 0 && this.isRunning) {
      onStatusUpdate(`正在完成最后的优化 (${this.activeOptimizationTasks.size}个任务)...`);
      while (this.activeOptimizationTasks.size > 0 && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (this.isRunning) {
      onStatusUpdate('创作完成！');
      this.isRunning = false;
    }
  }

  private async optimizeChapter(
    chapterId: number,
    sourceContent: string,
    onStatusUpdate: (status: string) => void,
    onNovelUpdate: (novel: Novel) => void,
  ) {
    // 并发控制
    const maxConcurrent = this.config.maxConcurrentOptimizations || 3;
    if (this.activeOptimizationTasks.size >= maxConcurrent) {
      // 如果超过最大并发，且是异步模式，则等待一段时间重试或跳过（这里简单处理：如果是线性模式会自然等待，异步模式则简单排队）
      if (this.config.asyncOptimize) {
        let waitCount = 0;
        while (this.activeOptimizationTasks.size >= maxConcurrent && this.isRunning && waitCount < 30) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          waitCount++;
        }
      }
    }

    const optimizationAbortController = new AbortController();
    this.activeOptimizationTasks.set(chapterId, optimizationAbortController);

    const activePreset =
      this.config.optimizePresets?.find(p => p.id === this.config.activeOptimizePresetId) ||
      this.config.optimizePresets?.[0];
    if (!activePreset) return;

    onStatusUpdate(`优化中 (${this.activeOptimizationTasks.size}个任务)...`);
    const baseTime = Date.now();
    let currentAnalysisResult = '';

    const openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    // Phase 1: Analysis
    if (this.config.twoStepOptimization) {
      try {
        const analysisPreset =
          this.config.analysisPresets?.find(p => p.id === this.config.activeAnalysisPresetId) ||
          this.config.analysisPresets?.[0];
        if (analysisPreset) {
          onStatusUpdate(`优化分析中...`);
          const analysisMessages: any[] = analysisPreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{content}}', sourceContent).replace('{{input}}', ''),
            }));

          const completion = await openai.chat.completions.create(
            {
              model: this.config.model,
              messages: analysisMessages,
              temperature: analysisPreset.temperature ?? 1.0,
            } as any,
            { signal: optimizationAbortController.signal },
          );

          currentAnalysisResult = completion.choices[0]?.message?.content || '';

          this.novel = {
            ...this.novel,
            chapters: this.novel.chapters.map(c =>
              c.id === chapterId ? { ...c, analysisResult: currentAnalysisResult } : c,
            ),
          };
          onNovelUpdate(this.novel);
        }
      } catch (e) {
        terminal.error(`[AutoWrite Optimize] Analysis failed: ${e}`);
      }
    }

    // Phase 2: Optimization
    try {
      let isAnalysisUsed = false;
      const messages: any[] = activePreset.prompts
        .filter(p => p.enabled)
        .map(p => {
          let content = p.content.replace('{{content}}', sourceContent).replace('{{input}}', '');
          if (currentAnalysisResult && content.includes('{{analysis}}')) {
            content = content.replace('{{analysis}}', currentAnalysisResult);
            isAnalysisUsed = true;
          }
          return { role: p.role, content };
        });

      if (currentAnalysisResult && !isAnalysisUsed) {
        messages.push({ role: 'user', content: `请基于以下修改建议优化正文：\n\n${currentAnalysisResult}` });
      }

      const completion = await openai.chat.completions.create(
        {
          model: this.config.model,
          messages: messages,
          temperature: activePreset.temperature ?? 1.0,
        } as any,
        { signal: optimizationAbortController.signal },
      );

      const optimizedContent = completion.choices[0]?.message?.content || '';
      if (optimizedContent) {
        const optVersion: ChapterVersion = {
          id: `v_${baseTime}_opt_${chapterId}`,
          content: optimizedContent,
          timestamp: baseTime,
          type: 'optimized',
        };

        this.novel = {
          ...this.novel,
          chapters: this.novel.chapters.map(c => {
            if (c.id === chapterId) {
              const versions = [...(c.versions || [])];
              versions.push(optVersion);
              return {
                ...c,
                content: optimizedContent,
                versions: versions,
                activeVersionId: optVersion.id,
              };
            }
            return c;
          }),
        };
        onNovelUpdate(this.novel);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        terminal.log(`[AutoWrite Optimize] Optimization for chapter ${chapterId} aborted.`);
      } else {
        terminal.error(`[AutoWrite Optimize] Optimization failed for chapter ${chapterId}: ${e}`);
      }
    } finally {
      this.activeOptimizationTasks.delete(chapterId);
    }
  }
}

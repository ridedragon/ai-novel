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
            console.log(`[AutoWrite] Skipping existing chapter and checking for summaries: ${item.title}`);
            // 即使跳过已存在的章节，也触发一次完成回调，确保由于跳过导致的缺失总结能被补全
            const resultNovel = await onChapterComplete(existingChapter.id, existingChapter.content, this.novel);
            if (resultNovel && typeof resultNovel === 'object' && (resultNovel as Novel).chapters) {
              this.novel = resultNovel as Novel;
            }
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
      const taskStartTime = Date.now(); // 锁定本次任务起始时间戳，保证流式、重试及完成态 ID 一致

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
          const processedContext = await processTextWithRegex(rawContext, scripts, 'input');
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
            let lastUpdateTime = 0;
            let streamTokenCount = 0;
            let streamUpdateCount = 0;

            // 优化：预编译章节标题匹配正则，避免流式输出时高频创建正则对象
            const precompiledRegexes = batchItems.map(b => {
              const escapedTitle = b.item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return new RegExp(`(?:\\r\\n|\\r|\\n|^)###\\s*${escapedTitle}(?:\\s|\\r|\\n|$)`, 'i');
            });

            for await (const chunk of response) {
              if (!this.isRunning || this.abortController?.signal.aborted) throw new Error('Aborted');
              const content = chunk.choices[0]?.delta?.content || '';
              fullGeneratedContent += content;
              streamTokenCount++;
              if (streamTokenCount % 50 === 0) {
                terminal.log(`[AUTOWRITE] 正在生成流式内容: 已接收 ${streamTokenCount} tokens...`);
              }

              const now = Date.now();
              // 节流处理：每 200ms 更新一次 UI，防止高频重绘导致的闪烁和性能下降
              if (now - lastUpdateTime < 200) continue;

              streamUpdateCount++;
              lastUpdateTime = now;

              // 支持流式分章节更新
              const liveContents =
                batchItems.length > 1
                  ? this.splitBatchContent(fullGeneratedContent, batchItems, precompiledRegexes)
                  : [fullGeneratedContent];

              this.novel = {
                ...this.novel,
                chapters: this.novel.chapters.map(c => {
                  const bIdx = batchItems.findIndex(b => b.id === c.id);
                  if (bIdx !== -1) {
                    const updatedContent = liveContents[bIdx] || '';
                    // 多章节模式下，如果后续章节还没有内容，不要清空它们
                    if (!updatedContent && batchItems.length > 1 && bIdx > 0) return c;

                    let currentVersions = [...(c.versions || [])];
                    let currentActiveVersionId = c.activeVersionId;

                    // 1. 初始保护：如果原本有内容且无版本历史，将其锁定为 original
                    if (currentVersions.length === 0 && c.content?.trim()) {
                      const originalVersion: ChapterVersion = {
                        id: `v_${taskStartTime}_orig_${c.id}`,
                        content: c.content,
                        timestamp: taskStartTime,
                        type: 'original',
                      };
                      currentVersions = [originalVersion];
                    }

                    // 2. 更新 AI 创作版本
                    const aiVersionId = `v_${taskStartTime}_autowrite_${c.id}`;
                    const existingAiVerIdx = currentVersions.findIndex(v => v.id === aiVersionId);

                    if (existingAiVerIdx !== -1) {
                      currentVersions[existingAiVerIdx] = {
                        ...currentVersions[existingAiVerIdx],
                        content: updatedContent,
                      };
                    } else if (updatedContent.trim()) {
                      // 仅在有实际内容时创建版本，避免 0 字符原文标签
                      // 特殊修复：如果 currentVersions 中唯一的版本内容为空（之前误创建的 0 字符原文），则直接覆盖它
                      if (currentVersions.length === 1 && !currentVersions[0].content.trim()) {
                        currentVersions[0] = {
                          ...currentVersions[0],
                          id: aiVersionId,
                          content: updatedContent,
                          timestamp: taskStartTime,
                          type: 'original',
                        };
                        currentActiveVersionId = aiVersionId;
                      } else {
                        const isFirstContent = currentVersions.length === 0;
                        currentVersions.push({
                          id: aiVersionId,
                          content: updatedContent,
                          timestamp: taskStartTime,
                          type: isFirstContent ? 'original' : 'user_edit',
                        });
                        currentActiveVersionId = aiVersionId;
                      }
                    }

                    return {
                      ...c,
                      content: updatedContent,
                      versions: currentVersions,
                      activeVersionId: currentActiveVersionId || c.activeVersionId,
                    };
                  }
                  return c;
                }),
              };
              onNovelUpdate(this.novel);
            }
            const avgUpdateFreq = streamUpdateCount / ((Date.now() - taskStartTime) / 1000);
            terminal.log(
              `[PERF] 流式输出统计: Token总数=${streamTokenCount}, 触发状态更新次数=${streamUpdateCount}, 预估平均每秒更新=${avgUpdateFreq.toFixed(
                1,
              )}次`,
            );
            if (avgUpdateFreq > 10) {
              terminal.warn(
                `[FREQ ALERT] AutoWrite 流式更新频率过高: 平均每秒达 ${avgUpdateFreq.toFixed(1)} 次 (建议调大节流阈值)`,
              );
            }
          } else {
            fullGeneratedContent = response.choices[0]?.message?.content || '';
          }

          if (!fullGeneratedContent) throw new Error('Empty response received');

          // Split logic
          // 优化：重用预编译正则
          const finalRegexes = batchItems.map(b => {
            const escapedTitle = b.item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(?:\\r\\n|\\r|\\n|^)###\\s*${escapedTitle}(?:\\s|\\r|\\n|$)`, 'i');
          });
          let finalContents = this.splitBatchContent(fullGeneratedContent, batchItems, finalRegexes);

          // 兜底处理：如果分割出来的有效章节数不足，尝试更激进的正则分割
          if (batchItems.length > 1 && finalContents.filter(c => c.trim()).length < batchItems.length) {
            const aggressiveSplit = fullGeneratedContent
              .split(/(?:\r\n|\r|\n|^)###\s*[^\n]*/)
              .filter(p => p.trim().length > 0);

            if (aggressiveSplit.length >= batchItems.length) {
              finalContents = aggressiveSplit.slice(0, batchItems.length);
            }
          }

          // 确保长度一致，避免后续遍历越界
          while (finalContents.length < batchItems.length) {
            finalContents.push(`(生成错误：未能解析到此章节内容)`);
          }

          const processedContents: string[] = [];
          for (const content of finalContents) {
            processedContents.push(await processTextWithRegex(content, scripts, 'output'));
          }
          finalContents = processedContents;

          // 【BUG 风险点 - 原文丢失】：批量生成后的版本强行覆盖
          // 谨慎修改：在全自动创作完成时，此处会为章节强行初始化 versions。
          // 它将 AI 生成的最终正文（content）直接作为 original 版本存入。
          // 如果该章节 ID 对应的是一个用户已经手动修改过的章节，那么用户的手动修改在此处会被 AI 内容彻底抹除。
          this.novel = {
            ...this.novel,
            chapters: this.novel.chapters.map(c => {
              const bIdx = batchItems.findIndex(b => b.id === c.id);
              if (bIdx !== -1) {
                const content = finalContents[bIdx] || '';

                let currentVersions = [...(c.versions || [])];
                // 核心修复：使用 taskStartTime 而非 Date.now()，确保与流式阶段 ID 匹配，避免重复
                const aiVersionId = `v_${taskStartTime}_autowrite_${c.id}`;

                const existingAiVerIdx = currentVersions.findIndex(v => v.id === aiVersionId);

                if (existingAiVerIdx !== -1) {
                  // 更新现有的 autowrite 版本为最终完整内容
                  currentVersions[existingAiVerIdx] = {
                    ...currentVersions[existingAiVerIdx],
                    content: content,
                    timestamp: taskStartTime,
                  };
                } else {
                  currentVersions.push({
                    id: aiVersionId,
                    content: content,
                    timestamp: taskStartTime,
                    type: 'user_edit',
                  });
                }

                return {
                  ...c,
                  content: content,
                  versions: currentVersions,
                  activeVersionId: currentVersions[currentVersions.length - 1].id,
                };
              }
              return c;
            }),
          };
          onNovelUpdate(this.novel);

          // 上报章节完成并按需触发自动优化
          // 核心修复：由 Promise.all 改为顺序执行，防止由于并发产生的状态覆盖导致总结丢失（Stale State Conflict）
          for (let i = 0; i < batchItems.length; i++) {
            const item = batchItems[i];
            const chapterId = item.id;
            const content = finalContents[i];

            const resultNovel = await onChapterComplete(chapterId, content, this.novel);
            if (resultNovel && typeof resultNovel === 'object' && (resultNovel as Novel).chapters) {
              this.novel = resultNovel as Novel;
            }

            // 联动“自动优化”按钮逻辑：如果配置开启，直接触发内部优化函数
            if (this.config.autoOptimize && this.isRunning) {
              terminal.log(`[AutoWrite] Auto-optimization (background) triggered for chapter ${chapterId}.`);
              // 第十九次修复：自动优化任务在后台静默运行，不阻塞主流程
              this.optimizeChapter(chapterId, content, () => {}, onNovelUpdate, getActiveScripts(), true);
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
            throw err; // 抛出错误以中止工作流，防止误跳到下一个节点
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (this.isRunning) {
        // 缩短批次间等待时间，与电脑端一致，提升连贯感
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // 彻底不等待后台优化任务。
    // 工作流的“正文生成”节点应该在所有正文生成完毕后立即标记为完成。
    // 后台的润色任务（如果存在）将继续在后台运行，不影响工作流跳转到下一个节点。

    onStatusUpdate('完成');
    this.isRunning = false;
  }

  private async optimizeChapter(
    chapterId: number,
    sourceContent: string,
    onStatusUpdate: (status: string) => void,
    onNovelUpdate: (novel: Novel) => void,
    scripts: RegexScript[] = [],
    isAsync: boolean = false,
  ) {
    // 并发控制：针对异步模式进行优化
    const maxConcurrent = this.config.maxConcurrentOptimizations || 3;

    if (this.activeOptimizationTasks.size >= maxConcurrent) {
      if (isAsync) {
        // 如果是异步模式且并发已满，不再等待，直接跳过本次自动优化，确保不阻塞主创作流程
        terminal.log(
          `[AutoWrite] Max concurrent optimizations reached (${maxConcurrent}). Skipping auto-optimize for chapter ${chapterId} to avoid blocking.`,
        );
        return;
      }
      // 同步模式下，自然等待前面的任务完成（虽然 AutoWriteEngine 内部逻辑通常是串行的，但为了健壮性保留判断）
    }

    const optimizationAbortController = new AbortController();
    this.activeOptimizationTasks.set(chapterId, optimizationAbortController);

    const activePreset =
      this.config.optimizePresets?.find(p => p.id === this.config.activeOptimizePresetId) ||
      this.config.optimizePresets?.[0];
    if (!activePreset) return;

    // 异步模式下禁止更新 UI 状态标签，防止干扰/覆盖主创作流程的状态
    if (!isAsync) {
      onStatusUpdate(`优化中 (${this.activeOptimizationTasks.size}个任务)...`);
    }
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
          if (!isAsync) {
            onStatusUpdate(`优化分析中...`);
          }
          const analysisMessages: any[] = analysisPreset.prompts
            .filter(p => p.enabled)
            .map(p => ({
              role: p.role,
              content: p.content.replace('{{content}}', sourceContent).replace('{{input}}', ''),
            }));

          terminal.log(`
>> AI REQUEST [工作流: 优化前分析]
>> -----------------------------------------------------------
>> Model:       ${this.config.analysisModel || this.config.model}
>> Temperature: ${analysisPreset.temperature ?? 1.0}
>> Top P:       ${analysisPreset.topP ?? 1.0}
>> Top K:       ${analysisPreset.topK ?? 200}
>> -----------------------------------------------------------
          `);

          const completion = await openai.chat.completions.create(
            {
              model: this.config.analysisModel || this.config.model,
              messages: analysisMessages,
              temperature: analysisPreset.temperature ?? 1.0,
              top_p: analysisPreset.topP ?? 1.0,
              top_k: analysisPreset.topK ?? 200,
            } as any,
            { signal: optimizationAbortController.signal },
          );

          currentAnalysisResult = completion.choices[0]?.message?.content || '';
          terminal.log(
            `[Analysis Result] chapter ${chapterId}:\n${currentAnalysisResult.slice(0, 500)}${
              currentAnalysisResult.length > 500 ? '...' : ''
            }`,
          );

          this.novel = {
            ...this.novel,
            chapters: this.novel.chapters.map(c =>
              c.id === chapterId ? { ...c, analysisResult: currentAnalysisResult } : c,
            ),
          };
          onNovelUpdate(this.novel);
        }
      } catch (e: any) {
        const isAbort = e.name === 'AbortError' || e.message === 'Request was aborted.' || e.message === 'Aborted';
        if (isAbort) {
          terminal.log(`[AutoWrite Optimize] Analysis for chapter ${chapterId} aborted.`);
        } else {
          terminal.error(`[AutoWrite Optimize] Analysis failed: ${e}`);
        }
      }
    }

    // Phase 2: Optimization
    // 第二十次修复：移除对 this.isRunning 的依赖。
    // 因为异步优化任务在后台运行，而主创作循环可能在最后两章投递后立即结束并设置 isRunning=false。
    // 我们仅需判断该任务是否被显式中止（signal.aborted）。
    if (optimizationAbortController.signal.aborted) return;

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

      terminal.log(`
>> AI REQUEST [工作流: 正文优化/润色]
>> -----------------------------------------------------------
>> Model:       ${this.config.optimizeModel || this.config.model}
>> Temperature: ${activePreset.temperature ?? 1.0}
>> Top P:       ${activePreset.topP ?? 1.0}
>> Top K:       ${activePreset.topK ?? 200}
>> -----------------------------------------------------------
      `);

      const completion = await openai.chat.completions.create(
        {
          model: this.config.optimizeModel || this.config.model,
          messages: messages,
          temperature: activePreset.temperature ?? 1.0,
          top_p: activePreset.topP ?? 1.0,
          top_k: activePreset.topK ?? 200,
        } as any,
        { signal: optimizationAbortController.signal },
      );

      let optimizedContent = completion.choices[0]?.message?.content || '';
      terminal.log(`[Optimization Result] chapter ${chapterId} length: ${optimizedContent.length}`);
      if (optimizedContent) {
        // 核心修复：对优化后的正文也要应用正则脚本
        optimizedContent = await processTextWithRegex(optimizedContent, scripts, 'output');

        const optVersion: ChapterVersion = {
          id: `v_${baseTime}_opt_${chapterId}`,
          content: optimizedContent,
          timestamp: baseTime,
          type: 'optimized',
        };

        // 【BUG 风险点 - 原文丢失】：异步优化任务的版本抢占
        // 谨慎修改：当异步优化任务（润色）完成后，会强制切换 activeVersionId。
        // 如果在 AI 优化的过程中，用户在主界面又进行了手动编辑，
        // 这里的 `versions.push(optVersion)` 和 `activeVersionId` 的切换，
        // 可能会导致用户最新的手动编辑内容因为处于非活跃版本而被“隐藏”或被后续合并逻辑丢失。
        const updatedChapters = this.novel.chapters.map(c => {
          if (c.id === chapterId) {
            const versions = [...(c.versions || [])];
            // 避免重复添加相同的优化版本
            if (!versions.some(v => v.id === optVersion.id)) {
              versions.push(optVersion);
            }
            return {
              ...c,
              content: optimizedContent,
              versions: versions,
              activeVersionId: optVersion.id,
            };
          }
          return c;
        });

        this.novel = {
          ...this.novel,
          chapters: updatedChapters,
        };
        onNovelUpdate(this.novel);
      }
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || e.message === 'Request was aborted.' || e.message === 'Aborted';
      if (isAbort) {
        terminal.log(`[AutoWrite Optimize] Optimization for chapter ${chapterId} aborted.`);
      } else {
        terminal.error(`[AutoWrite Optimize] Optimization failed for chapter ${chapterId}: ${e}`);
      }
    } finally {
      this.activeOptimizationTasks.delete(chapterId);
    }
  }

  /**
   * 将合并生成的文本拆分为多个章节内容（支持流式过程中动态拆分）
   */
  private splitBatchContent(
    text: string,
    batchItems: { item: OutlineItem; id: number }[],
    precompiledRegexes?: RegExp[],
  ): string[] {
    const contents: string[] = new Array(batchItems.length).fill('');
    const ranges: { start: number; bIdx: number }[] = [];

    batchItems.forEach((b, idx) => {
      const regex =
        precompiledRegexes?.[idx] ||
        new RegExp(
          `(?:\\r\\n|\\r|\\n|^)###\\s*${b.item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|\\r|\\n|$)`,
          'i',
        );
      const match = text.match(regex);
      if (match && match.index !== undefined) {
        ranges.push({ start: match.index, bIdx: idx });
      }
    });

    if (ranges.length === 0) {
      // 没找到明确标记，默认全部塞进第一章
      contents[0] = text;
    } else {
      ranges.sort((a, b) => a.start - b.start);
      for (let i = 0; i < ranges.length; i++) {
        const nextStart = i < ranges.length - 1 ? ranges[i + 1].start : text.length;
        const currentRange = ranges[i];

        // 寻找标题行的结尾，正文从下一行开始
        const titleLineEnd = text.indexOf('\n', currentRange.start);
        const contentStart = titleLineEnd !== -1 ? titleLineEnd + 1 : currentRange.start;

        contents[currentRange.bIdx] = text.substring(contentStart, nextStart).trim();
      }
    }
    return contents;
  }
}

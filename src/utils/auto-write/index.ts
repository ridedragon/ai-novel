import OpenAI from 'openai';
import terminal from 'virtual:terminal';
import { ChapterVersion, ChatMessage, Novel, OutlineItem, PromptItem, RegexScript } from '../../types';
import { buildWorldInfoMessages, getChapterContextMessages, processTextWithRegex } from './core';
import { AutoWriteConfig } from './types';
import { initializeChapterNumbering, generateChapterTitle, calculateNewChapterNumbering } from '../chapterNumbering';

export { buildWorldInfoMessages, getChapterContextMessages, processTextWithRegex, getEffectiveChapterContent } from './core';

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
    terminal.log('[AutoWriteEngine] STOP requested.');
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
    onChapterComplete?: (
      chapterId: number,
      content: string,
      updatedNovel?: Novel,
      forceFinal?: boolean,
    ) => Promise<Novel | void | {
      updatedNovel?: Novel;
      shouldPauseForVolumeSwitch?: boolean;
      nextVolumeIndex?: number;
    }>,
    onBeforeChapter?: (title: string) => Promise<{ 
      updatedNovel?: Novel; 
      newVolumeId?: string;
      shouldPauseForVolumeSwitch?: boolean;
      nextVolumeIndex?: number;
    } | void>,
    targetVolumeId?: string,
    includeFullOutline: boolean = false,
    outlineSetId: string | null = null,
    signal?: AbortSignal,
    runId?: string | null,
    workflowContext?: string | ChatMessage[],
  ): Promise<{ shouldPauseForVolumeSwitch?: boolean; nextVolumeIndex?: number } | void> {
    // 核心增强 (Bug 1 反馈加固)：引擎级分卷继承机制
    // 如果外部未传入目标分卷（由于快照丢失或重启），自动回溯现有章节的最后一章所属的分卷
    if (!targetVolumeId && this.novel.chapters && this.novel.chapters.length > 0) {
      for (let k = this.novel.chapters.length - 1; k >= 0; k--) {
        if (this.novel.chapters[k].volumeId) {
          targetVolumeId = this.novel.chapters[k].volumeId;
          terminal.log(`[AutoWrite] Recovered targetVolumeId from last chapter: ${targetVolumeId}`);
          break;
        }
      }
    }

    // 核心增强 (Bug 1 反馈加固)：引擎级分卷继承机制
    // 如果外部未传入目标分卷（由于快照丢失或重启），自动回溯现有章节的最后一章所属的分卷
    if (!targetVolumeId && this.novel.chapters && this.novel.chapters.length > 0) {
      for (let k = this.novel.chapters.length - 1; k >= 0; k--) {
        if (this.novel.chapters[k].volumeId) {
          targetVolumeId = this.novel.chapters[k].volumeId;
          terminal.log(`[AutoWrite] Recovered targetVolumeId from last chapter: ${targetVolumeId}`);
          break;
        }
      }
    }

    terminal.log(
      `[DEBUG] AutoWriteEngine.run STARTED: startIndex=${startIndex}, targetVolumeId=${targetVolumeId}, novelTitle=${this.novel.title}`,
    );
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

    // 核心修复 (Bug 2): 引入全局工作流管理器校验函数
    const { workflowManager } = await import('../WorkflowManager');
    const checkActive = () => {
      if (!this.isRunning) return false;
      if (runId && !workflowManager.isRunActive(runId)) {
        terminal.warn(`[AutoWriteEngine] 侦测到过时的执行实例 (RunID: ${runId})，正在静默退出以防双倍生成。`);
        this.stop();
        return false;
      }
      return true;
    };

    while (startIndex < outline.length && checkActive()) {
      const batchItems: { item: OutlineItem; idx: number; id: number; volumeId?: string }[] = [];

      // 核心修复：批量生成时对每个章节单独检查分卷归属
      // 问题根源：原来批量生成时所有章节使用同一个 targetVolumeId
      // 如果批次内包含跨卷章节（如第一卷最后几章 + 第二卷前几章）
      // 第二卷的章节会被错误保存到第一卷
      // 修复：对每个章节单独检查是否需要切换分卷，遇到跨卷时拆分批次
      
      let batchVolumeId = targetVolumeId; // 批次起始卷ID
      let batchSplitIndex = -1; // 如果检测到跨卷，记录拆分位置
      
      for (let i = 0; i < maxBatchSize; i++) {
        const currIdx = startIndex + i;
        if (currIdx >= outline.length) break;

        const item = outline[currIdx];

        // --- 核心修复：分卷预检拦截（每个章节单独检查）---
        // 在创建任何占位符或生成内容前，先询问 UI 是否需要分卷。
        // 这解决了分卷触发章被错误归入上一个分卷的问题。
        if (onBeforeChapter) {
          const beforeResult = await onBeforeChapter(item.title);
          if (beforeResult) {
            // 分卷终止章检测：如果需要暂停切换分卷
            if (beforeResult.shouldPauseForVolumeSwitch) {
              terminal.log(`[AutoWriteEngine] Volume end chapter reached, pausing for volume switch to index ${beforeResult.nextVolumeIndex}`);
              onStatusUpdate(`分卷终止章完成，等待切换到下一卷...`);
              // 暂停当前执行，等待外部处理分卷切换
              this.isRunning = false;
              return { shouldPauseForVolumeSwitch: true, nextVolumeIndex: beforeResult.nextVolumeIndex };
            }

            if (beforeResult.updatedNovel) {
              // 原子化同步：立即更新引擎内部的副本，防止旧快照覆盖 UI 新创建的分卷
              this.novel = beforeResult.updatedNovel;
            }
            if (beforeResult.newVolumeId) {
              // --- 核心增强：分卷结束时的强制总结 ---
              // 如果发生了分卷切换，说明上一个分卷结束了，触发一次强制总结
              // 修复：归一化 volumeId 比较，确保"未分类"到"具体分卷"的切换也能触发
              const currentVolId = targetVolumeId || '';
              const nextVolId = beforeResult.newVolumeId || '';

              if (currentVolId !== nextVolId) {
                // 核心修复：批量生成时检测跨卷情况
                // 如果批次已有章节（i > 0），检测到分卷切换意味着批次内包含跨卷章节
                // 此时应该拆分批次，只处理当前卷的章节，下一卷的章节留待下一次循环
                if (i > 0 && batchItems.length > 0) {
                  terminal.log(`[AutoWriteEngine] Cross-volume detected in batch at index ${i}. Splitting batch. Current volume: ${currentVolId}, Next volume: ${nextVolId}`);
                  batchSplitIndex = i;
                  // 不继续添加更多章节到当前批次
                  break;
                }
                
                const lastChapterOfPrevVol = (this.novel.chapters || [])
                  .filter(c => {
                    const cVolId = c.volumeId || '';
                    return cVolId === currentVolId && (!c.subtype || c.subtype === 'story');
                  })
                  .pop();

                if (lastChapterOfPrevVol) {
                  terminal.log(
                    `[AutoWrite] Volume boundary detected (${currentVolId || 'Uncategorized'} -> ${nextVolId}). Triggering final summary for previous volume.`,
                  );
                  const resultNovel = onChapterComplete ? await onChapterComplete(
                    lastChapterOfPrevVol.id,
                    lastChapterOfPrevVol.content,
                    this.novel,
                    true,
                  ) : undefined;
                  // 同步由于总结产生的新小说状态
                  if (
                    checkActive() &&
                    resultNovel &&
                    typeof resultNovel === 'object' &&
                    (resultNovel as Novel).chapters
                  ) {
                    this.novel = resultNovel as Novel;
                  }
                }
              }

              // 立即切换当前及后续章节的目标分卷
              targetVolumeId = beforeResult.newVolumeId;
              terminal.log(`[AutoWriteEngine] Switched targetVolumeId to ${targetVolumeId} for chapter: ${item.title}`);
              
              // 核心修复：更新批次起始卷ID，确保后续章节使用正确的 volumeId
              batchVolumeId = targetVolumeId;
            }
          }
        }

        // 核心修复 (Bug 2)：查重逻辑优化。
        // 1. 查重范围应严格限制在当前目标分卷（targetVolumeId）内。
        // 2. 这解决了用户删除当前卷章节后，因"回收站"或"其他卷"存在同名章而导致引擎跳过生成的问题。
        const existingChapter = (this.novel.chapters || []).find(c => {
          const isTitleMatch = c.title === item.title;
          if (!isTitleMatch) return false;

          const isSameVolume =
            (targetVolumeId && c.volumeId === targetVolumeId) ||
            (!targetVolumeId && (!c.volumeId || c.volumeId === ''));

          // 核心逻辑：仅在同一分卷内进行查重
          return isSameVolume;
        });

        if (existingChapter && existingChapter.content && existingChapter.content.trim().length > 0) {
          terminal.log(
            `[DEBUG] AutoWriteEngine: Skipping ${item.title} - already exists in volume ${targetVolumeId || 'default'}`,
          );

          console.log(`[AutoWrite] Skipping existing chapter and checking for summaries: ${item.title}`);
          // 核心修复 (Bug 2)：校验执行 ID 有效性，杜绝多实例并跑
          if (!checkActive()) return;

          // 即使跳过已存在的章节，也触发一次完成回调，确保由于跳过导致的缺失总结能被补全
          const resultNovel = onChapterComplete ? await onChapterComplete(existingChapter.id, existingChapter.content, this.novel) : undefined;
          if (checkActive() && resultNovel && typeof resultNovel === 'object' && (resultNovel as Novel).chapters) {
            this.novel = resultNovel as Novel;
          }

          // 核心修复：无论 batchItems 是否有值，只要当前项已存在，就应该递增 startIndex 并继续检查下一项
          // 否则会导致死循环或批次偏移
          startIndex++;
          continue;
        }

        batchItems.push({
          item,
          idx: currIdx,
          id: existingChapter ? existingChapter.id : Date.now() + Math.floor(Math.random() * 1000000) + i,
          volumeId: targetVolumeId, // 锁定每一章所属的分卷 ID，每个章节单独设置
        });
        
        // 核心修复：记录当前章节使用的 volumeId，用于跨卷检测
        // 如果后续章节检测到分卷切换，会比较与 batchVolumeId 是否一致
      }

      if (batchItems.length === 0) {
        if (startIndex >= outline.length) break;
        continue;
      }

      // Apply placeholders
      let newChapters = [...(this.novel.chapters || [])];
      batchItems.forEach(batchItem => {
        const itemVolId = batchItem.volumeId;
        const existingById = newChapters.find(c => c.id === batchItem.id);
        const existingByTitle = newChapters.find(c => {
          return (
            c.title === batchItem.item.title &&
            ((itemVolId && c.volumeId === itemVolId) || (!itemVolId && (!c.volumeId || c.volumeId === '')))
          );
        });

        if (!existingById && !existingByTitle) {
          // 计算当前应该使用的章节编号
          const numbering = calculateNewChapterNumbering(newChapters, itemVolId);
          
          // 使用 generateChapterTitle 生成正确的标题，保留原有的章节名称
          const originalTitle = batchItem.item.title;
          const resolvedTitle = generateChapterTitle(numbering.volumeIndex, originalTitle);
          
          const newChapter = {
            id: batchItem.id,
            title: resolvedTitle,
            content: '',
            volumeId: itemVolId,
            globalIndex: numbering.globalIndex,
            volumeIndex: numbering.volumeIndex,
          };

          // 核心修复：优化章节插入位置 (Bug 1 反馈修复)
          // 不再简单 push，而是尝试插入到同分卷最后一章之后，或全书末尾
          if (itemVolId) {
            // 寻找同卷最后一章的物理位置
            let lastIndexInVol = -1;
            for (let k = newChapters.length - 1; k >= 0; k--) {
              if (newChapters[k].volumeId === itemVolId) {
                lastIndexInVol = k;
                break;
              }
            }

            if (lastIndexInVol !== -1) {
              newChapters.splice(lastIndexInVol + 1, 0, newChapter);
            } else {
              // 核心修复：优化新分卷插入逻辑
              // 如果该分卷目前是空的，且当前创作顺序明确，则应追加到全书末尾
              // 这样可以确保新分卷在物理顺序上位于所有已有章节（包括未分类章）之后
              newChapters.push(newChapter);
            }
          } else {
            newChapters.push(newChapter);
          }
        } else if (existingByTitle) {
          batchItem.id = existingByTitle.id;
          // 深度修复：即便章节已存在，如果它处于“未分卷”状态，且当前生成任务明确了目标分卷，
          // 则在执行时将其归类到该分卷中。这解决了用户看到的“空卷”且章节在“未分卷”中的问题。
          if ((!existingByTitle.volumeId || existingByTitle.volumeId === '') && itemVolId) {
            existingByTitle.volumeId = itemVolId;
          }
          
          // 确保已存在章节的标题也是正确的
          const numbering = {
            globalIndex: existingByTitle.globalIndex || (newChapters.indexOf(existingByTitle) + 1),
            volumeIndex: existingByTitle.volumeIndex || 1
          };
          existingByTitle.title = generateChapterTitle(numbering.volumeIndex, batchItem.item.title);
        }
      });
      
      // 初始化所有章节的编号信息，确保一致
      this.novel = { ...this.novel, chapters: newChapters };
      this.novel = initializeChapterNumbering(this.novel);
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

          const firstChapterInBatch = this.novel.chapters?.find(c => c.id === batchItems[0].id);
          if (!firstChapterInBatch) throw new Error('Chapter placeholder missing');

          const contextMessages = getChapterContextMessages(this.novel, firstChapterInBatch, {
            longTextMode: this.config.longTextMode,
            contextScope: this.config.contextScope || 'current',
            contextChapterCount: this.config.contextChapterCount,
          });

          // 虽然跳过长上下文清洗，但我们仍需要 scripts 用于后续的章节输出清洗
          const scripts = getActiveScripts();

          const worldInfoMessages = buildWorldInfoMessages(this.novel, outlineSetId);

          let taskDescription = '';
          if (batchItems.length > 1) {
            taskDescription = `你正在创作连续的小说故事。请一次性撰写以下 ${batchItems.length} 章的内容。\n**重要：请严格使用 "### 章节标题" 作为每一章的分隔符。**\n\n`;
            batchItems.forEach((b, idx) => {
              const chapter = this.novel.chapters?.find(c => c.id === b.id);
              const chapterTitle = chapter?.title || b.item.title;
              taskDescription += `第 ${idx + 1} 部分：\n标题：${chapterTitle}\n大纲：${b.item.summary}\n\n`;
            });
            const firstChapter = this.novel.chapters?.find(c => c.id === batchItems[0].id);
            const firstChapterTitle = firstChapter?.title || batchItems[0].item.title;
            const secondChapter = this.novel.chapters?.find(c => c.id === batchItems[1]?.id);
            const secondChapterTitle = secondChapter?.title || batchItems[1]?.item.title || '第二章';
            taskDescription += `\n请开始撰写，确保内容连贯，不要包含任何多余的解释，直接输出正文。格式示例：\n### ${firstChapterTitle}\n(第一章正文...)\n### ${secondChapterTitle}\n(第二章正文...)\n`;
          } else {
            const chapter = this.novel.chapters?.find(c => c.id === batchItems[0].id);
            const chapterTitle = chapter?.title || batchItems[0].item.title;
            taskDescription = `你正在创作连续的小说故事。\n当前章节：${chapterTitle}\n本章大纲：${batchItems[0].item.summary}\n\n请根据大纲和前文剧情，撰写本章正文。文笔要生动流畅。`;
          }

          const messages: any[] = [];

          // 0. 基础系统提示词 (System)
          messages.push({ role: 'system', content: this.config.systemPrompt });

          // 核心功能：接收工作流上下文
          if (workflowContext) {
            if (typeof workflowContext === 'string') {
              // 兼容旧的字符串模式：转换为独立 System 消息，不再合并到 System Prompt
              if (workflowContext.trim()) {
                messages.push({
                  role: 'system',
                  content: workflowContext,
                });
              }
            } else if (Array.isArray(workflowContext)) {
              // 新增：支持直接插入消息数组，满足用户“单独system发送”的需求
              messages.push(...workflowContext);
            }
          }

          // 1. 注入世界观和角色信息 (System)
          messages.push(...worldInfoMessages);

          // 核心修复 (Bug 3)：调整待创作大纲顺序，紧跟在【角色档案】之后，并确保 system 角色
          if (includeFullOutline) {
            // 过滤已完成章节的大纲，只发送未写的和当前批次的大纲
            // 增强：忽略标题首尾空格，提高匹配准确性
            const filteredOutline = outline.filter(item => {
              const cleanItemTitle = item.title.trim();
              const isCompleted = (this.novel.chapters || []).some(
                c => (c.title?.trim() || '') === cleanItemTitle && c.content && c.content.trim().length > 10,
              );
              const isCurrentBatch = batchItems.some(b => b.item.title.trim() === cleanItemTitle);
              return !isCompleted || isCurrentBatch;
            });

            if (filteredOutline.length > 0) {
              const fullOutlineStr = filteredOutline.map((item, i) => `· ${item.title}: ${item.summary}`).join('\n');
              messages.push({
                role: 'system',
                content: `【待创作章节大纲参考】：\n${fullOutlineStr}`,
              });
            }
          }

          // 2. 注入灵感/自定义提示词 (透传预设角色和内容)
          activePrompts.forEach(p => {
            if (!p.isFixed && p.content && p.content.trim()) {
              messages.push({
                role: p.role,
                content: p.content,
              });
            }
          });

          // 3. 注入前文背景/剧情摘要 (System)
          messages.push(...contextMessages);

          // 5. 注入最终的任务描述 (唯一的 User 消息)
          messages.push({ role: 'user', content: taskDescription });

          // 6. 如果存在循环特定指令，以 User 身份追加 (满足用户最新需求)
          if (this.config.systemPrompt.includes('【第') && this.config.systemPrompt.includes('轮循环特定指令】')) {
            const loopMatch = this.config.systemPrompt.match(/【第 \d+ 轮循环特定指令】：\n([\s\S]*?)$/);
            if (loopMatch && loopMatch[1]) {
              messages.push({ role: 'user', content: `当前轮次特定要求：\n${loopMatch[1].trim()}` });
              // 从 systemPrompt 中移除，避免重复发送且角色混乱
              messages[0].content = messages[0].content.replace(loopMatch[0], '').trim();
            }
          }

          // 调试：F12 打印发送给 AI 的全部内容
          console.group(`[AI REQUEST] 工作流正文创作 - ${this.novel.title}`);
          console.log('Final Message Count:', messages.length);
          console.log('Messages Structure:', messages);
          console.groupEnd();

          const baseMaxTokens = this.config.max_tokens || this.config.maxReplyLength;
          const batchMaxTokens =
            baseMaxTokens * batchItems.length > 128000
              ? 128000
              : baseMaxTokens * (batchItems.length > 1 ? 1.5 : 1);

          let requestParams: any = {
              model: this.config.model,
              messages: messages,
              stream: this.config.stream,
              temperature: this.config.temperature,
              top_p: this.config.topP,
              max_tokens: Math.round(batchMaxTokens),
            };
            if (this.config.topK && this.config.topK > 0) {
              requestParams.top_k = this.config.topK;
            }
          
          let response;
          let fallbackMode = 0;
          let apiCallSuccess = false;
          while (!apiCallSuccess && fallbackMode <= 2) {
            try {
              if (this.config.stream) {
                // 对于流式请求，直接使用返回的异步可迭代对象
                response = await openai.chat.completions.create(
                  requestParams,
                  {
                    signal: this.abortController?.signal,
                  },
                ) as any;
              } else {
                // 对于非流式请求，使用 await
                response = (await openai.chat.completions.create(
                  requestParams,
                  {
                    signal: this.abortController?.signal,
                  },
                )) as any;
              }
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

            console.log('[AutoWrite Stream] 开始流式传输');
            terminal.log('[AutoWrite Stream] 开始流式传输');

            for await (const chunk of response) {
              if (!checkActive() || this.abortController?.signal.aborted) throw new Error('Aborted');
              const content = chunk.choices[0]?.delta?.content || '';
              fullGeneratedContent += content;
              streamTokenCount++;
              
              if (content) {
                console.log('[AutoWrite Stream] 收到数据:', { content: content.substring(0, 30) + (content.length > 30 ? '...' : ''), length: content.length });
              }

              const now = Date.now();
              // 节流处理：每 50ms 更新一次 UI，实现流畅的流式输出效果
              // 50ms ≈ 20fps，在流畅度和性能之间取得平衡
              if (now - lastUpdateTime < 50) continue;

              streamUpdateCount++;
              lastUpdateTime = now;

              // 支持流式分章节更新
              let liveContents =
                batchItems.length > 1
                  ? this.splitBatchContent(fullGeneratedContent, batchItems, precompiledRegexes)
                  : [fullGeneratedContent];

              // 优化：在流式传输过程中，处理未完成的章节内容
              if (batchItems.length > 1) {
                // 检查是否有未分配的内容
                const hasContent = liveContents.some(content => content.trim());
                if (hasContent) {
                  // 如果只有第一个章节有内容，且还有其他章节，尝试分配剩余内容
                  const firstContent = liveContents[0] || '';
                  if (firstContent.trim() && liveContents.length > 1) {
                    // 检查是否有章节标题的开始标记
                    const chapterMarkers = [];
                    for (let i = 1; i < batchItems.length; i++) {
                      const chapterTitle = batchItems[i].item.title;
                      const markerIndex = fullGeneratedContent.indexOf(`### ${chapterTitle}`);
                      if (markerIndex !== -1) {
                        chapterMarkers.push({ index: markerIndex, bIdx: i });
                      }
                    }

                    // 如果找到章节标记，重新分配内容
                    if (chapterMarkers.length > 0) {
                      chapterMarkers.sort((a, b) => a.index - b.index);
                      
                      // 更新第一个章节的内容
                      liveContents[0] = fullGeneratedContent.substring(0, chapterMarkers[0].index).trim();
                      
                      // 更新其他章节的内容
                      for (let i = 0; i < chapterMarkers.length; i++) {
                        const currentMarker = chapterMarkers[i];
                        const nextMarker = i < chapterMarkers.length - 1 ? chapterMarkers[i + 1] : null;
                        const start = currentMarker.index;
                        const end = nextMarker ? nextMarker.index : fullGeneratedContent.length;
                        
                        // 寻找标题行的结尾
                        const titleLineEnd = fullGeneratedContent.indexOf('\n', start);
                        const contentStart = titleLineEnd !== -1 ? titleLineEnd + 1 : start;
                        
                        liveContents[currentMarker.bIdx] = fullGeneratedContent.substring(contentStart, end).trim();
                      }
                    }
                  }
                }
              }

              this.novel = {
                ...this.novel,
                chapters: (this.novel.chapters || []).map(c => {
                  // 优先通过ID匹配，如果匹配不到，则通过标题和分卷ID匹配
                  let bIdx = batchItems.findIndex(b => b.id === c.id);
                  if (bIdx === -1) {
                    bIdx = batchItems.findIndex(b => {
                      const titleMatch = b.item.title === c.title;
                      const volumeMatch = (b.volumeId && c.volumeId === b.volumeId) || 
                                         (!b.volumeId && (!c.volumeId || c.volumeId === ''));
                      return titleMatch && volumeMatch;
                    });
                  }
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
              // 核心修复 4.2：流式更新期间仅发送增量章节数据 (Delta Update)，显著减轻跨进程通信 (IPC) 压力
              // 我们仅提取本次 batch 涉及的章节传递给 UI，避免传递整个小说对象
              const deltaChapters = (this.novel.chapters || []).filter(c => {
                const idMatch = batchItems.some(b => b.id === c.id);
                if (idMatch) return true;
                // 备用匹配：通过标题和分卷ID匹配
                return batchItems.some(b => {
                  const titleMatch = b.item.title === c.title;
                  const volumeMatch = (b.volumeId && c.volumeId === b.volumeId) || 
                                     (!b.volumeId && (!c.volumeId || c.volumeId === ''));
                  return titleMatch && volumeMatch;
                });
              });
              onNovelUpdate({ ...this.novel, chapters: deltaChapters });
            }
            // 优化 4.3：将高频流式统计改为 console.debug，不再发送给 VSCode Terminal
            const avgUpdateFreq = streamUpdateCount / ((Date.now() - taskStartTime) / 1000);
            if (avgUpdateFreq > 15) {
              terminal.warn(
                `[FREQ ALERT] AutoWrite 流式更新频率过高: 每秒达 ${avgUpdateFreq.toFixed(1)} 次，已触发自动节流`,
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

          // 核心修复：防止因批次拆分失败导致的超长文本重复运行正则
          // 如果 AI 生成的内容没能被正确分割，且当前是多章节生成模式
          if (
            batchItems.length > 1 &&
            finalContents.filter(c => c.trim()).length === 1 &&
            fullGeneratedContent.length > 30000
          ) {
            terminal.warn(
              `[PERF ALERT] 检测到批次拆分失败且文本超长(${fullGeneratedContent.length}), 正在尝试强制兜底拆分以防止正则卡死`,
            );

            // 尝试基于通用分隔符拆分
            const parts = fullGeneratedContent.split(/(?:\r\n|\r|\n|^)###\s*[^\n]*/).filter(p => p.trim());
            if (parts.length >= batchItems.length) {
              finalContents = parts.slice(0, batchItems.length);
            } else {
              // 极端情况：如果连 ### 都没搜到，说明 AI 格式完全错误。
              // 此时为了防止后续 applyRegexToText 对 5 万字长文本运行同步正则导致假死 6s
              // 我们强制进行按长度粗略分片（仅作为保护，总比卡死强）
              const avgLen = Math.floor(fullGeneratedContent.length / batchItems.length);
              finalContents = [];
              for (let k = 0; k < batchItems.length; k++) {
                finalContents.push(fullGeneratedContent.substring(k * avgLen, (k + 1) * avgLen));
              }
            }
          }

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
          for (let idx = 0; idx < finalContents.length; idx++) {
            const content = finalContents[idx];
            // 增加日志：标记具体章节产出处理
            const label = batchItems[idx] ? `output:${batchItems[idx].item.title}` : 'output:unknown';
            processedContents.push(await processTextWithRegex(content, scripts, 'output'));
          }
          finalContents = processedContents;

          // 【BUG 风险点 - 原文丢失】：批量生成后的版本强行覆盖
          // 谨慎修改：在全自动创作完成时，此处会为章节强行初始化 versions。
          // 它将 AI 生成的最终正文（content）直接作为 original 版本存入。
          // 如果该章节 ID 对应的是一个用户已经手动修改过的章节，那么用户的手动修改在此处会被 AI 内容彻底抹除。
          this.novel = {
            ...this.novel,
            chapters: (this.novel.chapters || []).map(c => {
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
          // 完成时同样仅发送本批次增量
          const finalDeltaChapters = (this.novel.chapters || []).filter(c => batchItems.some(b => b.id === c.id));
          onNovelUpdate({ ...this.novel, chapters: finalDeltaChapters });

          // 上报章节完成并按需触发自动优化
          // 核心修复：由 Promise.all 改为顺序执行，防止由于并发产生的状态覆盖导致总结丢失（Stale State Conflict）
          for (let i = 0; i < batchItems.length; i++) {
            // 核心修复 (Bug 2)：循环内部检查 ID，防止终止后的残余回调导致双倍生成
            if (!checkActive()) break;

            const item = batchItems[i];
            const chapterId = item.id;
            const content = finalContents[i];

            const result = onChapterComplete ? await onChapterComplete(chapterId, content, this.novel) : undefined;
            if (checkActive() && result && typeof result === 'object') {
              if ('updatedNovel' in result && result.updatedNovel && typeof result.updatedNovel === 'object' && 'chapters' in result.updatedNovel) {
                this.novel = result.updatedNovel as Novel;
              }
              if ('shouldPauseForVolumeSwitch' in result && result.shouldPauseForVolumeSwitch) {
                terminal.log('[AutoWrite] Volume switch signal received from onChapterComplete, pausing...');
                return { shouldPauseForVolumeSwitch: true, nextVolumeIndex: result.nextVolumeIndex };
              }
            }

            // 联动“自动优化”按钮逻辑：如果配置开启，直接触发内部优化函数
            if (checkActive() && this.config.autoOptimize) {
              terminal.log(`[AutoWrite] Auto-optimization (background) triggered for chapter ${chapterId}.`);
              // 第十九次修复：自动优化任务在后台静默运行，不阻塞主流程
              this.optimizeChapter(chapterId, content, () => {}, onNovelUpdate, getActiveScripts(), true);
            }
          }

          success = true;
          startIndex += batchItems.length;
          break;
        } catch (err: any) {
          const isAbort =
            err.name === 'AbortError' ||
            err.message?.includes('aborted') ||
            err.message?.includes('Aborted') ||
            !this.isRunning;
          if (isAbort) return;
          attempt++;
          if (attempt >= maxAttempts) {
            onStatusUpdate(`生成失败：${err.message}`);
            this.isRunning = false;
            throw err; // 抛出错误以中止工作流，防止误跳到下一个节点
          } else {
            // 退避重试延迟：1s, 2s, 4s...
            const delay = 1000 * Math.pow(2, attempt - 1);
            onStatusUpdate(
              `API 报错，${Math.round(delay / 1000)}s 后进行第 ${attempt}/${this.config.maxRetries} 次重试...`,
            );
            await new Promise(resolve => setTimeout(resolve, delay));
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

    // 核心改进：全自动创作彻底结束前，对最后一章触发一次“强制收尾”总结检查
    // 这将补全那些不满步长（如 3 或 6）的残余章节总结
    const lastBatchItem = startIndex > 0 ? outline[startIndex - 1] : null;
    if (lastBatchItem && this.isRunning) {
      const lastChapter = (this.novel.chapters || []).find(
        c =>
          c.title === lastBatchItem.title &&
          ((targetVolumeId && c.volumeId === targetVolumeId) || (!targetVolumeId && !c.volumeId)),
      );
      if (lastChapter) {
        terminal.log(`[AutoWrite] Triggering final summary completion for chapter: ${lastChapter.title}`);
        if (onChapterComplete) await onChapterComplete(lastChapter.id, lastChapter.content, this.novel, true);
      }
    }

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
              content: p.content.replace('{{content}}', sourceContent),
            }));

          // 调试：F12 打印发送给 AI 的全部内容
          console.group(`[AI REQUEST] 润色前分析 - Chapter ${chapterId}`);
          console.log('Messages:', analysisMessages);
          console.groupEnd();

          terminal.log(`
>> AI REQUEST [工作流: 优化前分析]
>> -----------------------------------------------------------
>> Model:       ${this.config.analysisModel || this.config.model}
>> Temperature: ${analysisPreset.temperature ?? 1.0}
>> Top P:       ${analysisPreset.topP ?? 1.0}
>> Top K:       ${analysisPreset.topK ?? 200}
>> -----------------------------------------------------------
          `);

          let analysisAttempt = 0;
          const maxAnalysisRetries = 2;
          let analysisSuccess = false;
          let analysisFallbackMode = 0;

          while (analysisAttempt <= maxAnalysisRetries && !analysisSuccess) {
            try {
              let requestParams: any = {
                  model: this.config.analysisModel || this.config.model,
                  messages: analysisMessages,
                  temperature: analysisPreset.temperature ?? 1.0,
                  top_p: analysisPreset.topP ?? 1.0,
                };
                if (analysisPreset.topK && analysisPreset.topK > 0 && analysisFallbackMode < 1) {
                  requestParams.top_k = analysisPreset.topK;
                }
          
              let completion;
              let apiCallSuccess = false;
              while (!apiCallSuccess && analysisFallbackMode <= 2) {
                try {
                  completion = await openai.chat.completions.create(
                    requestParams,
                    { signal: optimizationAbortController.signal },
                  );
                  apiCallSuccess = true;
                } catch (apiError: any) {
                  if (apiError.status === 400) {
                    const errorBody = apiError.error?.message || apiError.message || 'Unknown error';
                    terminal.warn(`API 400 错误: ${errorBody}`);
                    
                    if (requestParams.top_k && analysisFallbackMode < 1) {
                      terminal.warn('尝试移除 top_k 参数重试');
                      delete requestParams.top_k;
                      analysisFallbackMode = 1;
                    } else if (analysisFallbackMode < 2) {
                      terminal.warn('尝试简化参数重试 (移除 top_p)');
                      delete requestParams.top_p;
                      requestParams.temperature = 1.0;
                      analysisFallbackMode = 2;
                    } else {
                      throw apiError;
                    }
                  } else {
                    throw apiError;
                  }
                }
              }

              currentAnalysisResult = completion.choices[0]?.message?.content || '';
              if (currentAnalysisResult) analysisSuccess = true;
              else analysisAttempt++;
            } catch (anaErr: any) {
              if (anaErr.name === 'AbortError') throw anaErr;
              analysisAttempt++;
              if (analysisAttempt <= maxAnalysisRetries) {
                terminal.warn(`分析阶段重试 ${analysisAttempt}/${maxAnalysisRetries}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
              }
              throw anaErr;
            }
          }
          terminal.log(
            `[Analysis Result] chapter ${chapterId}:\n${currentAnalysisResult.slice(0, 500)}${
              currentAnalysisResult.length > 500 ? '...' : ''
            }`,
          );

          this.novel = {
            ...this.novel,
            chapters: (this.novel.chapters || []).map(c =>
              c.id === chapterId ? { ...c, analysisResult: currentAnalysisResult } : c,
            ),
          };
          // 异步分析结果上报：仅发送受影响章节
          const analysisDelta = (this.novel.chapters || []).filter(c => c.id === chapterId);
          onNovelUpdate({ ...this.novel, chapters: analysisDelta });
        }
      } catch (e: any) {
        const isAbort = e.name === 'AbortError' || /aborted/i.test(e.message);
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
          let content = p.content.replace('{{content}}', sourceContent);
          if (currentAnalysisResult && content.includes('{{analysis}}')) {
            content = content.replace('{{analysis}}', currentAnalysisResult);
            isAnalysisUsed = true;
          }
          return { role: p.role, content };
        });

      if (currentAnalysisResult && !isAnalysisUsed) {
        messages.push({ role: 'user', content: `请基于以下修改建议优化正文：\n\n${currentAnalysisResult}` });
      }

      // 调试：F12 打印发送给 AI 的全部内容
      console.group(`[AI REQUEST] 正文润色优化 - Chapter ${chapterId}`);
      console.log('Messages:', messages);
      console.groupEnd();

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

      let optAttempt = 0;
      const maxOptRetries = 3;
      let optSuccess = false;
      let optimizedContent = '';
      let fallbackMode = 0;

      while (optAttempt <= maxOptRetries && !optSuccess) {
        try {
          let requestParams: any = {
              model: this.config.optimizeModel || this.config.model,
              messages: messages,
              temperature: activePreset.temperature ?? 1.0,
              top_p: activePreset.topP ?? 1.0,
            };
            if (activePreset.topK && activePreset.topK > 0 && fallbackMode < 1) {
              requestParams.top_k = activePreset.topK;
            }
          
          let completion;
          let apiCallSuccess = false;
          while (!apiCallSuccess && fallbackMode <= 2) {
            try {
              completion = await openai.chat.completions.create(
                requestParams,
                { signal: optimizationAbortController.signal },
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

          optimizedContent = completion.choices[0]?.message?.content || '';
          if (optimizedContent) optSuccess = true;
          else optAttempt++;
        } catch (optErr: any) {
          if (optErr.name === 'AbortError') throw optErr;
          optAttempt++;
          if (optAttempt <= maxOptRetries) {
            terminal.warn(`正文优化重试 ${optAttempt}/${maxOptRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * optAttempt));
            continue;
          }
          throw optErr;
        }
      }
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
        const updatedChapters = (this.novel.chapters || []).map(c => {
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
        // 异步润色结果上报：仅发送受影响章节
        const optDelta = (this.novel.chapters || []).filter(c => c.id === chapterId);
        onNovelUpdate({ ...this.novel, chapters: optDelta });
      }
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || /aborted/i.test(e.message);
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

import OpenAI from 'openai';
import terminal from 'virtual:terminal';
import { Chapter, Novel } from '../types';

/**
 * 严格判定总结类型 (识别 subtype 或 标题关键字)
 */
export const isSummaryChapter = (c: Chapter): boolean =>
  c.subtype === 'small_summary' ||
  c.subtype === 'big_summary' ||
  (typeof c.title === 'string' &&
    (c.title.includes('🔹小总结') || c.title.includes('🔸大总结') || c.title.includes('总结')));

/**
 * 核心章节排序引擎 (V5 - 物理隔离与分卷强校验版)
 * 解决问题：防止总结章节由于索引失效或逻辑偏差，在多分卷场景下漂移到分卷顶部或全书顶部。
 */
export const sortChapters = (chapters: Chapter[]): Chapter[] => {
  if (!chapters || !Array.isArray(chapters)) return [];

  const startTime = Date.now();

  // 1. 分离剧情章与总结章
  const allStories = chapters.filter(c => !isSummaryChapter(c));
  const allSummaries = chapters.filter(c => isSummaryChapter(c));

  if (allStories.length === 0) return chapters;

  // 2. 预对齐：为每个总结寻找它在全局剧情流中的“挂载点”
  const summariesByParentId = new Map<number, Chapter[]>();
  const globalOrphans: Chapter[] = [];

  allSummaries.forEach(s => {
    const range = s.summaryRange?.split('-').map(Number);
    if (range && range.length === 2 && !isNaN(range[1]) && range[1] > 0) {
      // 获取该总结理论上应该跟随的剧情章 (基于全局物理索引)
      const targetStory = allStories[range[1] - 1];
      if (targetStory) {
        if (!summariesByParentId.has(targetStory.id)) summariesByParentId.set(targetStory.id, []);
        summariesByParentId.get(targetStory.id)!.push(s);
        return;
      }
    }
    globalOrphans.push(s);
  });

  // 3. 构建分卷拓扑：按剧情章出现的先后顺序排列分卷
  const volumeOrder: (string | undefined)[] = [];
  const storiesByVol = new Map<string | undefined, Chapter[]>();

  allStories.forEach(s => {
    if (!volumeOrder.includes(s.volumeId)) volumeOrder.push(s.volumeId);
    if (!storiesByVol.has(s.volumeId)) storiesByVol.set(s.volumeId, []);
    storiesByVol.get(s.volumeId)!.push(s);
  });

  const finalResult: Chapter[] = [];

  // 4. 逐卷装配
  volumeOrder.forEach(vid => {
    const volStories = storiesByVol.get(vid) || [];

    volStories.forEach(story => {
      finalResult.push(story);
      // 挂载属于该章的总结
      const related = summariesByParentId.get(story.id);
      if (related) {
        related.sort((a, b) => {
          // 类型优先级：小总结在前
          if (a.subtype !== b.subtype) return a.subtype === 'small_summary' ? -1 : 1;
          // 范围优先级：范围更小的在前 (即起始章节更晚)
          const startA = parseInt(a.summaryRange?.split('-')[0] || '0');
          const startB = parseInt(b.summaryRange?.split('-')[0] || '0');
          if (startA !== startB) return startB - startA;
          return (a.id || 0) - (b.id || 0);
        });
        finalResult.push(...related);
      }
    });

    // 分卷孤儿补救：如果孤儿总结的 volumeId 指向该卷，将其强制堆叠在该卷正文结束之后
    const volOrphans = globalOrphans.filter(o => o.volumeId === vid);
    finalResult.push(...volOrphans);
  });

  // 5. 最终孤儿兜底：完全没分卷且没挂载点的，追加到全书末尾
  const processedIds = new Set(finalResult.map(c => c.id));
  const remaining = chapters.filter(c => !processedIds.has(c.id));
  if (remaining.length > 0) {
    finalResult.push(...remaining);
  }

  // 6. 防护盾：如果结果列表第一项是总结，强行将其下移
  if (finalResult.length > 1 && isSummaryChapter(finalResult[0])) {
    terminal.error(`[SORT SHIELD] 拦截到总结漂移至顶部: ${finalResult[0].title}`);
    const firstStoryIdx = finalResult.findIndex(c => !isSummaryChapter(c));
    if (firstStoryIdx !== -1) {
      const [badItem] = finalResult.splice(0, 1);
      finalResult.splice(firstStoryIdx, 0, badItem);
    }
  }

  const duration = Date.now() - startTime;
  if (duration > 30) {
    terminal.log(`[PERF] SummaryManager.sortChapters V5: ${duration}ms`);
  }

  return finalResult;
};

/**
 * 总结范围动态校准工具
 * 核心逻辑：以“物理前驱剧情章”作为唯一事实来源，强制修正失效的总结索引。
 */
export const recalibrateSummaries = (chapters: Chapter[]): Chapter[] => {
  // 1. 剧情章物理索引参考
  const storyChapters = chapters.filter(c => !isSummaryChapter(c));
  const idToGlobalIdx = new Map<number, number>();
  storyChapters.forEach((c, i) => idToGlobalIdx.set(c.id, i + 1));

  // 2. 遍历校准
  return chapters.map((chapter, index) => {
    if (!isSummaryChapter(chapter)) return chapter;

    // 【深度修复】：不仅要对齐 range，还要强制纠正 volumeId
    // 逻辑：总结章节必须属于它在数组位置上紧邻的那个剧情章所属的分卷
    let anchor: Chapter | null = null;
    for (let i = index - 1; i >= 0; i--) {
      if (!isSummaryChapter(chapters[i])) {
        anchor = chapters[i];
        break;
      }
    }

    // 如果该总结前完全没有剧情章，说明它彻底迷路了，将其归入第一个剧情章的分卷
    if (!anchor) {
      const firstStory = storyChapters[0];
      if (firstStory) {
        return { ...chapter, summaryRange: '1-1', volumeId: firstStory.volumeId };
      }
      return chapter;
    }

    const currentEnd = idToGlobalIdx.get(anchor.id) || 1;
    const oldRange = chapter.summaryRange || '1-1';
    const [oldS, oldE] = oldRange.split('-').map(Number);
    const span = Math.max(1, (oldE || 1) - (oldS || 1) + 1);

    // 校准逻辑：计算新的起始点，但如果是分卷模式，严禁跨越分卷起始章
    let newStart = Math.max(1, currentEnd - span + 1);

    // 获取该分卷的第一章全局索引
    const volumeStories = storyChapters.filter(s => s.volumeId === anchor!.volumeId);
    const firstInVol = volumeStories[0];
    if (firstInVol) {
      const volStartIdx = idToGlobalIdx.get(firstInVol.id) || 1;
      if (newStart < volStartIdx) {
        newStart = volStartIdx;
      }
    }

    const newRange = `${newStart}-${currentEnd}`;
    const hasChanged = newRange !== chapter.summaryRange || chapter.volumeId !== anchor.volumeId;

    if (hasChanged) {
      terminal.log(`[FIX] 校准章节: "${chapter.title}" 位置修正为分卷 [${anchor.volumeId}] 索引 [${newRange}]`);
      return {
        ...chapter,
        summaryRange: newRange,
        volumeId: anchor.volumeId, // 强制纠正分卷归属，防止 UI 渲染时的跨卷漂移
        title: chapter.title.replace(/\(\d+-\d+\)/, `(${newRange})`),
      };
    }
    return chapter;
  });
};

export interface SummaryConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  smallSummaryInterval: number;
  bigSummaryInterval: number;
  smallSummaryPrompt: string;
  bigSummaryPrompt: string;
  contextChapterCount?: number;
  contextScope?: string;
  runId?: string | null; // 核心修复 (Bug 2): 支持执行锁校验
}

const getStableContent = (chapter: Chapter) => {
  if (chapter.content && chapter.content.trim().length > 0) return chapter.content;
  if (chapter.versions && chapter.versions.length > 0) {
    const original = chapter.versions?.find(v => v.type === 'original');
    if (original && original.content) return original.content;
    const valid = [...(chapter.versions || [])].reverse().find(v => v.content && v.content.length > 0);
    if (valid) return valid.content;
  }
  return chapter.content || '';
};

const activeGenerations = new Set<string>();

export const checkAndGenerateSummary = async (
  targetChapterId: number,
  currentContent: string,
  targetNovelId: string,
  novels: Novel[],
  setNovels: (updater: (prev: Novel[]) => Novel[]) => void,
  config: SummaryConfig,
  log: (msg: string) => void,
  errorLog: (msg: string) => void,
  signal?: AbortSignal,
  forceFinal?: boolean,
): Promise<Novel | undefined> => {
  if (signal?.aborted) return;

  // 核心修复 (Bug 2): 引入工作流状态校验闭包
  const { workflowManager } = await import('./WorkflowManager');
  const checkActive = () => {
    if (signal?.aborted) return false;
    // 如果传入了 runId，则强制校验其活跃性。若未传入则视为非锁任务（兼容模式）
    if (config.runId && !workflowManager.isRunActive(config.runId)) {
      terminal.warn(`[SummaryManager] 侦测到过时总结任务 (RunID: ${config.runId})，正在拦截。`);
      return false;
    }
    return true;
  };

  if (!checkActive()) return;

  const startTime = Date.now();
  const {
    apiKey,
    baseUrl,
    model,
    smallSummaryInterval,
    bigSummaryInterval,
    smallSummaryPrompt,
    bigSummaryPrompt,
    contextChapterCount = 1,
    contextScope = 'all',
  } = config;

  if (!apiKey || !targetNovelId) return;

  const currentNovel = novels?.find(n => n.id === targetNovelId);
  if (!currentNovel) return undefined;

  // 1. 构建全书章节快照（包含当前正文更新）
  const allChapters = (currentNovel.chapters || []).map(c => {
    if (c.id === targetChapterId) return { ...c, content: currentContent };
    return c;
  });

  // 2. 核心修复：分卷数据物理隔离
  // 如果处于本卷模式，我们将后续所有操作的“世界”裁切为仅包含当前分卷
  const isVolMode = config.contextScope === 'volume';
  const targetChapForVol = allChapters.find(c => c.id === targetChapterId);
  const targetVolumeId = targetChapForVol?.volumeId;

  let currentChaptersSnapshot = allChapters;
  if (isVolMode) {
    currentChaptersSnapshot = allChapters.filter(c => {
      // 统一 ID 比较逻辑
      const cVolId = c.volumeId ? String(c.volumeId) : '';
      const tVolId = targetVolumeId ? String(targetVolumeId) : '';
      return cVolId === tVolId;
    });
    terminal.log(
      `[SummaryManager] 本卷模式启用，已裁切快照，当前数据源仅包含本卷 (${currentChaptersSnapshot.length}个章节)`,
    );
  }

  const getSnapshotStoryChapters = () =>
    (currentChaptersSnapshot || []).filter(c => !c.subtype || c.subtype === 'story');

  const storyChapters = getSnapshotStoryChapters();
  const globalIndex = storyChapters.findIndex(c => c.id === targetChapterId);
  if (globalIndex === -1) {
    // 只有在非本卷模式且由于某种原因找不到章节时才退出。
    // 在本卷模式下，如果裁切后仍找不到，说明逻辑有误。
    return;
  }

  const targetChapterObj = storyChapters[globalIndex];

  const volumeStoryChapters = storyChapters; // 在裁切后的快照中，storyChapters 就是本卷章节
  const indexInVolume = volumeStoryChapters.findIndex(c => c.id === targetChapterId);
  const currentCountInVolume = indexInVolume + 1;

  const sInterval = Number(smallSummaryInterval) || 3;
  const bInterval = Number(bigSummaryInterval) || 6;

  let lastUpdatedNovel: Novel = { ...currentNovel, chapters: currentChaptersSnapshot };
  const pendingSummaries: Chapter[] = [];

  const generate = async (type: 'small' | 'big', start: number, end: number, lastChapterId: number) => {
    const rangeStr = `${start}-${end}`;
    const subtype = type === 'small' ? 'small_summary' : ('big_summary' as const);

    log(`[Summary] Checking ${type} summary for range ${rangeStr}...`);

    let sourceText = '';
    if (type === 'small') {
      const targetChapters = getSnapshotStoryChapters()
        .slice(start - 1, end)
        .filter(c => c.volumeId === targetVolumeId || (!c.volumeId && !targetVolumeId));

      if (targetChapters.length === 0) return;
      sourceText = targetChapters.map(c => `Chapter: ${c.title}\n${getStableContent(c)}`).join('\n\n');
    } else {
      const allSmallSummaries = currentChaptersSnapshot
        .filter(c => {
          if (c.subtype !== 'small_summary' || !c.summaryRange) return false;
          // 本卷模式下，参与大总结构建的小总结必须属于同一卷
          if (contextScope === 'volume' && c.volumeId !== targetVolumeId) return false;
          const [s, e] = c.summaryRange.split('-').map(Number);
          return s >= start && e <= end;
        })
        .sort((a, b) => {
          const startA = parseInt(a.summaryRange!.split('-')[0]);
          const startB = parseInt(b.summaryRange!.split('-')[0]);
          return startA - startB;
        });

      const latestBigSummary = currentChaptersSnapshot
        .filter(c => {
          if (c.subtype !== 'big_summary' || !c.summaryRange) return false;
          // 本卷模式下，作为参考基准的历史大总结必须属于同一卷
          if (contextScope === 'volume' && c.volumeId !== targetVolumeId) return false;
          const [s, e] = c.summaryRange.split('-').map(Number);
          return s === start && e < end;
        })
        .sort((a, b) => {
          const endA = parseInt(a.summaryRange!.split('-')[1]);
          const endB = parseInt(b.summaryRange!.split('-')[1]);
          return endB - endA;
        })[0];

      const bigEnd = latestBigSummary ? parseInt(latestBigSummary.summaryRange!.split('-')[1]) : 0;
      let contextParts: string[] = [];

      if (latestBigSummary) {
        contextParts.push(`【历史剧情大总结 (${start}-${bigEnd}章)】：\n${latestBigSummary.content}`);
      }

      const incrementalSmallSummaries = allSmallSummaries.filter(s => {
        const sEnd = parseInt(s.summaryRange!.split('-')[1]);
        return sEnd > bigEnd;
      });

      if (incrementalSmallSummaries.length > 0) {
        contextParts.push(
          incrementalSmallSummaries.map(s => `【阶段剧情概要 (${s.summaryRange})】：\n${s.content}`).join('\n\n'),
        );
      }

      const latestSmallSummary = allSmallSummaries[allSmallSummaries.length - 1];
      const lastSmallEnd = latestSmallSummary ? parseInt(latestSmallSummary.summaryRange!.split('-')[1]) : bigEnd;
      const lookbackStart = Math.max(start, lastSmallEnd - contextChapterCount + 1);
      const relevantOriginalChapters = getSnapshotStoryChapters().filter((_, idx) => {
        const cNum = idx + 1;
        return cNum >= lookbackStart && cNum <= end;
      });

      if (relevantOriginalChapters.length > 0) {
        contextParts.push(
          `【近期章节原文细节】：\n${relevantOriginalChapters
            .map(c => `### ${c.title}\n${getStableContent(c)}`)
            .join('\n\n')}`,
        );
      }
      sourceText = contextParts.join('\n\n---\n\n');
    }

    if (!sourceText) return;

    try {
      const openai = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true });
      let prompt = type === 'small' ? smallSummaryPrompt : bigSummaryPrompt;

      // 在本卷模式下，通过系统指令强力约束 AI 的总结范围
      if (isVolMode) {
        if (type === 'big') {
          prompt = `【分卷大总结专项指令】：当前正在进行“分卷创作模式”，你必须仅针对下方提供的本卷内容进行大总结。严禁提及或猜测任何不属于下方内容的剧情。你的总结范围应严格限定在本卷内。\n\n${prompt}`;
        } else {
          prompt = `【分卷小总结专项指令】：你必须仅针对下方提供的本卷片段进行概要总结。严禁提及本卷以外的内容。\n\n${prompt}`;
        }
      }

      console.group(
        `%c[Summary AI Request] %c${type === 'small' ? '🔹小总结' : '🔸大总结'} (${rangeStr})`,
        'color: #1a73e8; font-weight: bold;',
        'color: #333;',
      );
      console.log('%c[Context Scope]:', 'color: #666; font-weight: bold;', contextScope);
      console.log('%c[Source Text]:', 'color: #666; font-weight: bold;', sourceText);
      console.log('%c[Prompt]:', 'color: #666; font-weight: bold;', prompt);
      console.groupEnd();

      const completion = await openai.chat.completions.create(
        {
          model: model,
          messages: [
            { role: 'system', content: 'You are a professional editor helper.' },
            { role: 'user', content: `${sourceText}\n\n${prompt}` },
          ],
          temperature: 0.5,
        },
        { signal },
      );

      if (!checkActive()) return;
      const summaryContent = completion.choices[0]?.message?.content || '';
      if (summaryContent && checkActive()) {
        const existingIndex = currentChaptersSnapshot.findIndex(
          c => c.subtype === subtype && c.summaryRange === rangeStr,
        );
        if (existingIndex !== -1) {
          currentChaptersSnapshot[existingIndex] = {
            ...currentChaptersSnapshot[existingIndex],
            content: summaryContent,
          };
        } else {
          const newChapter: Chapter = {
            id: Date.now() + Math.floor(Math.random() * 10000),
            title: `${type === 'small' ? '🔹小总结' : '🔸大总结'} (${rangeStr})`,
            content: summaryContent,
            subtype: subtype,
            summaryRange: rangeStr,
            volumeId: targetVolumeId || undefined,
          };
          const snapIdx = currentChaptersSnapshot.findIndex(c => c.id === lastChapterId);
          if (snapIdx !== -1) {
            let insertAt = snapIdx + 1;
            while (insertAt < currentChaptersSnapshot.length && isSummaryChapter(currentChaptersSnapshot[insertAt])) {
              insertAt++;
            }
            currentChaptersSnapshot.splice(insertAt, 0, newChapter);
          } else {
            currentChaptersSnapshot.push(newChapter);
          }
        }
        const lastCreated = currentChaptersSnapshot.find(c => c.subtype === subtype && c.summaryRange === rangeStr);
        if (lastCreated) pendingSummaries.push(lastCreated);
      }
    } catch (e) {
      errorLog(`[Summary] Failed to generate ${type} summary: ${(e as any).message}`);
    }
  };

  // Trigger Logic
  for (let i = sInterval; i <= currentCountInVolume; i += sInterval) {
    const batchChapters = volumeStoryChapters.slice(i - sInterval, i);
    if (batchChapters.length > 0) {
      // 修正：即便物理隔离了数据，我们仍需要获取该章在全书中的真实物理索引用于标题显示
      const allStoryChapters = allChapters.filter(c => !c.subtype || c.subtype === 'story');
      let globalStart = allStoryChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
      const globalEnd = allStoryChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;

      // 如果是本卷模式，且该 batch 跨越了卷边界（理论上 slice 不会，但如果是基于 volumeStoryChapters 产生的 i 可能会有偏离）
      // 确保 globalStart 不会早于本卷第一章
      if (contextScope === 'volume') {
        const firstStoryInVol = volumeStoryChapters[0];
        const volStartIdx = allStoryChapters.findIndex(c => c.id === firstStoryInVol.id) + 1;
        if (globalStart < volStartIdx) globalStart = volStartIdx;
      }

      const rangeStr = `${globalStart}-${globalEnd}`;
      const lockKey = `${targetNovelId}_small_${rangeStr}`;
      if (
        !currentChaptersSnapshot.some(c => c.subtype === 'small_summary' && c.summaryRange === rangeStr) &&
        !activeGenerations.has(lockKey)
      ) {
        activeGenerations.add(lockKey);
        try {
          await generate('small', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
        } finally {
          activeGenerations.delete(lockKey);
        }
      }
    }
  }

  for (let i = bInterval; i <= currentCountInVolume; i += bInterval) {
    const batchChapters = volumeStoryChapters.slice(i - bInterval, i);
    if (batchChapters.length > 0) {
      // 修正大总结起始位置计算
      const allStoryChapters = allChapters.filter(c => !c.subtype || c.subtype === 'story');
      let globalStart = 1;
      if (contextScope !== 'all') {
        const firstInVol = volumeStoryChapters[0];
        if (firstInVol) globalStart = allStoryChapters.findIndex(c => c.id === firstInVol.id) + 1;
      }
      const globalEnd = allStoryChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      const rangeStr = `${globalStart}-${globalEnd}`;
      const lockKey = `${targetNovelId}_big_${rangeStr}`;
      if (
        !currentChaptersSnapshot.some(c => c.subtype === 'big_summary' && c.summaryRange === rangeStr) &&
        !activeGenerations.has(lockKey)
      ) {
        activeGenerations.add(lockKey);
        try {
          await generate('big', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
        } finally {
          activeGenerations.delete(lockKey);
        }
      }
    }
  }

  // 强制收尾逻辑 (Force Final Completion)
  if (forceFinal) {
    log(`[Summary] Force final summary check triggered for volume: ${targetVolumeId || 'default'}`);

    // 1. 补全小总结
    const existingSmallSummaries = currentChaptersSnapshot.filter(
      c => c.subtype === 'small_summary' && (targetVolumeId ? c.volumeId === targetVolumeId : !c.volumeId),
    );

    const allStoryChapters = allChapters.filter(c => !c.subtype || c.subtype === 'story');
    const firstStoryInVol = volumeStoryChapters[0];
    const firstGlobalIdxInVol = firstStoryInVol ? allStoryChapters.findIndex(c => c.id === firstStoryInVol.id) + 1 : 1;

    let lastSmallEnd = 0;
    existingSmallSummaries.forEach(s => {
      const range = s.summaryRange?.split('-').map(Number);
      if (range && range.length === 2 && range[1] > lastSmallEnd) {
        lastSmallEnd = range[1];
      }
    });

    // 如果是本卷模式且没有任何小总结，起始点应从本卷第一章开始，而不是从第1章开始
    if (lastSmallEnd === 0 && contextScope === 'volume' && firstGlobalIdxInVol > 1) {
      lastSmallEnd = firstGlobalIdxInVol - 1;
    }

    // 如果分卷内最后一章还没被小总结覆盖
    const lastStoryChapterInVol = volumeStoryChapters[volumeStoryChapters.length - 1];
    if (lastStoryChapterInVol) {
      const lastGlobalIdx = allStoryChapters.findIndex(c => c.id === lastStoryChapterInVol.id) + 1;

      if (lastSmallEnd < lastGlobalIdx) {
        // 避免产生只有 0 节跨度的小总结 (除非是强制首章)
        const start = lastSmallEnd + 1;
        const end = lastGlobalIdx;
        const rangeStr = `${start}-${end}`;
        const lockKey = `${targetNovelId}_final_small_${rangeStr}`;

        if (!activeGenerations.has(lockKey)) {
          activeGenerations.add(lockKey);
          try {
            await generate('small', start, end, lastStoryChapterInVol.id);
          } finally {
            activeGenerations.delete(lockKey);
          }
        }
      }
    }

    // 2. 补全大总结
    const existingBigSummaries = currentChaptersSnapshot.filter(
      c => c.subtype === 'big_summary' && (targetVolumeId ? c.volumeId === targetVolumeId : !c.volumeId),
    );

    let lastBigEnd = 0;
    existingBigSummaries.forEach(s => {
      const range = s.summaryRange?.split('-').map(Number);
      if (range && range.length === 2 && range[1] > lastBigEnd) {
        lastBigEnd = range[1];
      }
    });

    if (lastStoryChapterInVol) {
      const lastGlobalIdx = allStoryChapters.findIndex(c => c.id === lastStoryChapterInVol.id) + 1;

      if (lastBigEnd < lastGlobalIdx) {
        let globalStart = 1;
        if (contextScope !== 'all') {
          const firstInVol = volumeStoryChapters[0];
          if (firstInVol) globalStart = allStoryChapters.findIndex(c => c.id === firstInVol.id) + 1;
        }

        // 修复：如果当前是大总结的起始章（分卷第一章），且并未达到总结间隔，不应强行生成大总结
        // 除非是 forceFinal 且当前章节数确实有增长
        const isFirstChapterInVol = lastGlobalIdx === globalStart;
        if (isFirstChapterInVol && !forceFinal) return;

        // 如果是分卷第一章就触发 forceFinal，且之前没总结过，通常是逻辑错误或章节太少，跳过
        if (isFirstChapterInVol && lastBigEnd === 0) {
          terminal.log(`[Summary] 跳过分卷首章的大总结生成: ${lastGlobalIdx}`);
          return;
        }

        const rangeStr = `${globalStart}-${lastGlobalIdx}`;
        const lockKey = `${targetNovelId}_final_big_${rangeStr}`;

        if (!activeGenerations.has(lockKey)) {
          activeGenerations.add(lockKey);
          try {
            await generate('big', globalStart, lastGlobalIdx, lastStoryChapterInVol.id);
          } finally {
            activeGenerations.delete(lockKey);
          }
        }
      }
    }
  }

  if (pendingSummaries.length > 0 && checkActive()) {
    setNovels(prev =>
      prev.map(n => {
        if (n.id !== targetNovelId) return n;
        const newSummaries = pendingSummaries.filter(c => !n.chapters.some(nc => nc.id === c.id));
        const updatedChapters = n.chapters.map(nc => {
          const match = pendingSummaries?.find(
            ps => ps.id === nc.id || (ps.subtype === nc.subtype && ps.summaryRange === nc.summaryRange),
          );
          return match ? { ...nc, content: match.content } : nc;
        });
        return { ...n, chapters: sortChapters([...updatedChapters, ...newSummaries]) };
      }),
    );
    lastUpdatedNovel = { ...currentNovel, chapters: sortChapters([...currentNovel.chapters, ...pendingSummaries]) };
  }

  return lastUpdatedNovel;
};

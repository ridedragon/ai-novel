import OpenAI from 'openai';
import terminal from 'virtual:terminal';
import { Chapter, Novel } from '../types';

/**
 * 核心章节排序函数：确保“章节-总结”关系的稳定性
 * 规则：
 * 1. 普通章节按数组原始顺序排列
 * 2. 总结章节紧跟在其 summaryRange 涵盖范围的最后一章之后
 * 3. 同一位置小总结在前，大总结在后
 */
let _sortCount = 0;
let _lastSortTime = 0;
let _lastResult: Chapter[] = [];
let _lastSignature = '';

/**
 * 获取章节列表的结构化签名，用于判断是否真正需要重新计算排序逻辑
 */
const getChaptersSignature = (chapters: Chapter[]): string => {
  // 仅提取影响排序的字段：ID、子类型、总结范围
  return chapters.map(c => `${c.id}-${c.subtype || 's'}-${c.summaryRange || ''}`).join('|');
};

export const sortChapters = (chapters: Chapter[]): Chapter[] => {
  if (!chapters || !Array.isArray(chapters)) return [];

  const startTime = Date.now();
  const currentSignature = getChaptersSignature(chapters);

  // 1. 快速路径：结构完全未变，直接按原顺序重新映射新对象（保持引用最新但跳过排序耗时）
  if (currentSignature === _lastSignature && _lastResult.length === chapters.length) {
    // 即使签名一样，对象引用可能变了（内容更新），我们需要返回包含最新内容的数组，但顺序按旧的来
    const idMap = new Map(chapters.map(c => [c.id, c]));
    const fastResult = _lastResult.map(old => idMap.get(old.id) || old);

    // 仍然检查频率，但不输出警告，因为这是廉价操作
    if (startTime - _lastSortTime >= 1000) {
      _sortCount = 0;
      _lastSortTime = startTime;
    }
    return fastResult;
  }

  // 2. 严格频率限制：针对“结构变化”的排序请求进行限流
  if (startTime - _lastSortTime < 1000) {
    _sortCount++;
    if (_sortCount > 1) {
      // 如果在冷却期内且不是第一次，除非是极重要的变动（如长度剧增），否则返回缓存
      if (_lastResult.length > 0 && Math.abs(_lastResult.length - chapters.length) < 1) {
        if (_sortCount % 10 === 0) {
          terminal.warn(`[FREQ LIMIT] sortChapters 结构排序限流中: 1秒内已屏蔽 ${_sortCount} 次计算`);
        }
        return _lastResult;
      }
    }
  } else {
    _sortCount = 1;
    _lastSortTime = startTime;
  }

  // 1. 分离非总结章节（保持原始顺序）和总结章节
  const storyChapters = chapters.filter(c => c.subtype !== 'small_summary' && c.subtype !== 'big_summary');
  const summaries = chapters.filter(c => c.subtype === 'small_summary' || c.subtype === 'big_summary');

  const finalChapters: Chapter[] = [];

  // 按总结的范围结束点进行分组
  const summariesByEndIndex = new Map<number, Chapter[]>();
  summaries.forEach(s => {
    const range = s.summaryRange?.split('-').map(Number);
    if (range && range.length === 2) {
      const end = range[1];
      if (!summariesByEndIndex.has(end)) summariesByEndIndex.set(end, []);
      summariesByEndIndex.get(end)?.push(s);
    }
  });

  // 对每一组内的总结进行排序：规定同一结束点，小总结在前，大总结在后。
  // 若类型相同，起始章节靠后（即总结范围更小、更具体的）排在前面。
  summariesByEndIndex.forEach(group => {
    group.sort((a, b) => {
      // 1. 优先级最高：子类型 (small_summary < big_summary)
      if (a.subtype !== b.subtype) {
        return a.subtype === 'small_summary' ? -1 : 1;
      }

      // 2. 类型相同时：起始章节降序 (例如 4-6 排在 1-6 之前)
      const startA = parseInt(a.summaryRange?.split('-')[0] || '0');
      const startB = parseInt(b.summaryRange?.split('-')[0] || '0');
      if (startA !== startB) return startB - startA;

      // 3. 兜底：ID 稳定排序，防止视觉闪烁
      return (a.id || 0) - (b.id || 0);
    });
  });

  // 构建最终列表
  storyChapters.forEach((chapter, index) => {
    finalChapters.push(chapter);
    const storyOrder = index + 1;
    const matchedSummaries = summariesByEndIndex.get(storyOrder);
    if (matchedSummaries) {
      finalChapters.push(...matchedSummaries);
    }
  });

  // 补漏：处理那些无法通过范围匹配到的孤立总结（按 ID 兜底）
  const processedIds = new Set(finalChapters.map(c => c.id));
  summaries.forEach(s => {
    if (!processedIds.has(s.id)) {
      finalChapters.push(s);
    }
  });

  const endTime = Date.now();
  if (endTime - startTime > 30) {
    terminal.log(`[PERF] SummaryManager.sortChapters: ${endTime - startTime}ms (Chapters: ${chapters.length})`);
  }

  // 更新缓存
  _lastSignature = currentSignature;
  _lastResult = finalChapters;

  return finalChapters;
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
}

// Helper: Get stable content (fallback to versions if content is empty/optimizing)
const getStableContent = (chapter: Chapter) => {
  if (chapter.content && chapter.content.trim().length > 0) return chapter.content;
  if (chapter.versions && chapter.versions.length > 0) {
    // Prefer original or last valid version
    const original = chapter.versions.find(v => v.type === 'original');
    if (original && original.content) return original.content;
    const valid = [...chapter.versions].reverse().find(v => v.content && v.content.length > 0);
    if (valid) return valid.content;
  }
  return chapter.content || '';
};

// 模块级锁，防止同一小说在同一时间内对同一范围触发多次生成请求
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
): Promise<Novel | undefined> => {
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

  const currentNovel = novels.find(n => n.id === targetNovelId);
  if (!currentNovel) return undefined;

  // Snapshot of chapters for this generation session
  // This snapshot will be updated locally as we generate new summaries
  let currentChaptersSnapshot = (currentNovel.chapters || []).map(c => {
    // Ensure the snapshot has the latest content for the target chapter,
    // and also ensure other chapters in this batch (which might have been updated in Ref but not yet in this function's 'novels' parameter) are captured.
    if (c.id === targetChapterId) return { ...c, content: currentContent };

    // Check if the chapter content in novelsRef is newer (relevant for batch mode)
    // Note: Since we don't have access to novelsRef here, we trust the 'novels' passed in
    // BUT we must make sure the caller in App.tsx passes the most recent data.
    return c;
  });

  // Helper to get story chapters from the snapshot
  // We rely on array order as the "truth" for story sequence, especially if user reordered chapters.
  const getSnapshotStoryChapters = () =>
    (currentChaptersSnapshot || []).filter(c => !c.subtype || c.subtype === 'story');

  const storyChapters = getSnapshotStoryChapters();
  const globalIndex = storyChapters.findIndex(c => c.id === targetChapterId);
  if (globalIndex === -1) return;

  const targetChapterObj = storyChapters[globalIndex];
  const targetVolumeId = targetChapterObj.volumeId;

  // Calculate Volume-based Count
  const volumeStoryChapters = storyChapters.filter(c => c.volumeId === targetChapterObj.volumeId);
  const indexInVolume = volumeStoryChapters.findIndex(c => c.id === targetChapterId);
  const currentCountInVolume = indexInVolume + 1;

  const sInterval = Number(smallSummaryInterval) || 3;
  const bInterval = Number(bigSummaryInterval) || 6;

  let lastUpdatedNovel: Novel = { ...currentNovel, chapters: currentChaptersSnapshot };

  const pendingSummaries: Chapter[] = [];

  const generate = async (type: 'small' | 'big', start: number, end: number, lastChapterId: number) => {
    const rangeStr = `${start}-${end}`;
    const subtype = type === 'small' ? 'small_summary' : ('big_summary' as const);

    terminal.log(`[SUMMARY] 正在检查并准备生成${type === 'small' ? '小总结' : '大总结'}: 范围 ${rangeStr}`);
    log(`[Summary] Checking ${type} summary for range ${rangeStr}...`);

    // Prepare Context using the Snapshot
    let sourceText = '';
    if (type === 'small') {
      // 容错性增强：除了目标分卷，也要考虑未分类章节，防止跨分卷移动后的总结关联失效
      const targetChapters = getSnapshotStoryChapters()
        .slice(start - 1, end)
        .filter(c => c.volumeId === targetVolumeId || (!c.volumeId && !targetVolumeId));

      if (targetChapters.length === 0) return;
      sourceText = targetChapters.map(c => `Chapter: ${c.title}\n${getStableContent(c)}`).join('\n\n');
    } else {
      // --- 重构：全量累积式大总结上下文构建 ---
      // 目标：[历史最近大总结] + [后续所有小总结] + [基于深度的正文原文]

      // 1. 获取所有相关的小总结 (start 到 end)
      const allSmallSummaries = currentChaptersSnapshot
        .filter(c => {
          if (c.subtype !== 'small_summary' || !c.summaryRange) return false;
          const [s, e] = c.summaryRange.split('-').map(Number);
          return s >= start && e <= end;
        })
        .sort((a, b) => {
          const startA = parseInt(a.summaryRange!.split('-')[0]);
          const startB = parseInt(b.summaryRange!.split('-')[0]);
          return startA - startB;
        });

      // 2. 寻找最近的一个大总结 (且范围结束于本次 end 之前)
      const latestBigSummary = currentChaptersSnapshot
        .filter(c => {
          if (c.subtype !== 'big_summary' || !c.summaryRange) return false;
          const [s, e] = c.summaryRange.split('-').map(Number);
          return s === start && e < end;
        })
        .sort((a, b) => {
          const endA = parseInt(a.summaryRange!.split('-')[1]);
          const endB = parseInt(b.summaryRange!.split('-')[1]);
          return endB - endA; // 取结束章节最大的那个
        })[0];

      const bigEnd = latestBigSummary ? parseInt(latestBigSummary.summaryRange!.split('-')[1]) : 0;

      // 3. 构造 Prompt 内容
      let contextParts: string[] = [];

      if (latestBigSummary) {
        contextParts.push(`【历史剧情大总结 (${start}-${bigEnd}章)】：\n${latestBigSummary.content}`);
      }

      // 仅包含在大总结结束之后的那些小总结，避免重复
      const incrementalSmallSummaries = allSmallSummaries.filter(s => {
        const sEnd = parseInt(s.summaryRange!.split('-')[1]);
        return sEnd > bigEnd;
      });

      if (incrementalSmallSummaries.length > 0) {
        const smallText = incrementalSmallSummaries
          .map(s => `【阶段剧情概要 (${s.summaryRange})】：\n${s.content}`)
          .join('\n\n');
        contextParts.push(smallText);
      }

      // 4. 确定正文原文提取范围
      // 策略：提取最近的一个小总结之前的 N 章 (depth)，加上最后一个小总结之后的所有章节 (incremental)
      const latestSmallSummary = allSmallSummaries[allSmallSummaries.length - 1];
      const lastSmallEnd = latestSmallSummary ? parseInt(latestSmallSummary.summaryRange!.split('-')[1]) : bigEnd;

      const storyChapters = getSnapshotStoryChapters();

      // 双段式原文提取
      const lookbackStart = Math.max(start, lastSmallEnd - contextChapterCount + 1);
      const relevantOriginalChapters = storyChapters.filter((_, idx) => {
        const cNum = idx + 1;
        // 包含最近小总结边界附近的细节，以及小总结之后尚未被总结的增量章节
        return cNum >= lookbackStart && cNum <= end;
      });

      if (relevantOriginalChapters.length > 0) {
        const originalText = relevantOriginalChapters.map(c => `### ${c.title}\n${getStableContent(c)}`).join('\n\n');
        contextParts.push(`【近期章节原文细节 (用于确保逻辑连贯)】：\n${originalText}`);
      }

      sourceText = contextParts.join('\n\n---\n\n');
    }

    if (!sourceText) return;

    try {
      const openai = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true });
      const prompt = type === 'small' ? smallSummaryPrompt : bigSummaryPrompt;

      log(`
>> AI REQUEST [章节总结生成: ${type === 'small' ? '小总结' : '大总结'}]
>> -----------------------------------------------------------
>> Model:       ${model}
>> Range:       ${rangeStr}
>> -----------------------------------------------------------
      `);

      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: 'You are a professional editor helper.' },
          { role: 'user', content: `${sourceText}\n\n${prompt}` },
        ],
        temperature: 0.5,
      });

      const summaryContent = completion.choices[0]?.message?.content || '';
      log(
        `[Summary Result] ${type} (${rangeStr}):\n${summaryContent.slice(0, 300)}${
          summaryContent.length > 300 ? '...' : ''
        }`,
      );
      if (summaryContent) {
        const existingIndex = currentChaptersSnapshot.findIndex(
          c => c.subtype === subtype && c.summaryRange === rangeStr,
        );

        if (existingIndex !== -1) {
          // Update existing
          const existingChapter = currentChaptersSnapshot[existingIndex];
          const updatedChapter = { ...existingChapter, content: summaryContent };
          currentChaptersSnapshot[existingIndex] = updatedChapter;
          log(`[Summary] Updated ${type} summary for ${rangeStr}.`);
        } else {
          // Create new
          const newChapter: Chapter = {
            id: Date.now() + Math.floor(Math.random() * 10000),
            title: `${type === 'small' ? '🔹小总结' : '🔸大总结'} (${rangeStr})`,
            content: summaryContent,
            subtype: subtype,
            summaryRange: rangeStr,
            // 强化：确保总结章节的 volumeId 与其涵盖的末尾章节一致
            volumeId: targetVolumeId || undefined,
          };

          // Update Snapshot - Insert after the last chapter of the range
          const snapIdx = currentChaptersSnapshot.findIndex(c => c.id === lastChapterId);
          if (snapIdx !== -1) {
            let insertAt = snapIdx + 1;
            while (
              insertAt < currentChaptersSnapshot.length &&
              (currentChaptersSnapshot[insertAt].subtype === 'small_summary' ||
                currentChaptersSnapshot[insertAt].subtype === 'big_summary')
            ) {
              insertAt++;
            }
            currentChaptersSnapshot.splice(insertAt, 0, newChapter);
          } else {
            currentChaptersSnapshot.push(newChapter);
          }
          log(`[Summary] Created ${type} summary for ${rangeStr}.`);
        }

        // 收集待更新的总结
        const lastCreated = currentChaptersSnapshot.find(c => c.subtype === subtype && c.summaryRange === rangeStr);
        if (lastCreated) {
          pendingSummaries.push(lastCreated);
        }
      }
    } catch (e) {
      console.error(e);
      errorLog(`[Summary] Failed to generate ${type} summary: ${(e as any).message}`);
    }
  };

  // Check Small Summary Trigger (Volume Based)
  // 改进：检查当前及之前所有应触发但未触发的总结，防止丢失
  for (let i = sInterval; i <= currentCountInVolume; i += sInterval) {
    const batchEndVolIndex = i - 1;
    const batchStartVolIndex = i - sInterval;
    const batchChapters = volumeStoryChapters.slice(batchStartVolIndex, batchEndVolIndex + 1);

    if (batchChapters.length > 0) {
      const globalStart = storyChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      const rangeStr = `${globalStart}-${globalEnd}`;

      // 检查是否已存在该范围的总结
      const exists = currentChaptersSnapshot.some(c => c.subtype === 'small_summary' && c.summaryRange === rangeStr);
      const lockKey = `${targetNovelId}_small_${rangeStr}`;

      if (!exists && !activeGenerations.has(lockKey)) {
        activeGenerations.add(lockKey);
        try {
          await generate('small', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
        } finally {
          activeGenerations.delete(lockKey);
        }
      }
    }
  }

  // Check Big Summary Trigger (Volume Based)
  for (let i = bInterval; i <= currentCountInVolume; i += bInterval) {
    const batchEndVolIndex = i - 1;
    const batchStartVolIndex = i - bInterval;
    const batchChapters = volumeStoryChapters.slice(batchStartVolIndex, batchEndVolIndex + 1);

    if (batchChapters.length > 0) {
      // 累积式修改：根据 contextScope 决定大总结的起点
      let globalStart = 1;
      if (contextScope === 'current' || (contextScope !== 'all' && contextScope)) {
        // 如果是仅当前卷或指定分卷，起点为该分卷的第一章
        const firstInVolume = volumeStoryChapters[0];
        if (firstInVolume) {
          const startIdx = storyChapters.findIndex(c => c.id === firstInVolume.id);
          if (startIdx !== -1) {
            globalStart = startIdx + 1;
          }
        }
      }

      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      const rangeStr = `${globalStart}-${globalEnd}`;

      const exists = currentChaptersSnapshot.some(c => c.subtype === 'big_summary' && c.summaryRange === rangeStr);
      const lockKey = `${targetNovelId}_big_${rangeStr}`;

      if (!exists && !activeGenerations.has(lockKey)) {
        activeGenerations.add(lockKey);
        try {
          await generate('big', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
        } finally {
          activeGenerations.delete(lockKey);
        }
      }
    }
  }

  // 批量更新：一次性将所有生成的总结同步到状态中
  if (pendingSummaries.length > 0) {
    setNovels(prevNovels =>
      prevNovels.map(n => {
        if (n.id !== targetNovelId) return n;

        // 1. 识别新增的总结条目
        const newSummaries = pendingSummaries.filter(c => !n.chapters.some(nc => nc.id === c.id));

        // 2. 更新现有总结的内容
        const updatedChapters = n.chapters.map(nc => {
          const match = pendingSummaries.find(
            ps => ps.id === nc.id || (ps.subtype === nc.subtype && ps.summaryRange === nc.summaryRange),
          );
          return match ? { ...nc, content: match.content } : nc;
        });

        // 3. 合并新条目并排序
        const finalChapters = sortChapters([...updatedChapters, ...newSummaries]);
        return { ...n, chapters: finalChapters };
      }),
    );

    // 同步到最终返回的 Novel 对象
    lastUpdatedNovel = { ...currentNovel, chapters: sortChapters([...currentNovel.chapters, ...pendingSummaries]) };
  }

  const endTime = Date.now();
  if (endTime - startTime > 100) {
    terminal.log(`[PERF] SummaryManager.checkAndGenerateSummary total time: ${endTime - startTime}ms`);
  }

  return lastUpdatedNovel;
};

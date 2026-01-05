import OpenAI from 'openai';
import { Chapter, Novel } from '../types';

export interface SummaryConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  smallSummaryInterval: number;
  bigSummaryInterval: number;
  smallSummaryPrompt: string;
  bigSummaryPrompt: string;
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
  const { apiKey, baseUrl, model, smallSummaryInterval, bigSummaryInterval, smallSummaryPrompt, bigSummaryPrompt } =
    config;

  if (!apiKey || !targetNovelId) return;

  const currentNovel = novels.find(n => n.id === targetNovelId);
  if (!currentNovel) return undefined;

  // Snapshot of chapters for this generation session
  // This snapshot will be updated locally as we generate new summaries
  let currentChaptersSnapshot = currentNovel.chapters.map(c => {
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
  const getSnapshotStoryChapters = () => currentChaptersSnapshot.filter(c => !c.subtype || c.subtype === 'story');

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

  const generate = async (type: 'small' | 'big', start: number, end: number, lastChapterId: number) => {
    const rangeStr = `${start}-${end}`;
    const subtype = type === 'small' ? 'small_summary' : ('big_summary' as const);

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
      // For Big Summary, try to use Small Summaries first
      // We filter from currentChaptersSnapshot which includes any just-generated small summaries
      const relevantSmallSummaries = currentChaptersSnapshot
        .filter(c => {
          if (c.subtype !== 'small_summary' || !c.summaryRange) return false;
          const [s, e] = c.summaryRange.split('-').map(Number);
          const rangeMatch = s >= start && e <= end;
          const volumeMatch = c.volumeId === targetVolumeId || (!c.volumeId && !targetVolumeId);
          return rangeMatch && volumeMatch;
        })
        .sort((a, b) => {
          const startA = parseInt(a.summaryRange!.split('-')[0]);
          const startB = parseInt(b.summaryRange!.split('-')[0]);
          return startA - startB;
        });

      if (relevantSmallSummaries.length > 0) {
        sourceText = relevantSmallSummaries.map(c => `Small Summary (${c.summaryRange}):\n${c.content}`).join('\n\n');
      } else {
        const targetChapters = getSnapshotStoryChapters().slice(start - 1, end);
        sourceText = targetChapters.map(c => `Chapter: ${c.title}\n${getStableContent(c)}`).join('\n\n');
      }
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
            volumeId: targetVolumeId,
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

        // Sync to Novel and React State
        const finalChapters = [...currentChaptersSnapshot];
        lastUpdatedNovel = { ...currentNovel, chapters: finalChapters };
        // 核心修复：这里不再直接全量覆盖 prevNovels，
        // 而是将生成的总结条目插入到最新的 prevNovels 章节列表中，
        // 防止由于工作流执行速度过快导致的章节内容回滚或总结丢失。
        setNovels(prevNovels =>
          prevNovels.map(n => {
            if (n.id !== targetNovelId) return n;

            // 1. 识别新增的总结条目
            const newSummaries = finalChapters.filter(
              c =>
                (c.subtype === 'small_summary' || c.subtype === 'big_summary') &&
                !n.chapters.some(nc => nc.id === c.id),
            );

            if (newSummaries.length === 0) {
              // 2. 如果没有新条目，仅更新现有总结的内容（如果 range 匹配）
              const updatedChapters = n.chapters.map(nc => {
                const match = finalChapters.find(fc => fc.id === nc.id && fc.subtype === nc.subtype);
                return match ? { ...nc, content: match.content } : nc;
              });
              return { ...n, chapters: updatedChapters };
            }

            // 3. 将新总结插入到正确位置
            const mergedChapters = [...n.chapters];
            newSummaries.forEach(summary => {
              // 寻找插入点：在 summaryRange 结束章节之后
              const rangeEnd = parseInt(summary.summaryRange?.split('-')[1] || '0');
              const storyChapters = mergedChapters.filter(c => !c.subtype || c.subtype === 'story');
              const lastChapterInRange = storyChapters[rangeEnd - 1];

              if (lastChapterInRange) {
                const insertIdx = mergedChapters.findIndex(c => c.id === lastChapterInRange.id);
                if (insertIdx !== -1) {
                  // 往后找，跳过已有的总结
                  let insertAt = insertIdx + 1;
                  while (
                    insertAt < mergedChapters.length &&
                    (mergedChapters[insertAt].subtype === 'small_summary' ||
                      mergedChapters[insertAt].subtype === 'big_summary')
                  ) {
                    insertAt++;
                  }
                  mergedChapters.splice(insertAt, 0, summary);
                } else {
                  mergedChapters.push(summary);
                }
              } else {
                mergedChapters.push(summary);
              }
            });

            return { ...n, chapters: mergedChapters };
          }),
        );
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
      const globalStart = storyChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
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

  return lastUpdatedNovel;
};

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
      // Ensure we only include chapters from the target volume
      const targetChapters = getSnapshotStoryChapters()
        .slice(start - 1, end)
        .filter(c => c.volumeId === targetVolumeId);

      if (targetChapters.length === 0) return;
      sourceText = targetChapters.map(c => `Chapter: ${c.title}\n${getStableContent(c)}`).join('\n\n');
    } else {
      // For Big Summary, try to use Small Summaries first
      // We filter from currentChaptersSnapshot which includes any just-generated small summaries
      const relevantSmallSummaries = currentChaptersSnapshot
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

      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: 'You are a professional editor helper.' },
          { role: 'user', content: `${sourceText}\n\n${prompt}` },
        ],
        temperature: 0.5,
      });

      const summaryContent = completion.choices[0]?.message?.content || '';
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
        setNovels(prevNovels => prevNovels.map(n => (n.id === targetNovelId ? { ...n, chapters: finalChapters } : n)));
      }
    } catch (e) {
      console.error(e);
      errorLog(`[Summary] Failed to generate ${type} summary: ${(e as any).message}`);
    }
  };

  // Check Small Summary Trigger (Volume Based)
  if (currentCountInVolume % sInterval === 0) {
    // Map back to Global Range for Labeling
    const batchStartVolIndex = indexInVolume - sInterval + 1;
    const batchChapters = volumeStoryChapters.slice(batchStartVolIndex, indexInVolume + 1);

    if (batchChapters.length > 0) {
      // Find IDs in global list to get range
      // Note: getSnapshotStoryChapters returns filtered list, so indices match global STORY indices if we map back
      // But we need the range string to be meaningful to user (e.g. Chapter 4-6).
      // We can use the global index in storyChapters (+1 for 1-based)
      const globalStart = storyChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      await generate('small', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
    }
  }

  // Check Big Summary Trigger (Volume Based)
  if (currentCountInVolume % bInterval === 0) {
    const batchStartVolIndex = indexInVolume - bInterval + 1;
    const batchChapters = volumeStoryChapters.slice(batchStartVolIndex, indexInVolume + 1);

    if (batchChapters.length > 0) {
      const globalStart = storyChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      await generate('big', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id);
    }
  }

  return lastUpdatedNovel;
};

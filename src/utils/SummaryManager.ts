import OpenAI from 'openai';
import terminal from 'virtual:terminal';
import { Chapter, Novel } from '../types';

/**
 * 严格判定总结类型 (识别 subtype 或 标题关键字)
 */
export const isSummaryChapter = (c: Chapter): boolean =>
  c.subtype === 'small_summary' ||
  c.subtype === 'big_summary';

/**
 * 核心章节排序引擎 (V5 - 物理隔离与分卷强校验版)
 * 解决问题：防止总结章节由于索引失效或逻辑偏差，在多分卷场景下漂移到分卷顶部或全书顶部。
 */
export const sortChapters = (chapters: Chapter[]): Chapter[] => {
  if (!chapters || !Array.isArray(chapters)) return [];

  const startTime = Date.now();

  // 1. 分离剧情章与总结章，并确保剧情章按原始顺序排列
  const allStories = chapters.filter(c => !isSummaryChapter(c));
  const allSummaries = chapters.filter(c => isSummaryChapter(c));
  
  // 确保剧情章按照 globalIndex 排序，防止章节顺序被打乱
  allStories.sort((a, b) => {
    // 优先使用 globalIndex 排序
    if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
      return a.globalIndex - b.globalIndex;
    }
    // 如果没有 globalIndex，则使用在原始数组中的位置排序
    return chapters.indexOf(a) - chapters.indexOf(b);
  });

  if (allStories.length === 0) return chapters;

  // 2. 预对齐：为每个总结寻找它在全局剧情流中的“挂载点”
  const summariesByParentId = new Map<number, Chapter[]>();
  const globalOrphans: Chapter[] = [];

  // 创建一个映射，用于快速查找剧情章 by globalIndex
  const globalIndexToStory = new Map<number, Chapter>();
  allStories.forEach(story => {
    if (story.globalIndex !== undefined) {
      globalIndexToStory.set(story.globalIndex, story);
    }
  });

  allSummaries.forEach(s => {
    const range = s.summaryRange?.split('-').map(Number);
    if (range && range.length === 2 && !isNaN(range[1]) && range[1] > 0) {
      // 首先尝试通过 globalIndex 查找目标剧情章
      let targetStory = globalIndexToStory.get(range[1]);
      
      // 如果通过 globalIndex 找不到，则尝试通过数组索引查找
      if (!targetStory && range[1] <= allStories.length) {
        targetStory = allStories[range[1] - 1];
      }
      
      if (targetStory) {
        // 确保总结章节的volumeId与目标剧情章一致
        s.volumeId = targetStory.volumeId;
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
  const volumeFirstOccurrence = new Map<string | undefined, number>();

  // 记录每个分卷首次出现的位置
  allStories.forEach((s, index) => {
    if (!volumeFirstOccurrence.has(s.volumeId)) {
      volumeFirstOccurrence.set(s.volumeId, index);
      volumeOrder.push(s.volumeId);
    }
    if (!storiesByVol.has(s.volumeId)) storiesByVol.set(s.volumeId, []);
    storiesByVol.get(s.volumeId)!.push(s);
  });

  // 按分卷首次出现的位置排序，确保分卷顺序的稳定性
  volumeOrder.sort((a, b) => {
    const posA = volumeFirstOccurrence.get(a) || 0;
    const posB = volumeFirstOccurrence.get(b) || 0;
    return posA - posB;
  });

  const finalResult: Chapter[] = [];

  // 4. 逐卷装配
  volumeOrder.forEach(vid => {
    const volStories = storiesByVol.get(vid) || [];
    
    // 确保分卷内的章节按照 globalIndex 排序
    volStories.sort((a, b) => {
      if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
        return a.globalIndex - b.globalIndex;
      }
      // 如果没有 globalIndex，则使用在原始数组中的位置排序
      return chapters.indexOf(a) - chapters.indexOf(b);
    });

    volStories.forEach(story => {
      finalResult.push(story);
      // 挂载属于该章的总结
      const related = summariesByParentId.get(story.id);
        if (related) {
          // 保留同一挂载点下总结的物理顺序，支持用户手动调整总结显示位置
          // 这里只负责“挂载到对应正文之后”，不再强制改写同组总结之间的先后顺序
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
  
  // 6. 确保所有原始章节都被包含
  if (finalResult.length < chapters.length) {
    const resultIds = new Set(finalResult.map(c => c.id));
    const missingChapters = chapters.filter(c => !resultIds.has(c.id));
    if (missingChapters.length > 0) {
      terminal.warn(`[SORT SAFETY] 检测到 ${missingChapters.length} 个章节在排序过程中丢失，正在恢复...`);
      finalResult.push(...missingChapters);
    }
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

  // 7. 确保总结章的volumeId与挂载点章节一致
  for (let i = 1; i < finalResult.length; i++) {
    const current = finalResult[i];
    if (isSummaryChapter(current)) {
      // 找到前一个非总结章节作为挂载点
      let anchor: Chapter | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!isSummaryChapter(finalResult[j])) {
          anchor = finalResult[j];
          break;
        }
      }
      // 如果找到挂载点，确保总结章的volumeId与挂载点一致
      if (anchor && current.volumeId !== anchor.volumeId) {
        current.volumeId = anchor.volumeId;
      }
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
  const storyChapters = chapters.filter(c => !isSummaryChapter(c)).sort((a, b) => {
    // 优先使用 globalIndex 排序
    if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
      return a.globalIndex - b.globalIndex;
    }
    // 如果没有 globalIndex，则使用在原始数组中的位置排序
    return chapters.indexOf(a) - chapters.indexOf(b);
  });
  const idToGlobalIdx = new Map<number, number>();
  storyChapters.forEach((c, i) => idToGlobalIdx.set(c.id, i + 1));
  
  // 创建一个映射，用于快速查找剧情章 by globalIndex
  const globalIndexToStory = new Map<number, Chapter>();
  storyChapters.forEach(story => {
    if (story.globalIndex !== undefined) {
      globalIndexToStory.set(story.globalIndex, story);
    }
  });

  // 按分卷分组剧情章，用于计算本卷内的索引
  const storiesByVolume = new Map<string | undefined, Chapter[]>();
  storyChapters.forEach(c => {
    if (!storiesByVolume.has(c.volumeId)) storiesByVolume.set(c.volumeId, []);
    storiesByVolume.get(c.volumeId)!.push(c);
  });
  
  // 对每个分卷内的剧情章进行排序，确保顺序正确
  storiesByVolume.forEach(stories => {
    stories.sort((a, b) => {
      // 优先使用 globalIndex 排序
      if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
        return a.globalIndex - b.globalIndex;
      }
      // 如果没有 globalIndex，则使用在原始数组中的位置排序
      return storyChapters.indexOf(a) - storyChapters.indexOf(b);
    });
  });
  
  const idToVolumeIdx = new Map<number, number>();
  storiesByVolume.forEach(stories => {
    stories.forEach((c, i) => idToVolumeIdx.set(c.id, i + 1));
  });

  // 2. 遍历校准
  return chapters.map((chapter, index) => {
    if (!isSummaryChapter(chapter)) return chapter;

    // 【深度修复】：优先根据 summaryRange 寻找挂载点，而不是根据数组位置
    // 这样即使总结章节跑到了错误的数组位置，也能找到正确的挂载点
    let anchor: Chapter | null = null;
    
    // 首先尝试根据 summaryRange 寻找挂载点
    const range = chapter.summaryRange?.split('-').map(Number);
    if (range && range.length === 2 && !isNaN(range[1]) && range[1] > 0) {
      // 首先尝试通过 globalIndex 查找目标剧情章
      let targetStory = globalIndexToStory.get(range[1]);
      
      // 如果通过 globalIndex 找不到，则尝试通过数组索引查找
      if (!targetStory && range[1] <= storyChapters.length) {
        targetStory = storyChapters[range[1] - 1];
      }
      
      if (targetStory) {
        anchor = targetStory;
      }
    }
    
    // 如果根据 summaryRange 找不到挂载点，再回退到根据数组位置寻找
    if (!anchor) {
      for (let i = index - 1; i >= 0; i--) {
        if (!isSummaryChapter(chapters[i])) {
          anchor = chapters[i];
          break;
        }
      }
    }

    // 如果该总结前完全没有剧情章，说明它彻底迷路了，将其归入第一个剧情章的分卷
    if (!anchor) {
      const firstStory = storyChapters[0];
      if (firstStory) {
        return { ...chapter, summaryRange: '1-1', summaryRangeVolume: '1-1', volumeId: firstStory.volumeId };
      }
      return chapter;
    }

    // 确保总结章节的volumeId与挂载点一致
    const targetVolumeId = anchor.volumeId;
    
    // 获取当前分卷的所有剧情章节
    const volumeStories = storiesByVolume.get(targetVolumeId) || [];
    
    // 找到挂载点在分卷内的索引
    const anchorVolumeIndex = volumeStories.findIndex(s => s.id === anchor.id) + 1;
    
    const currentEnd = idToGlobalIdx.get(anchor.id) || 1;
    const currentEndVolume = anchorVolumeIndex;
    
    // 计算 span 时，优先使用合理的默认值，而不是依赖可能无效的 oldRange
    // 对于小总结，默认 span 为 3；对于大总结，默认 span 为 6
    let span = chapter.subtype === 'small_summary' ? 3 : 6;
    
    // 如果 oldRange 有效，则使用它来计算 span
    const oldRange = chapter.summaryRange;
    if (oldRange) {
      const [oldS, oldE] = oldRange.split('-').map(Number);
      if (!isNaN(oldS) && !isNaN(oldE) && oldE >= oldS) {
        span = Math.max(1, oldE - oldS + 1);
      }
    }
    
    // 计算新的范围，确保不跨越分卷边界
    const newStartVolume = Math.max(1, currentEndVolume - span + 1);
    
    // 确保 newStartVolume 不超过当前分卷的章节数
    const validStartVolume = Math.min(newStartVolume, volumeStories.length);
    
    // 获取起始章节的全局索引
    const startChapter = volumeStories[validStartVolume - 1];
    const newStart = startChapter ? idToGlobalIdx.get(startChapter.id) || validStartVolume : validStartVolume;
    
    const newRange = `${newStart}-${currentEnd}`;
    const newRangeVolume = `${validStartVolume}-${currentEndVolume}`;

    const hasChanged = newRange !== chapter.summaryRange || chapter.volumeId !== anchor.volumeId || newRangeVolume !== chapter.summaryRangeVolume;

    if (hasChanged) {
      // Get actual chapter titles for the new range
      const [rangeStart, rangeEnd] = newRange.split('-').map(Number);
      const startChapter = storyChapters[rangeStart - 1];
      const endChapter = storyChapters[rangeEnd - 1];
      const startTitle = startChapter?.title || `Chapter ${rangeStart}`;
      const endTitle = endChapter?.title || `Chapter ${rangeEnd}`;
      
      const newTitle = chapter.title.replace(/\s*\(\d+-\d+\)/, '').replace(/：.*$/, `：${startTitle} 到 ${endTitle}`);
      
      terminal.log(`[FIX] 校准章节: "${chapter.title}" 位置修正为分卷 [${anchor.volumeId}] 索引 [${newRange}] 本卷索引 [${newRangeVolume}]`);
      return {
        ...chapter,
        summaryRange: newRange,
        summaryRangeVolume: newRangeVolume,
        volumeId: anchor.volumeId, // 强制纠正分卷归属，防止 UI 渲染时的跨卷漂移
        title: newTitle,
      };
    }
    return chapter;
  });
};

export interface SummaryConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  smallSummaryApiKey: string;
  smallSummaryBaseUrl: string;
  smallSummaryModel: string;
  bigSummaryApiKey: string;
  bigSummaryBaseUrl: string;
  bigSummaryModel: string;
  smallSummaryInterval: number;
  bigSummaryInterval: number;
  smallSummaryPrompt: string;
  bigSummaryPrompt: string;
  contextChapterCount?: number;
  contextScope?: string;
  maxRetries?: number; // 失败重试次数
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
    smallSummaryApiKey,
    smallSummaryBaseUrl,
    smallSummaryModel,
    bigSummaryApiKey,
    bigSummaryBaseUrl,
    bigSummaryModel,
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

  let currentChaptersSnapshot = (currentNovel.chapters || []).map(c => {
    if (c.id === targetChapterId) return { ...c, content: currentContent };
    return c;
  });

  const getSnapshotStoryChapters = () =>
    (currentChaptersSnapshot || []).filter(c => !c.subtype || c.subtype === 'story');

  const storyChapters = getSnapshotStoryChapters();
  const globalIndex = storyChapters.findIndex(c => c.id === targetChapterId);
  if (globalIndex === -1) return;
  
  // 检查目标章节内容是否为空，避免删除章节时意外触发总结
  const targetChapter = storyChapters[globalIndex];
  if (!targetChapter || !targetChapter.content || targetChapter.content.trim() === '') {
    terminal.log(`[Summary] Skipped: target chapter ${targetChapterId} has empty content`);
    return;
  }

  const targetChapterObj = storyChapters[globalIndex];
  const targetVolumeId = targetChapterObj.volumeId;

  const volumeStoryChapters = storyChapters.filter(c => c.volumeId === targetChapterObj.volumeId);
  const indexInVolume = volumeStoryChapters.findIndex(c => c.id === targetChapterId);
  const currentCountInVolume = indexInVolume + 1;

  const sInterval = Number(smallSummaryInterval) || 3;
  const bInterval = Number(bigSummaryInterval) || 6;

  let lastUpdatedNovel: Novel = { ...currentNovel, chapters: currentChaptersSnapshot };
  const pendingSummaries: Chapter[] = [];

  const generate = async (type: 'small' | 'big', start: number, end: number, lastChapterId: number, startVolume?: number, endVolume?: number) => {
    const rangeStr = `${start}-${end}`;
    const rangeStrVolume = startVolume !== undefined && endVolume !== undefined ? `${startVolume}-${endVolume}` : rangeStr;
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
          if ((contextScope === 'volume' || contextScope === 'currentVolume') && c.volumeId !== targetVolumeId) return false;
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
          if ((contextScope === 'volume' || contextScope === 'currentVolume') && c.volumeId !== targetVolumeId) return false;
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
        // 处理章节标题，去除前置的程序自动编号（如"第二十九章 "）
        const processChapterTitle = (title: string) => {
          // 匹配中文数字章节编号格式，如"第一章 "、"第二十九章 "等
          const chapterNumberRegex = /^第[一二三四五六七八九十百千]+章\s+/;
          return title.replace(chapterNumberRegex, '');
        };
        
        contextParts.push(
          `【近期章节原文细节】：\n${relevantOriginalChapters
            .map(c => `### ${processChapterTitle(c.title)}\n${getStableContent(c)}`)
            .join('\n\n')}`,
        );
      }
      sourceText = contextParts.join('\n\n---\n\n');
    }

    if (!sourceText) return;

    const maxRetries = config.maxRetries || 3; // 默认重试3次
    let retryCount = 0;
    let success = false;

    while (retryCount <= maxRetries && !success) {
      try {
        const currentApiKey = type === 'small' ? smallSummaryApiKey : bigSummaryApiKey;
        const currentBaseUrl = type === 'small' ? smallSummaryBaseUrl : bigSummaryBaseUrl;
        const openai = new OpenAI({ apiKey: currentApiKey, baseURL: currentBaseUrl, dangerouslyAllowBrowser: true });
        let prompt = type === 'small' ? smallSummaryPrompt : bigSummaryPrompt;
        const currentModel = type === 'small' ? smallSummaryModel : bigSummaryModel;

        // 在本卷模式下，通过系统指令强力约束 AI 的总结范围
        const isVolMode = contextScope === 'volume' || contextScope === 'currentVolume';
        if (isVolMode && type === 'big') {
          prompt = `【分卷总结专项指令】：当前正在进行“分卷创作模式”，你必须仅针对下方提供的本卷内容进行大总结。严禁提及或猜测任何不属于下方内容的剧情。\n\n${prompt}`;
        }

        // 详细日志记录
        terminal.log(`
>> AI REQUEST [Summary ${type}] ${retryCount > 0 ? `(重试 ${retryCount})` : ''}
>> -----------------------------------------------------------
>> Model:       ${currentModel}
>> Base URL:    ${currentBaseUrl}
>> Temperature: 0.5
>> Type:        ${type === 'small' ? 'Small Summary' : 'Big Summary'}
>> Range:       ${rangeStr}
>> Volume:      ${targetVolumeId || 'default'}
>> Context Scope: ${contextScope}
>> -----------------------------------------------------------
>> Request Details:
>>  - API Key:     ${currentApiKey ? '***' : 'Missing'}
>>  - Source Text: ${sourceText.length > 200 ? sourceText.slice(0, 200) + '...' : sourceText}
>>  - Prompt:      ${prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt}
>> -----------------------------------------------------------
      `);

        const completion = await openai.chat.completions.create(
          {
            model: currentModel,
            messages: [
              { role: 'system', content: 'You are a professional editor helper.' },
              { role: 'user', content: `${sourceText}\n\n${prompt}` },
            ],
            temperature: 1,
            top_p: 0.95,
            top_k: 50,
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
            // Get actual chapter titles for the range
            const startChapter = getSnapshotStoryChapters()[start - 1];
            const endChapter = getSnapshotStoryChapters()[end - 1];
            const startTitle = startChapter?.title || `Chapter ${start}`;
            const endTitle = endChapter?.title || `Chapter ${end}`;
            
            const newChapter: Chapter = {
              id: Date.now() + Math.floor(Math.random() * 10000),
              title: `${type === 'small' ? '🔹小总结' : '🔸大总结'}：${startTitle} 到 ${endTitle}`,
              content: summaryContent,
              subtype: subtype,
              summaryRange: rangeStr,
              summaryRangeVolume: rangeStrVolume,
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
          success = true;
        }
      } catch (e) {
        const error = e as any;
        retryCount++;
        errorLog(`[Summary] Failed to generate ${type} summary (尝试 ${retryCount}/${maxRetries}): ${error.message}`);
        if (error.status) {
          errorLog(`[Summary] Error status: ${error.status}`);
          errorLog(`[Summary] Error details: ${JSON.stringify(error, null, 2)}`);
        }
        
        if (retryCount < maxRetries) {
          // 指数退避策略
          const delay = 1500 * Math.pow(2, retryCount - 1);
          terminal.log(`[Summary] 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          errorLog(`[Summary] 已达到最大重试次数，生成 ${type} summary 失败`);
        }
      }
    }
  };

  // Trigger Logic
  for (let i = sInterval; i <= currentCountInVolume; i += sInterval) {
    const batchChapters = volumeStoryChapters.slice(i - sInterval, i);
    if (batchChapters.length > 0) {
      const globalStart = storyChapters.findIndex(c => c.id === batchChapters[0].id) + 1;
      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      const volumeStart = i - sInterval + 1;
      const volumeEnd = i;
      const rangeStr = `${globalStart}-${globalEnd}`;
      const lockKey = `${targetNovelId}_small_${rangeStr}`;
      if (
        !currentChaptersSnapshot.some(c => c.subtype === 'small_summary' && c.summaryRange === rangeStr) &&
        !activeGenerations.has(lockKey)
      ) {
        activeGenerations.add(lockKey);
        try {
          await generate('small', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id, volumeStart, volumeEnd);
        } finally {
          activeGenerations.delete(lockKey);
        }
      }
    }
  }

  for (let i = bInterval; i <= currentCountInVolume; i += bInterval) {
    const batchChapters = volumeStoryChapters.slice(i - bInterval, i);
    if (batchChapters.length > 0) {
      let globalStart = 1;
      let volumeStart = 1;
      if (contextScope !== 'all') {
        const firstInVol = volumeStoryChapters[0];
        if (firstInVol) globalStart = storyChapters.findIndex(c => c.id === firstInVol.id) + 1;
      }
      const globalEnd = storyChapters.findIndex(c => c.id === batchChapters[batchChapters.length - 1].id) + 1;
      const volumeEnd = i;
      const rangeStr = `${globalStart}-${globalEnd}`;
      const lockKey = `${targetNovelId}_big_${rangeStr}`;
      if (
        !currentChaptersSnapshot.some(c => c.subtype === 'big_summary' && c.summaryRange === rangeStr) &&
        !activeGenerations.has(lockKey)
      ) {
        activeGenerations.add(lockKey);
        try {
          await generate('big', globalStart, globalEnd, batchChapters[batchChapters.length - 1].id, volumeStart, volumeEnd);
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

    let lastSmallEnd = 0;
    existingSmallSummaries.forEach(s => {
      const range = s.summaryRange?.split('-').map(Number);
      if (range && range.length === 2 && range[1] > lastSmallEnd) {
        lastSmallEnd = range[1];
      }
    });

    // 如果分卷内最后一章还没被小总结覆盖
    const lastStoryChapterInVol = volumeStoryChapters[volumeStoryChapters.length - 1];
    if (lastStoryChapterInVol) {
      const lastGlobalIdx = storyChapters.findIndex(c => c.id === lastStoryChapterInVol.id) + 1;
      const lastVolumeIdx = volumeStoryChapters.length;

      if (lastSmallEnd < lastGlobalIdx) {
        const start = lastSmallEnd + 1;
        const end = lastGlobalIdx;
        // 计算本卷内的起始编号
        let volumeStart = 1;
        if (lastSmallEnd > 0) {
          // 找到上一个小总结在本卷中的结束位置
          const lastSmallSummary = existingSmallSummaries[existingSmallSummaries.length - 1];
          if (lastSmallSummary && lastSmallSummary.summaryRange) {
            const [, lastSmallEndGlobal] = lastSmallSummary.summaryRange.split('-').map(Number);
            const lastSmallEndInVol = volumeStoryChapters.findIndex(c => {
              const globalIdx = storyChapters.findIndex(sc => sc.id === c.id) + 1;
              return globalIdx === lastSmallEndGlobal;
            });
            volumeStart = lastSmallEndInVol !== -1 ? lastSmallEndInVol + 2 : 1;
          }
        }
        const volumeEnd = lastVolumeIdx;
        const rangeStr = `${start}-${end}`;
        const lockKey = `${targetNovelId}_final_small_${rangeStr}`;

        if (!activeGenerations.has(lockKey)) {
          activeGenerations.add(lockKey);
          try {
            await generate('small', start, end, lastStoryChapterInVol.id, volumeStart, volumeEnd);
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
      const lastGlobalIdx = storyChapters.findIndex(c => c.id === lastStoryChapterInVol.id) + 1;
      const lastVolumeIdx = volumeStoryChapters.length;
      if (lastBigEnd < lastGlobalIdx) {
        let globalStart = 1;
        let volumeStart = 1;
        if (contextScope !== 'all') {
          const firstInVol = volumeStoryChapters[0];
          if (firstInVol) globalStart = storyChapters.findIndex(c => c.id === firstInVol.id) + 1;
        }
        const volumeEnd = lastVolumeIdx;
        const rangeStr = `${globalStart}-${lastGlobalIdx}`;
        const lockKey = `${targetNovelId}_final_big_${rangeStr}`;

        if (!activeGenerations.has(lockKey)) {
          activeGenerations.add(lockKey);
          try {
            await generate('big', globalStart, lastGlobalIdx, lastStoryChapterInVol.id, volumeStart, volumeEnd);
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
        
        // Use the PREV novel's chapters (the latest state) instead of outdated snapshot
        const latestChapters = n.chapters || [];
        
        const newSummaries = pendingSummaries.filter(c => !latestChapters.some(nc => nc.id === c.id));
        
        const updatedChapters = latestChapters.map(nc => {
          const match = pendingSummaries?.find(
            ps => ps.id === nc.id || (ps.subtype === nc.subtype && ps.summaryRange === nc.summaryRange),
          );
          return match ? { ...nc, content: match.content } : nc;
        });
        
        return { ...n, chapters: sortChapters([...updatedChapters, ...newSummaries]) };
      }),
    );

    // For returning lastUpdatedNovel, also use the latest chapters if possible
    // But since we don't have access to latest state here, we'll use currentChaptersSnapshot as fallback
    const existingSummaryIds = currentChaptersSnapshot.filter(c => isSummaryChapter(c)).map(c => c.id);
    const newSummariesForReturn = pendingSummaries.filter(c => !existingSummaryIds.includes(c.id));
    lastUpdatedNovel = {
      ...currentNovel,
      chapters: sortChapters([...currentChaptersSnapshot, ...newSummariesForReturn]),
    };
  }

  return lastUpdatedNovel;
};
import { Chapter, Novel, RegexScript } from '../../types';

// Helper: Build World Info Context
export const buildWorldInfoContext = (novel: Novel | undefined, activeOutlineSetId: string | null = null) => {
  if (!novel) return '';
  let context = '';

  let targetName = '';
  if (activeOutlineSetId) {
    targetName = novel.outlineSets?.find(s => s.id === activeOutlineSetId)?.name || '';
  }

  const worldviewSets = novel.worldviewSets || [];
  const relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets.slice(0, 1);

  if (relevantWorldview.length > 0) {
    context += '【当前小说世界观设定】：\n';
    relevantWorldview.forEach(set => {
      set.entries.forEach(entry => {
        context += `· ${entry.item}: ${entry.setting}\n`;
      });
    });
    context += '\n';
  }

  const characterSets = novel.characterSets || [];
  const relevantCharacters = activeOutlineSetId
    ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : characterSets.slice(0, 1);

  if (relevantCharacters.length > 0) {
    context += '【当前小说角色档案】：\n';
    relevantCharacters.forEach(set => {
      set.characters.forEach(char => {
        context += `· ${char.name}: ${char.bio}\n`;
      });
    });
    context += '\n';
  }

  return context;
};

// Helper to get effective content
export const getEffectiveChapterContent = (chapter: Chapter | undefined) => {
  if (!chapter) return '';
  if (chapter.content && chapter.content.trim()) return chapter.content;
  const originalVersion = chapter.versions?.find(v => v.type === 'original');
  return originalVersion?.content || '';
};

// Helper: Get Story Chapters
export const getStoryChapters = (chapters: Chapter[]) => chapters.filter(c => !c.subtype || c.subtype === 'story');

// Context Builder Helper
export const getChapterContext = (
  targetNovel: Novel | undefined,
  targetChapter: Chapter | undefined,
  config: { longTextMode: boolean; contextScope: string; contextChapterCount?: number },
) => {
  if (!targetNovel || !targetChapter) return '';

  const chapters = targetNovel.chapters;
  const contextChapterCount = config.contextChapterCount || 1;
  let contextContent = '';

  if (config.longTextMode) {
    let filterVolumeId: string | null = null;
    let filterUncategorized = false;

    if (config.contextScope === 'current') {
      if (targetChapter.volumeId) {
        filterVolumeId = targetChapter.volumeId;
      } else {
        filterUncategorized = true;
      }
    } else if (config.contextScope !== 'all') {
      filterVolumeId = config.contextScope;
    }

    const storyChapters = getStoryChapters(chapters);
    const currentChapterIndex = storyChapters.findIndex(c => c.id === targetChapter.id);

    if (currentChapterIndex !== -1) {
      const currentNum = currentChapterIndex + 1;
      const parseRange = (s: string) => {
        const parts = s.split('-');
        return { start: parseInt(parts[0]) || 0, end: parseInt(parts[1]) || 0 };
      };

      let bigSummaries = chapters.filter(c => c.subtype === 'big_summary');
      bigSummaries = bigSummaries.filter(bs => {
        if (filterVolumeId) return bs.volumeId === filterVolumeId;
        if (filterUncategorized) return !bs.volumeId;
        return true;
      });

      // 1. 收集所有结束于当前章之前的总结 (不进行大总结吃小总结的过滤，保留细节)
      const relevantSummaries = chapters
        .filter(c => (c.subtype === 'big_summary' || c.subtype === 'small_summary') && c.summaryRange)
        .filter(s => {
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return true;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum)
        .sort((a, b) => parseRange(a.summaryRange!).start - parseRange(b.summaryRange!).start);

      let maxSummarizedIdx = 0;
      relevantSummaries.forEach(s => {
        const typeStr = s.subtype === 'big_summary' ? '剧情大纲' : '剧情概要';
        contextContent += `【${typeStr} (${s.title})】：\n${s.content}\n\n`;
        const { end } = parseRange(s.summaryRange!);
        if (end > maxSummarizedIdx) maxSummarizedIdx = end;
      });

      // 2. 确定正文发送范围
      // 策略：发送 (maxSummarizedIdx - contextChapterCount) 之后的所有正文内容
      // 这样既包含了总结后的新正文，也包含了总结末尾指定深度的旧正文细节
      // 策略：确保深度为 1 时，至少能看到上一章。
      // 发送 (maxSummarizedIdx - contextChapterCount + 1) 之后的所有正文内容。
      // 如果 maxSummarizedIdx 是 3 (总结到第 3 章)，深度是 1，则 storyStartNum 为 3 - 1 + 1 = 3，包含第 3 章。
      const storyStartNum = Math.max(1, maxSummarizedIdx - contextChapterCount + 1);

      const previousStoryChapters = storyChapters.filter((c, idx) => {
        if (filterVolumeId && c.volumeId !== filterVolumeId) return false;
        if (filterUncategorized && c.volumeId) return false;

        const cNum = idx + 1;
        if (cNum >= currentNum) return false;

        // 发送范围：从 (总结边界 - 深度) 开始，直到当前章之前
        if (cNum >= storyStartNum) return true;

        return false;
      });

      const uniqueChapters = Array.from(new Set(previousStoryChapters.map(c => c.id)))
        .map(id => previousStoryChapters.find(c => c.id === id))
        .filter((c): c is Chapter => !!c)
        .sort((a, b) => {
          const idxA = storyChapters.findIndex(sc => sc.id === a.id);
          const idxB = storyChapters.findIndex(sc => sc.id === b.id);
          return idxA - idxB;
        });

      uniqueChapters.forEach(c => {
        contextContent += `### ${c.title}\n${getEffectiveChapterContent(c)}\n\n`;
      });
    }
  } else {
    const volumeId = targetChapter.volumeId;
    const volumeChapters = chapters.filter(c => c.volumeId === volumeId && (!c.subtype || c.subtype === 'story'));
    const currentIdx = volumeChapters.findIndex(c => c.id === targetChapter.id);

    if (currentIdx !== -1) {
      // 非长上下文模式：无视深度设置，发送全部分卷章节 (符合反馈期望)
      const previousChapters = volumeChapters.slice(0, currentIdx);
      contextContent = previousChapters.map(c => `### ${c.title}\n${getEffectiveChapterContent(c)}`).join('\n\n');
      if (contextContent) contextContent += '\n\n';
    }
  }

  return contextContent;
};

export const applyRegexToText = async (text: string, scripts: RegexScript[]) => {
  let processed = text;
  const startTime = Date.now();

  for (const script of scripts) {
    // 每一秒或每个脚本处理前 yield 一次主线程，防止长文本+多脚本导致页面完全无响应
    if (Date.now() - startTime > 50) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    try {
      if (script.trimStrings && script.trimStrings.length > 0) {
        for (const trimStr of script.trimStrings) {
          if (trimStr) {
            processed = processed.split(trimStr).join('');
          }
        }
      }

      const regexParts = script.findRegex.match(/^\/(.*?)\/([a-z]*)$/);
      const regex = regexParts ? new RegExp(regexParts[1], regexParts[2]) : new RegExp(script.findRegex, 'g');

      // 这里的 replace 是同步的，如果是灾难性回溯仍可能卡顿，但至少脚本之间有了喘息机会
      processed = processed.replace(regex, script.replaceString);
    } catch (e) {
      console.error(`Regex error in ${script.scriptName}`, e);
    }
  }
  return processed;
};

export const processTextWithRegex = async (text: string, scripts: RegexScript[], type: 'input' | 'output') => {
  if (!text) return text;
  const relevantScripts = scripts.filter(s => !s.disabled && s.placement.includes(type === 'input' ? 1 : 2));
  return await applyRegexToText(text, relevantScripts);
};

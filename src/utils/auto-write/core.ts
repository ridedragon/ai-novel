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
  config: { longTextMode: boolean; contextScope: string },
) => {
  if (!targetNovel || !targetChapter) return '';

  const chapters = targetNovel.chapters;
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

      let bigEnd = 0;
      const relevantBig = bigSummaries
        .filter(bs => {
          if (!bs.summaryRange) return false;
          const { end } = parseRange(bs.summaryRange);
          return end < currentNum;
        })
        .sort((a, b) => {
          return parseRange(a.summaryRange!).start - parseRange(b.summaryRange!).start;
        });

      relevantBig.forEach(bs => {
        contextContent += `【剧情大纲 (${bs.title})】：\n${bs.content}\n\n`;
        const { end } = parseRange(bs.summaryRange!);
        if (end > bigEnd) bigEnd = end;
      });

      let smallSummaries = chapters.filter(c => c.subtype === 'small_summary');
      smallSummaries = smallSummaries.filter(ss => {
        if (filterVolumeId) return ss.volumeId === filterVolumeId;
        if (filterUncategorized) return !ss.volumeId;
        return true;
      });

      let smallEnd = bigEnd;
      const relevantSmall = smallSummaries
        .filter(ss => {
          if (!ss.summaryRange) return false;
          const { start, end } = parseRange(ss.summaryRange);
          return start > bigEnd && end < currentNum;
        })
        .sort((a, b) => {
          const ra = parseRange(a.summaryRange!);
          const rb = parseRange(b.summaryRange!);
          return ra.start - rb.start;
        });

      relevantSmall.forEach(ss => {
        contextContent += `【剧情概要 (${ss.title})】：\n${ss.content}\n\n`;
        const { end } = parseRange(ss.summaryRange!);
        if (end > smallEnd) smallEnd = end;
      });

      const previousStoryChapters = storyChapters.filter((c, idx) => {
        if (filterVolumeId && c.volumeId !== filterVolumeId) return false;
        if (filterUncategorized && c.volumeId) return false;

        const cNum = idx + 1;
        if (cNum >= currentNum) return false;
        if (cNum > smallEnd) return true;
        if (cNum === currentNum - 1) return true;
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
      const previousChapters = volumeChapters.slice(0, currentIdx);
      contextContent = previousChapters.map(c => `### ${c.title}\n${getEffectiveChapterContent(c)}`).join('\n\n');
      if (contextContent) contextContent += '\n\n';
    }
  }

  return contextContent;
};

export const applyRegexToText = (text: string, scripts: RegexScript[]) => {
  let processed = text;
  for (const script of scripts) {
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
      processed = processed.replace(regex, script.replaceString);
    } catch (e) {
      console.error(`Regex error in ${script.scriptName}`, e);
    }
  }
  return processed;
};

export const processTextWithRegex = (text: string, scripts: RegexScript[], type: 'input' | 'output') => {
  if (!text) return text;
  const relevantScripts = scripts.filter(s => !s.disabled && s.placement.includes(type === 'input' ? 1 : 2));
  return applyRegexToText(text, relevantScripts);
};

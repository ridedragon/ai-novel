import terminal from 'virtual:terminal';
import { Chapter, ChatMessage, Novel, RegexScript } from '../../types';

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

/**
 * 将世界观和角色档案构建为结构化的消息数组 (System 角色)
 */
export const buildWorldInfoMessages = (
  novel: Novel | undefined,
  activeOutlineSetId: string | null = null,
): ChatMessage[] => {
  if (!novel) return [];
  const messages: ChatMessage[] = [];

  // 1. 注入粗纲 (System)
  if (novel.description && novel.description.trim()) {
    messages.push({
      role: 'system',
      content: `【全书粗纲】：\n${novel.description}`,
    });
  }

  let targetName = '';
  if (activeOutlineSetId) {
    targetName = novel.outlineSets?.find(s => s.id === activeOutlineSetId)?.name || '';
  }

  const worldviewSets = novel.worldviewSets || [];
  const relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets.slice(0, 1);

  if (relevantWorldview.length > 0) {
    let worldviewContent = '【当前小说世界观设定】：\n';
    relevantWorldview.forEach(set => {
      set.entries.forEach(entry => {
        worldviewContent += `· ${entry.item}: ${entry.setting}\n`;
      });
    });
    messages.push({ role: 'system', content: worldviewContent });
  }

  const characterSets = novel.characterSets || [];
  const relevantCharacters = activeOutlineSetId
    ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : characterSets.slice(0, 1);

  if (relevantCharacters.length > 0) {
    let characterContent = '【当前小说角色档案】：\n';
    relevantCharacters.forEach(set => {
      set.characters.forEach(char => {
        characterContent += `· ${char.name}: ${char.bio}\n`;
      });
    });
    messages.push({ role: 'system', content: characterContent });
  }

  return messages;
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
  const startTime = Date.now();
  if (!targetNovel || !targetChapter) return '';

  const chapters = targetNovel.chapters;
  const contextChapterCount = config.contextChapterCount || 1;
  let contextContent = '';

  if (config.longTextMode) {
    let filterVolumeId: string | null = null;
    let filterUncategorized = false;
    const isAllScope = config.contextScope === 'all';

    if (config.contextScope === 'current') {
      if (targetChapter.volumeId) {
        filterVolumeId = targetChapter.volumeId;
      } else {
        filterUncategorized = true;
      }
    } else if (!isAllScope) {
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

      // --- 1. 确定当前 Scope 的起始边界 ---
      let scopeStartNum = 1;
      if (!isAllScope && (filterVolumeId || filterUncategorized)) {
        const firstInScope = storyChapters.find(c => (filterVolumeId ? c.volumeId === filterVolumeId : !c.volumeId));
        if (firstInScope) {
          scopeStartNum = storyChapters.indexOf(firstInScope) + 1;
        }
      }

      // --- 核心修复：新卷第一章熔断 ---
      if (currentNum === scopeStartNum) {
        return '';
      }

      // --- 2. 注入本卷规划 (粗纲/细纲) ---
      if (!isAllScope) {
        const targetVolume = targetNovel.volumes.find(v => v.id === filterVolumeId);
        const volumeTitle = targetVolume?.title || (filterUncategorized ? '未分类' : '');
        const volumeOutlineSets =
          targetNovel.outlineSets?.filter(s => s.id === filterVolumeId || (volumeTitle && s.name === volumeTitle)) ||
          [];

        volumeOutlineSets.forEach(set => {
          contextContent += `【本卷大纲规划 - ${set.name}】：\n`;
          set.items.forEach((item, idx) => {
            contextContent += `${idx + 1}. ${item.title}: ${item.summary}\n`;
          });
          contextContent += '\n';
        });
      }

      // 3. 收集所有结束于当前章之前的总结
      const allSummaries = chapters
        .filter(c => (c.subtype === 'big_summary' || c.subtype === 'small_summary') && c.summaryRange)
        .filter(s => {
          if (isAllScope) return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          // 强化：即便处于“未分类”作用域，也只允许同样“未分类”的总结进入
          if (filterUncategorized) return !s.volumeId;
          // 绝对防御：非全书模式下，严禁任何不匹配分卷 ID 的总结进入（防止漂移）
          return false;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum);

      // 去重
      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const range = s.summaryRange!;
        if (!rangeMap.has(range) || s.id > rangeMap.get(range)!.id) rangeMap.set(range, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values()).sort(
        (a, b) => parseRange(a.summaryRange!).start - parseRange(b.summaryRange!).start,
      );

      // 核心修复：根据作用域（全书/本卷）决定总结提取策略
      // 获取范围内最近的一个大总结（作为补充参考，不再作为强制截断点）
      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary')
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      // 提取所有有效的“小总结”，不再被大总结截断
      const effectiveSmallSummaries = uniqueSummaries.filter(s => {
        if (s.subtype !== 'small_summary') return false;
        if (isAllScope) return true;
        if (filterVolumeId) return s.volumeId === filterVolumeId;
        if (filterUncategorized) return !s.volumeId;
        return true;
      });

      // --- 结构化上下文构建 ---

      // 1. 注入小总结链（确保全书/本卷所有细节摘要都被发送）
      effectiveSmallSummaries.forEach(s => {
        contextContent += `【剧情概要 (${s.title})】：\n${s.content}\n\n`;
      });

      // 2. 注入最近的大总结（作为宏观参考）
      if (latestBigSummary) {
        contextContent += `【阶段剧情大纲 (${latestBigSummary.title})】：\n${latestBigSummary.content}\n\n`;
      }

      // 3. 注入最近几章的正文细节（基于回看深度）
      const storyStartNum = Math.max(scopeStartNum, currentNum - contextChapterCount);
      const recentStoryChapters = storyChapters.filter((c, idx) => {
        const cNum = idx + 1;
        return cNum >= storyStartNum && cNum < currentNum;
      });

      recentStoryChapters.forEach(c => {
        contextContent += `### [前文回顾] ${c.title}\n${getEffectiveChapterContent(c)}\n\n`;
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

  const duration = Date.now() - startTime;
  if (duration > 20) {
    terminal.log(`[PERF] auto-write/core.getChapterContext: ${duration}ms`);
  }
  return contextContent;
};

/**
 * 将前文背景（摘要和历史正文）构建为结构化的消息数组 (System 角色)
 */
export const getChapterContextMessages = (
  targetNovel: Novel | undefined,
  targetChapter: Chapter | undefined,
  config: { longTextMode: boolean; contextScope: string; contextChapterCount?: number },
): ChatMessage[] => {
  if (!targetNovel || !targetChapter) return [];
  const messages: ChatMessage[] = [];

  const chapters = targetNovel.chapters;
  const contextChapterCount = config.contextChapterCount || 1;

  if (config.longTextMode) {
    let filterVolumeId: string | null = null;
    let filterUncategorized = false;
    const isAllScope = config.contextScope === 'all';

    if (config.contextScope === 'current') {
      if (targetChapter.volumeId) {
        filterVolumeId = targetChapter.volumeId;
      } else {
        filterUncategorized = true;
      }
    } else if (!isAllScope) {
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

      // --- 1. 确定当前 Scope 的起始边界 ---
      let scopeStartNum = 1;
      if (!isAllScope && (filterVolumeId || filterUncategorized)) {
        const firstInScope = storyChapters.find(c => (filterVolumeId ? c.volumeId === filterVolumeId : !c.volumeId));
        if (firstInScope) {
          scopeStartNum = storyChapters.indexOf(firstInScope) + 1;
        }
      }

      // --- 核心修复：新卷第一章熔断 ---
      if (currentNum === scopeStartNum) {
        return [];
      }

      // --- 2. 注入本卷规划 (粗纲/细纲) ---
      if (!isAllScope) {
        const targetVolume = targetNovel.volumes.find(v => v.id === filterVolumeId);
        const volumeTitle = targetVolume?.title || (filterUncategorized ? '未分类' : '');
        const volumeOutlineSets =
          targetNovel.outlineSets?.filter(s => s.id === filterVolumeId || (volumeTitle && s.name === volumeTitle)) ||
          [];

        volumeOutlineSets.forEach(set => {
          let content = `【本卷大纲规划 - ${set.name}】：\n`;
          set.items.forEach((item, idx) => {
            content += `${idx + 1}. ${item.title}: ${item.summary}\n`;
          });
          messages.push({ role: 'system', content: content });
        });
      }

      // 3. 收集总结
      const allSummaries = chapters
        .filter(c => (c.subtype === 'big_summary' || c.subtype === 'small_summary') && c.summaryRange)
        .filter(s => {
          if (isAllScope) return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          // 同上强化
          if (filterUncategorized) return !s.volumeId;
          return false;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum);

      // 去重
      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const range = s.summaryRange!;
        if (!rangeMap.has(range) || s.id > rangeMap.get(range)!.id) rangeMap.set(range, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values()).sort(
        (a, b) => parseRange(a.summaryRange!).start - parseRange(b.summaryRange!).start,
      );

      // 核心修复：根据作用域（全书/本卷）决定总结提取策略
      // 获取范围内最近的一个大总结（作为补充参考，不再作为强制截断点）
      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary')
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      // 提取所有有效的“小总结”，不再被大总结截断
      const effectiveSmallSummaries = uniqueSummaries.filter(s => {
        if (s.subtype !== 'small_summary') return false;
        if (isAllScope) return true;
        if (filterVolumeId) return s.volumeId === filterVolumeId;
        if (filterUncategorized) return !s.volumeId;
        return true;
      });

      // --- 结构化消息构建 ---

      // 1. 注入小总结链（作为 System 消息）
      effectiveSmallSummaries.forEach(s => {
        messages.push({
          role: 'system',
          content: `【阶段剧情概要 (${s.title})】：\n${s.content}`,
        });
      });

      // 2. 注入最近的大总结（作为 System 消息）
      if (latestBigSummary) {
        messages.push({
          role: 'system',
          content: `【全书剧情回顾大纲 (${latestBigSummary.title})】：\n${latestBigSummary.content}`,
        });
      }

      // 3. 注入最近几章的正文细节（作为 System 消息，基于回看深度）
      const storyStartNum = Math.max(scopeStartNum, currentNum - contextChapterCount);
      const recentStoryChapters = storyChapters.filter((c, idx) => {
        const cNum = idx + 1;
        return cNum >= storyStartNum && cNum < currentNum;
      });

      recentStoryChapters.forEach(c => {
        messages.push({
          role: 'system',
          content: `【前文回顾细节 - ${c.title}】：\n${getEffectiveChapterContent(c)}`,
        });
      });
    }
  } else {
    // 非长上下文模式
    const volumeId = targetChapter.volumeId;
    const volumeChapters = chapters.filter(c => c.volumeId === volumeId && (!c.subtype || c.subtype === 'story'));
    const currentIdx = volumeChapters.findIndex(c => c.id === targetChapter.id);

    if (currentIdx !== -1) {
      const previousChapters = volumeChapters.slice(0, currentIdx);
      previousChapters.forEach(c => {
        messages.push({
          role: 'system',
          content: `【前文回顾 - ${c.title}】：\n${getEffectiveChapterContent(c)}`,
        });
      });
    }
  }

  return messages;
};

export const applyRegexToText = async (text: string, scripts: RegexScript[], label: string = 'unknown') => {
  if (scripts.length === 0) return text;
  let processed = text;
  const startTime = Date.now();
  const totalScripts = scripts.length;

  terminal.log(`[PERF DEBUG] applyRegexToText [${label}] 开始: 文本长度=${text.length}, 脚本数=${totalScripts}`);

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const scriptStartTime = Date.now();
    // 每一秒或每个脚本处理前 yield 一次主线程，防止长文本+多脚本导致页面完全无响应
    // 优化：将阈值从 50ms 降至 16ms (约1帧)，提升流式输出时的 UI 响应速度
    if (Date.now() - startTime > 16) {
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

      const scriptDuration = Date.now() - scriptStartTime;
      // 降低警告阈值至 50ms，并包含更多上下文信息
      if (scriptDuration > 50) {
        terminal.warn(
          `[PERF ALERT] 正则脚本 [${script.scriptName}] 耗时较长: ${scriptDuration}ms (标签=${label}, 文本长度=${text.length}, 正则=${script.findRegex})`,
        );
      }
    } catch (e) {
      console.error(`Regex error in ${script.scriptName}`, e);
    }
  }
  const duration = Date.now() - startTime;
  if (duration > 50) {
    terminal.warn(
      `[PERF ALERT] applyRegexToText [${label}] 耗时过长: ${duration}ms (处理 ${totalScripts} 个脚本, 文本长度 ${text.length})`,
    );
  } else if (duration > 10) {
    terminal.log(
      `[PERF] applyRegexToText [${label}]: 处理 ${totalScripts} 个脚本, 耗时 ${duration}ms, 文本长度 ${text.length}`,
    );
  }
  return processed;
};

export const processTextWithRegex = async (text: string, scripts: RegexScript[], type: 'input' | 'output') => {
  if (!text) return text;
  const relevantScripts = scripts.filter(s => !s.disabled && s.placement.includes(type === 'input' ? 1 : 2));
  return await applyRegexToText(text, relevantScripts, type);
};

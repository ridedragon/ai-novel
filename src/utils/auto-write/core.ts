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
  // 优先尝试匹配特定集合，如果未匹配到或未指定，则发送所有启用的集合
  let relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets;

  if (relevantWorldview.length === 0) {
    relevantWorldview = worldviewSets;
  }

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
  // 优先尝试匹配特定集合，如果未匹配到或未指定，则发送所有启用的集合
  let relevantCharacters = activeOutlineSetId
    ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : characterSets;

  if (relevantCharacters.length === 0) {
    relevantCharacters = characterSets;
  }

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

  // 1. 注入粗纲 (System) - 已根据需求移除，避免冗余
  // if (novel.description && novel.description.trim()) {
  //   messages.push({
  //     role: 'system',
  //     content: `【全书粗纲】：\n${novel.description}`,
  //   });
  // }

  let targetName = '';
  if (activeOutlineSetId) {
    targetName = novel.outlineSets?.find(s => s.id === activeOutlineSetId)?.name || '';
  }

  const worldviewSets = novel.worldviewSets || [];
  // 优先尝试匹配特定集合，如果未匹配到或未指定，则发送所有启用的集合（防止遗漏）
  let relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets;

  if (relevantWorldview.length === 0) {
    relevantWorldview = worldviewSets;
  }

  if (relevantWorldview.length > 0) {
    let worldviewContent = '【当前小说世界观设定】：\n';
    let hasContent = false;
    relevantWorldview.forEach(set => {
      set.entries.forEach(entry => {
        worldviewContent += `· ${entry.item}: ${entry.setting}\n`;
        hasContent = true;
      });
    });
    if (hasContent) {
      messages.push({ role: 'system', content: worldviewContent });
    }
  }

  const characterSets = novel.characterSets || [];
  // 修复：不再根据 activeOutlineSetId 过滤角色，始终发送所有集合，确保全局主角不丢失
  let relevantCharacters = characterSets;

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

      // 3. 收集总结与正文 (按时间线排序)
      const allSummaries = chapters
        .filter(c => (c.subtype === 'big_summary' || c.subtype === 'small_summary') && c.summaryRange)
        .filter(s => {
          if (isAllScope) return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return false;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum);

      // 去重
      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const rangeKey = `${s.volumeId || 'default'}-${s.summaryRange}`;
        if (!rangeMap.has(rangeKey) || s.id > rangeMap.get(rangeKey)!.id) rangeMap.set(rangeKey, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values());

      // 获取最近的大总结
      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary' || (typeof s.title === 'string' && s.title.includes('大总结')))
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      // 计算正文回看起点
      // 规则：最近一次大总结结束位置 - 上下文参考章节数 + 1
      let contextStartNum = Math.max(scopeStartNum, currentNum - contextChapterCount);
      if (latestBigSummary) {
        const bigSumEnd = parseRange(latestBigSummary.summaryRange!).end;
        // 如果有大总结，起点设为大总结结束前 N 章 (Context Depth)，确保包含大总结之后的所有章节
        contextStartNum = Math.max(scopeStartNum, bigSumEnd - contextChapterCount + 1);
      }

      // 收集所有要发送的 Item
      interface ContextItem {
        type: 'big_summary' | 'small_summary' | 'story';
        end: number;
        data: Chapter;
      }
      const itemsToSend: ContextItem[] = [];

      // 1. 添加大总结 (Always)
      if (latestBigSummary) {
        itemsToSend.push({
          type: 'big_summary',
          end: parseRange(latestBigSummary.summaryRange!).end,
          data: latestBigSummary,
        });
      }

      // 2. 添加相关的小总结
      // 规则：填补大总结(或起点)与当前章节之间的空白
      const bigSumEnd = latestBigSummary ? parseRange(latestBigSummary.summaryRange!).end : scopeStartNum - 1;
      uniqueSummaries.forEach(s => {
        const isSmall = s.subtype === 'small_summary' || (typeof s.title === 'string' && s.title.includes('小总结'));
        if (isSmall) {
          const end = parseRange(s.summaryRange!).end;
          // 修复：允许总结在大总结之后，且在当前章节之前
          if (end > bigSumEnd && end < currentNum) {
            itemsToSend.push({ type: 'small_summary', end, data: s });
          }
        }
      });

      // 3. 添加正文章节
      // 规则：位置 >= contextStartNum
      storyChapters.forEach((c, idx) => {
        const cNum = idx + 1;
        if (cNum >= contextStartNum && cNum < currentNum) {
          itemsToSend.push({ type: 'story', end: cNum, data: c });
        }
      });

      // 排序：按结束位置 -> 类型 (Story < Small < Big)
      // 修复：调换 Story 和 Summary 的优先级，确保同位置下 Story 在前
      itemsToSend.sort((a, b) => {
        if (a.end !== b.end) return a.end - b.end;
        const typeOrder = { story: 0, small_summary: 1, big_summary: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      // 生成 Context Content
      itemsToSend.forEach(item => {
        if (item.type === 'story') {
          contextContent += `### [前文回顾] ${item.data.title}\n${getEffectiveChapterContent(item.data)}\n\n`;
        } else if (item.type === 'big_summary') {
          contextContent += `【阶段剧情大纲 (${item.data.title})】：\n${item.data.content}\n\n`;
        } else {
          contextContent += `【剧情概要 (${item.data.title})】：\n${item.data.content}\n\n`;
        }
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

      // 3. 收集总结 (兼容识别逻辑)
      const allSummaries = chapters
        .filter(c => {
          const isSum =
            c.subtype === 'big_summary' ||
            c.subtype === 'small_summary' ||
            (typeof c.title === 'string' && (c.title.includes('总结') || c.title.includes('摘要')));
          return isSum && !!c.summaryRange;
        })
        .filter(s => {
          if (isAllScope) return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return false;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum);

      // 去重
      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const rangeKey = `${s.volumeId || 'default'}-${s.summaryRange}`;
        if (!rangeMap.has(rangeKey) || s.id > rangeMap.get(rangeKey)!.id) rangeMap.set(rangeKey, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values());

      // 获取范围内最近的一个大总结
      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary' || (typeof s.title === 'string' && s.title.includes('大总结')))
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      // 计算正文回看起点
      // 规则：最近一次大总结结束位置 - 上下文参考章节数 + 1
      let contextStartNum = Math.max(scopeStartNum, currentNum - contextChapterCount);
      if (latestBigSummary) {
        const bigSumEnd = parseRange(latestBigSummary.summaryRange!).end;
        // 如果有大总结，起点设为大总结结束前 N 章 (Context Depth)，确保包含大总结之后的所有章节
        contextStartNum = Math.max(scopeStartNum, bigSumEnd - contextChapterCount + 1);
      }

      // 收集所有要发送的 Item (按时间线混合)
      interface ContextItem {
        type: 'big_summary' | 'small_summary' | 'story';
        end: number;
        data: Chapter;
      }
      const itemsToSend: ContextItem[] = [];

      // A. 添加大总结 (Always)
      if (latestBigSummary) {
        itemsToSend.push({
          type: 'big_summary',
          end: parseRange(latestBigSummary.summaryRange!).end,
          data: latestBigSummary,
        });
      }

      // B. 添加相关的小总结
      const bigSumEnd = latestBigSummary ? parseRange(latestBigSummary.summaryRange!).end : scopeStartNum - 1;
      uniqueSummaries.forEach(s => {
        const isSmall = s.subtype === 'small_summary' || (typeof s.title === 'string' && s.title.includes('小总结'));
        if (isSmall) {
          const end = parseRange(s.summaryRange!).end;
          // 修复：允许总结在大总结之后，且在当前章节之前
          if (end > bigSumEnd && end < currentNum) {
            itemsToSend.push({ type: 'small_summary', end, data: s });
          }
        }
      });

      // C. 添加正文章节 (Context Window 范围内或之后)
      storyChapters.forEach((c, idx) => {
        const cNum = idx + 1;
        if (cNum >= contextStartNum && cNum < currentNum) {
          itemsToSend.push({ type: 'story', end: cNum, data: c });
        }
      });

      // 排序：按结束位置 -> 类型 (Story < Small < Big)
      // 修复：调换 Story 和 Summary 的优先级
      itemsToSend.sort((a, b) => {
        if (a.end !== b.end) return a.end - b.end;
        const typeOrder = { story: 0, small_summary: 1, big_summary: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      // 生成 Messages
      itemsToSend.forEach(item => {
        if (item.type === 'story') {
          messages.push({
            role: 'system',
            content: `【前文回顾细节 - ${item.data.title}】：\n${getEffectiveChapterContent(item.data)}`,
          });
        } else if (item.type === 'big_summary') {
          messages.push({
            role: 'system',
            content: `【全书剧情回顾大纲 (${item.data.title})】：\n${item.data.content}`,
          });
        } else {
          messages.push({
            role: 'system',
            content: `【阶段剧情概要 (${item.data.title})】：\n${item.data.content}`,
          });
        }
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

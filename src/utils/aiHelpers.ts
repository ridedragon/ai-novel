import terminal from 'virtual:terminal';
import { fixedPromptItems } from '../constants/aiPresets';
import { Chapter, ChatMessage, Novel, PromptItem, RegexScript } from '../types';

/**
 * 确保提示词列表中包含固定条目（聊天记录、世界观、大纲）
 */
export const ensureFixedItems = (items: PromptItem[]): PromptItem[] => {
  const newItems = [...items];
  fixedPromptItems.forEach(fixed => {
    if (!newItems.some(p => p.fixedType === fixed.fixedType)) {
      newItems.push(fixed);
    }
  });
  return newItems;
};

/**
 * 获取故事类型的章节（排除总结章节）
 */
export const getStoryChapters = (chapters: Chapter[]) => chapters.filter(c => !c.subtype || c.subtype === 'story');

/**
 * 构建世界观和角色设定的 Chat 消息
 */
export const buildWorldInfoMessages = (
  novel: Novel | undefined,
  activeOutlineSetId: string | null = null,
): ChatMessage[] => {
  if (!novel) return [];
  const messages: ChatMessage[] = [];

  let targetName = '';
  if (activeOutlineSetId) {
    targetName = novel.outlineSets?.find(s => s.id === activeOutlineSetId)?.name || '';
  }

  const worldviewSets = novel.worldviewSets || [];
  const relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets.slice(0, 1);

  if (relevantWorldview.length > 0) {
    let context = '【当前小说世界观设定】：\n';
    relevantWorldview.forEach(set => {
      set.entries.forEach(entry => {
        context += `· ${entry.item}: ${entry.setting}\n`;
      });
    });
    messages.push({ role: 'system', content: context });
  }

  const characterSets = novel.characterSets || [];
  const relevantCharacters = activeOutlineSetId
    ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : characterSets.slice(0, 1);

  if (relevantCharacters.length > 0) {
    let context = '【当前小说角色档案】：\n';
    relevantCharacters.forEach(set => {
      set.characters.forEach(char => {
        context += `· ${char.name}: ${char.bio}\n`;
      });
    });
    messages.push({ role: 'system', content: context });
  }

  return messages;
};

/**
 * 构建世界观和角色设定的纯文本上下文
 */
export const buildWorldInfoContext = (novel: Novel | undefined, activeOutlineSetId: string | null = null) => {
  const msgs = buildWorldInfoMessages(novel, activeOutlineSetId);
  return msgs.map(m => m.content).join('\n\n');
};

/**
 * 构建引用资料的上下文（包括世界观、角色、灵感、大纲、资料库文件）
 */
export const buildReferenceContext = (
  novel: Novel | undefined,
  worldviewSetId: string | null,
  worldviewIndices: number[],
  characterSetId: string | null,
  characterIndices: number[],
  inspirationSetId: string | null,
  inspirationIndices: number[],
  outlineSetId: string | null,
  outlineIndices: number[],
  referenceType: string | null | string[] = null,
  referenceIndices: number[] = [],
) => {
  if (!novel) return '';
  let context = '';

  const referenceTypes = Array.isArray(referenceType) ? referenceType : referenceType ? [referenceType] : [];

  // Worldview
  if (worldviewSetId) {
    const set = novel.worldviewSets?.find(s => s.id === worldviewSetId);
    if (set) {
      context += `【参考世界观 (${set.name})】：\n`;
      set.entries.forEach((entry, idx) => {
        if (worldviewIndices.length === 0 || worldviewIndices.includes(idx)) {
          context += `· ${entry.item}: ${entry.setting}\n`;
        }
      });
      if (set.userNotes) context += `备注：${set.userNotes}\n`;
      if (set.chatHistory && set.chatHistory.length > 0) {
        context += `讨论历史：\n${set.chatHistory
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n')}\n`;
      }
      context += '\n';
    }
  }

  // Characters
  if (characterSetId) {
    const set = novel.characterSets?.find(s => s.id === characterSetId);
    if (set) {
      context += `【参考角色档案 (${set.name})】：\n`;
      set.characters.forEach((char, idx) => {
        if (characterIndices.length === 0 || characterIndices.includes(idx)) {
          context += `· ${char.name}: ${char.bio}\n`;
        }
      });
      if (set.userNotes) context += `备注：${set.userNotes}\n`;
      if (set.chatHistory && set.chatHistory.length > 0) {
        context += `讨论历史：\n${set.chatHistory
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n')}\n`;
      }
      context += '\n';
    }
  }

  // Inspiration
  if (inspirationSetId) {
    const set = novel.inspirationSets?.find(s => s.id === inspirationSetId);
    if (set) {
      context += `【参考灵感 (${set.name})】：\n`;
      set.items.forEach((item, idx) => {
        if (inspirationIndices.length === 0 || inspirationIndices.includes(idx)) {
          context += `· ${item.title}: ${item.content}\n`;
        }
      });
      if (set.userNotes) context += `备注：${set.userNotes}\n`;
      if (set.chatHistory && set.chatHistory.length > 0) {
        context += `讨论历史：\n${set.chatHistory
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n')}\n`;
      }
      context += '\n';
    }
  }

  // Outline
  if (outlineSetId) {
    const set = novel.outlineSets?.find(s => s.id === outlineSetId);
    if (set) {
      context += `【参考粗纲 (${set.name})】：\n`;
      set.items.forEach((item, idx) => {
        if (outlineIndices.length === 0 || outlineIndices.includes(idx)) {
          context += `${idx + 1}. ${item.title}: ${item.summary}\n`;
        }
      });
      if (set.userNotes) context += `备注：${set.userNotes}\n`;
      if (set.chatHistory && set.chatHistory.length > 0) {
        context += `讨论历史：\n${set.chatHistory
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n')}\n`;
      }
      context += '\n';
    }
  }

  // Reference Library
  if (referenceTypes.length > 0 && referenceIndices.length > 0) {
    context += `【参考资料库】：\n`;
    if (referenceTypes.includes('file')) {
      referenceIndices.forEach(idx => {
        const file = novel.referenceFiles?.[idx];
        if (file) {
          context += `· 文件 (${file.name}): ${
            file.content.length > 2000 ? file.content.slice(0, 2000) + '...' : file.content
          }\n`;
        }
      });
    }
    if (referenceTypes.includes('folder')) {
      referenceIndices.forEach(idx => {
        const folder = novel.referenceFolders?.[idx];
        if (folder) {
          context += `· 文件夹 (${folder.name})：\n`;
          const folderFiles = novel.referenceFiles?.filter(f => f.parentId === folder.id);
          folderFiles?.forEach(file => {
            context += `  - ${file.name}: ${
              file.content.length > 1000 ? file.content.slice(0, 1000) + '...' : file.content
            }\n`;
          });
        }
      });
    }
    context += '\n';
  }

  return context;
};

/**
 * 格式化打印 AI 请求参数到控制台
 */
export const logAiParams = (module: string, model: string, temperature: number, topP: number, topK: number) => {
  terminal.log(`
>> AI REQUEST [${module}]
>> -----------------------------------------------------------
>> Model:       ${model}
>> Temperature: ${temperature}
>> Top P:       ${topP}
>> Top K:       ${topK}
>> -----------------------------------------------------------
    `);
};

/**
 * 规格化生成器的结果（确保具有正确的 key 名称）
 */
export const normalizeGeneratorResult = (
  data: any[],
  type: 'outline' | 'character' | 'worldview' | 'inspiration',
): any[] => {
  if (!Array.isArray(data)) return [];

  if (data.length > 0 && Array.isArray(data[0])) {
    data = data.flat();
  }

  if (data.length === 1 && data[0] && typeof data[0] === 'object' && !data[0].title && !data[0].name && !data[0].item) {
    const values = Object.values(data[0]);
    const arrayVal = values.find(v => Array.isArray(v));
    if (arrayVal) {
      data = arrayVal as any[];
    }
  }

  return data
    .map(item => {
      if (typeof item !== 'object' || !item) return null;

      const processField = (val: any): string => {
        if (typeof val === 'string') return val;
        if (typeof val === 'number') return String(val);
        if (Array.isArray(val)) {
          return val.map(item => processField(item)).join('\n');
        }
        if (typeof val === 'object' && val) {
          if (val.text && typeof val.text === 'string') return val.text;
          if (val.content && typeof val.content === 'string') return val.content;
          if (val.setting && typeof val.setting === 'string') return val.setting;
          if (val.description && typeof val.description === 'string') return val.description;

          return Object.entries(val)
            .map(([key, value]) => {
              const formattedValue = typeof value === 'object' ? processField(value) : String(value);
              if (formattedValue.includes('\n') || formattedValue.length > 20) {
                return `【${key}】：\n${formattedValue}`;
              }
              return `【${key}】：${formattedValue}`;
            })
            .join('\n');
        }
        return '';
      };

      if (type === 'outline') {
        const title = processField(
          item.title || item.chapter || item.name || item.header || item.label || Object.values(item)[0] || '',
        );
        const summary = processField(
          item.summary || item.content || item.description || item.plot || item.setting || Object.values(item)[1] || '',
        );
        return { title, summary };
      }

      if (type === 'character') {
        const name = processField(item.name || item.character || item.role || Object.values(item)[0] || '');
        const bio = processField(
          item.bio || item.description || item.background || item.setting || Object.values(item)[1] || '',
        );
        return { name, bio };
      }

      if (type === 'worldview') {
        const itemKey = processField(item.item || item.name || item.key || item.object || Object.values(item)[0] || '');
        const setting = processField(
          item.setting || item.description || item.content || item.value || Object.values(item)[1] || '',
        );
        return { item: itemKey, setting };
      }

      if (type === 'inspiration') {
        const title = processField(
          item.title || item.name || item.topic || item.header || Object.values(item)[0] || '',
        );
        const content = processField(
          item.content || item.summary || item.description || item.plot || Object.values(item)[1] || '',
        );
        return { title, content };
      }

      return item;
    })
    .filter(item => item !== null);
};

/**
 * 万能数字解析器（支持阿拉伯数字和中文数字）
 */
export const parseAnyNumber = (text: string): number | null => {
  if (!text) return null;

  const arabicMatch = text.match(/\d+/);
  if (arabicMatch) return parseInt(arabicMatch[0]);

  const chineseNums: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    百: 100,
    千: 1000,
  };

  const chineseMatch = text.match(/[零一二两三四五六七八九十百千]+/);
  if (chineseMatch) {
    const s = chineseMatch[0];
    if (s.length === 1) return chineseNums[s] ?? null;

    let result = 0;
    let temp = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      const num = chineseNums[char];
      if (num === 10) {
        if (temp === 0) temp = 1;
        result += temp * 10;
        temp = 0;
      } else if (num === 100) {
        result += temp * 100;
        temp = 0;
      } else {
        temp = num;
      }
    }
    result += temp;
    return result > 0 ? result : null;
  }

  return null;
};

/**
 * 将正则脚本应用到文本
 */
export const applyRegexToText = async (text: string, scripts: RegexScript[], label: string = 'unknown') => {
  if (!text || scripts.length === 0) return text;

  let processed = text;
  const startTime = Date.now();
  terminal.log(`[PERF DEBUG] App.applyRegexToText [${label}] 开始: 长度=${text.length}, 脚本数=${scripts.length}`);

  for (const script of scripts) {
    const scriptStartTime = Date.now();
    if (Date.now() - startTime > 30) {
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

      processed = processed.replace(regex, script.replaceString);

      const scriptDuration = Date.now() - scriptStartTime;
      if (scriptDuration > 100) {
        terminal.warn(
          `[PERF ALERT] 单个正则脚本 [${script.scriptName}] 耗时过长: ${scriptDuration}ms (标签=${label}, 文本长度: ${processed.length})`,
        );
      }
    } catch (e) {
      console.error(`Regex error in ${script.scriptName}`, e);
    }
  }
  const duration = Date.now() - startTime;
  if (duration > 100) {
    terminal.warn(`[PERF ALERT] App.applyRegexToText [${label}] 耗时过长: ${duration}ms, 文本长度: ${text.length}`);
  }
  return processed;
};

/**
 * 根据类型（输入/输出）过滤并处理文本正则
 */
export const processTextWithRegex = async (text: string, scripts: RegexScript[], type: 'input' | 'output') => {
  if (!text) return text;
  const relevantScripts = scripts.filter(s => !s.disabled && s.placement.includes(type === 'input' ? 1 : 2));
  return await applyRegexToText(text, relevantScripts, type);
};

/**
 * 从 Prompt 中提取终点章节号
 */
export const extractTargetEndChapter = (prompt: string): number | null => {
  if (!prompt) return null;
  const rangeMatch = prompt.match(/(?:到|至|-|—|直到)\s*([零一二两三四五六七八九十百千\d]+)(?:\s*章)?/);
  if (rangeMatch) return parseAnyNumber(rangeMatch[1]);

  const countMatch = prompt.match(/(?:共|生成|写|规划|准备|大纲|内容)\s*([零一二两三四五六七八九十百千\d]+)\s*章/);
  if (countMatch) return parseAnyNumber(countMatch[1]);

  const fallbackMatch = prompt.match(/([零一二两三四五六七八九十百千\d]+)\s*章/);
  if (fallbackMatch) return parseAnyNumber(fallbackMatch[1]);

  return null;
};

/**
 * 获取有效的章节内容（如果当前内容为空，尝试从历史版本恢复）
 */
export const getEffectiveChapterContent = (chapter: Chapter | undefined) => {
  if (!chapter) return '';
  if (chapter.content && chapter.content.trim()) return chapter.content;
  const originalVersion = chapter.versions?.find(v => v.type === 'original');
  return originalVersion?.content || '';
};

/**
 * 构建长文模式下的章节上下文消息
 */
export const getChapterContextMessages = (
  targetNovel: Novel | undefined,
  targetChapter: Chapter | undefined,
  config: {
    longTextMode: boolean;
    contextScope: string;
    contextChapterCount: number;
  },
): ChatMessage[] => {
  if (!targetNovel || !targetChapter) return [];
  const messages: ChatMessage[] = [];
  const chapters = targetNovel.chapters || [];

  if (config.longTextMode) {
    let filterVolumeId: string | null = null;
    let filterUncategorized = false;

    if (config.contextScope === 'current') {
      if (targetChapter.volumeId) filterVolumeId = targetChapter.volumeId;
      else filterUncategorized = true;
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

      let scopeStartNum = 1;
      if (filterVolumeId || filterUncategorized) {
        const firstInScope = storyChapters.find(c => (filterVolumeId ? c.volumeId === filterVolumeId : !c.volumeId));
        if (firstInScope) {
          scopeStartNum = storyChapters.indexOf(firstInScope) + 1;
        }
      }

      const allSummaries = chapters
        .filter(c => (c.subtype === 'big_summary' || c.subtype === 'small_summary') && c.summaryRange)
        .filter(s => {
          if (config.contextScope === 'all') return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return false;
        })
        .filter(s => parseRange(s.summaryRange!).end < currentNum);

      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const range = s.summaryRange!;
        if (!rangeMap.has(range) || s.id > rangeMap.get(range)!.id) rangeMap.set(range, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values());

      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary')
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      const effectiveSummaries = uniqueSummaries
        .filter(s => {
          if (s.subtype === 'big_summary') return s.id === latestBigSummary?.id;
          if (config.contextScope === 'all') return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return true;
        })
        .sort((a, b) => parseRange(a.summaryRange!).start - parseRange(b.summaryRange!).start);

      let maxSummarizedIdx = scopeStartNum - 1;
      uniqueSummaries.forEach(s => {
        const { end } = parseRange(s.summaryRange!);
        if (end > maxSummarizedIdx) maxSummarizedIdx = end;
      });

      effectiveSummaries.forEach(s => {
        const typeStr = s.subtype === 'big_summary' ? '剧情大纲' : '剧情概要';
        messages.push({ role: 'system', content: `【${typeStr} (${s.title})】：\n${s.content}` });
      });

      const storyStartNum = Math.max(scopeStartNum, maxSummarizedIdx - config.contextChapterCount + 1);
      const previousStoryChapters = storyChapters.filter((c, idx) => {
        const cNum = idx + 1;
        if (cNum >= currentNum) return false;
        return cNum >= storyStartNum && cNum >= scopeStartNum;
      });

      previousStoryChapters.forEach(c => {
        messages.push({
          role: 'system',
          content: `【前文回顾 - ${c.title}】：\n${getEffectiveChapterContent(c)}`,
        });
      });
    }
  } else {
    // 非长文模式：仅卷内前文
    const volChapters = chapters.filter(
      c => c.volumeId === targetChapter.volumeId && (!c.subtype || c.subtype === 'story'),
    );
    const currentIdx = volChapters.findIndex(c => c.id === targetChapter.id);
    if (currentIdx !== -1) {
      volChapters.slice(0, currentIdx).forEach(c => {
        messages.push({
          role: 'system',
          content: `【前文回顾 - ${c.title}】：\n${getEffectiveChapterContent(c)}`,
        });
      });
    }
  }

  return messages;
};

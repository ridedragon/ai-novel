import terminal from 'virtual:terminal';
import { fixedPromptItems } from '../constants/aiPresets';
import { Chapter, ChatMessage, Novel, PromptItem, RegexScript } from '../types';

export const getApiConfig = (
  presetConfig: any,
  featureModel: string,
  globalApiKey: string,
  globalBaseUrl: string,
  globalModel: string,
) => {
  const finalApiKey = presetConfig?.apiKey || globalApiKey;
  const finalBaseUrl = presetConfig?.baseUrl || globalBaseUrl;
  let finalModel = presetConfig?.defaultModel || presetConfig?.model || featureModel || globalModel;
  return { apiKey: finalApiKey, baseUrl: finalBaseUrl, model: finalModel };
};

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
  // 优先尝试匹配特定集合，如果未匹配到或未指定，则发送所有启用的集合（防止遗漏）
  let relevantWorldview = activeOutlineSetId
    ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : worldviewSets;

  if (relevantWorldview.length === 0) {
    relevantWorldview = worldviewSets;
  }

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
  // 修复：不再根据 activeOutlineSetId 过滤角色，始终发送所有集合，确保全局主角不丢失
  let relevantCharacters = characterSets;

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
 * 验证正则表达式的安全性（防止ReDoS攻击）
 * 返回 { valid: boolean, error?: string }
 */
export const validateRegexSafety = (pattern: string, replaceStr: string = ''): { valid: boolean; error?: string } => {
  try {
    const regexParts = pattern.match(/^\/(.*?)\/([a-z]*)$/);
    const regex = regexParts ? new RegExp(regexParts[1], regexParts[2]) : new RegExp(pattern);

    // 检查正则复杂度指标
    const patternStr = regexParts ? regexParts[1] : pattern;

    // 危险模式检测
    const dangerousPatterns = [
      /\(\?[^)]+\+[^)]*\)\*/i,   // (?:x+)* 类型的嵌套量词
      /\(\[[^\]]+\]\+\)\*/i,     // ([abc]+)* 类型
      /\.\*\.\*/i,              // 连续.*容易导致回溯
      /\([^)]*\{[^}]+\}\)\*/i,   // 嵌套量词
    ];

    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(patternStr)) {
        return { valid: false, error: '检测到潜在危险的正则模式，可能导致性能问题' };
      }
    }

    // 检查替换字符串长度，防止内存溢出
    if (replaceStr.length > 10000) {
      return { valid: false, error: '替换字符串过长，可能导致内存溢出' };
    }

    // 检查是否使用了过于贪婪的匹配
    if ((patternStr.match(/\.\*/g) || []).length > 5) {
      return { valid: false, error: '使用了过多通配符，可能导致严重的性能问题' };
    }

    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: `正则表达式无效: ${e.message}` };
  }
};

/**
 * 安全执行正则替换（带超时保护）
 */
export const safeRegexReplace = (
  text: string,
  regex: RegExp,
  replaceStr: string,
  timeoutMs: number = 1000
): { result: string; timedOut: boolean } => {
  const startTime = Date.now();
  let result = text;
  let timedOut = false;

  try {
    // 使用带有长度限制的replace回调
    result = text.replace(regex, (...args) => {
      if (Date.now() - startTime > timeoutMs) {
        timedOut = true;
        return args[0]; // 返回原匹配，保持文本完整
      }
      return replaceStr;
    });

    // 如果超时，回退到原文本
    if (timedOut) {
      terminal.warn(`[REGEX] 正则执行超时(${timeoutMs}ms)，跳过该脚本`);
      return { result: text, timedOut: true };
    }
  } catch (e) {
    terminal.error(`[REGEX] 正则执行出错: ${e}`);
    return { result: text, timedOut: false };
  }

  return { result, timedOut };
};

/**
 * 将正则脚本应用到文本
 */
export const applyRegexToText = async (text: string, scripts: RegexScript[], label: string = 'unknown') => {
  if (!text || scripts.length === 0) return text;

  let processed = text;
  const startTime = Date.now();
  const SCRIPT_TIMEOUT = 500; // 单个脚本超时500ms
  const TOTAL_TIMEOUT = 5000; // 总超时5秒

  terminal.log(`[PERF DEBUG] App.applyRegexToText [${label}] 开始: 长度=${text.length}, 脚本数=${scripts.length}`);

  for (const script of scripts) {
    // 总时间超时检查
    if (Date.now() - startTime > TOTAL_TIMEOUT) {
      terminal.warn(`[REGEX] 正则处理总时间超时(${TOTAL_TIMEOUT}ms)，停止执行剩余脚本`);
      break;
    }

    const scriptStartTime = Date.now();

    // 每执行几个脚本就让出一次主线程，避免阻塞
    if (Date.now() - startTime > 30) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    try {
      // 验证正则安全性
      const safetyCheck = validateRegexSafety(script.findRegex, script.replaceString);
      if (!safetyCheck.valid) {
        terminal.warn(`[REGEX] 跳过不安全脚本 [${script.scriptName}]: ${safetyCheck.error}`);
        continue;
      }

      if (script.trimStrings && script.trimStrings.length > 0) {
        for (const trimStr of script.trimStrings) {
          if (trimStr && trimStr.length < 100) { // 限制trim字符串长度
            processed = processed.split(trimStr).join('');
          }
        }
      }

      const regexParts = script.findRegex.match(/^\/(.*?)\/([a-z]*)$/);
      const regex = regexParts ? new RegExp(regexParts[1], regexParts[2]) : new RegExp(script.findRegex, 'g');

      // 使用安全的替换方法
      const { result, timedOut } = safeRegexReplace(processed, regex, script.replaceString, SCRIPT_TIMEOUT);
      processed = result;

      if (timedOut) {
        terminal.warn(`[REGEX] 脚本 [${script.scriptName}] 执行超时，跳过`);
        continue;
      }

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

    if (config.contextScope === 'current' || config.contextScope === 'currentVolume' || config.contextScope === 'volume') {
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

      // 3. 收集总结 (兼容识别逻辑)
      const allSummaries = chapters
        .filter(c => {
          const isSum =
            c.subtype === 'big_summary' ||
            c.subtype === 'small_summary' ||
            (typeof c.title === 'string' && (c.title.includes('总结') || c.title.includes('摘要')));

          if (c.summaryRange) return isSum;
          if (isSum && typeof c.title === 'string' && /\d+-\d+/.test(c.title)) return true;

          return false;
        })
        .map(c => {
          if (!c.summaryRange && typeof c.title === 'string') {
            const match = c.title.match(/(\d+)-(\d+)/);
            if (match) {
              return { ...c, summaryRange: `${match[1]}-${match[2]}` };
            }
          }
          return c;
        })
        .filter(s => {
          if (config.contextScope === 'all') return true;
          if (filterVolumeId) return s.volumeId === filterVolumeId;
          if (filterUncategorized) return !s.volumeId;
          return false;
        })
        .filter(s => s.summaryRange && parseRange(s.summaryRange).end < currentNum);

      terminal.log(`[Context] Ch:${currentNum} Summaries:${allSummaries.length}`);

      const rangeMap = new Map<string, Chapter>();
      allSummaries.forEach(s => {
        const range = s.summaryRange!;
        if (!rangeMap.has(range) || s.id > rangeMap.get(range)!.id) rangeMap.set(range, s);
      });
      const uniqueSummaries = Array.from(rangeMap.values());

      // 获取范围内最近的一个大总结
      const latestBigSummary = uniqueSummaries
        .filter(s => s.subtype === 'big_summary' || (typeof s.title === 'string' && s.title.includes('大总结')))
        .sort((a, b) => parseRange(b.summaryRange!).end - parseRange(a.summaryRange!).end)[0];

      if (latestBigSummary) {
        terminal.log(`[Context] Picked Big Summary: ${latestBigSummary.title}`);
      }

      // 计算正文回看起点
      // 规则：最近一次大总结结束位置 - 上下文参考章节数 + 1
      let contextStartNum = Math.max(scopeStartNum, currentNum - config.contextChapterCount);
      if (latestBigSummary) {
        const bigSumEnd = parseRange(latestBigSummary.summaryRange!).end;
        // 如果有大总结，起点设为大总结结束前 N 章 (Context Depth)，确保包含大总结之后的所有章节
        contextStartNum = Math.max(scopeStartNum, bigSumEnd - config.contextChapterCount + 1);
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

      // B. 添加相关的小总结 (Context Window 范围内或之后)
      uniqueSummaries.forEach(s => {
        const isSmall = s.subtype === 'small_summary' || (typeof s.title === 'string' && s.title.includes('小总结'));
        if (isSmall) {
          const end = parseRange(s.summaryRange!).end;
          if (end >= contextStartNum && end < currentNum) {
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

      // D. 添加后续一章内容（如果存在）
      if (currentChapterIndex < storyChapters.length - 1) {
        const nextChapter = storyChapters[currentChapterIndex + 1];
        itemsToSend.push({
          type: 'story',
          end: currentChapterIndex + 2, // 下一章的序号
          data: nextChapter
        });
      }

      // 排序：按结束位置 -> 类型 (Story < Small < Big)
      itemsToSend.sort((a, b) => {
        if (a.end !== b.end) return a.end - b.end;
        // 修正优先级：Story < Small < Big，确保 Summary 在同位置 Story 之后（作为总结）
        const typeOrder = { story: 0, small_summary: 1, big_summary: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      // 生成 Messages
      itemsToSend.forEach(item => {
        if (item.type === 'story') {
          // 检查是否是后续章节
          const isNextChapter = item.end === currentChapterIndex + 2;
          if (isNextChapter) {
            messages.push({
              role: 'system',
              content: `【后一章内容 - ${item.data.title}】：\n${getEffectiveChapterContent(item.data)}\n\n提示：这是故事的后续章节内容，请保持故事的连续性和一致性。`,
            });
          } else {
            messages.push({
              role: 'system',
              content: `【前文回顾细节 - ${item.data.title}】：\n${getEffectiveChapterContent(item.data)}`,
            });
          }
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
    // 非长文模式：卷内前文 + 后续一章
    const volChapters = chapters.filter(
      c => c.volumeId === targetChapter.volumeId && (!c.subtype || c.subtype === 'story'),
    );
    const currentIdx = volChapters.findIndex(c => c.id === targetChapter.id);
    if (currentIdx !== -1) {
      // 添加前文回顾
      volChapters.slice(0, currentIdx).forEach(c => {
        messages.push({
          role: 'system',
          content: `【前文回顾 - ${c.title}】：\n${getEffectiveChapterContent(c)}`,
        });
      });
      
      // 添加后续一章内容（如果存在）
      if (currentIdx < volChapters.length - 1) {
        const nextChapter = volChapters[currentIdx + 1];
        messages.push({
          role: 'system',
          content: `【后一章内容 - ${nextChapter.title}】：\n${getEffectiveChapterContent(nextChapter)}\n\n提示：这是故事的后续章节内容，请保持故事的连续性和一致性。`,
        });
      }
    }
  }

  return messages;
};

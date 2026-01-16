/**
 * 共享工作流工具函数
 */

/**
 * 数字解析工具 - 支持阿拉伯数字和中文数字
 * @param text 输入文本
 * @returns 解析后的数字或 null
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
 * 从提示词中提取目标结束章节数
 * @param prompt 提示词
 * @returns 章节数或 null
 */
export const extractTargetEndChapter = (prompt: string): number | null => {
  if (!prompt) return null;
  // 1. 寻找范围终点: "到"、"至"、"-" 之后跟着的数字 (例如: 1-30章)
  const rangeMatch = prompt.match(/(?:到|至|-|—|直到)\s*([零一二两三四五六七八九十百千\d]+)(?:\s*章)?/);
  if (rangeMatch) return parseAnyNumber(rangeMatch[1]);

  // 2. 寻找绝对章节数: "共xx章"、"生成xx章"、"xx章大纲" (例如: 生成30章)
  const countMatch = prompt.match(/(?:共|生成|写|规划|准备|大纲|内容)\s*([零一二两三四五六七八九十百千\d]+)\s*章/);
  if (countMatch) return parseAnyNumber(countMatch[1]);

  // 3. 兜底: 寻找任何带"章"的数字 (例如: 30章)
  const fallbackMatch = prompt.match(/([零一二两三四五六七八九十百千\d]+)\s*章/);
  if (fallbackMatch) return parseAnyNumber(fallbackMatch[1]);

  return null;
};

/**
 * 鲁棒的 JSON 清理与解析逻辑 (异步化以防 UI 假死)
 * @param text 待解析的文本
 * @returns 解析后的 JSON 对象
 */
export const cleanAndParseJSON = async (text: string) => {
  let processed = text.trim();

  // 1. 异步化的正则清理 (Yield thread)
  await new Promise(resolve => setTimeout(resolve, 0));
  processed = processed
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .replace(/```\s*([\s\S]*?)```/gi, '$1')
    .replace(/\[\/?JSON\]/gi, '');

  // 寻找 JSON 边界
  const firstBracket = processed.indexOf('[');
  const firstBrace = processed.indexOf('{');
  let start = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) start = firstBracket;
  else if (firstBrace !== -1) start = firstBrace;

  if (start !== -1) {
    const lastBracket = processed.lastIndexOf(']');
    const lastBrace = processed.lastIndexOf('}');
    const end = Math.max(lastBracket, lastBrace);
    if (end > start) {
      processed = processed.substring(start, end + 1);
    }
  }

  // 增强纠偏：修复常见的 LLM JSON 语法错误
  const heuristicFix = (jsonStr: string) => {
    return jsonStr
      .replace(/":\s*:/g, '":') // 修复双冒号 "::"
      .replace(/,\s*([\]}])/g, '$1') // 移除末尾多余逗号
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // 移除不可见控制字符
  };

  try {
    return JSON.parse(processed);
  } catch (e: any) {
    const fixed = heuristicFix(processed);
    try {
      return JSON.parse(fixed);
    } catch (e2: any) {
      throw e2;
    }
  }
};

/**
 * 从解析后的对象中提取内容条目
 * @param data 解析后的 JSON 数据
 * @returns 统一格式的条目列表
 */
export const extractEntries = async (data: any): Promise<{ title: string; content: string }[]> => {
  if (!data) return [];

  // 递归处理嵌套对象（如 { "outline": [...] }）
  if (typeof data === 'object' && !Array.isArray(data)) {
    const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
    if (arrayKey) return await extractEntries(data[arrayKey]);
  }

  const items = Array.isArray(data) ? data : [data];
  const resultItems: { title: string; content: string }[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    // 每处理 50 个条目 yield 一次，确保移动端 UI 响应
    if (idx > 0 && idx % 50 === 0) await new Promise(resolve => setTimeout(resolve, 0));

    const item = items[idx];
    if (typeof item === 'string') {
      resultItems.push({ title: `条目 ${idx + 1}`, content: item });
      continue;
    }
    if (typeof item !== 'object' || item === null) {
      resultItems.push({ title: '未命名', content: String(item) });
      continue;
    }

    // 拓宽键名匹配范围
    const title = String(
      item.title ||
        item.chapter ||
        item.name ||
        item.item ||
        item.label ||
        item.header ||
        Object.values(item)[0] ||
        '未命名',
    );
    const content = String(
      item.summary ||
        item.content ||
        item.description ||
        item.plot ||
        item.setting ||
        item.bio ||
        item.value ||
        Object.values(item)[1] ||
        '',
    );

    resultItems.push({ title, content });
  }
  return resultItems;
};

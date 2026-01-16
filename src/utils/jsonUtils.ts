/**
 * 清理 JSON 字符串（处理字符串中未转义的换行符）
 */
export const sanitizeJsonString = (content: string): string => {
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += char;
      } else {
        if (char === '\\') {
          isEscaped = true;
          result += char;
        } else if (char === '"') {
          inString = false;
          result += char;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          // Ignore CR
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }
  return result;
};

/**
 * 深度修复并解析 AI 返回的 JSON（处理 Markdown、截断、非法换行等）
 */
export const sanitizeAndParseJson = (content: string): any[] | null => {
  let processed = content.trim();
  processed = processed.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```\s*([\s\S]*?)```/gi, '$1');
  processed = processed.replace(/\[\/?JSON\]/gi, '');

  const startBracket = processed.indexOf('[');
  const startBrace = processed.indexOf('{');
  let start = -1;
  if (startBracket !== -1 && startBrace !== -1) start = Math.min(startBracket, startBrace);
  else if (startBracket !== -1) start = startBracket;
  else if (startBrace !== -1) start = startBrace;

  if (start !== -1) {
    const endBracket = processed.lastIndexOf(']');
    const endBrace = processed.lastIndexOf('}');
    const end = Math.max(endBracket, endBrace);
    if (end > start) {
      processed = processed.substring(start, end + 1);
    }
  }

  let result = sanitizeJsonString(processed);

  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      const values = Object.values(parsed);
      if (values.length === 1 && Array.isArray(values[0])) return values[0] as any[];
      return [parsed];
    }
  } catch (e) {
    try {
      const ultraClean = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
      const parsed = JSON.parse(ultraClean);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) return [parsed];
    } catch (e2) {
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let isEscaped = false;

      for (let i = 0; i < result.length; i++) {
        const char = result[i];
        if (inString) {
          if (isEscaped) isEscaped = false;
          else if (char === '\\') isEscaped = true;
          else if (char === '"') inString = false;
        } else {
          if (char === '"') inString = true;
          else if (char === '{') openBraces++;
          else if (char === '}') {
            openBraces--;
          } else if (char === '[') openBrackets++;
          else if (char === ']') {
            openBrackets--;
          }
        }
      }

      if (openBrackets > 0 || openBraces > 0) {
        const lastBrace = result.lastIndexOf('}');
        const lastBracket = result.lastIndexOf(']');
        const lastEnd = Math.max(lastBrace, lastBracket);

        if (lastEnd !== -1) {
          let fix = result.substring(0, lastEnd + 1);
          if (openBrackets > 0 && result[lastEnd] !== ']') fix += ']';
          try {
            const parsed = JSON.parse(fix);
            if (Array.isArray(parsed)) return parsed;
            if (typeof parsed === 'object' && parsed !== null) return [parsed];
          } catch (e3) {}
        }
      }
    }
  }

  return null;
};

/**
 * 鲁棒地解析 JSON 数组，包含自动补救逻辑
 */
export const safeParseJSONArray = (content: string): any[] => {
  const sanitizedResult = sanitizeAndParseJson(content);
  if (sanitizedResult) return sanitizedResult;

  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
    } else {
      if (char === '"') inString = true;
      else if (char === '[') {
        if (braceCount === 0) startIndex = i;
        braceCount++;
      } else if (char === ']') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          const potentialJson = content.substring(startIndex, i + 1);
          const result = sanitizeAndParseJson(potentialJson);
          if (result) return result;
          startIndex = -1;
        }
      }
    }
  }

  const objects: any[] = [];
  braceCount = 0;
  startIndex = -1;
  inString = false;
  escape = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
    } else {
      if (char === '"') inString = true;
      else if (char === '{') {
        if (braceCount === 0) startIndex = i;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          const potentialJson = content.substring(startIndex, i + 1);
          try {
            const obj = JSON.parse(potentialJson);
            if (obj) objects.push(obj);
          } catch (e) {
            try {
              const sanitized = sanitizeJsonString(potentialJson);
              const obj = JSON.parse(sanitized);
              if (obj) objects.push(obj);
            } catch (e2) {}
          }
          startIndex = -1;
        }
      }
    }
  }

  if (objects.length > 0) return objects;
  throw new Error('无法解析有效的 JSON 数据');
};

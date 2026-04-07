/**
 * 预清理：移除常见非 JSON 包装内容
 */
const stripNonJsonWrappers = (content: string): string => {
  let processed = content.trim();
  
  // 移除 markdown 代码块标记
  processed = processed.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
  // 移除常见的 JSON 包装标签
  processed = processed.replace(/\[\/?JSON\]/gi, '');
  processed = processed.replace(/<\??json.*?>/gi, '').replace(/<\/?\??json>/gi, '');
  // 移除常见的开头说明文字（保留方括号/花括号之后的内容）
  const bracketIdx = Math.max(processed.indexOf('['), processed.indexOf('{'));
  if (bracketIdx > 0) {
    // 检查开头是否包含说明性文字
    const beforeBracket = processed.substring(0, bracketIdx).trim();
    if (beforeBracket.length > 0 && beforeBracket.length < 500) {
      processed = processed.substring(bracketIdx);
    }
  }
  // 移除末尾的说明文字
  const lastBracket = Math.max(processed.lastIndexOf(']'), processed.lastIndexOf('}'));
  if (lastBracket !== -1 && lastBracket < processed.length - 1) {
    const afterBracket = processed.substring(lastBracket + 1).trim();
    if (afterBracket.length > 0 && afterBracket.length < 500) {
      processed = processed.substring(0, lastBracket + 1);
    }
  }
  
  return processed;
};

/**
 * 清理 JSON 字符串（处理字符串中未转义的换行符、尾随逗号等）
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
 * 修复尾随逗号（trailing comma）
 * 在数组或对象中，最后一个元素后面的逗号会导致 JSON 解析失败
 */
const fixTrailingCommas = (content: string): string => {
  let result = '';
  let inString = false;
  let isEscaped = false;
  
  // 逐字符处理
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += char;
      } else {
        if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else if (char === ',') {
        // 检查逗号后面是否有 ] 或 }
        let j = i + 1;
        while (j < content.length && (content[j] === ' ' || content[j] === '\n' || content[j] === '\r' || content[j] === '\t')) {
          j++;
        }
        if (j < content.length && (content[j] === ']' || content[j] === '}')) {
          // 这是尾随逗号，移除它
          continue;
        }
        result += char;
      } else {
        result += char;
      }
    }
  }
  
  return result;
};

/**
 * 将单引号转换为双引号（仅在 JSON 结构中）
 */
const convertSingleQuotesToDouble = (content: string): string => {
  let result = '';
  let inDoubleQuoteString = false;
  let inSingleQuoteString = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (isEscaped) {
      isEscaped = false;
      result += char;
      continue;
    }
    
    if (inDoubleQuoteString) {
      if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inDoubleQuoteString = false;
      }
      result += char;
    } else if (inSingleQuoteString) {
      if (char === '\\') {
        isEscaped = true;
        result += char;
      } else if (char === "'") {
        inSingleQuoteString = false;
        result += '"';
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inDoubleQuoteString = true;
        result += char;
      } else if (char === "'") {
        inSingleQuoteString = true;
        result += '"';
      } else {
        result += char;
      }
    }
  }
  
  return result;
};

/**
 * 修复未加引号的键名（仅限常见的简单键名）
 * 例如：{item: "value"} -> {"item": "value"}
 */
const fixUnquotedKeys = (content: string): string => {
  // 匹配 { 或 , 后跟随未加引号的键名
  return content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
};

/**
 * 移除 JavaScript 风格的注释
 */
const removeComments = (content: string): string => {
  let result = '';
  let inString = false;
  let isEscaped = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += char;
      } else {
        if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        result += char;
      }
    } else {
      // 检测单行注释 //
      if (char === '/' && i + 1 < content.length && content[i + 1] === '/') {
        while (i < content.length && content[i] !== '\n') i++;
        continue;
      }
      // 检测多行注释 /* */
      if (char === '/' && i + 1 < content.length && content[i + 1] === '*') {
        i += 2;
        while (i + 1 < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
        i += 2; // 跳过 */
        continue;
      }
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
    i++;
  }
  
  return result;
};

/**
 * 深度修复并解析 AI 返回的 JSON（处理 Markdown、截断、非法换行、尾随逗号、单引号、注释等）
 */
export const sanitizeAndParseJson = (content: string): any[] | null => {
  // 第 1 层：预清理，移除常见非 JSON 包装内容
  let processed = stripNonJsonWrappers(content.trim());

  // 第 2 层：找到 JSON 边界
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

  // 第 3 层：移除注释
  processed = removeComments(processed);

  // 第 4 层：处理字符串中的非法字符（换行、制表符等）
  let result = sanitizeJsonString(processed);

  // 第 5 层：修复尾随逗号
  result = fixTrailingCommas(result);

  // 第 6 层：修复未加引号的键名
  result = fixUnquotedKeys(result);

  // 尝试解析
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      const values = Object.values(parsed);
      if (values.length === 1 && Array.isArray(values[0])) return values[0] as any[];
      return [parsed];
    }
  } catch (e) {
    // 尝试 7：清理控制字符
    try {
      const ultraClean = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
      const parsed = JSON.parse(ultraClean);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) return [parsed];
    } catch (e2) {
      // 尝试 8：将单引号替换为双引号
      try {
        const doubleQuoted = convertSingleQuotesToDouble(result);
        const parsed = JSON.parse(doubleQuoted);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object' && parsed !== null) return [parsed];
      } catch (e3) {
        // 尝试 9：修复未闭合的括号（截断的情况）
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
            else if (char === '}') openBraces--;
            else if (char === '[') openBrackets++;
            else if (char === ']') openBrackets--;
          }
        }

        if (openBrackets > 0 || openBraces > 0) {
          const lastBrace = result.lastIndexOf('}');
          const lastBracket = result.lastIndexOf(']');
          const lastEnd = Math.max(lastBrace, lastBracket);

          if (lastEnd !== -1) {
            let fix = result.substring(0, lastEnd + 1);
            if (openBrackets > 0 && result[lastEnd] !== ']') fix += ']';
            if (openBraces > 0 && result[lastEnd] !== '}') fix += '}';
            // 在修复括号后再次尝试修复尾随逗号
            fix = fixTrailingCommas(fix);
            try {
              const parsed = JSON.parse(fix);
              if (Array.isArray(parsed)) return parsed;
              if (typeof parsed === 'object' && parsed !== null) return [parsed];
            } catch (e4) {}
          }
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
            // 使用增强版的 sanitizeAndParseJson 进行深度修复
            const fixed = sanitizeAndParseJson(potentialJson);
            if (fixed && fixed.length > 0) {
              objects.push(...fixed);
            } else {
              // 最终降级：尝试修复尾随逗号和未加引号键名
              try {
                let fixedJson = potentialJson;
                fixedJson = fixTrailingCommas(fixedJson);
                fixedJson = fixUnquotedKeys(fixedJson);
                const obj = JSON.parse(fixedJson);
                if (obj) objects.push(obj);
              } catch (e3) {
                // 无法解析该对象，跳过
              }
            }
          }
          startIndex = -1;
        }
      }
    }
  }

  if (objects.length > 0) return objects;
  throw new Error('无法解析有效的 JSON 数据');
};

/**
 * 编辑预设宏系统
 * 
 * 允许在编辑预设的提示词中使用特殊语法来动态引用当前章节内容
 * 
 * @example
 * 在提示词中使用：{{current_chapter}} 获取当前章节的全部内容
 */

/**
 * 编辑预设宏定义接口
 */
export type EditPresetMacroResolverFn = (match: string, ...args: string[]) => string;

export interface EditPresetMacroDefinition {
  name: string;
  description: string;
  pattern: string;
  resolver: (context: EditPresetMacroContext) => string | EditPresetMacroResolverFn;
  examples: string[];
}

/**
 * 编辑预设宏解析上下文
 */
export interface EditPresetMacroContext {
  // 当前章节的全部内容
  currentChapterContent: string;
  // 当前章节标题
  currentChapterTitle?: string;
}

/**
 * 预定义的编辑预设宏列表
 */
export const EDIT_PRESET_MACRO_DEFINITIONS: EditPresetMacroDefinition[] = [
  {
    name: 'current_chapter',
    description: '获取当前正在编辑的本章正文的全部内容',
    pattern: '{{current_chapter}}',
    resolver: (ctx) => {
      return ctx.currentChapterContent || '[当前章节内容为空]';
    },
    examples: ['{{current_chapter}} - 获取当前章节的全部内容'],
  },
  {
    name: 'current_chapter_title',
    description: '获取当前章节的标题',
    pattern: '{{current_chapter_title}}',
    resolver: (ctx) => {
      return ctx.currentChapterTitle || '[当前章节标题为空]';
    },
    examples: ['{{current_chapter_title}} - 获取当前章节的标题'],
  },
];

/**
 * 编辑预设宏解析器主函数
 * 将文本中的所有宏替换为实际内容
 */
export function resolveEditPresetMacros(text: string, context: EditPresetMacroContext): string {
  if (!text) return text;
  
  let result = text;
  
  for (const macro of EDIT_PRESET_MACRO_DEFINITIONS) {
    const regex = new RegExp(macro.pattern, 'g');
    
    result = result.replace(regex, (match: string, ...args: string[]) => {
      const resolverResult = macro.resolver(context);
      
      if (typeof resolverResult === 'function') {
        return resolverResult(match, ...args);
      }
      
      return resolverResult as string;
    });
  }
  
  return result;
}

/**
 * 获取所有可用编辑预设宏的说明文本
 */
export function getEditPresetMacroHelpText(): string {
  const sections: string[] = ['# 编辑预设宏使用指南\n'];
  
  for (const macro of EDIT_PRESET_MACRO_DEFINITIONS) {
    sections.push(`\n## ${macro.name}\n`);
    sections.push(`${macro.description}\n`);
    sections.push('\n**用法示例**：\n');
    for (const example of macro.examples) {
      sections.push(`- \`${example}\`\n`);
    }
  }
  
  return sections.join('');
}

/**
 * 简化的编辑预设宏提示，用于在UI中显示
 */
export const EDIT_PRESET_MACRO_QUICK_REFERENCE: string = `
可用编辑预设宏：
- {{current_chapter}} - 当前章节全部内容
- {{current_chapter_title}} - 当前章节标题
`;

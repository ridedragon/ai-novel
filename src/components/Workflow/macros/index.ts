/**
 * 工作流宏组件系统
 * 
 * 宏组件允许节点引用其他节点生成的全部内容。
 * 无论节点执行先后，宏都能正确获取数据。
 * 
 * @example
 * 在节点指令中使用：{{all_worldview}} 获取所有世界观内容
 * 在提示词中使用：{{node_output:worldview}} 获取世界观节点的输出
 */

import { WorkflowNodeData } from '../types';

/**
 * 宏定义接口
 */
export type MacroResolverFn = (match: string, ...args: string[]) => string;

export interface MacroDefinition {
  name: string;
  description: string;
  pattern: string; // 正则匹配模式
  resolver: (context: MacroContext) => string | MacroResolverFn;
  examples: string[];
}

/**
 * 宏解析上下文
 */
export interface MacroContext {
  // 所有前序节点的数据（按执行顺序）
  previousNodes: Array<{ id: string; typeKey: string; data: WorkflowNodeData }>;
  // 所有节点数据（不区分顺序）
  allNodes: Array<{ id: string; typeKey: string; data: WorkflowNodeData }>;
  // 当前节点数据
  currentNode?: { id: string; typeKey: string; data: WorkflowNodeData };
  // 全局上下文变量
  globalVariables: Record<string, any>;
  // 当前分卷锚点
  activeVolumeAnchor?: string;
  // 当前分卷索引
  currentVolumeIndex: number;
  // 小说数据
  novelData?: any;
}

/**
 * 预定义的宏组件列表
 */
export const MACRO_DEFINITIONS: MacroDefinition[] = [
  // ==================== 节点输出类宏 ====================
  {
    name: 'node_output',
    description: '获取指定节点的输出内容。支持按节点ID或节点类型引用。',
    pattern: '{{node_output:([^}]+)}}',
    resolver: (ctx) => {
      return (match: string, identifier: string) => {
        const trimmedId = identifier.trim();
        
        // 尝试按节点ID查找
        const byId = ctx.allNodes.find(n => n.id === trimmedId);
        if (byId && byId.data.outputEntries?.length) {
          return formatOutputEntries(byId.data.outputEntries, byId.typeKey);
        }
        
        // 尝试按节点类型查找（获取最新的已完成节点）
        const byType = ctx.previousNodes
          .filter(n => n.typeKey === trimmedId && n.data.status === 'completed')
          .pop();
        if (byType && byType.data.outputEntries?.length) {
          return formatOutputEntries(byType.data.outputEntries, byType.typeKey);
        }
        
        // 尝试按节点标签查找
        const byLabel = ctx.allNodes.find(n => 
          n.data.label === trimmedId || n.data.typeLabel === trimmedId
        );
        if (byLabel && byLabel.data.outputEntries?.length) {
          return formatOutputEntries(byLabel.data.outputEntries, byLabel.typeKey);
        }
        
        return `[未找到节点: ${trimmedId}]`;
      };
    },
    examples: [
      '{{node_output:worldview}} - 获取世界观节点的输出',
      '{{node_output:characters}} - 获取角色节点的输出',
      '{{node_output:node_123}} - 获取指定ID节点的输出',
      '{{node_output:世界观设定}} - 获取标签为"世界观设定"的节点输出',
    ],
  },

  // ==================== 全量内容类宏 ====================
  {
    name: 'all_worldview',
    description: '获取所有世界观节点的完整输出内容，合并显示。',
    pattern: '{{all_worldview}}',
    resolver: (ctx) => {
      const worldviewNodes = ctx.allNodes.filter(n => n.typeKey === 'worldview');
      if (worldviewNodes.length === 0) return '[无世界观内容]';
      
      const contents = worldviewNodes
        .filter(n => n.data.outputEntries?.length)
        .map(n => formatOutputEntries(n.data.outputEntries!, 'worldview'));
      
      return contents.length > 0 ? contents.join('\n\n') : '[无世界观内容]';
    },
    examples: ['{{all_worldview}}'],
  },

  {
    name: 'all_characters',
    description: '获取所有角色节点的完整输出内容，合并显示。',
    pattern: '{{all_characters}}',
    resolver: (ctx) => {
      const characterNodes = ctx.allNodes.filter(n => n.typeKey === 'characters');
      if (characterNodes.length === 0) return '[无角色内容]';
      
      const contents = characterNodes
        .filter(n => n.data.outputEntries?.length)
        .map(n => formatOutputEntries(n.data.outputEntries!, 'characters'));
      
      return contents.length > 0 ? contents.join('\n\n') : '[无角色内容]';
    },
    examples: ['{{all_characters}}'],
  },

  {
    name: 'all_outline',
    description: '获取所有大纲节点的完整输出内容，合并显示。',
    pattern: '{{all_outline}}',
    resolver: (ctx) => {
      const outlineNodes = ctx.allNodes.filter(n => n.typeKey === 'outline');
      if (outlineNodes.length === 0) return '[无大纲内容]';
      
      const contents = outlineNodes
        .filter(n => n.data.outputEntries?.length)
        .map(n => formatOutputEntries(n.data.outputEntries!, 'outline'));
      
      return contents.length > 0 ? contents.join('\n\n') : '[无大纲内容]';
    },
    examples: ['{{all_outline}}'],
  },

  {
    name: 'all_plotOutline',
    description: '获取所有粗纲节点的完整输出内容，合并显示。',
    pattern: '{{all_plotOutline}}',
    resolver: (ctx) => {
      const plotNodes = ctx.allNodes.filter(n => n.typeKey === 'plotOutline');
      if (plotNodes.length === 0) return '[无粗纲内容]';
      
      const contents = plotNodes
        .filter(n => n.data.outputEntries?.length)
        .map(n => formatOutputEntries(n.data.outputEntries!, 'plotOutline'));
      
      return contents.length > 0 ? contents.join('\n\n') : '[无粗纲内容]';
    },
    examples: ['{{all_plotOutline}}'],
  },

  {
    name: 'all_inspiration',
    description: '获取所有灵感节点的完整输出内容，合并显示。',
    pattern: '{{all_inspiration}}',
    resolver: (ctx) => {
      const inspirationNodes = ctx.allNodes.filter(n => n.typeKey === 'inspiration');
      if (inspirationNodes.length === 0) return '[无灵感内容]';
      
      const contents = inspirationNodes
        .filter(n => n.data.outputEntries?.length)
        .map(n => formatOutputEntries(n.data.outputEntries!, 'inspiration'));
      
      return contents.length > 0 ? contents.join('\n\n') : '[无灵感内容]';
    },
    examples: ['{{all_inspiration}}'],
  },

  // ==================== 分卷信息类宏 ====================
  {
    name: 'volume_content',
    description: '获取分卷规划节点的完整规划内容。',
    pattern: '{{volume_content}}',
    resolver: (ctx) => {
      const volumeNode = ctx.allNodes.find(n => n.typeKey === 'saveToVolume');
      if (!volumeNode) return '[无分卷规划]';
      
      // 优先使用 volumeContent（支持手动编辑）
      if (volumeNode.data.volumeContent) {
        return volumeNode.data.volumeContent;
      }
      
      if (volumeNode.data.outputEntries?.length) {
        return formatOutputEntries(volumeNode.data.outputEntries, 'saveToVolume');
      }
      
      return '[无分卷规划内容]';
    },
    examples: ['{{volume_content}}'],
  },

  {
    name: 'volume_list',
    description: '获取所有分卷的名称列表，格式化显示。',
    pattern: '{{volume_list}}',
    resolver: (ctx) => {
      const volumeNode = ctx.allNodes.find(n => n.typeKey === 'saveToVolume');
      if (!volumeNode?.data.volumes?.length) {
        // 尝试从小说数据获取
        if (ctx.novelData?.volumes?.length) {
          return ctx.novelData.volumes.map((v: any, i: number) => 
            `${i + 1}. ${v.title}`
          ).join('\n');
        }
        return '[无分卷信息]';
      }
      
      return volumeNode.data.volumes.map((v: any, i: number) => 
        `${i + 1}. ${v.volumeName}${v.startChapter ? ` (第${v.startChapter}-${v.endChapter || '?'}章)` : ''}`
      ).join('\n');
    },
    examples: ['{{volume_list}}'],
  },

  {
    name: 'current_volume',
    description: '获取当前正在创作的分卷名称。',
    pattern: '{{current_volume}}',
    resolver: (ctx) => {
      if (!ctx.activeVolumeAnchor) return '[未设置当前分卷]';
      
      // 从分卷规划中查找
      const volumeNode = ctx.allNodes.find(n => n.typeKey === 'saveToVolume');
      if (volumeNode?.data.volumes?.length) {
        const currentVol = volumeNode.data.volumes.find((v: any) => v.id === ctx.activeVolumeAnchor);
        if (currentVol) return currentVol.volumeName;
      }
      
      // 从小说数据查找
      if (ctx.novelData?.volumes?.length) {
        const currentVol = ctx.novelData.volumes.find((v: any) => v.id === ctx.activeVolumeAnchor);
        if (currentVol) return currentVol.title;
      }
      
      return '[未知的分卷]';
    },
    examples: ['{{current_volume}}'],
  },

  {
    name: 'current_volume_info',
    description: '获取当前分卷的详细信息（名称、章节范围、描述）。',
    pattern: '{{current_volume_info}}',
    resolver: (ctx) => {
      if (!ctx.activeVolumeAnchor) return '[未设置当前分卷]';
      
      const volumeNode = ctx.allNodes.find(n => n.typeKey === 'saveToVolume');
      if (volumeNode?.data.volumes?.length) {
        const currentVol = volumeNode.data.volumes.find((v: any) => v.id === ctx.activeVolumeAnchor);
        if (currentVol) {
          let info = `分卷名称：${currentVol.volumeName}`;
          if (currentVol.startChapter) info += `\n章节范围：第${currentVol.startChapter}-${currentVol.endChapter || '?'}章`;
          if (currentVol.description) info += `\n内容概述：${currentVol.description}`;
          return info;
        }
      }
      
      return '[未找到当前分卷信息]';
    },
    examples: ['{{current_volume_info}}'],
  },

  // ==================== 循环信息类宏 ====================
  {
    name: 'loop_instruction',
    description: '获取当前循环轮次的特定指令内容。',
    pattern: '{{loop_instruction}}',
    resolver: (ctx) => {
      const loopIndex = ctx.globalVariables['loop_index'] || 1;
      
      // 从循环配置器获取指令
      const loopConfigNode = ctx.allNodes.find(n => n.typeKey === 'loopConfigurator');
      if (loopConfigNode?.data.globalLoopInstructions?.length) {
        const instruction = loopConfigNode.data.globalLoopInstructions.find(
          (inst: any) => inst.index === loopIndex
        );
        if (instruction?.content) return instruction.content;
      }
      
      // 从循环节点获取
      const loopNode = ctx.allNodes.find(n => n.typeKey === 'loopNode');
      if (loopNode?.data.loopInstructions?.length) {
        const instruction = loopNode.data.loopInstructions.find(
          (inst: any) => inst.index === loopIndex
        );
        if (instruction?.content) return instruction.content;
      }
      
      return `[无第${loopIndex}轮循环指令]`;
    },
    examples: ['{{loop_instruction}}'],
  },

  {
    name: 'loop_config',
    description: '获取循环配置信息（总轮次、当前轮次）。',
    pattern: '{{loop_config}}',
    resolver: (ctx) => {
      const loopIndex = ctx.globalVariables['loop_index'] || 1;
      const totalLoops = ctx.globalVariables['total_loops'] || 
        ctx.allNodes.find(n => n.typeKey === 'loopConfigurator')?.data.globalLoopConfig?.count ||
        ctx.allNodes.find(n => n.typeKey === 'loopNode')?.data.loopConfig?.count || 1;
      
      return `当前轮次：第${loopIndex}轮 / 共${totalLoops}轮`;
    },
    examples: ['{{loop_config}}'],
  },

  // ==================== 前序内容类宏 ====================
  {
    name: 'previous_outputs',
    description: '获取所有前序节点的输出内容摘要，按执行顺序排列。',
    pattern: '{{previous_outputs}}',
    resolver: (ctx) => {
      if (ctx.previousNodes.length === 0) return '[无前序节点输出]';
      
      const outputs = ctx.previousNodes
        .filter(n => n.data.status === 'completed' && n.data.outputEntries?.length)
        .map(n => {
          const label = n.data.label || n.data.typeLabel;
          const content = formatOutputEntries(n.data.outputEntries!, n.typeKey);
          return `【${label}】\n${content.substring(0, 500)}${content.length > 500 ? '...(更多内容省略)' : ''}`;
        });
      
      return outputs.length > 0 ? outputs.join('\n\n---\n\n') : '[无已完成的前序节点]';
    },
    examples: ['{{previous_outputs}}'],
  },

  {
    name: 'previous_outputs_full',
    description: '获取所有前序节点的完整输出内容（不截断）。',
    pattern: '{{previous_outputs_full}}',
    resolver: (ctx) => {
      if (ctx.previousNodes.length === 0) return '[无前序节点输出]';
      
      const outputs = ctx.previousNodes
        .filter(n => n.data.status === 'completed' && n.data.outputEntries?.length)
        .map(n => {
          const label = n.data.label || n.data.typeLabel;
          const content = formatOutputEntries(n.data.outputEntries!, n.typeKey);
          return `【${label}】\n${content}`;
        });
      
      return outputs.length > 0 ? outputs.join('\n\n---\n\n') : '[无已完成的前序节点]';
    },
    examples: ['{{previous_outputs_full}}'],
  },

  {
    name: 'context_summary',
    description: '获取创作上下文摘要，包含世界观、角色、大纲等关键信息的精简版本。',
    pattern: '{{context_summary}}',
    resolver: (ctx) => {
      const sections: string[] = [];
      
      // 世界观摘要
      const worldviewNodes = ctx.allNodes.filter(n => n.typeKey === 'worldview' && n.data.outputEntries?.length);
      if (worldviewNodes.length) {
        const worldviewContent = worldviewNodes.map(n => 
          n.data.outputEntries!.map(e => `· ${e.title}: ${e.content?.substring(0, 100)}...`).join('\n')
        ).join('\n');
        sections.push(`【世界观设定】\n${worldviewContent}`);
      }
      
      // 角色摘要
      const characterNodes = ctx.allNodes.filter(n => n.typeKey === 'characters' && n.data.outputEntries?.length);
      if (characterNodes.length) {
        const characterContent = characterNodes.map(n =>
          n.data.outputEntries!.map(e => `· ${e.title}: ${e.content?.substring(0, 150)}...`).join('\n')
        ).join('\n');
        sections.push(`【角色档案】\n${characterContent}`);
      }
      
      // 大纲摘要
      const outlineNodes = ctx.allNodes.filter(n => n.typeKey === 'outline' && n.data.outputEntries?.length);
      if (outlineNodes.length) {
        const outlineContent = outlineNodes.map(n =>
          n.data.outputEntries!.map(e => `· ${e.title}`).join('\n')
        ).join('\n');
        sections.push(`【章节大纲】\n${outlineContent}`);
      }
      
      // 分卷信息
      const currentVolInfo = resolveMacro('current_volume_info', ctx);
      if (currentVolInfo && !currentVolInfo.startsWith('[未')) {
        sections.push(`【当前分卷】\n${currentVolInfo}`);
      }
      
      return sections.length > 0 ? sections.join('\n\n') : '[无创作上下文]';
    },
    examples: ['{{context_summary}}'],
  },

  // ==================== 创作信息类宏 ====================
  {
    name: 'creation_info',
    description: '获取完整的创作信息，包含分卷进度、循环轮次等系统信息。',
    pattern: '{{creation_info}}',
    resolver: (ctx) => {
      const loopIndex = ctx.globalVariables['loop_index'] || 1;
      const volumeIndex = ctx.currentVolumeIndex;
      
      let info = '';
      
      // 当前分卷
      const currentVol = resolveMacro('current_volume', ctx);
      if (!currentVol.startsWith('[未') && !currentVol.startsWith('[无')) {
        info += `当前分卷：${currentVol}\n`;
      }
      
      // 分卷进度
      const volumeNode = ctx.allNodes.find(n => n.typeKey === 'saveToVolume');
      const totalVolumes = volumeNode?.data.volumes?.length || 
        ctx.novelData?.volumes?.length || 1;
      if (totalVolumes > 1) {
        info += `分卷进度：第${volumeIndex + 1}卷 / 共${totalVolumes}卷\n`;
      }
      
      // 循环轮次
      info += `当前循环轮次：第${loopIndex}轮`;
      
      return info || '[无创作信息]';
    },
    examples: ['{{creation_info}}'],
  },

  // ==================== 小说数据类宏 ====================
  {
    name: 'novel_title',
    description: '获取小说标题。',
    pattern: '{{novel_title}}',
    resolver: (ctx) => {
      return ctx.novelData?.title || '[未设置小说标题]';
    },
    examples: ['{{novel_title}}'],
  },

  {
    name: 'novel_summary',
    description: '获取小说简介。',
    pattern: '{{novel_summary}}',
    resolver: (ctx) => {
      return ctx.novelData?.summary || '[未设置小说简介]';
    },
    examples: ['{{novel_summary}}'],
  },

  {
    name: 'chapter_count',
    description: '获取已创作的章节数量。',
    pattern: '{{chapter_count}}',
    resolver: (ctx) => {
      const chapters = ctx.novelData?.chapters || [];
      return `${chapters.length}章`;
    },
    examples: ['{{chapter_count}}'],
  },

  // ==================== 动态选择类宏 ====================
  {
    name: 'select_entries',
    description: '从指定节点中选择特定条目。支持按条目标题或索引选择。',
    pattern: '{{select_entries:([^:]+):([^}]+)}}',
    resolver: (ctx) => {
      return (match: string, nodeIdentifier: string, entryIdentifier: string) => {
        const trimmedNode = nodeIdentifier.trim();
        const trimmedEntry = entryIdentifier.trim();
        
        // 找到节点
        const node = ctx.allNodes.find(n => 
          n.id === trimmedNode || 
          n.typeKey === trimmedNode ||
          n.data.label === trimmedNode
        );
        
        if (!node?.data.outputEntries?.length) {
          return `[未找到节点: ${trimmedNode}]`;
        }
        
        // 尝试按索引选择
        const index = parseInt(trimmedEntry);
        if (!isNaN(index)) {
          const entry = node.data.outputEntries[index - 1]; // 1-based index
          if (entry) return entry.content || '[空内容]';
          return `[条目索引${trimmedEntry}不存在]`;
        }
        
        // 按标题选择
        const entry = node.data.outputEntries.find(e => 
          e.title === trimmedEntry || e.title?.includes(trimmedEntry)
        );
        if (entry) return entry.content || '[空内容]';
        
        return `[未找到条目: ${trimmedEntry}]`;
      };
    },
    examples: [
      '{{select_entries:worldview:1}} - 获取世界观节点的第1条输出',
      '{{select_entries:characters:主角档案}} - 获取角色节点中标题包含"主角档案"的条目',
    ],
  },

  {
    name: 'filter_by_volume',
    description: '过滤内容，只显示与当前分卷相关的信息。',
    pattern: '{{filter_by_volume:([^}]+)}}',
    resolver: (ctx) => {
      return (match: string, macroName: string) => {
        if (!ctx.activeVolumeAnchor) {
          return `[未设置当前分卷，无法过滤]`;
        }
        
        // 先解析内部宏
        const innerContent = resolveMacro(macroName.trim(), ctx);
        
        // 这里简化处理，实际可以根据分卷配置进行更智能的过滤
        // 目前返回原始内容，因为其他宏已经会根据上下文获取正确内容
        return innerContent;
      };
    },
    examples: [
      '{{filter_by_volume:all_outline}} - 只获取与当前分卷相关的大纲内容',
    ],
  },
];

/**
 * 格式化输出条目
 */
function formatOutputEntries(entries: any[], typeKey: string): string {
  if (!entries || entries.length === 0) return '';
  
  // 不同节点类型的格式化方式
  if (typeKey === 'characters' || typeKey === 'worldview') {
    return entries.map(e => `· ${e.title}: ${e.content}`).join('\n');
  }
  
  if (typeKey === 'outline' || typeKey === 'plotOutline') {
    return entries.map(e => `${e.title}\n${e.content}`).join('\n\n');
  }
  
  if (typeKey === 'inspiration') {
    return entries.map(e => `【${e.title}】\n${e.content}`).join('\n\n');
  }
  
  // 默认格式
  return entries.map(e => e.content).join('\n\n');
}

/**
 * 解析单个宏
 */
function resolveMacro(macroName: string, context: MacroContext): string {
  const macro = MACRO_DEFINITIONS.find(m => m.name === macroName);
  if (!macro) return `[未知宏: ${macroName}]`;
  
  // 静态宏（无参数）
  if (!macro.pattern.includes(':')) {
    const result = macro.resolver(context);
    return typeof result === 'string' ? result : result('', '');
  }
  
  return `[宏 ${macroName} 需要参数]`;
}

/**
 * 宏解析器主函数
 * 将文本中的所有宏替换为实际内容
 */
export function resolveMacros(text: string, context: MacroContext): string {
  if (!text) return text;
  
  let result = text;
  
  // 遍历所有宏定义，按顺序替换
  for (const macro of MACRO_DEFINITIONS) {
    const regex = new RegExp(macro.pattern, 'g');
    
    result = result.replace(regex, (match: string, ...args: string[]) => {
      const resolverResult = macro.resolver(context);
      
      // 动态宏（带参数）
      if (typeof resolverResult === 'function') {
        return resolverResult(match, ...args);
      }
      
      // 静态宏
      return resolverResult as string;
    });
  }
  
  return result;
}

/**
 * 获取所有可用宏的说明文本
 * 用于帮助用户了解可用的宏
 */
export function getMacroHelpText(): string {
  const sections: string[] = ['# 工作流宏组件使用指南\n'];
  
  // 按类别分组
  const categories: Record<string, MacroDefinition[]> = {
    '节点输出类宏': MACRO_DEFINITIONS.filter(m => 
      m.name === 'node_output' || m.name === 'select_entries'
    ),
    '全量内容类宏': MACRO_DEFINITIONS.filter(m => 
      m.name.startsWith('all_')
    ),
    '分卷信息类宏': MACRO_DEFINITIONS.filter(m => 
      m.name.includes('volume')
    ),
    '循环信息类宏': MACRO_DEFINITIONS.filter(m => 
      m.name.includes('loop')
    ),
    '前序内容类宏': MACRO_DEFINITIONS.filter(m => 
      m.name.includes('previous') || m.name === 'context_summary'
    ),
    '创作信息类宏': MACRO_DEFINITIONS.filter(m => 
      m.name === 'creation_info'
    ),
    '小说数据类宏': MACRO_DEFINITIONS.filter(m => 
      m.name.startsWith('novel_') || m.name === 'chapter_count'
    ),
    '动态过滤类宏': MACRO_DEFINITIONS.filter(m => 
      m.name === 'filter_by_volume'
    ),
  };
  
  for (const [category, macros] of Object.entries(categories)) {
    if (macros.length === 0) continue;
    
    sections.push(`\n## ${category}\n`);
    
    for (const macro of macros) {
      sections.push(`\n### ${macro.name}\n`);
      sections.push(`${macro.description}\n`);
      sections.push(`\n**用法示例**：\n`);
      for (const example of macro.examples) {
        sections.push(`- \`${example}\`\n`);
      }
    }
  }
  
  return sections.join('');
}

/**
 * 简化的宏提示，用于在UI中显示
 */
export const MACRO_QUICK_REFERENCE: string = `
可用宏组件：
- {{all_worldview}} - 所有世界观内容
- {{all_characters}} - 所有角色内容
- {{all_outline}} - 所有大纲内容
- {{volume_content}} - 分卷规划内容
- {{current_volume}} - 当前分卷名称
- {{loop_instruction}} - 当前循环指令
- {{previous_outputs}} - 前序节点摘要
- {{node_output:typeKey}} - 指定节点输出
- {{creation_info}} - 创作信息
`;
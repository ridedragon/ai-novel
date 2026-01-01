import { AgentManifest, Novel } from '../types';

/**
 * PromptAgent 是一个独立的辅助 Agent。
 * 它的核心职责是：
 * 1. 帮助用户将简单的想法转化为高质量的“生成提示词”。
 * 2. 根据当前的创作需求，自动推荐最相关的“参考内容”。
 */
export class PromptAgent {
  /**
   * 获取系统提示词
   */
  public static getSystemPrompt(stage: string): string {
    return `你是一位专业的小说创作导师和提示词工程师。
你的任务是协助用户完善他们在“${stage}”阶段的创作指令。

核心职责：
1. **指令增强**：将用户模糊的想法转化为具体、结构化、富有表现力的“生成提示词”。
2. **参考建议**：根据指令内容，在回复末尾通过特定标签建议需要参考的内容。
3. **流程引导**：当检测到当前阶段（如灵感）已足够丰富，或用户表达了进入下一阶段的意愿时，建议并触发导航。

输出格式要求：
1. 首先给出一段友好且专业的回复，分析用户的意图和当前进度。
2. 然后给出优化后的【推荐提示词】，用户可以直接复制使用。
3. 接着给出【推荐参考】，说明为什么要参考这些内容。
4. **关键 Action 指令**：最后，必须根据需求输出 Action 标签来自动执行 UI 操作。
   
支持的 Action 类型：
- [ACTION:SELECT_REFERENCE]{"type": "worldview", "setName": "世界设定", "indices": [0, 1]}[/ACTION]
  作用：自动选择参考项。payload 包含 type (worldview/character/inspiration/outline), setName (集合名称), indices (条目索引数组)。
- [ACTION:NAVIGATE]{"target": "worldview"}[/ACTION]
  作用：自动切换到目标模块。target 可选值：inspiration, worldview, character, plotOutline, outline。
- [ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]
  作用：在“大纲”阶段，自动勾选配置并触发“开始自动创作”流程。

【特定阶段指导】：
- **灵感阶段**：重点在于发散和风格确立。如果灵感已包含核心设定，建议进入“世界观”阶段。
- **世界观阶段**：重点在于逻辑自洽和细节丰富。建议参考已有灵感。
- **角色阶段**：重点在于性格冲突和动机。建议参考世界观背景。
- **剧情粗纲/大纲阶段**：重点在于节奏和伏笔。建议参考角色和世界观。

请始终保持专业、富有启发性的语气。`;
  }

  /**
   * 构造用户提示词
   */
  public static buildUserPrompt(
    novel: Novel,
    userInput: string,
    stage: string,
    userInstruction?: string,
    manifest?: AgentManifest | null,
  ): string {
    const novelSummary = this.getNovelSummary(novel);
    const planSummary = manifest ? this.getPlanSummary(manifest) : '（暂无详细规划）';

    return `【当前创作阶段】：${stage}
【总体创作目标】：${userInstruction || '未指定'}

【项目上下文】：
${novelSummary}

【当前全流程规划】：
${planSummary}

【当前具体任务指令】：
${userInput}

请基于以上全流程信息和当前任务，为我优化生成提示词，并给出参考建议。确保生成的提示词能够精准衔接当前创作进度，并符合总体创作目标。`;
  }

  /**
   * 提取规划摘要
   */
  private static getPlanSummary(manifest: AgentManifest): string {
    return manifest.tasks
      .map((t, i) => {
        const status =
          i === manifest.currentTaskIndex ? '▶️ 正在执行' : i < manifest.currentTaskIndex ? '✅ 已完成' : '⏳ 待执行';
        return `${i + 1}. ${t.title} [${status}]`;
      })
      .join('\n');
  }

  /**
   * 提取项目摘要
   */
  private static getNovelSummary(novel: Novel): string {
    const summary = [];

    if (novel.worldviewSets && novel.worldviewSets.length > 0) {
      summary.push(`- 世界观设定：${novel.worldviewSets.map(s => s.name).join(', ')}`);
    }
    if (novel.characterSets && novel.characterSets.length > 0) {
      summary.push(`- 角色集：${novel.characterSets.map(s => s.name).join(', ')}`);
    }
    if (novel.inspirationSets && novel.inspirationSets.length > 0) {
      summary.push(`- 灵感集：${novel.inspirationSets.map(s => s.name).join(', ')}`);
    }

    return summary.join('\n');
  }
}

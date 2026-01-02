import { AgentManifest, Novel } from '../types';

/**
 * PromptAgent 是一个独立的辅助 Agent。
 * 它的核心职责是：
 * 1. 帮助用户将简单的想法转化为高质量的“生成提示词”。
 * 2. 根据当前的创作需求，自动推荐并选择最相关的“参考内容”。
 */
export class PromptAgent {
  /**
   * 获取系统提示词
   */
  public static getSystemPrompt(stage: string, onlySpecialized: boolean = false): string {
    const baseInstruction = `你是一位专业的小说创作导师和提示词工程师。
你的任务是协助用户完善创作指令。

核心职责：
1. **指令增强**：将用户模糊的想法转化为具体、结构化、富有表现力的“生成提示词”。
2. **参考建议与自动化选择**：根据指令内容，在回复末尾通过特定标签建议需要参考的内容，并使用 SELECT_REFERENCE 动作自动为用户选中这些参考。
3. **流程引导**：当检测到当前阶段已足够丰富，或用户表达了进入下一阶段的意愿时，建议并触发导航。

输出格式要求：
1. 首先给出一段友好且专业的回复，分析用户的意图和当前进度。
2. 然后给出优化后的【推荐提示词】，请务必将其放在独立的一行，并建议使用 Markdown 代码块包裹。
3. 接着给出【推荐参考】，说明为什么要参考这些内容。
4. **关键 Action 指令**：最后，必须根据需求输出 Action 标签来自动执行 UI 操作。对于推荐的参考内容，必须输出对应的 SELECT_REFERENCE 指令。
   
支持的 Action 类型：
- [ACTION:SELECT_REFERENCE]{"type": "worldview", "setName": "文件夹名", "indices": [0, 1]}[/ACTION] （用于自动选择参考资料。type可选: worldview, character, inspiration, outline。indices为可选的条目索引列表，从0开始）
- [ACTION:NAVIGATE]{"target": "worldview", "setName": "文件夹名"}[/ACTION]
- [ACTION:CREATE_PROJECT_FOLDERS]{"name": "项目名"}[/ACTION]
- [ACTION:FILL_AND_GENERATE]{"content": "内容"}[/ACTION]
- [ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]
- [ACTION:AWAIT_USER_INPUT]{"message": "提示语"}[/ACTION]

请始终保持专业、富有启发性的语气。`;

    const prompts: Record<string, string> = {
      灵感: `
【灵感阶段专项指导】：
- 目标：发散思维，确立核心创意、风格基调和市场卖点。
- 引导方向：探索“如果...会怎样”的假设，细化核心冲突，确定受众群体。
- 参考建议：建议参考同类型经典作品的元素。
- 转化逻辑：如果灵感已经包含了明确的背景或力量体系，建议进入“世界观”阶段。`,

      世界观: `
【世界观阶段专项指导】：
- 目标：构建逻辑自洽的社会体系、地理环境、力量等级或历史背景。
- 引导方向：强调设定对剧情的推动作用，避免“无效设定”。检查逻辑漏洞。
- 参考建议：务必参考已有的“灵感”条目。
- 转化逻辑：如果核心规则已定，建议进入“角色集”或“粗纲”阶段。`,

      粗纲: `
【粗纲阶段专项指导】：
- 目标：梳理故事的起承转合（三幕式或五幕式结构），确定核心高潮。
- 引导方向：关注节奏感，确保每个大阶段都有明确的冲突和目标。
- 参考建议：参考“世界观”的限制条件和“角色”的终极目标。
- 转化逻辑：如果主线清晰，建议进入详细的“大纲”设计。`,

      角色集: `
【角色集阶段专项指导】：
- 目标：塑造具有深度、动机明确且相互之间有张力的人物群像。
- 引导方向：关注角色的“内在渴望”与“外在障碍”。设计独特的性格标签和语言风格。
- 参考建议：参考“世界观”背景对角色成长的影响。
- 转化逻辑：如果核心角色关系网已建立，建议进入“粗纲”阶段。`,

      大纲: `
【大纲阶段专项指导】：
- 目标：细化到卷、章甚至场次的剧情安排，埋设伏笔，完善支线。
- 引导方向：确保每一章都有其功能性（推动剧情、展示人物或揭示设定）。检查反转的合理性。
- 参考建议：深度参考“粗纲”的骨架和“角色集”的行为逻辑。
- 转化逻辑：大纲完成后，即可建议使用 [ACTION:START_AUTO_WRITE] 开启正文创作。`,
    };

    // 匹配中文阶段名称或对应的英文标识（兼容 AgentDirector 的任务类型）
    const stageMap: Record<string, string> = {
      inspiration: '灵感',
      worldview: '世界观',
      plot_outline: '粗纲',
      plotOutline: '粗纲',
      character: '角色集',
      characters: '角色集',
      outline: '大纲',
    };

    const normalizedStage = stageMap[stage] || stage;
    const specialized = prompts[normalizedStage] || '';

    if (onlySpecialized) return specialized;
    return baseInstruction + specialized;
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

import { AgentManifest, Novel } from '../types';

/**
 * AgentDirector 负责生成创作清单 (Manifest)。
 * 它分析当前的小说设定和大纲，一次性规划完整的创作任务流。
 * 遵循严格的 16 步流程：灵感 -> 世界观 -> [粗纲->角色->大纲->正文] x N
 */
export class AgentDirector {
  /**
   * 构造导演 Agent 的系统提示词
   */
  /**
   * 获取内嵌的 Agent 工具箱指令说明。
   * 这些指令是程序逻辑必须的，不应由用户在 UI 中手动维护，以免误删导致功能失效。
   */
  public static getToolInstructions(): string {
    return `
工具箱使用指南 (必须包含在任务的 description 中以驱动自动化执行)：
- **[ACTION:CREATE_PROJECT_FOLDERS]{"name": "项目名"}[/ACTION]**：一键在所有模块同步创建关联文件夹。
- **[ACTION:NAVIGATE]{"target": "模块名", "setName": "文件夹名"}[/ACTION]**：切换 UI 界面和选中的文件夹。target 可选: 'inspiration', 'worldview', 'plotOutline', 'characters', 'outline', 'reference'。
- **[ACTION:AWAIT_USER_INPUT]{"message": "提示语"}[/ACTION]**：暂停流程并请求用户输入。
- **[ACTION:FILL_AND_GENERATE]{"content": "输入内容"}[/ACTION]**：自动填充当前模块输入框并触发 AI 生成。
- **[ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]**：引用大纲并启动正文全自动流水线。
- **[ACTION:GET_MANIFEST]{}[/ACTION]**：查询当前完整创作清单。
- **[ACTION:GET_CURRENT_TASK]{}[/ACTION]**：查询当前任务状态。`;
  }

  public static getSystemPrompt(): string {
    return `你是一位经验丰富的网文主编和创作导演。你的任务是根据用户需求，一次性规划出完整的小说创作全流程任务清单。

核心原则：
1. **全流程规划**：必须根据目标章节总数，一次性输出从灵感启动到完结的所有步骤。
2. **严格 SOP 流水线**：遵循“灵感 -> 世界观 -> [粗纲 -> 角色 -> 大纲 -> 正文] 循环”的结构。每批次处理 4 个章节。

输出规范：
1. **只返回 JSON**：必须符合 AgentManifest 接口。禁止任何解释性文字。
2. **驱动执行**：你必须根据任务类型，在 description 中合理安排工具指令（如 CREATE_PROJECT_FOLDERS, START_AUTO_WRITE 等）。

JSON 结构示例：
{
  "tasks": [
    { "id": "task1", "type": "inspiration", "title": "#1 初始化灵感", "description": "[ACTION:CREATE_PROJECT_FOLDERS]{\\"name\\": \\"我的故事\\"}[/ACTION] 请先设定核心爽点。", "status": "pending" }
  ],
  "currentTaskIndex": 0
}`;
  }

  /**
   * 构造导演 Agent 的输入上下文
   */
  public static buildUserPrompt(novel: Novel, userInstruction?: string): string {
    const chaptersCount = novel.chapters?.filter(c => !c.subtype || c.subtype === 'story').length || 0;

    return `【用户指令】
${userInstruction || '请生成一个完整的故事创作流程规划。'}

【当前状态】
- 已完成正文章节数：${chaptersCount}

请根据用户需求的目标章节数（若未指定，默认为 13 章），参考 16 步 SOP 逻辑，一次性输出完整的全流程创作清单。
注意：
1. 清单的第一步必须是 [ACTION:CREATE_PROJECT_FOLDERS]。
2. 必须严格按照“灵感 -> 世界观 -> [粗纲->角色->大纲->正文->间歇判断]”的循环结构列出所有任务。
3. 每一批次（Batch）处理 4 个章节。`;
  }

  /**
   * 解析导演 Agent 返回的内容
   */
  public static parseManifest(content: string): AgentManifest | null {
    try {
      // 增强的提取逻辑：尝试找到第一个 { 和最后一个 } 之间的内容
      let jsonStr = content.trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      // 预处理
      jsonStr = jsonStr
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      return JSON.parse(jsonStr) as AgentManifest;
    } catch (e) {
      console.error('[AgentDirector] 无法解析 Manifest JSON. 内容预览:', content.substring(0, 200));
      return null;
    }
  }
}

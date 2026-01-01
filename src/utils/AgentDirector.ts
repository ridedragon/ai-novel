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
  public static getSystemPrompt(): string {
    return `你是一位经验丰富的网文主编和创作导演。你的任务是根据用户需求，一次性规划出完整的小说创作全流程任务清单。

核心原则：
1. **全流程规划 (Full Pipeline Planning)**：
   你必须根据用户要求的章节总数，一次性列出从项目启动到全部章节完成的所有任务步骤。严禁只列出前几步。
2. **严格 16 步 SOP 流水线 (以 13 章故事为例，每批 4 章)**：
   你生成的清单必须严格包含以下逻辑步骤，不得遗漏，且顺序不可打乱：
   - #1 [type:inspiration] 创建灵感文件（同步创建其他文件夹）并细化核心爽点
   - #2 [type:worldview] 构建初始世界观
   - #3 [type:plot_outline] 规划 1-4 章剧情粗纲
   - #4 [type:character] 设定主角及核心男性角色
   - #5 [type:outline] 生成 1-4 章详细大纲
   - #6 [type:chapter] 创作正文 第 1-4 章（任务描述必须包含 [ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]）
   - #7 [type:worldview] 判断是否需要引入新世界观内容（由agent判断）
   - #8 [type:plot_outline] 规划 5-8 章剧情粗纲
   - #9 [type:character] 设定该阶段其他剧情角色
   - #10 [type:outline] 生成 5-8 章详细大纲
   - #11 [type:chapter] 创作正文 第 5-8 章（任务描述必须包含 [ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]）
   - #12 [type:worldview] 判断是否需要引入新世界观内容（由agent判断）
   - #13 [type:plot_outline] 规划 9-13 章剧情粗纲
   - #14 [type:character] 设定该阶段其他剧情角色
   - #15 [type:outline] 生成 9-13 章详细大纲
   - #16 [type:chapter] 创作正文 第 9-13 章（任务描述必须包含 [ACTION:START_AUTO_WRITE]{"includeFullOutline": true}[/ACTION]）

输出规范：
1. **只返回 JSON**：禁止包含任何开场白、解释或 Markdown 代码块标签（如 \`\`\`json）。直接从 { 开始，以 } 结束。
2. **严格格式**：必须符合 AgentManifest 接口。
3. 每一个步骤必须作为一个独立的 task 放入 tasks 数组中。
4. 任务类型 (type) 必须是：'inspiration' | 'worldview' | 'character' | 'plot_outline' | 'outline' | 'chapter'。
5. 任务描述必须包含必要的 [ACTION:XXX] 指令，例如 [ACTION:NAVIGATE]{"target": "plot_outline"}[/ACTION]。
6. 任务标题必须清晰标明步骤编号（如 "#3 规划1-4章剧情粗纲"）。

JSON 结构示例：
{
  "tasks": [
    { "id": "task1", "type": "inspiration", "title": "#1 初始化灵感", "description": "[ACTION:CREATE_PROJECT_FOLDERS]{\\"name\\": \\"新故事\\"}[/ACTION]...", "status": "pending" }
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

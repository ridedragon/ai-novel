import { AgentAction } from '../types';

/**
 * AgentParser 负责解析 Agent 输出文本中的特定指令标签。
 * 支持格式: [ACTION:TYPE]{"key": "value"}[/ACTION]
 */
export class AgentParser {
  // 支持带闭合标签的 [ACTION:TYPE]payload[/ACTION] 或不带闭合标签的 [ACTION:TYPE]payload
  // 优化正则：使用非贪婪匹配，并显式排除后续标签的干扰，提高对连续无闭合标签的兼容性
  private static ACTION_REGEX = /\[ACTION:(\w+)\]([\s\S]*?)(?:\[\/ACTION\]|(?=\[ACTION:)|$)/g;

  /**
   * 从文本中提取所有 Action 指令
   * @param text Agent 生成的原始文本
   * @returns 解析后的 Action 列表
   */
  public static parseActions(text: string): AgentAction[] {
    const actions: AgentAction[] = [];
    let match;

    // 重置 regex 状态以确保多次调用正确
    this.ACTION_REGEX.lastIndex = 0;

    while ((match = this.ACTION_REGEX.exec(text)) !== null) {
      const type = match[1];
      const payloadStr = match[2].trim();

      try {
        const payload = JSON.parse(payloadStr);
        actions.push({ type, payload });
      } catch (e) {
        console.error(`[AgentParser] 无法解析 Action "${type}" 的负载 JSON:`, payloadStr, e);
      }
    }

    return actions;
  }

  /**
   * 移除文本中的 Action 标签，返回干净的正文内容
   * @param text 原始文本
   */
  public static cleanText(text: string): string {
    return text.replace(this.ACTION_REGEX, '').trim();
  }

  /**
   * 检查文本是否包含特定类型的 Action
   */
  public static hasAction(text: string, type?: string): boolean {
    if (!type) return this.ACTION_REGEX.test(text);
    const specificRegex = new RegExp(`\\[ACTION:${type}\\]`, 'g');
    return specificRegex.test(text);
  }

  /**
   * 替换文本中的全局宏
   * @param text 原始文本
   * @param userInstruction 用户输入的指令
   */
  public static replaceMacros(text: string, userInstruction?: string): string {
    if (!text) return text;
    const instruction = userInstruction || '';
    return text.replace(/\{\{userinput\}\}/g, instruction);
  }
}

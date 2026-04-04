import { SkillTriggerResult, SkillContext } from './types';
import { skillRegistry } from './SkillRegistry';

export interface LoadedSkillContext {
  systemPrompt: string;
  skillsMetadata: Array<{ name: string; description: string }>;
  loadedSkills: Array<{ name: string; content: string }>;
  totalTokenEstimate: number;
}

export class SkillLoader {
  private static readonly MAX_SKILL_CONTENT_TOKENS = 5000;
  private static readonly METADATA_TOKEN_ESTIMATE = 100;

  static getSkillsMetadataForSystemPrompt(): Array<{ name: string; description: string }> {
    const enabledSkills = skillRegistry.getEnabledSkills();
    return enabledSkills.map(skill => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  static async loadSkillForTrigger(triggerResult: SkillTriggerResult, context?: SkillContext): Promise<string> {
    const skill = triggerResult.skill;

    let skillContent = skill.content;

    if (context) {
      skillContent = this.injectContext(skillContent, context);
    }

    skillContent = this.addTriggerInfo(skillContent, triggerResult);

    return skillContent;
  }

  static async loadMultipleSkills(triggerResults: SkillTriggerResult[], context?: SkillContext): Promise<LoadedSkillContext> {
    const skillsMetadata = this.getSkillsMetadataForSystemPrompt();

    const loadedSkills: Array<{ name: string; content: string }> = [];
    let totalTokenEstimate = skillsMetadata.length * this.METADATA_TOKEN_ESTIMATE;

    for (const triggerResult of triggerResults) {
      const content = await this.loadSkillForTrigger(triggerResult, context);
      loadedSkills.push({
        name: triggerResult.skill.name,
        content,
      });

      const tokenEstimate = this.estimateTokens(content);
      if (tokenEstimate <= this.MAX_SKILL_CONTENT_TOKENS) {
        totalTokenEstimate += tokenEstimate;
      } else {
        totalTokenEstimate += this.MAX_SKILL_CONTENT_TOKENS;
      }
    }

    const systemPrompt = this.buildSystemPrompt(skillsMetadata, loadedSkills);

    return {
      systemPrompt,
      skillsMetadata,
      loadedSkills,
      totalTokenEstimate,
    };
  }

  private static injectContext(content: string, context: SkillContext): string {
    let injected = content;

    if (context.novelId) {
      injected = injected.replace(/\{\{novelId\}\}/g, context.novelId);
    }
    if (context.currentChapter !== undefined) {
      injected = injected.replace(/\{\{currentChapter\}\}/g, context.currentChapter.toString());
    }
    if (context.activeVolume) {
      injected = injected.replace(/\{\{activeVolume\}\}/g, context.activeVolume);
    }
    if (context.workflowNode) {
      injected = injected.replace(/\{\{workflowNode\}\}/g, context.workflowNode);
    }
    if (context.context) {
      Object.entries(context.context).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        injected = injected.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
      });
    }

    return injected;
  }

  private static addTriggerInfo(content: string, triggerResult: SkillTriggerResult): string {
    const triggerInfo = `\n\n---\n触发方式: ${triggerResult.triggerType === 'explicit' ? '显式调用' : '隐式触发'}\n置信度: ${(triggerResult.confidence * 100).toFixed(0)}%\n---\n`;
    return triggerInfo + content;
  }

  private static buildSystemPrompt(_skillsMetadata: Array<{ name: string; description: string }>, loadedSkills: Array<{ name: string; content: string }>): string {
    let prompt = '# 已激活的 Skills\n\n';

    if (loadedSkills.length > 0) {
      prompt += '以下 Skills 已被激活并加载：\n\n';
      loadedSkills.forEach(skill => {
        prompt += `## ${skill.name}\n\n`;
      });
    }

    return prompt;
  }

  static estimateTokens(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = content.length - chineseChars - englishWords;

    return Math.ceil(chineseChars * 1.5 + englishWords * 0.25 + otherChars * 0.1);
  }

  static getSkillFile(skillName: string, fileName: string): string | null {
    const skill = skillRegistry.getSkill(skillName);
    if (!skill) return null;

    const file = skill.files.find(f => f.name === fileName);
    return file ? file.content : null;
  }

  static getAllSkillFiles(skillName: string): Array<{ name: string; content: string; path: string }> | null {
    const skill = skillRegistry.getSkill(skillName);
    if (!skill) return null;

    return skill.files;
  }
}

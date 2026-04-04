import { Skill, SkillTriggerResult, SkillContext } from './types';
import { skillRegistry } from './SkillRegistry';

export class SkillTriggerMatcher {
  private static readonly EXPLICIT_TRIGGER_REGEX = /^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/;

  static matchExplicitTrigger(userMessage: string): SkillTriggerResult | null {
    const match = userMessage.trim().match(this.EXPLICIT_TRIGGER_REGEX);
    if (!match) return null;

    const skillName = match[1];

    const skill = skillRegistry.getSkill(skillName);
    if (!skill || !skill.enabled) return null;

    return {
      skill,
      confidence: 1.0,
      triggerType: 'explicit',
    };
  }

  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    let matchCount = 0;
    words1.forEach(word => {
      if (words2.some(w2 => w2.includes(word) || word.includes(w2))) {
        matchCount++;
      }
    });

    return matchCount / Math.max(words1.length, words2.length);
  }

  static matchImplicitTrigger(userMessage: string, context?: SkillContext): SkillTriggerResult[] {
    const enabledSkills = skillRegistry.getEnabledSkills();
    const results: SkillTriggerResult[] = [];

    enabledSkills.forEach(skill => {
      if (skill.frontmatter['disable-model-invocation']) return;

      const description = skill.description.toLowerCase();
      const userMessageLower = userMessage.toLowerCase();

      let confidence = 0;

      const similarity = this.calculateSimilarity(userMessage, skill.description);
      if (similarity > 0) {
        confidence = Math.max(confidence, similarity * 0.7);
      }

      const keywords = this.extractKeywords(description);
      const keywordMatches = keywords.filter(kw => userMessageLower.includes(kw));
      if (keywordMatches.length > 0) {
        const keywordScore = keywordMatches.length / keywords.length;
        confidence = Math.max(confidence, keywordScore * 0.8);
      }

      if (context) {
        if (context.workflowNode && description.includes(context.workflowNode.toLowerCase())) {
          confidence = Math.max(confidence, 0.6);
        }
      }

      if (confidence >= 0.3) {
        results.push({
          skill,
          confidence: Math.min(confidence, 1.0),
          triggerType: 'implicit',
        });
      }
    });

    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  private static extractKeywords(description: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but',
      'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
      'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
      '当', '用户', '请求', '时', '使用', '适用', '场景', '的', '了',
      '是', '在', '和', '与', '或', '及', '等', '其', '这', '那',
    ]);

    return description
      .toLowerCase()
      .replace(/[，。！？、；：""''（）【】《》/\\|{}[\]<>~`!@#$%^&*()_+=\-.]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
  }

  static findSkillByName(name: string): Skill | undefined {
    return skillRegistry.getSkill(name);
  }

  static getAllTriggerableSkills(): Skill[] {
    return skillRegistry.getEnabledSkills().filter(
      skill => !skill.frontmatter['disable-model-invocation'] || skill.frontmatter['user-invocable'] !== false
    );
  }
}

import { SkillTriggerMatcher } from './SkillTriggerMatcher';
import { SkillLoader } from './SkillLoader';
import { SkillContext } from './types';

export async function processSkillsForAI(
  userMessage: string,
  context?: SkillContext
): Promise<{ enhancedMessage: string; skillSystemPrompt: string; triggeredSkills: string[] }> {
  const explicitTrigger = SkillTriggerMatcher.matchExplicitTrigger(userMessage);

  if (explicitTrigger) {
    const loadedContext = await SkillLoader.loadMultipleSkills([explicitTrigger], context);
    return {
      enhancedMessage: userMessage.replace(/^\/[a-zA-Z0-9_-]+\s*/, ''),
      skillSystemPrompt: loadedContext.systemPrompt,
      triggeredSkills: [explicitTrigger.skill.name],
    };
  }

  const implicitTriggers = SkillTriggerMatcher.matchImplicitTrigger(userMessage, context);

  if (implicitTriggers.length > 0) {
    const topTriggers = implicitTriggers.slice(0, 3);
    const loadedContext = await SkillLoader.loadMultipleSkills(topTriggers, context);

    return {
      enhancedMessage: userMessage,
      skillSystemPrompt: loadedContext.systemPrompt,
      triggeredSkills: topTriggers.map(t => t.skill.name),
    };
  }

  return {
    enhancedMessage: userMessage,
    skillSystemPrompt: '',
    triggeredSkills: [],
  };
}

export function getSkillsMetadataForSystemPrompt(): string {
  const metadata = SkillLoader.getSkillsMetadataForSystemPrompt();

  if (metadata.length === 0) {
    return '';
  }

  let prompt = '## 可用的 Skills（技能包）\n\n';
  prompt += '以下 Skills 已安装并可能在适当时自动触发：\n\n';

  metadata.forEach(skill => {
    prompt += `- **${skill.name}**: ${skill.description}\n`;
  });

  prompt += '\n当用户的请求与某个 Skill 的描述匹配时，请按照该 Skill 的指令执行。\n';

  return prompt;
}

export { SkillTriggerMatcher, SkillLoader };
export type { SkillContext };

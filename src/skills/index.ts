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

  return {
    enhancedMessage: userMessage,
    skillSystemPrompt: '',
    triggeredSkills: [],
  };
}

export function getSkillsMetadataForSystemPrompt(): string {
  const metadata = SkillLoader.getSkillsMetadataForSystemPromptWithContent();

  if (metadata.length === 0) {
    return '';
  }

  let prompt = '## 可用的 Skills（技能包）\n\n';
  prompt += '你可以在适当的时候主动调用以下 Skills 来更好地完成用户的请求。请仔细阅读每个 Skill 的完整指令，根据当前任务判断是否需要调用以及调用哪个 Skill。\n\n';

  metadata.forEach(skill => {
    prompt += `### 【${skill.name}】\n${skill.content}\n\n---\n`;
  });

  return prompt;
}

export { SkillTriggerMatcher, SkillLoader };
export type { SkillContext };

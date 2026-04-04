export interface SkillFrontmatter {
  name: string;
  description: string;
  'user-invocable'?: boolean;
  'disable-model-invocation'?: boolean;
  'allowed-tools'?: string[];
  context?: string;
  agent?: string;
}

export interface SkillFile {
  name: string;
  content: string;
  path: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  frontmatter: SkillFrontmatter;
  content: string;
  files: SkillFile[];
  enabled: boolean;
  installedAt: number;
  source: 'builtin' | 'user' | 'imported';
  version?: string;
  author?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillTriggerResult {
  skill: Skill;
  confidence: number;
  triggerType: 'explicit' | 'implicit';
}

export interface SkillContext {
  novelId?: string;
  currentChapter?: number;
  activeVolume?: string;
  workflowNode?: string;
  userMessage: string;
  context?: Record<string, any>;
}

export interface SkillInstallationData {
  name: string;
  description: string;
  frontmatter: SkillFrontmatter;
  content: string;
  files?: Array<{ name: string; content: string; path: string }>;
  source?: 'builtin' | 'user' | 'imported';
}

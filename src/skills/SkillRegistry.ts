import { Skill, SkillFrontmatter, SkillInstallationData, SkillMetadata } from './types';

const SKILLS_STORAGE_KEY = 'novel_writer_skills';

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { name: '', description: '' },
      body: content,
    };
  }

  const frontmatterStr = match[1];
  const body = match[2];

  const frontmatter: Partial<SkillFrontmatter> = {};
  frontmatterStr.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value) as any;
      } catch {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/["']/g, '')) as any;
      }
    } else if (value === 'true') {
      value = true as any;
    } else if (value === 'false') {
      value = false as any;
    }

    (frontmatter as any)[key] = value;
  });

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body,
  };
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(SKILLS_STORAGE_KEY);
      if (stored) {
        const skillsData = JSON.parse(stored);
        skillsData.forEach((data: any) => {
          const skill: Skill = {
            ...data,
            frontmatter: data.frontmatter || { name: data.name, description: data.description },
          };
          this.skills.set(skill.id, skill);
        });
      }
    } catch (error) {
      console.error('Failed to load skills from storage:', error);
    }
  }

  private saveToStorage() {
    try {
      const skillsArray = Array.from(this.skills.values());
      localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(skillsArray));
    } catch (error) {
      console.error('Failed to save skills to storage:', error);
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  registerSkill(installationData: SkillInstallationData): Skill {
    if (this.skills.has(installationData.name)) {
      throw new Error(`Skill "${installationData.name}" already exists`);
    }

    const { frontmatter } = parseFrontmatter(installationData.content);
    const name = installationData.frontmatter.name || frontmatter.name || installationData.name;
    const description = installationData.frontmatter.description || frontmatter.description;

    const skill: Skill = {
      id: name,
      name,
      description,
      frontmatter: {
        ...frontmatter,
        ...installationData.frontmatter,
        name,
        description,
      },
      content: installationData.content,
      files: installationData.files || [],
      enabled: true,
      installedAt: Date.now(),
      source: installationData.source || 'user',
    };

    this.skills.set(skill.id, skill);
    this.saveToStorage();
    this.notifyListeners();

    return skill;
  }

  updateSkill(name: string, content: string, files?: SkillInstallationData['files']): Skill {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill "${name}" not found`);
    }

    const { frontmatter } = parseFrontmatter(content);

    skill.content = content;
    skill.frontmatter = {
      ...skill.frontmatter,
      ...frontmatter,
      name: skill.name,
      description: frontmatter.description || skill.description,
    };
    skill.description = skill.frontmatter.description;
    if (files) {
      skill.files = files;
    }

    this.skills.set(name, skill);
    this.saveToStorage();
    this.notifyListeners();

    return skill;
  }

  unregisterSkill(name: string): boolean {
    const deleted = this.skills.delete(name);
    if (deleted) {
      this.saveToStorage();
      this.notifyListeners();
    }
    return deleted;
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getEnabledSkills(): Skill[] {
    return this.getAllSkills().filter(skill => skill.enabled);
  }

  getSkillMetadata(): SkillMetadata[] {
    return this.getAllSkills().map(skill => ({
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
    }));
  }

  toggleSkill(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;

    skill.enabled = !skill.enabled;
    this.skills.set(name, skill);
    this.saveToStorage();
    this.notifyListeners();

    return skill.enabled;
  }

  exportSkill(name: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const exportData = {
      name: skill.name,
      description: skill.description,
      frontmatter: skill.frontmatter,
      content: skill.content,
      files: skill.files,
      version: skill.version,
      author: skill.author,
    };

    return JSON.stringify(exportData, null, 2);
  }

  importSkill(jsonData: string): Skill {
    try {
      const data = JSON.parse(jsonData);
      return this.registerSkill({
        name: data.name,
        description: data.description,
        frontmatter: data.frontmatter,
        content: data.content,
        files: data.files,
        source: 'imported',
      });
    } catch (error) {
      throw new Error(`Failed to import skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  getSkillCount(): number {
    return this.skills.size;
  }

  getEnabledSkillCount(): number {
    return this.getEnabledSkills().length;
  }
}

export const skillRegistry = new SkillRegistry();

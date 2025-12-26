export interface ChapterVersion {
  id: string;
  content: string;
  timestamp: number;
  type: 'original' | 'optimized' | 'user_edit';
}

export interface Chapter {
  id: number;
  title: string;
  content: string;
  volumeId?: string; // 所属卷ID
  sourceContent?: string; // 原始内容 (Deprecated)
  optimizedContent?: string; // 优化后内容 (Deprecated)
  showingVersion?: 'source' | 'optimized'; // 当前显示版本 (Deprecated)

  versions?: ChapterVersion[];
  activeVersionId?: string;

  // Chapter-specific settings
  activeOptimizePresetId?: string;
  activeAnalysisPresetId?: string;
  analysisResult?: string; // 存储该章节上次的分析结果

  subtype?: 'story' | 'small_summary' | 'big_summary';
  summaryRange?: string;
}

export interface NovelVolume {
  id: string;
  title: string;
  collapsed: boolean;
}

export interface OutlineItem {
  title: string;
  summary: string;
  chapterAnalysis?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OutlineSet {
  id: string;
  name: string;
  items: OutlineItem[];
  userNotes?: string;
  chatHistory?: ChatMessage[];
}

export interface CharacterItem {
  name: string;
  bio: string;
}

export interface CharacterSet {
  id: string;
  name: string;
  characters: CharacterItem[];
  userNotes?: string; // 用户输入的设定记录
  chatHistory?: ChatMessage[];
}

export interface WorldviewItem {
  item: string;
  setting: string;
}

export interface WorldviewSet {
  id: string;
  name: string;
  entries: WorldviewItem[];
  userNotes?: string;
  chatHistory?: ChatMessage[];
}

export interface InspirationItem {
  title: string;
  content: string;
}

export interface InspirationSet {
  id: string;
  name: string;
  items: InspirationItem[];
  userNotes?: string;
  chatHistory?: ChatMessage[];
}

export interface Novel {
  id: string;
  title: string;
  chapters: Chapter[];
  volumes: NovelVolume[]; // 分卷列表
  systemPrompt: string;
  createdAt: number;
  outline?: OutlineItem[]; // Deprecated, use outlineSets
  outlineSets?: OutlineSet[];
  characters?: CharacterItem[]; // Deprecated, use characterSets
  characterSets?: CharacterSet[];
  worldview?: WorldviewItem[]; // Deprecated, use worldviewSets
  worldviewSets?: WorldviewSet[];
  inspirationSets?: InspirationSet[];
}

export interface PromptItem {
  id: number;
  name: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
  trigger: string;
  position: 'relative' | 'absolute';
  active: boolean; // 控制开关状态
  icon?: string;
  isFixed?: boolean;
  fixedType?: 'chat_history' | 'world_info' | 'outline';
}

export interface GeneratorPrompt {
  id: string;
  name?: string; // Optional name for display
  role: 'system' | 'user' | 'assistant';
  content: string;
  enabled: boolean;
}

export interface PresetApiConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  modelList?: string[];
}

export interface GeneratorPreset {
  id: string;
  name: string;
  prompts: GeneratorPrompt[];
  temperature?: number;
  topP?: number;
  topK?: number;
  apiConfig?: PresetApiConfig;
}

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[]; // 1: User Input (Context), 2: AI Output
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
}

export interface CompletionPreset {
  id: string;
  name: string;
  contextLength: number;
  maxReplyLength: number;
  temperature: number;
  frequencyPenalty: number;
  presencePenalty: number;
  topP: number;
  topK: number;
  stream: boolean;
  candidateCount: number;
  prompts?: PromptItem[];
  regexScripts?: RegexScript[];
  apiConfig?: PresetApiConfig;
}

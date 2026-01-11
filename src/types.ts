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
  logicScore?: number; // 逻辑评分 (0-100)，用于逻辑热力图展示

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

export interface MessageContentText {
  type: 'text';
  text: string;
}

export interface MessageContentImage {
  type: 'image_url';
  image_url: {
    url: string; // base64 or url
  };
}

export interface MessageContentFile {
  type: 'file'; // For PDF etc, support varies by model
  file_url: {
    url: string;
  };
}

export type MessageContent = string | (MessageContentText | MessageContentImage | MessageContentFile)[];

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
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

export interface PlotOutlineItem {
  id: string;
  title: string;
  description: string;
  type: string;
  children?: PlotOutlineItem[];
}

export interface PlotOutlineSet {
  id: string;
  name: string;
  items: PlotOutlineItem[];
  userNotes?: string;
  chatHistory?: ChatMessage[];
}

export interface ReferenceFile {
  id: string;
  name: string;
  content: string;
  type: string;
  size: number;
  lastModified: number;
  parentId?: string; // 所属文件夹ID
}

export interface ReferenceFolder {
  id: string;
  name: string;
  parentId?: string; // 父文件夹ID，支持多级
}

export interface Novel {
  id: string;
  title: string;
  chapters: Chapter[];
  volumes: NovelVolume[]; // 分卷列表
  systemPrompt: string;
  createdAt: number;
  coverUrl?: string;
  description?: string;
  category?: string; // 作品类型/分类
  status?: '连载中' | '已完结'; // 创作状态
  outline?: OutlineItem[]; // Deprecated, use outlineSets
  outlineSets?: OutlineSet[];
  characters?: CharacterItem[]; // Deprecated, use characterSets
  characterSets?: CharacterSet[];
  worldview?: WorldviewItem[]; // Deprecated, use worldviewSets
  worldviewSets?: WorldviewSet[];
  inspirationSets?: InspirationSet[];
  plotOutlineSets?: PlotOutlineSet[];
  referenceFiles?: ReferenceFile[];
  referenceFolders?: ReferenceFolder[];
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

import { GeneratorPreset, Novel, PromptItem } from '../../types';

export interface AutoWriteConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  contextLength: number;
  maxReplyLength: number;
  temperature: number;
  topP?: number;
  topK?: number;
  stream: boolean;
  maxRetries: number;
  systemPrompt: string;
  globalCreationPrompt?: string;
  longTextMode: boolean;
  autoOptimize: boolean;
  consecutiveChapterCount: number;
  smallSummaryInterval: number;
  bigSummaryInterval: number;
  smallSummaryPrompt: string;
  bigSummaryPrompt: string;
  outlineModel: string;
}

export interface AutoWriteStatus {
  isAutoWriting: boolean;
  status: string;
  error?: string;
}

export interface AutoWriteContext {
  novel: Novel;
  activeOutlineSetId: string | null;
  includeFullOutline: boolean;
  activePrompts: PromptItem[];
  outlinePresets: GeneratorPreset[];
  activeOutlinePresetId: string;
  outlineModel: string;
  currentChapterId: number | null;
}

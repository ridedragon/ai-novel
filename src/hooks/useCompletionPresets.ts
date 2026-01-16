import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPresets, defaultPrompts } from '../constants/aiPresets';
import { CompletionPreset, PresetApiConfig, PromptItem } from '../types';
import { ensureFixedItems } from '../utils/aiHelpers';

export function useCompletionPresets() {
  // 1. 核心状态：所有预设与活跃 ID
  const [completionPresets, setCompletionPresets] = useState<CompletionPreset[]>(() => {
    try {
      const saved = localStorage.getItem('completionPresets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return defaultPresets;
  });

  const [activePresetId, setActivePresetId] = useState<string>(
    () => localStorage.getItem('activePresetId') || 'default',
  );

  // 辅助函数：从草稿或预设加载特定值
  const getSetting = <T>(key: keyof CompletionPreset, defaultValue: T): T => {
    try {
      const draftJson = localStorage.getItem(`completion_settings_draft_${activePresetId}`);
      if (draftJson) {
        const draft = JSON.parse(draftJson);
        if (draft[key] !== undefined) return draft[key];
      }
      const preset = completionPresets.find(p => p.id === activePresetId);
      if (preset && preset[key] !== undefined) return preset[key] as unknown as T;
    } catch (e) {}
    return defaultValue;
  };

  // 2. 详细参数状态
  const [contextLength, setContextLength] = useState(() => getSetting('contextLength', 200000));
  const [maxReplyLength, setMaxReplyLength] = useState(() => getSetting('maxReplyLength', 64000));
  const [candidateCount, setCandidateCount] = useState(() => getSetting('candidateCount', 1));
  const [stream, setStream] = useState(() => getSetting('stream', true));
  const [temperature, setTemperature] = useState(() => getSetting('temperature', 1.0));
  const [frequencyPenalty, setFrequencyPenalty] = useState(() => getSetting('frequencyPenalty', 0.0));
  const [presencePenalty, setPresencePenalty] = useState(() => getSetting('presencePenalty', 0.0));
  const [topP, setTopP] = useState(() => getSetting('topP', 1.0));
  const [topK, setTopK] = useState(() => getSetting('topK', 200));
  const [presetApiConfig, setPresetApiConfig] = useState<PresetApiConfig | undefined>(() =>
    getSetting('apiConfig', undefined),
  );
  const [prompts, setPrompts] = useState<PromptItem[]>(() => {
    const draftPrompts = getSetting('prompts', null);
    if (Array.isArray(draftPrompts)) return ensureFixedItems(draftPrompts);
    return ensureFixedItems(defaultPrompts);
  });

  // 3. 数据持久化
  useEffect(() => {
    localStorage.setItem('completionPresets', JSON.stringify(completionPresets));
  }, [completionPresets]);

  useEffect(() => {
    localStorage.setItem('activePresetId', activePresetId);
  }, [activePresetId]);

  const prevActivePresetIdRef = useRef(activePresetId);

  // 切换预设时同步状态
  useEffect(() => {
    if (activePresetId !== prevActivePresetIdRef.current) {
      const preset = completionPresets.find(p => p.id === activePresetId) || defaultPresets[0];
      const draftJson = localStorage.getItem(`completion_settings_draft_${activePresetId}`);
      const source = draftJson ? JSON.parse(draftJson) : preset;

      setContextLength(source.contextLength ?? 200000);
      setMaxReplyLength(source.maxReplyLength ?? 64000);
      setTemperature(source.temperature ?? 1.0);
      setFrequencyPenalty(source.frequencyPenalty ?? 0.0);
      setPresencePenalty(source.presencePenalty ?? 0.0);
      setTopP(source.topP ?? 1.0);
      setTopK(source.topK ?? 200);
      setStream(source.stream ?? true);
      setCandidateCount(source.candidateCount ?? 1);
      setPrompts(ensureFixedItems(source.prompts || defaultPrompts));
      setPresetApiConfig(source.apiConfig);

      prevActivePresetIdRef.current = activePresetId;
    }
  }, [activePresetId, completionPresets]);

  // 自动保存草稿
  useEffect(() => {
    if (activePresetId !== prevActivePresetIdRef.current) return;
    const draft = {
      contextLength,
      maxReplyLength,
      temperature,
      frequencyPenalty,
      presencePenalty,
      topP,
      topK,
      stream,
      candidateCount,
      prompts,
      apiConfig: presetApiConfig,
    };
    localStorage.setItem(`completion_settings_draft_${activePresetId}`, JSON.stringify(draft));
  }, [
    contextLength,
    maxReplyLength,
    temperature,
    frequencyPenalty,
    presencePenalty,
    topP,
    topK,
    stream,
    candidateCount,
    prompts,
    activePresetId,
    presetApiConfig,
  ]);

  // --- 高级操作方法 ---

  const saveCurrentPreset = useCallback(() => {
    const updatedPresets = completionPresets.map(p => {
      if (p.id === activePresetId) {
        return {
          ...p,
          contextLength,
          maxReplyLength,
          temperature,
          frequencyPenalty,
          presencePenalty,
          topP,
          topK,
          stream,
          candidateCount,
          prompts: prompts,
          apiConfig: presetApiConfig,
        };
      }
      return p;
    });
    setCompletionPresets(updatedPresets);

    // 显式更新本地存储
    localStorage.setItem('completionPresets', JSON.stringify(updatedPresets));

    // 同时更新草稿使其与保存状态一致
    const draft = {
      contextLength,
      maxReplyLength,
      temperature,
      frequencyPenalty,
      presencePenalty,
      topP,
      topK,
      stream,
      candidateCount,
      prompts,
      apiConfig: presetApiConfig,
    };
    localStorage.setItem(`completion_settings_draft_${activePresetId}`, JSON.stringify(draft));
  }, [
    completionPresets,
    activePresetId,
    contextLength,
    maxReplyLength,
    temperature,
    frequencyPenalty,
    presencePenalty,
    topP,
    topK,
    stream,
    candidateCount,
    prompts,
    presetApiConfig,
    setCompletionPresets,
  ]);

  const deletePreset = useCallback(
    (id: string) => {
      if (id === 'default') return;
      setCompletionPresets(prev => {
        const next = prev.filter(p => p.id !== id);
        return next;
      });
      if (activePresetId === id) {
        setActivePresetId('default');
      }
    },
    [activePresetId, setCompletionPresets],
  );

  const renamePreset = useCallback(
    (id: string, newName: string) => {
      setCompletionPresets(prev => prev.map(p => (p.id === id ? { ...p, name: newName } : p)));
    },
    [setCompletionPresets],
  );

  const resetPreset = useCallback(() => {
    const preset = completionPresets.find(p => p.id === activePresetId);
    if (preset) {
      // 清除草稿
      localStorage.removeItem(`completion_settings_draft_${activePresetId}`);

      // 重新加载预设原始值
      setContextLength(preset.contextLength);
      setMaxReplyLength(preset.maxReplyLength);
      setTemperature(preset.temperature);
      setFrequencyPenalty(preset.frequencyPenalty);
      setPresencePenalty(preset.presencePenalty);
      setTopP(preset.topP);
      setTopK(preset.topK > 0 ? preset.topK : 1);
      setStream(preset.stream);
      setCandidateCount(preset.candidateCount);
      if (preset.prompts) {
        setPrompts(ensureFixedItems(preset.prompts));
      }
      setPresetApiConfig(preset.apiConfig);
    }
  }, [activePresetId, completionPresets]);

  const saveAsNewPreset = useCallback(
    (name: string) => {
      const newId = `custom_${Date.now()}`;
      const newPreset: CompletionPreset = {
        id: newId,
        name,
        contextLength,
        maxReplyLength,
        temperature,
        frequencyPenalty,
        presencePenalty,
        topP,
        topK,
        stream,
        candidateCount,
        prompts: prompts, // 复制当前提示词
        apiConfig: presetApiConfig,
      };
      setCompletionPresets(prev => [...prev, newPreset]);
      setActivePresetId(newId);
      return newId;
    },
    [
      contextLength,
      maxReplyLength,
      temperature,
      frequencyPenalty,
      presencePenalty,
      topP,
      topK,
      stream,
      candidateCount,
      prompts,
      presetApiConfig,
      setCompletionPresets,
    ],
  );

  const updateRegexScripts = useCallback((id: string, scripts: any[]) => {
    setCompletionPresets(prev => prev.map(p => (p.id === id ? { ...p, regexScripts: scripts } : p)));
  }, []);

  return {
    completionPresets,
    setCompletionPresets,
    activePresetId,
    setActivePresetId,
    contextLength,
    setContextLength,
    maxReplyLength,
    setMaxReplyLength,
    candidateCount,
    setCandidateCount,
    stream,
    setStream,
    temperature,
    setTemperature,
    frequencyPenalty,
    setFrequencyPenalty,
    presencePenalty,
    setPresencePenalty,
    topP,
    setTopP,
    topK,
    setTopK,
    presetApiConfig,
    setPresetApiConfig,
    prompts,
    setPrompts,
    // Actions
    saveCurrentPreset,
    deletePreset,
    renamePreset,
    resetPreset,
    saveAsNewPreset,
    updateRegexScripts,
  };
}

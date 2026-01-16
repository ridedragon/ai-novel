import { useCallback, useEffect, useState } from 'react';
import {
  defaultAnalysisPresets,
  defaultCharacterPresets,
  defaultInspirationPresets,
  defaultOptimizePresets,
  defaultOutlinePresets,
  defaultPlotOutlinePresets,
  defaultWorldviewPresets,
} from '../constants/aiPresets';
import { GeneratorPreset } from '../types';

export function useGeneratorPresets() {
  // 辅助函数：安全加载解析
  const loadPresets = (key: string, defaultValue: GeneratorPreset[]) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return defaultValue;
  };

  // 1. 大纲预设
  const [outlinePresets, setOutlinePresets] = useState<GeneratorPreset[]>(() => {
    const presets = loadPresets('outlinePresets', defaultOutlinePresets);
    // 迁移逻辑：确保 chat 预设存在
    if (!presets.some((p: any) => p.id === 'chat')) {
      const chatPreset = defaultOutlinePresets.find(p => p.id === 'chat');
      if (chatPreset) presets.push(chatPreset);
    }
    return presets;
  });
  const [activeOutlinePresetId, setActiveOutlinePresetId] = useState<string>(
    () => localStorage.getItem('activeOutlinePresetId') || 'default',
  );

  // 2. 角色预设
  const [characterPresets, setCharacterPresets] = useState<GeneratorPreset[]>(() => {
    const presets = loadPresets('characterPresets', defaultCharacterPresets);
    if (!presets.some((p: any) => p.id === 'chat')) {
      const chatPreset = defaultCharacterPresets.find(p => p.id === 'chat');
      if (chatPreset) presets.push(chatPreset);
    }
    return presets;
  });
  const [activeCharacterPresetId, setActiveCharacterPresetId] = useState<string>(
    () => localStorage.getItem('activeCharacterPresetId') || 'default',
  );

  // 3. 世界观预设
  const [worldviewPresets, setWorldviewPresets] = useState<GeneratorPreset[]>(() => {
    const presets = loadPresets('worldviewPresets', defaultWorldviewPresets);
    if (!presets.some((p: any) => p.id === 'chat')) {
      const chatPreset = defaultWorldviewPresets.find(p => p.id === 'chat');
      if (chatPreset) presets.push(chatPreset);
    }
    return presets;
  });
  const [activeWorldviewPresetId, setActiveWorldviewPresetId] = useState<string>(
    () => localStorage.getItem('activeWorldviewPresetId') || 'default',
  );

  // 4. 灵感预设
  const [inspirationPresets, setInspirationPresets] = useState<GeneratorPreset[]>(() => {
    const presets = loadPresets('inspirationPresets', defaultInspirationPresets);
    if (!presets.some((p: any) => p.id === 'chat')) {
      const chatPreset = defaultInspirationPresets.find(p => p.id === 'chat');
      if (chatPreset) presets.push(chatPreset);
    }
    return presets;
  });
  const [activeInspirationPresetId, setActiveInspirationPresetId] = useState<string>(
    () => localStorage.getItem('activeInspirationPresetId') || 'default',
  );

  // 5. 剧情粗纲预设
  const [plotOutlinePresets, setPlotOutlinePresets] = useState<GeneratorPreset[]>(() => {
    const presets = loadPresets('plotOutlinePresets', defaultPlotOutlinePresets);
    if (!presets.some((p: any) => p.id === 'chat')) {
      const chatPreset = defaultPlotOutlinePresets.find(p => p.id === 'chat');
      if (chatPreset) presets.push(chatPreset);
    }
    return presets;
  });
  const [activePlotOutlinePresetId, setActivePlotOutlinePresetId] = useState<string>(
    () => localStorage.getItem('activePlotOutlinePresetId') || 'default',
  );

  // 6. 优化与分析预设
  const [optimizePresets, setOptimizePresets] = useState<GeneratorPreset[]>(() =>
    loadPresets('optimizePresets', defaultOptimizePresets),
  );
  const [activeOptimizePresetId, setActiveOptimizePresetId] = useState<string>(
    () => localStorage.getItem('activeOptimizePresetId') || 'default',
  );
  const [analysisPresets, setAnalysisPresets] = useState<GeneratorPreset[]>(() =>
    loadPresets('analysisPresets', defaultAnalysisPresets),
  );
  const [activeAnalysisPresetId, setActiveAnalysisPresetId] = useState<string>(
    () => localStorage.getItem('activeAnalysisPresetId') || 'default',
  );

  // 7. 记忆最后使用的非 Chat 预设（用于自动切回）
  const [lastNonChatOutlinePresetId, setLastNonChatOutlinePresetId] = useState(() => {
    const saved = localStorage.getItem('activeOutlinePresetId');
    return saved && saved !== 'chat' ? saved : 'default';
  });
  const [lastNonChatCharacterPresetId, setLastNonChatCharacterPresetId] = useState(() => {
    const saved = localStorage.getItem('activeCharacterPresetId');
    return saved && saved !== 'chat' ? saved : 'default';
  });
  const [lastNonChatWorldviewPresetId, setLastNonChatWorldviewPresetId] = useState(() => {
    const saved = localStorage.getItem('activeWorldviewPresetId');
    return saved && saved !== 'chat' ? saved : 'default';
  });
  const [lastNonChatInspirationPresetId, setLastNonChatInspirationPresetId] = useState(() => {
    const saved = localStorage.getItem('activeInspirationPresetId');
    return saved && saved !== 'chat' ? saved : 'default';
  });
  const [lastNonChatPlotOutlinePresetId, setLastNonChatPlotOutlinePresetId] = useState(() => {
    const saved = localStorage.getItem('activePlotOutlinePresetId');
    return saved && saved !== 'chat' ? saved : 'default';
  });

  // 数据持久化
  useEffect(() => {
    localStorage.setItem('outlinePresets', JSON.stringify(outlinePresets));
    localStorage.setItem('activeOutlinePresetId', activeOutlinePresetId);
    if (activeOutlinePresetId !== 'chat') setLastNonChatOutlinePresetId(activeOutlinePresetId);
  }, [outlinePresets, activeOutlinePresetId]);

  useEffect(() => {
    localStorage.setItem('characterPresets', JSON.stringify(characterPresets));
    localStorage.setItem('activeCharacterPresetId', activeCharacterPresetId);
    if (activeCharacterPresetId !== 'chat') setLastNonChatCharacterPresetId(activeCharacterPresetId);
  }, [characterPresets, activeCharacterPresetId]);

  useEffect(() => {
    localStorage.setItem('worldviewPresets', JSON.stringify(worldviewPresets));
    localStorage.setItem('activeWorldviewPresetId', activeWorldviewPresetId);
    if (activeWorldviewPresetId !== 'chat') setLastNonChatWorldviewPresetId(activeWorldviewPresetId);
  }, [worldviewPresets, activeWorldviewPresetId]);

  useEffect(() => {
    localStorage.setItem('inspirationPresets', JSON.stringify(inspirationPresets));
    localStorage.setItem('activeInspirationPresetId', activeInspirationPresetId);
    if (activeInspirationPresetId !== 'chat') setLastNonChatInspirationPresetId(activeInspirationPresetId);
  }, [inspirationPresets, activeInspirationPresetId]);

  useEffect(() => {
    localStorage.setItem('plotOutlinePresets', JSON.stringify(plotOutlinePresets));
    localStorage.setItem('activePlotOutlinePresetId', activePlotOutlinePresetId);
    if (activePlotOutlinePresetId !== 'chat') setLastNonChatPlotOutlinePresetId(activePlotOutlinePresetId);
  }, [plotOutlinePresets, activePlotOutlinePresetId]);

  useEffect(() => {
    localStorage.setItem('optimizePresets', JSON.stringify(optimizePresets));
    localStorage.setItem('activeOptimizePresetId', activeOptimizePresetId);
  }, [optimizePresets, activeOptimizePresetId]);

  useEffect(() => {
    localStorage.setItem('analysisPresets', JSON.stringify(analysisPresets));
    localStorage.setItem('activeAnalysisPresetId', activeAnalysisPresetId);
  }, [analysisPresets, activeAnalysisPresetId]);

  // --- 高级操作方法 ---

  const addGeneratorPreset = useCallback((type: string) => {
    const typeName =
      type === 'outline'
        ? '大纲'
        : type === 'character'
        ? '角色'
        : type === 'worldview'
        ? '世界观'
        : type === 'inspiration'
        ? '灵感'
        : type === 'plotOutline'
        ? '剧情粗纲'
        : type === 'analysis'
        ? '分析'
        : '优化';

    const newPreset: GeneratorPreset = {
      id: `${type}_${Date.now()}`,
      name: `新${typeName}预设`,
      prompts: [{ id: '1', role: 'system', content: 'You are a helpful assistant.', enabled: true }],
    };

    switch (type) {
      case 'character':
        setCharacterPresets(prev => [...prev, newPreset]);
        break;
      case 'worldview':
        setWorldviewPresets(prev => [...prev, newPreset]);
        break;
      case 'inspiration':
        setInspirationPresets(prev => [...prev, newPreset]);
        break;
      case 'plotOutline':
        setPlotOutlinePresets(prev => [...prev, newPreset]);
        break;
      case 'optimize':
        setOptimizePresets(prev => [...prev, newPreset]);
        break;
      case 'analysis':
        setAnalysisPresets(prev => [...prev, newPreset]);
        break;
      default:
        setOutlinePresets(prev => [...prev, newPreset]);
        break;
    }
    return newPreset.id;
  }, []);

  const deleteGeneratorPreset = useCallback((type: string, id: string) => {
    const setter =
      type === 'character'
        ? setCharacterPresets
        : type === 'worldview'
        ? setWorldviewPresets
        : type === 'inspiration'
        ? setInspirationPresets
        : type === 'plotOutline'
        ? setPlotOutlinePresets
        : type === 'optimize'
        ? setOptimizePresets
        : type === 'analysis'
        ? setAnalysisPresets
        : setOutlinePresets;

    setter(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(p => p.id !== id);
      return next;
    });
  }, []);

  return {
    outlinePresets,
    setOutlinePresets,
    activeOutlinePresetId,
    setActiveOutlinePresetId,
    lastNonChatOutlinePresetId,
    setLastNonChatOutlinePresetId,
    characterPresets,
    setCharacterPresets,
    activeCharacterPresetId,
    setActiveCharacterPresetId,
    lastNonChatCharacterPresetId,
    setLastNonChatCharacterPresetId,
    worldviewPresets,
    setWorldviewPresets,
    activeWorldviewPresetId,
    setActiveWorldviewPresetId,
    lastNonChatWorldviewPresetId,
    setLastNonChatWorldviewPresetId,
    inspirationPresets,
    setInspirationPresets,
    activeInspirationPresetId,
    setActiveInspirationPresetId,
    lastNonChatInspirationPresetId,
    setLastNonChatInspirationPresetId,
    plotOutlinePresets,
    setPlotOutlinePresets,
    activePlotOutlinePresetId,
    setActivePlotOutlinePresetId,
    lastNonChatPlotOutlinePresetId,
    setLastNonChatPlotOutlinePresetId,
    optimizePresets,
    setOptimizePresets,
    activeOptimizePresetId,
    setActiveOptimizePresetId,
    analysisPresets,
    setAnalysisPresets,
    activeAnalysisPresetId,
    setActiveAnalysisPresetId,
    // Actions
    addGeneratorPreset,
    deleteGeneratorPreset,
  };
}

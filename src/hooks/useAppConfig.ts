import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RegexScript } from '../types';
import { adjustColor, hexToRgb } from '../utils/uiUtils';

export function useAppConfig() {
  // --- 主题设置 ---
  const [themeColor, setThemeColor] = useState(() => {
    try {
      return localStorage.getItem('themeColor') || '#2563eb';
    } catch (e) {
      return '#2563eb';
    }
  });

  useEffect(() => {
    localStorage.setItem('themeColor', themeColor);
    const root = document.documentElement;
    root.style.setProperty('--theme-color', themeColor);
    root.style.setProperty('--theme-color-rgb', hexToRgb(themeColor));
    root.style.setProperty('--theme-color-hover', adjustColor(themeColor, -0.2));
    root.style.setProperty('--theme-color-light', adjustColor(themeColor, 0.2));
  }, [themeColor]);

  // --- 工作流连线颜色 ---
  const [workflowEdgeColor, setWorkflowEdgeColor] = useState(() => {
    try {
      return localStorage.getItem('workflowEdgeColor') || '#b1b1b7';
    } catch (e) {
      return '#b1b1b7';
    }
  });

  useEffect(() => {
    localStorage.setItem('workflowEdgeColor', workflowEdgeColor);
    const root = document.documentElement;
    if (workflowEdgeColor) {
      root.style.setProperty('--workflow-edge-color', workflowEdgeColor);
      root.style.setProperty('--workflow-edge-color-dark', adjustColor(workflowEdgeColor, -0.2));
      root.style.setProperty('--workflow-edge-color-light', adjustColor(workflowEdgeColor, 0.2));
    } else {
      root.style.removeProperty('--workflow-edge-color');
      root.style.removeProperty('--workflow-edge-color-dark');
      root.style.removeProperty('--workflow-edge-color-light');
    }
  }, [workflowEdgeColor]);

  // --- API 核心设置 ---
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('apiKey') || '';
    } catch (e) {
      return '';
    }
  });
  const [baseUrl, setBaseUrl] = useState(() => {
    try {
      return localStorage.getItem('baseUrl') || 'https://api.openai.com/v1';
    } catch (e) {
      return 'https://api.openai.com/v1';
    }
  });
  const [maxRetries, setMaxRetries] = useState(() => {
    try {
      return parseInt(localStorage.getItem('maxRetries') || '3');
    } catch (e) {
      return 3;
    }
  });

  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
    localStorage.setItem('baseUrl', baseUrl);
    localStorage.setItem('maxRetries', String(maxRetries));
  }, [apiKey, baseUrl, maxRetries]);

  // --- 模型选择系统 ---
  const [model, setModel] = useState(() => localStorage.getItem('model') || '');
  const [outlineModel, setOutlineModel] = useState(() => localStorage.getItem('outlineModel') || '');
  const [characterModel, setCharacterModel] = useState(() => localStorage.getItem('characterModel') || '');
  const [worldviewModel, setWorldviewModel] = useState(() => localStorage.getItem('worldview') || '');
  const [inspirationModel, setInspirationModel] = useState(() => localStorage.getItem('inspirationModel') || '');
  const [plotOutlineModel, setPlotOutlineModel] = useState(() => localStorage.getItem('plotOutlineModel') || '');
  const [optimizeModel, setOptimizeModel] = useState(() => localStorage.getItem('optimizeModel') || '');
  const [analysisModel, setAnalysisModel] = useState(() => localStorage.getItem('analysisModel') || '');

  const [modelList, setModelList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('modelList');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('model', model);
    localStorage.setItem('outlineModel', outlineModel);
    localStorage.setItem('characterModel', characterModel);
    localStorage.setItem('worldviewModel', worldviewModel);
    localStorage.setItem('inspirationModel', inspirationModel);
    localStorage.setItem('plotOutlineModel', plotOutlineModel);
    localStorage.setItem('optimizeModel', optimizeModel);
    localStorage.setItem('analysisModel', analysisModel);
    localStorage.setItem('modelList', JSON.stringify(modelList));
  }, [
    model,
    outlineModel,
    characterModel,
    worldviewModel,
    inspirationModel,
    plotOutlineModel,
    optimizeModel,
    analysisModel,
    modelList,
  ]);

  const [newModelInput, setNewModelInput] = useState('');

  const handleAddModel = useCallback(() => {
    if (newModelInput.trim()) {
      const newModel = newModelInput.trim();
      if (!modelList.includes(newModel)) {
        setModelList(prev => {
          const next = [...prev, newModel];
          localStorage.setItem('modelList', JSON.stringify(next));
          return next;
        });
      }
      setModel(newModel);
      setNewModelInput('');
    }
  }, [newModelInput, modelList]);

  const handleDeleteModel = useCallback(
    (e: React.MouseEvent, modelToDelete: string) => {
      e.stopPropagation();
      setModelList(prev => {
        const next = prev.filter(m => m !== modelToDelete);
        localStorage.setItem('modelList', JSON.stringify(next));
        return next;
      });
      if (model === modelToDelete) {
        setModel('');
      }
    },
    [model],
  );

  // --- 全局提示词与辅助功能开关 ---
  const [globalCreationPrompt, setGlobalCreationPrompt] = useState(
    () => localStorage.getItem('globalCreationPrompt') || '',
  );
  const [autoOptimize, setAutoOptimize] = useState(() => localStorage.getItem('autoOptimize') === 'true');
  const [twoStepOptimization, setTwoStepOptimization] = useState(
    () => localStorage.getItem('twoStepOptimization') === 'true',
  );

  useEffect(() => {
    localStorage.setItem('globalCreationPrompt', globalCreationPrompt);
    localStorage.setItem('autoOptimize', String(autoOptimize));
    localStorage.setItem('twoStepOptimization', String(twoStepOptimization));
  }, [globalCreationPrompt, autoOptimize, twoStepOptimization]);

  // --- 全局正则脚本 ---
  const [globalRegexScripts, setGlobalRegexScripts] = useState<RegexScript[]>(() => {
    try {
      const saved = localStorage.getItem('globalRegexScripts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('globalRegexScripts', JSON.stringify(globalRegexScripts));
  }, [globalRegexScripts]);

  // --- 长文模式与总结设置 ---
  const [longTextMode, setLongTextMode] = useState(() => localStorage.getItem('longTextMode') === 'true');
  const longTextModeRef = useRef(longTextMode);
  useEffect(() => {
    longTextModeRef.current = longTextMode;
  }, [longTextMode]);

  const [contextScope, setContextScope] = useState<string>(() => localStorage.getItem('contextScope') || 'all');
  const contextScopeRef = useRef(contextScope);
  useEffect(() => {
    contextScopeRef.current = contextScope;
  }, [contextScope]);

  const [contextChapterCount, setContextChapterCount] = useState<number | ''>(() => {
    const val = localStorage.getItem('contextChapterCount');
    return val ? parseInt(val) : '';
  });
  const contextChapterCountRef = useRef(contextChapterCount);
  useEffect(() => {
    contextChapterCountRef.current = contextChapterCount;
  }, [contextChapterCount]);

  const [smallSummaryInterval, setSmallSummaryInterval] = useState<number | string>(() => {
    const val = localStorage.getItem('smallSummaryInterval');
    return val ? parseInt(val) : 3;
  });
  const smallSummaryIntervalRef = useRef(smallSummaryInterval);
  useEffect(() => {
    smallSummaryIntervalRef.current = smallSummaryInterval;
  }, [smallSummaryInterval]);

  const [bigSummaryInterval, setBigSummaryInterval] = useState<number | string>(() => {
    const val = localStorage.getItem('bigSummaryInterval');
    return val ? parseInt(val) : 6;
  });
  const bigSummaryIntervalRef = useRef(bigSummaryInterval);
  useEffect(() => {
    bigSummaryIntervalRef.current = bigSummaryInterval;
  }, [bigSummaryInterval]);

  const [smallSummaryPrompt, setSmallSummaryPrompt] = useState(
    () =>
      localStorage.getItem('smallSummaryPrompt') ||
      '请把以上小说章节的内容总结成一个简短的剧情摘要（300字以内）。保留关键的人名、地名和事件。',
  );
  const [bigSummaryPrompt, setBigSummaryPrompt] = useState(
    () =>
      localStorage.getItem('bigSummaryPrompt') ||
      '请根据以上的分段摘要，写一个宏观的剧情大纲（500字以内），概括这段时间内的主要情节发展。',
  );

  useEffect(() => {
    localStorage.setItem('longTextMode', String(longTextMode));
    localStorage.setItem('contextScope', contextScope);
    localStorage.setItem('contextChapterCount', String(contextChapterCount));
    localStorage.setItem('smallSummaryInterval', String(smallSummaryInterval));
    localStorage.setItem('bigSummaryInterval', String(bigSummaryInterval));
    localStorage.setItem('smallSummaryPrompt', smallSummaryPrompt);
    localStorage.setItem('bigSummaryPrompt', bigSummaryPrompt);
  }, [
    longTextMode,
    contextScope,
    contextChapterCount,
    smallSummaryInterval,
    bigSummaryInterval,
    smallSummaryPrompt,
    bigSummaryPrompt,
  ]);

  // --- 批量创作与并发设置 ---
  const [consecutiveChapterCount, setConsecutiveChapterCount] = useState<number | ''>(() => {
    const val = localStorage.getItem('consecutiveChapterCount');
    return val ? parseInt(val) : '';
  });
  const consecutiveChapterCountRef = useRef(consecutiveChapterCount);
  useEffect(() => {
    consecutiveChapterCountRef.current = consecutiveChapterCount;
  }, [consecutiveChapterCount]);

  const [concurrentOptimizationLimit, setConcurrentOptimizationLimit] = useState<number | ''>(() => {
    const val = localStorage.getItem('concurrentOptimizationLimit');
    return val ? parseInt(val) : '';
  });
  const concurrentOptimizationLimitRef = useRef(concurrentOptimizationLimit);
  useEffect(() => {
    concurrentOptimizationLimitRef.current = concurrentOptimizationLimit;
  }, [concurrentOptimizationLimit]);

  useEffect(() => {
    localStorage.setItem('consecutiveChapterCount', String(consecutiveChapterCount));
    localStorage.setItem('concurrentOptimizationLimit', String(concurrentOptimizationLimit));
  }, [consecutiveChapterCount, concurrentOptimizationLimit]);

  const autoOptimizeRef = useRef(autoOptimize);
  useEffect(() => {
    autoOptimizeRef.current = autoOptimize;
  }, [autoOptimize]);

  const twoStepOptimizationRef = useRef(twoStepOptimization);
  useEffect(() => {
    twoStepOptimizationRef.current = twoStepOptimization;
  }, [twoStepOptimization]);

  // --- 移动端状态监听 ---
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    themeColor,
    setThemeColor,
    workflowEdgeColor,
    setWorkflowEdgeColor,
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    maxRetries,
    setMaxRetries,
    model,
    setModel,
    outlineModel,
    setOutlineModel,
    characterModel,
    setCharacterModel,
    worldviewModel,
    setWorldviewModel,
    inspirationModel,
    setInspirationModel,
    plotOutlineModel,
    setPlotOutlineModel,
    optimizeModel,
    setOptimizeModel,
    analysisModel,
    setAnalysisModel,
    modelList,
    setModelList,
    newModelInput,
    setNewModelInput,
    handleAddModel,
    handleDeleteModel,
    globalCreationPrompt,
    setGlobalCreationPrompt,
    autoOptimize,
    setAutoOptimize,
    autoOptimizeRef,
    twoStepOptimization,
    setTwoStepOptimization,
    twoStepOptimizationRef,
    longTextMode,
    setLongTextMode,
    longTextModeRef,
    contextScope,
    setContextScope,
    contextScopeRef,
    contextChapterCount,
    setContextChapterCount,
    contextChapterCountRef,
    smallSummaryInterval,
    setSmallSummaryInterval,
    smallSummaryIntervalRef,
    bigSummaryInterval,
    setBigSummaryInterval,
    bigSummaryIntervalRef,
    smallSummaryPrompt,
    setSmallSummaryPrompt,
    bigSummaryPrompt,
    setBigSummaryPrompt,
    consecutiveChapterCount,
    setConsecutiveChapterCount,
    consecutiveChapterCountRef,
    concurrentOptimizationLimit,
    setConcurrentOptimizationLimit,
    concurrentOptimizationLimitRef,
    isMobile,
    globalRegexScripts,
    setGlobalRegexScripts,
  };
}

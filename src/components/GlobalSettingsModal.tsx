import { ChevronDown, Loader2, Monitor, Moon, Plus, RefreshCw, Sun, Trash2, Wand2, X } from 'lucide-react';
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ApiPreset } from '../types';

// Helper functions for real-time preview
const adjustColor = (hex: string, lum: number) => {
  hex = String(hex).replace(/[^0-9a-f]/gi, '');
  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  lum = lum || 0;
  let rgb = '#',
    c,
    i;
  for (i = 0; i < 3; i++) {
    c = parseInt(hex.substr(i * 2, 2), 16);
    c = Math.round(Math.min(Math.max(0, c + c * lum), 255)).toString(16);
    rgb += ('00' + c).substr(c.length);
  }
  return rgb;
};

const hexToRgb = (hex: string) => {
  let c: any;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length == 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(' ');
  }
  return '37 99 235';
};

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  workflowEdgeColor: string;
  setWorkflowEdgeColor: (color: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  model: string;
  setModel: (model: string) => void;
  modelList: string[];
  handleDeleteModel: (e: React.MouseEvent, modelToDelete: string) => void;
  newModelInput: string;
  setNewModelInput: (input: string) => void;
  handleAddModel: () => void;
  outlineModel: string;
  setOutlineModel: (model: string) => void;
  characterModel: string;
  setCharacterModel: (model: string) => void;
  worldviewModel: string;
  setWorldviewModel: (model: string) => void;
  inspirationModel: string;
  setInspirationModel: (model: string) => void;
  plotOutlineModel: string;
  setPlotOutlineModel: (model: string) => void;
  optimizeModel: string;
  setOptimizeModel: (model: string) => void;
  analysisModel: string;
  setAnalysisModel: (model: string) => void;
  smallSummaryModel: string;
  setSmallSummaryModel: (model: string) => void;
  bigSummaryModel: string;
  setBigSummaryModel: (model: string) => void;
  smallSummaryInterval: number | string;
  setSmallSummaryInterval: (val: number) => void;
  bigSummaryInterval: number | string;
  setBigSummaryInterval: (val: number) => void;
  smallSummaryPrompt: string;
  setSmallSummaryPrompt: (prompt: string) => void;
  bigSummaryPrompt: string;
  setBigSummaryPrompt: (prompt: string) => void;
  handleScanSummaries: () => void;
  handleRecalibrateSummaries: () => void;
  isLoading: boolean;
  longTextMode: boolean;
  setLongTextMode: (enabled: boolean) => void;
  contextScope: string;
  setContextScope: (scope: string) => void;
  consecutiveChapterCount: number | '';
  setConsecutiveChapterCount: (val: number | '') => void;
  concurrentOptimizationLimit: number | '';
  setConcurrentOptimizationLimit: (val: number | '') => void;
  contextChapterCount: number | '';
  setContextChapterCount: (val: number | '') => void;
  stream: boolean;
  setStream: (val: boolean) => void;
  apiPresets: ApiPreset[];
  activeApiPresetId: string;
  handleAddApiPreset: (preset: Omit<ApiPreset, 'id'>) => void;
  handleUpdateApiPreset: (id: string, updates: Partial<ApiPreset>) => void;
  handleDeleteApiPreset: (id: string) => void;
  handleSwitchApiPreset: (id: string) => void;
}

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  themeColor,
  setThemeColor,
  workflowEdgeColor,
  setWorkflowEdgeColor,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  model,
  setModel,
  modelList,
  handleDeleteModel,
  newModelInput,
  setNewModelInput,
  handleAddModel,
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
  smallSummaryModel,
  setSmallSummaryModel,
  bigSummaryModel,
  setBigSummaryModel,
  smallSummaryInterval,
  setSmallSummaryInterval,
  bigSummaryInterval,
  setBigSummaryInterval,
  smallSummaryPrompt,
  setSmallSummaryPrompt,
  bigSummaryPrompt,
  setBigSummaryPrompt,
  handleScanSummaries,
  handleRecalibrateSummaries,
  isLoading,
  longTextMode,
  setLongTextMode,
  contextScope,
  setContextScope,
  consecutiveChapterCount,
  setConsecutiveChapterCount,
  concurrentOptimizationLimit,
  setConcurrentOptimizationLimit,
  contextChapterCount,
  setContextChapterCount,
  stream,
  setStream,
  apiPresets,
  activeApiPresetId,
  handleAddApiPreset,
  handleUpdateApiPreset,
  handleDeleteApiPreset,
  handleSwitchApiPreset,
}) => {
  const { theme, setTheme } = useTheme();
  const [localThemeColor, setLocalThemeColor] = React.useState(themeColor);
  const [localWorkflowEdgeColor, setLocalWorkflowEdgeColor] = React.useState(workflowEdgeColor);
  
  // API预设表单状态
  const [newPresetName, setNewPresetName] = React.useState('');
  const [newPresetApiKey, setNewPresetApiKey] = React.useState('');
  const [newPresetBaseUrl, setNewPresetBaseUrl] = React.useState('https://api.openai.com/v1');
  const [newPresetDefaultModel, setNewPresetDefaultModel] = React.useState('');
  const [newPresetModelList, setNewPresetModelList] = React.useState<string[]>([]);
  const [newPresetModelInput, setNewPresetModelInput] = React.useState('');
  const [editingPresetId, setEditingPresetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLocalThemeColor(themeColor);
  }, [themeColor]);

  React.useEffect(() => {
    setLocalWorkflowEdgeColor(workflowEdgeColor);
  }, [workflowEdgeColor]);

  // 处理添加新模型到预设
  const handleAddModelToPreset = () => {
    if (newPresetModelInput.trim() && !newPresetModelList.includes(newPresetModelInput.trim())) {
      setNewPresetModelList([...newPresetModelList, newPresetModelInput.trim()]);
      setNewPresetModelInput('');
    }
  };

  // 处理从预设中删除模型
  const handleDeleteModelFromPreset = (modelToDelete: string) => {
    setNewPresetModelList(newPresetModelList.filter(m => m !== modelToDelete));
    if (newPresetDefaultModel === modelToDelete) {
      setNewPresetDefaultModel('');
    }
  };

  // 处理保存新预设或更新现有预设
  const handleSavePreset = () => {
    if (!newPresetName.trim() || !newPresetApiKey.trim() || !newPresetBaseUrl.trim()) {
      return;
    }

    const presetData = {
      name: newPresetName.trim(),
      apiKey: newPresetApiKey,
      baseUrl: newPresetBaseUrl,
      modelList: newPresetModelList,
      defaultModel: newPresetDefaultModel
    };

    if (editingPresetId) {
      handleUpdateApiPreset(editingPresetId, presetData);
      setEditingPresetId(null);
    } else {
      handleAddApiPreset(presetData);
    }

    // 重置表单
    setNewPresetName('');
    setNewPresetApiKey('');
    setNewPresetBaseUrl('https://api.openai.com/v1');
    setNewPresetDefaultModel('');
    setNewPresetModelList([]);
    setNewPresetModelInput('');
  };

  // 处理编辑预设
  const handleEditPreset = (preset: ApiPreset) => {
    setEditingPresetId(preset.id);
    setNewPresetName(preset.name);
    setNewPresetApiKey(preset.apiKey);
    setNewPresetBaseUrl(preset.baseUrl);
    setNewPresetModelList([...preset.modelList]);
    setNewPresetDefaultModel(preset.defaultModel);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingPresetId(null);
    setNewPresetName('');
    setNewPresetApiKey('');
    setNewPresetBaseUrl('https://api.openai.com/v1');
    setNewPresetDefaultModel('');
    setNewPresetModelList([]);
    setNewPresetModelInput('');
  };

  // Direct DOM manipulation for instant preview without React re-renders
  const updateThemePreview = (color: string) => {
    const root = document.documentElement;
    root.style.setProperty('--theme-color', color);
    root.style.setProperty('--theme-color-rgb', hexToRgb(color));
    root.style.setProperty('--theme-color-hover', adjustColor(color, -0.2));
    root.style.setProperty('--theme-color-light', adjustColor(color, 0.2));
  };

  const updateEdgePreview = (color: string) => {
    const root = document.documentElement;
    if (color) {
      root.style.setProperty('--workflow-edge-color', color);
      root.style.setProperty('--workflow-edge-color-dark', adjustColor(color, -0.2));
      root.style.setProperty('--workflow-edge-color-light', adjustColor(color, 0.2));
    } else {
      root.style.removeProperty('--workflow-edge-color');
      root.style.removeProperty('--workflow-edge-color-dark');
      root.style.removeProperty('--workflow-edge-color-light');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full md:w-96 bg-gray-800 h-full p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">全局设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-6">
          {/* Theme Mode Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">界面主题模式</label>
            <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
              {[
                { value: 'light', label: '白天', icon: Sun },
                { value: 'dark', label: '黑夜', icon: Moon },
                { value: 'system', label: '跟随系统', icon: Monitor },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    theme === option.value
                      ? 'bg-[var(--theme-color)] text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <option.icon className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Theme Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={localThemeColor}
                onInput={e => {
                  // Instant preview on drag
                  const val = (e.target as HTMLInputElement).value;
                  setLocalThemeColor(val);
                  updateThemePreview(val);
                }}
                onChange={e => {
                  // Commit change on release
                  const val = e.target.value;
                  setLocalThemeColor(val);
                  updateThemePreview(val); // Ensure preview is sync
                  setThemeColor(val);
                }}
                className="h-10 w-20 bg-transparent border border-gray-700 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-400">{localThemeColor}</span>
              <button
                onClick={() => {
                  const defaultColor = '#2563eb';
                  setLocalThemeColor(defaultColor);
                  updateThemePreview(defaultColor);
                  setThemeColor(defaultColor);
                }}
                className="text-xs text-[var(--theme-color-light)] hover:text-[var(--theme-color)] underline"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">工作流连接线颜色 (可选)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={localWorkflowEdgeColor}
                onInput={e => {
                  const val = (e.target as HTMLInputElement).value;
                  setLocalWorkflowEdgeColor(val);
                  updateEdgePreview(val);
                }}
                onChange={e => {
                  const val = e.target.value;
                  setLocalWorkflowEdgeColor(val);
                  updateEdgePreview(val);
                  setWorkflowEdgeColor(val);
                }}
                className="h-10 w-20 bg-transparent border border-gray-700 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-400">{localWorkflowEdgeColor || '未设置 (跟随主题)'}</span>
              <button
                onClick={() => {
                  setLocalWorkflowEdgeColor('');
                  updateEdgePreview('');
                  setWorkflowEdgeColor('');
                }}
                className="text-xs text-[var(--theme-color-light)] hover:text-[var(--theme-color)] underline"
              >
                Reset
              </button>
            </div>
            <p className="text-[10px] text-gray-500">不设置则默认跟随系统主题色。</p>
          </div>
          {/* API预设设置 */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-300">API预设管理</label>
            </div>

            {/* 预设选择 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-400">当前预设</label>
              <div className="relative">
                <select
                  value={activeApiPresetId}
                  onChange={e => handleSwitchApiPreset(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none appearance-none"
                >
                  <option value="">无（使用当前设置）</option>
                  {apiPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>

            {/* 预设列表 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400">现有预设</label>
              <div className="space-y-2">
                {apiPresets.map(preset => (
                  <div key={preset.id} className="flex items-center justify-between bg-gray-900 p-2.5 rounded border border-gray-700">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{preset.name}</div>
                      <div className="text-xs text-gray-500">{preset.baseUrl}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditPreset(preset)}
                        className="p-1.5 text-gray-400 hover:text-white transition-colors"
                        title="编辑预设"
                      >
                        <Wand2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteApiPreset(preset.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                        title="删除预设"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 新增/编辑预设表单 */}
            <div className="bg-gray-900 p-4 rounded border border-gray-700">
              <h4 className="text-sm font-medium mb-3">{editingPresetId ? '编辑预设' : '添加新预设'}</h4>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-400">预设名称</label>
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    placeholder="输入预设名称"
                    className="bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-400">API Key</label>
                  <input
                    type="password"
                    value={newPresetApiKey}
                    onChange={e => setNewPresetApiKey(e.target.value)}
                    placeholder="输入API Key"
                    className="bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-400">Base URL</label>
                  <input
                    type="text"
                    value={newPresetBaseUrl}
                    onChange={e => setNewPresetBaseUrl(e.target.value)}
                    placeholder="输入API基础URL"
                    className="bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-400">默认模型</label>
                  <div className="relative">
                    <select
                      value={newPresetDefaultModel}
                      onChange={e => setNewPresetDefaultModel(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none appearance-none"
                    >
                      <option value="">选择默认模型</option>
                      {newPresetModelList.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-400">模型列表</label>
                  <div className="space-y-2">
                    {newPresetModelList.map((m, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                        <span className="text-sm">{m}</span>
                        <button
                          onClick={() => handleDeleteModelFromPreset(m)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="添加模型..."
                        value={newPresetModelInput}
                        onChange={e => setNewPresetModelInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddModelToPreset()}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                      />
                      <button
                        onClick={handleAddModelToPreset}
                        disabled={!newPresetModelInput.trim()}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  {editingPresetId && (
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors"
                    >
                      取消
                    </button>
                  )}
                  <button
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim() || !newPresetApiKey.trim() || !newPresetBaseUrl.trim()}
                    className="flex-1 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] rounded text-sm text-white transition-colors disabled:opacity-50"
                  >
                    {editingPresetId ? '更新预设' : '保存预设'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-700 pt-4">
            {/* Default Model */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-300">默认模型 (正文/通用)</label>
              </div>
              <div className="relative">
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none appearance-none"
                >
                  <option value="">请选择模型</option>
                  {/* 显示所有预设的模型 */}
                  {apiPresets.map(preset => (
                    <optgroup key={preset.id} label={`${preset.name} 模型`}>
                      {preset.modelList.map(m => (
                        <option key={`${preset.id}-${m}`} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>

            {/* Specific Models */}
            {[
              { label: '大纲生成模型', value: outlineModel, setter: setOutlineModel },
              { label: '角色生成模型', value: characterModel, setter: setCharacterModel },
              { label: '世界观生成模型', value: worldviewModel, setter: setWorldviewModel },
              { label: '灵感生成模型', value: inspirationModel, setter: setInspirationModel },
              { label: '剧情粗纲模型', value: plotOutlineModel, setter: setPlotOutlineModel },
              { label: '正文优化模型', value: optimizeModel, setter: setOptimizeModel },
              { label: '正文分析模型', value: analysisModel, setter: setAnalysisModel },
              { label: '小总结模型', value: smallSummaryModel, setter: setSmallSummaryModel },
              { label: '大总结模型', value: bigSummaryModel, setter: setBigSummaryModel },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">{item.label}</label>
                <div className="relative">
                  <select
                    value={item.value}
                    onChange={e => item.setter(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-[var(--theme-color)] outline-none appearance-none text-gray-300"
                  >
                    <option value="">跟随默认模型</option>
                    {/* 显示所有预设的模型 */}
                    {apiPresets.map(preset => (
                      <optgroup key={preset.id} label={`${preset.name} 模型`}>
                        {preset.modelList.map(m => (
                          <option key={`${preset.id}-${m}`} value={m}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-3 h-3 text-gray-500 pointer-events-none" />
                </div>
              </div>
            ))}



            {/* Long Text Mode Settings */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">长文模式设置</label>
                <button
                  onClick={() => setLongTextMode(!longTextMode)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${longTextMode ? 'bg-[var(--theme-color)]' : 'bg-gray-700'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${longTextMode ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">流式传输</label>
                <button
                  onClick={() => setStream(!stream)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${stream ? 'bg-[var(--theme-color)]' : 'bg-gray-700'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${stream ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>

              {longTextMode && (
                <>
                  <div className="grid grid-cols-1 gap-4 mb-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">上下文参考范围 (长文模式核心)</label>
                      <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                        {[
                          { value: 'all', label: '整本书 (全书剧情回顾)' },
                          { value: 'currentVolume', label: '当前卷 (仅本卷剧情)' },
                          { value: 'volume', label: '本卷模式 (上下文严格隔离)' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => setContextScope(option.value)}
                            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                              contextScope === option.value
                                ? 'bg-[var(--theme-color)] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">小总结间隔 (章)</label>
                      <input
                        type="number"
                        min="1"
                        value={smallSummaryInterval}
                        onChange={e => setSmallSummaryInterval(parseInt(e.target.value) || 3)}
                        className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">大总结间隔 (章)</label>
                      <input
                        type="number"
                        min="1"
                        value={bigSummaryInterval}
                        onChange={e => setBigSummaryInterval(parseInt(e.target.value) || 6)}
                        className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">上下文参考章节数 (回看正文深度)</label>
                      <input
                        type="number"
                        min="0"
                        value={contextChapterCount}
                        onChange={e => setContextChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                        className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                        placeholder="默认参考前 1 章正文"
                      />
                      <p className="text-[10px] text-gray-500">
                        控制 AI 创作时能看到多少章之前的完整正文细节。增加此值会消耗更多 Token，但能提高连贯性。
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">小总结提示词</label>
                      <textarea
                        value={smallSummaryPrompt}
                        onChange={e => setSmallSummaryPrompt(e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-[var(--theme-color)] outline-none h-20 resize-none"
                        placeholder="输入小总结生成的提示词..."
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">大总结提示词</label>
                      <textarea
                        value={bigSummaryPrompt}
                        onChange={e => setBigSummaryPrompt(e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-[var(--theme-color)] outline-none h-20 resize-none"
                        placeholder="输入大总结生成的提示词..."
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleScanSummaries}
                      disabled={isLoading}
                      className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors flex items-center justify-center gap-2"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      扫描并补充缺失的总结
                    </button>
                    <button
                      onClick={handleRecalibrateSummaries}
                      disabled={isLoading}
                      className="w-full py-2 mt-2 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-800 rounded text-sm text-indigo-200 transition-colors flex items-center justify-center gap-2"
                      title="当手动删除或大幅移动章节导致总结位置错乱时使用"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                      一键校准总结索引 (修复错乱)
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Batch & Concurrent Settings */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
              <label className="text-sm font-medium text-gray-300">自动化与并发设置</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">连贯创作章节数</label>
                  <input
                    type="number"
                    min="1"
                    value={consecutiveChapterCount}
                    onChange={e => setConsecutiveChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                    placeholder="默认不开启"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">自动润色并发限制</label>
                  <input
                    type="number"
                    min="1"
                    value={concurrentOptimizationLimit}
                    onChange={e =>
                      setConcurrentOptimizationLimit(e.target.value === '' ? '' : parseInt(e.target.value))
                    }
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                    placeholder="默认串行 (1)"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                连贯创作：设置一次请求生成的章节数，节省API调用。
                <br />
                并发限制：控制同时进行的润色任务数，防止过载。不填默认为串行。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

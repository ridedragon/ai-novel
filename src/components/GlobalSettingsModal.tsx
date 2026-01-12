import {
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import React from 'react'

// Helper functions for real-time preview
const adjustColor = (hex: string, lum: number) => {
  hex = String(hex).replace(/[^0-9a-f]/gi, '')
  if (hex.length < 6) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]
  }
  lum = lum || 0
  let rgb = "#", c, i
  for (i = 0; i < 3; i++) {
    c = parseInt(hex.substr(i*2,2), 16)
    c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16)
    rgb += ("00"+c).substr(c.length)
  }
  return rgb
}

const hexToRgb = (hex: string) => {
    let c: any;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255].join(' ');
    }
    return '37 99 235';
}

interface GlobalSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  themeColor: string
  setThemeColor: (color: string) => void
  workflowEdgeColor: string
  setWorkflowEdgeColor: (color: string) => void
  apiKey: string
  setApiKey: (key: string) => void
  baseUrl: string
  setBaseUrl: (url: string) => void
  model: string
  setModel: (model: string) => void
  modelList: string[]
  handleDeleteModel: (e: React.MouseEvent, modelToDelete: string) => void
  newModelInput: string
  setNewModelInput: (input: string) => void
  handleAddModel: () => void
  outlineModel: string
  setOutlineModel: (model: string) => void
  characterModel: string
  setCharacterModel: (model: string) => void
  worldviewModel: string
  setWorldviewModel: (model: string) => void
  inspirationModel: string
  setInspirationModel: (model: string) => void
  plotOutlineModel: string
  setPlotOutlineModel: (model: string) => void
  optimizeModel: string
  setOptimizeModel: (model: string) => void
  analysisModel: string
  setAnalysisModel: (model: string) => void
  smallSummaryInterval: number | string
  setSmallSummaryInterval: (val: number) => void
  bigSummaryInterval: number | string
  setBigSummaryInterval: (val: number) => void
  smallSummaryPrompt: string
  setSmallSummaryPrompt: (prompt: string) => void
  bigSummaryPrompt: string
  setBigSummaryPrompt: (prompt: string) => void
  handleScanSummaries: () => void
  handleRecalibrateSummaries: () => void
  isLoading: boolean
  consecutiveChapterCount: number | ''
  setConsecutiveChapterCount: (val: number | '') => void
  concurrentOptimizationLimit: number | ''
  setConcurrentOptimizationLimit: (val: number | '') => void
  contextChapterCount: number | ''
  setContextChapterCount: (val: number | '') => void
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
  consecutiveChapterCount,
  setConsecutiveChapterCount,
  concurrentOptimizationLimit,
  setConcurrentOptimizationLimit,
  contextChapterCount,
  setContextChapterCount
}) => {
  const [localThemeColor, setLocalThemeColor] = React.useState(themeColor)
  const [localWorkflowEdgeColor, setLocalWorkflowEdgeColor] = React.useState(workflowEdgeColor)

  React.useEffect(() => {
    setLocalThemeColor(themeColor)
  }, [themeColor])

  React.useEffect(() => {
    setLocalWorkflowEdgeColor(workflowEdgeColor)
  }, [workflowEdgeColor])

  // Direct DOM manipulation for instant preview without React re-renders
  const updateThemePreview = (color: string) => {
    const root = document.documentElement
    root.style.setProperty('--theme-color', color)
    root.style.setProperty('--theme-color-rgb', hexToRgb(color))
    root.style.setProperty('--theme-color-hover', adjustColor(color, -0.2))
    root.style.setProperty('--theme-color-light', adjustColor(color, 0.2))
  }

  const updateEdgePreview = (color: string) => {
    const root = document.documentElement
    if (color) {
      root.style.setProperty('--workflow-edge-color', color)
      root.style.setProperty('--workflow-edge-color-dark', adjustColor(color, -0.2))
      root.style.setProperty('--workflow-edge-color-light', adjustColor(color, 0.2))
    } else {
      root.style.removeProperty('--workflow-edge-color')
      root.style.removeProperty('--workflow-edge-color-dark')
      root.style.removeProperty('--workflow-edge-color-light')
    }
  }

  if (!isOpen) return null

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
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Theme Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={localThemeColor}
                onInput={(e) => {
                  // Instant preview on drag
                  const val = (e.target as HTMLInputElement).value
                  setLocalThemeColor(val)
                  updateThemePreview(val)
                }}
                onChange={(e) => {
                  // Commit change on release
                  const val = e.target.value
                  setLocalThemeColor(val)
                  updateThemePreview(val) // Ensure preview is sync
                  setThemeColor(val)
                }}
                className="h-10 w-20 bg-transparent border border-gray-700 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-400">{localThemeColor}</span>
              <button
                onClick={() => {
                    const defaultColor = '#2563eb'
                    setLocalThemeColor(defaultColor)
                    updateThemePreview(defaultColor)
                    setThemeColor(defaultColor)
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
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value
                  setLocalWorkflowEdgeColor(val)
                  updateEdgePreview(val)
                }}
                onChange={(e) => {
                  const val = e.target.value
                  setLocalWorkflowEdgeColor(val)
                  updateEdgePreview(val)
                  setWorkflowEdgeColor(val)
                }}
                className="h-10 w-20 bg-transparent border border-gray-700 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-400">{localWorkflowEdgeColor || '未设置 (跟随主题)'}</span>
              <button
                onClick={() => {
                    setLocalWorkflowEdgeColor('')
                    updateEdgePreview('')
                    setWorkflowEdgeColor('')
                }}
                className="text-xs text-[var(--theme-color-light)] hover:text-[var(--theme-color)] underline"
              >
                Reset
              </button>
            </div>
            <p className="text-[10px] text-gray-500">不设置则默认跟随系统主题色。</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Base URL</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none" />
          </div>
          <div className="space-y-4 border-t border-gray-700 pt-4">
            {/* Default Model */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-300">默认模型 (正文/通用)</label>
                {modelList.includes(model) && (
                  <button
                    onClick={(e) => handleDeleteModel(e, model)}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> 删除
                  </button>
                )}
              </div>
              <div className="relative">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none appearance-none"
                >
                  {modelList.map(m => (
                    <option key={m} value={m}>{m}</option>
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
              { label: '正文分析模型', value: analysisModel, setter: setAnalysisModel }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">{item.label}</label>
                <div className="relative">
                  <select
                    value={item.value}
                    onChange={(e) => item.setter(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-[var(--theme-color)] outline-none appearance-none text-gray-300"
                  >
                    <option value="">跟随默认模型</option>
                    {modelList.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-3 h-3 text-gray-500 pointer-events-none" />
                </div>
              </div>
            ))}

            {/* Add New Model */}
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="添加新模型到列表..."
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
                className="flex-1 bg-gray-900 border border-gray-700 rounded p-2.5 text-sm focus:border-[var(--theme-color)] outline-none"
              />
              <button
                onClick={handleAddModel}
                disabled={!newModelInput.trim()}
                className="p-2.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50 transition-colors"
                title="添加模型"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Long Text Mode Settings */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
              <label className="text-sm font-medium text-gray-300">长文模式设置</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">小总结间隔 (章)</label>
                  <input
                    type="number"
                    min="1"
                    value={smallSummaryInterval}
                    onChange={(e) => setSmallSummaryInterval(parseInt(e.target.value) || 3)}
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">大总结间隔 (章)</label>
                  <input
                    type="number"
                    min="1"
                    value={bigSummaryInterval}
                    onChange={(e) => setBigSummaryInterval(parseInt(e.target.value) || 6)}
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
                    onChange={(e) => setContextChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
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
                    onChange={(e) => setSmallSummaryPrompt(e.target.value)}
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-[var(--theme-color)] outline-none h-20 resize-none"
                    placeholder="输入小总结生成的提示词..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">大总结提示词</label>
                  <textarea
                    value={bigSummaryPrompt}
                    onChange={(e) => setBigSummaryPrompt(e.target.value)}
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
                    onChange={(e) => setConsecutiveChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
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
                    onChange={(e) => setConcurrentOptimizationLimit(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-[var(--theme-color)] outline-none"
                    placeholder="默认串行 (1)"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                连贯创作：设置一次请求生成的章节数，节省API调用。<br />
                并发限制：控制同时进行的润色任务数，防止过载。不填默认为串行。
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
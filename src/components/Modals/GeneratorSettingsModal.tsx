import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  GripVertical,
  Plus,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import React from 'react'
import { GeneratorPreset, GeneratorPrompt } from '../../types'
import { GeneratorPromptEditModal } from './GeneratorPromptEditModal'

interface GeneratorSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  generatorSettingsType: 'outline' | 'character' | 'worldview' | 'inspiration' | 'plotOutline' | 'optimize' | 'analysis'
  setGeneratorSettingsType: (type: any) => void
  getGeneratorPresets: () => GeneratorPreset[]
  setGeneratorPresets: (newPresets: GeneratorPreset[]) => void
  getActiveGeneratorPresetId: () => string
  setActiveGeneratorPresetId: (id: string) => void
  handleAddNewGeneratorPreset: () => void
  handleDeleteGeneratorPreset: (id: string) => void
  handleExportGeneratorPreset: (preset: GeneratorPreset) => void
  handleImportGeneratorPreset: () => void
  
  // Optimization Specific
  twoStepOptimization: boolean
  setTwoStepOptimization: (val: boolean) => void
  analysisResult: string
  
  // Sub-modal states
  showGeneratorApiConfig: boolean
  setShowGeneratorApiConfig: (val: boolean) => void
  showGeneratorPromptEditModal: boolean
  setShowGeneratorPromptEditModal: (val: boolean) => void
  editingGeneratorPromptIndex: number | null
  setEditingGeneratorPromptIndex: (val: number | null) => void
  tempEditingPrompt: GeneratorPrompt | null
  setTempEditingPrompt: (val: GeneratorPrompt | null) => void
  handleSaveGeneratorPrompt: () => void
  
  // Shared UI states (can be local or passed)
  isDragEnabled: boolean
  setIsDragEnabled: (val: boolean) => void
  draggedPromptIndex: number | null
  setDraggedPromptIndex: (val: number | null) => void
}

export const GeneratorSettingsModal: React.FC<GeneratorSettingsModalProps> = (props) => {
  const {
    isOpen, onClose, generatorSettingsType, setGeneratorSettingsType,
    getGeneratorPresets, setGeneratorPresets, getActiveGeneratorPresetId, setActiveGeneratorPresetId,
    handleAddNewGeneratorPreset, handleDeleteGeneratorPreset, handleExportGeneratorPreset, handleImportGeneratorPreset,
    twoStepOptimization, setTwoStepOptimization, analysisResult,
    showGeneratorApiConfig, setShowGeneratorApiConfig,
    showGeneratorPromptEditModal, setShowGeneratorPromptEditModal,
    editingGeneratorPromptIndex, setEditingGeneratorPromptIndex,
    tempEditingPrompt, setTempEditingPrompt, handleSaveGeneratorPrompt,
    isDragEnabled, setIsDragEnabled, draggedPromptIndex, setDraggedPromptIndex
  } = props

  if (!isOpen) return null

  const currentPresets = getGeneratorPresets()
  const activeId = getActiveGeneratorPresetId()
  const currentPreset = currentPresets.find(p => p.id === activeId)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[900px] h-[700px] max-h-[90vh] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
         <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-gray-200">
                {generatorSettingsType === 'outline' ? '大纲预设界面' : 
                 generatorSettingsType === 'character' ? '角色集预设界面' : 
                 generatorSettingsType === 'worldview' ? '世界观预设界面' : 
                 generatorSettingsType === 'inspiration' ? '灵感预设界面' :
                 generatorSettingsType === 'analysis' ? '分析预设界面' : '优化预设界面'}
             </h3>
             <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
         </div>
         
         <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar: Preset List */}
            <div className={`w-full md:w-48 md:h-auto border-b md:border-r md:border-b-0 border-gray-700 bg-gray-900/50 flex flex-col shrink-0 ${generatorSettingsType === 'optimize' ? 'h-80' : 'h-48'}`}>
               <div className="p-2 border-b border-gray-700">
                  
                  {generatorSettingsType === 'optimize' && (
                      <div className="mb-2 pb-2 border-b border-gray-700 space-y-2">
                          <div 
                            className="flex items-center justify-between text-xs text-gray-300 cursor-pointer p-1.5 hover:bg-gray-800 rounded select-none"
                            onClick={() => setTwoStepOptimization(!twoStepOptimization)}
                          >
                              <span>两阶段优化</span>
                              <div className={`w-7 h-4 rounded-full relative transition-colors ${twoStepOptimization ? 'bg-[var(--theme-color)]' : 'bg-gray-600'}`}>
                                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${twoStepOptimization ? 'left-3.5' : 'left-0.5'}`} />
                              </div>
                          </div>
                          
                          {twoStepOptimization && (
                              <button 
                                onClick={() => setGeneratorSettingsType('analysis')}
                                className="w-full py-1.5 text-xs bg-[var(--theme-color)]/10 hover:bg-[var(--theme-color)]/20 text-[var(--theme-color)] border border-[var(--theme-color)]/30 rounded transition-colors flex items-center justify-center gap-1"
                              >
                                <Settings className="w-3 h-3" /> 配置分析预设
                              </button>
                          )}
                      </div>
                  )}
                  
                  {generatorSettingsType === 'analysis' && (
                      <div className="mb-2 pb-2 border-b border-gray-700">
                          <button 
                            onClick={() => setGeneratorSettingsType('optimize')}
                            className="w-full py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <ArrowLeft className="w-3 h-3" /> 返回优化设置
                          </button>
                      </div>
                  )}

                  <button 
                    onClick={handleImportGeneratorPreset}
                    className="w-full py-1.5 mb-2 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> 导入预设
                  </button>

                  <button 
                    onClick={handleAddNewGeneratorPreset}
                    className="w-full py-1.5 flex items-center justify-center gap-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-xs rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新建预设
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {currentPresets.map(preset => (
                     <div 
                       key={preset.id}
                       onClick={() => setActiveGeneratorPresetId(preset.id)}
                       className={`p-2 rounded text-sm cursor-pointer flex items-center justify-between group transition-colors ${
                          activeId === preset.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                       }`}
                     >
                        <span className="truncate flex-1">{preset.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                               onClick={(e) => { e.stopPropagation(); handleExportGeneratorPreset(preset); }}
                               className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded transition-colors"
                               title="导出预设"
                            >
                               <Download className="w-3.5 h-3.5" />
                            </button>
                            <button 
                               onClick={(e) => { e.stopPropagation(); handleDeleteGeneratorPreset(preset.id); }}
                               className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                               title="删除"
                            >
                               <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

            {/* Main: Edit Area */}
            <div className="flex-1 flex flex-col bg-gray-800 overflow-hidden">
               {!currentPreset ? (
                 <div className="flex-1 flex items-center justify-center text-gray-500">
                    请选择一个预设进行编辑
                 </div>
               ) : (() => {
                  const updatePreset = (updates: Partial<GeneratorPreset>) => {
                      setGeneratorPresets(currentPresets.map(p => p.id === currentPreset.id ? { ...p, ...updates } : p))
                  }

                  const togglePromptEnabled = (index: number) => {
                      const newPrompts = [...currentPreset.prompts]
                      newPrompts[index] = { ...newPrompts[index], enabled: !newPrompts[index].enabled }
                      updatePreset({ prompts: newPrompts })
                  }

                  const addPrompt = () => {
                      const newPrompt: GeneratorPrompt = {
                          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
                          role: 'user',
                          content: '',
                          enabled: true
                      }
                      updatePreset({ prompts: [...currentPreset.prompts, newPrompt] })
                  }

                  const removePrompt = (index: number) => {
                      const newPrompts = currentPreset.prompts.filter((_, i) => i !== index);
                      updatePreset({ prompts: newPrompts });
                  };

                  const handleEditPrompt = (index: number, prompt: GeneratorPrompt) => {
                      setEditingGeneratorPromptIndex(index)
                      setTempEditingPrompt(prompt)
                      setShowGeneratorPromptEditModal(true)
                  }

                  const moveGeneratorPrompt = (fromIndex: number, toIndex: number) => {
                      const newPrompts = [...currentPreset.prompts]
                      const [movedItem] = newPrompts.splice(fromIndex, 1)
                      newPrompts.splice(toIndex, 0, movedItem)
                      updatePreset({ prompts: newPrompts })
                  }

                  const onDragStart = (_e: React.DragEvent, index: number) => {
                      setDraggedPromptIndex(index)
                  }

                  const onDragOver = (e: React.DragEvent, index: number) => {
                      e.preventDefault()
                      if (draggedPromptIndex === null) return
                      if (draggedPromptIndex !== index) {
                          moveGeneratorPrompt(draggedPromptIndex, index)
                          setDraggedPromptIndex(index)
                      }
                  }

                  const onDragEnd = () => {
                      setDraggedPromptIndex(null)
                      setIsDragEnabled(false)
                  }

                  return (
                    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
                       <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-400">预设名称</label>
                          <input 
                             type="text" 
                             value={currentPreset.name}
                             onChange={(e) => updatePreset({ name: e.target.value })}
                             className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
                          />
                       </div>

                       <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-visible mb-4">
                           <button 
                               onClick={() => setShowGeneratorApiConfig(!showGeneratorApiConfig)}
                               className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors bg-gray-900 rounded-lg"
                           >
                               <div className="flex items-center gap-2">
                                   <Settings className="w-4 h-4 text-[var(--theme-color)]" />
                                   <span>独立 API 配置 (可选)</span>
                               </div>
                               {showGeneratorApiConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                           </button>
                           
                           {showGeneratorApiConfig && (
                               <div className="p-4 border-t border-gray-700 space-y-4 bg-gray-800 animate-in slide-in-from-top-2 duration-200 rounded-b-lg">
                                   <div className="space-y-1.5">
                                        <label className="text-xs text-gray-400 font-medium">API Key</label>
                                        <input 
                                            type="password" 
                                            value={currentPreset.apiConfig?.apiKey || ''}
                                            onChange={(e) => updatePreset({ apiConfig: { ...currentPreset.apiConfig, apiKey: e.target.value } })}
                                            placeholder="留空则使用全局设置"
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-gray-200 focus:border-[var(--theme-color)] outline-none placeholder-gray-600"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-gray-400 font-medium">Base URL</label>
                                        <input 
                                            type="text" 
                                            value={currentPreset.apiConfig?.baseUrl || ''}
                                            onChange={(e) => updatePreset({ apiConfig: { ...currentPreset.apiConfig, baseUrl: e.target.value } })}
                                            placeholder="留空则使用全局设置"
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-gray-200 focus:border-[var(--theme-color)] outline-none placeholder-gray-600"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-gray-400 font-medium">Model</label>
                                        <input 
                                            type="text" 
                                            value={currentPreset.apiConfig?.model || ''}
                                            onChange={(e) => updatePreset({ apiConfig: { ...currentPreset.apiConfig, model: e.target.value } })}
                                            placeholder="留空则使用全局/功能默认模型"
                                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-gray-200 focus:border-[var(--theme-color)] outline-none placeholder-gray-600"
                                        />
                                        {currentPreset.apiConfig?.modelList && currentPreset.apiConfig.modelList.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {currentPreset.apiConfig.modelList.map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => updatePreset({ apiConfig: { ...currentPreset.apiConfig, model: m } })}
                                                        className={`px-2 py-1 rounded text-xs border transition-colors ${currentPreset.apiConfig?.model === m ? 'bg-[var(--theme-color)] text-white border-transparent' : 'bg-gray-700 text-gray-300 border-gray-600 hover:border-gray-500 hover:bg-gray-600'}`}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                               </div>
                           )}
                       </div>

                       <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700/50 space-y-4">
                          {[
                             { label: '温度 (Temperature)', value: currentPreset.temperature ?? 1.0, setValue: (v: number) => updatePreset({ temperature: v }), min: 0, max: 2, step: 0.01 },
                             { label: 'Top P', value: currentPreset.topP ?? 1.0, setValue: (v: number) => updatePreset({ topP: v }), min: 0, max: 1, step: 0.01 },
                             { label: 'Top K', value: currentPreset.topK ?? 200, setValue: (v: number) => updatePreset({ topK: v }), min: 0, max: 500, step: 1 },
                          ].map((item) => (
                             <div key={item.label} className="space-y-1">
                                <div className="flex justify-between text-xs text-gray-400">
                                   <span>{item.label}</span>
                                   <span className="bg-gray-900 px-2 py-0.5 rounded border border-gray-700 font-mono">{item.value.toFixed(2)}</span>
                                </div>
                                <input 
                                   type="range" 
                                   min={item.min} 
                                   max={item.max} 
                                   step={item.step} 
                                   value={item.value} 
                                   onChange={(e) => item.setValue(parseFloat(e.target.value))} 
                                   className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[var(--theme-color)]" 
                                />
                             </div>
                          ))}
                       </div>

                       {generatorSettingsType === 'analysis' && (
                           <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 mb-4">
                               <div className="flex justify-between items-center mb-2">
                                   <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                       <Bot className="w-3 h-3"/> 上次分析结果参考
                                   </label>
                               </div>
                               <div className="w-full max-h-32 overflow-y-auto text-xs text-gray-300 font-mono whitespace-pre-wrap custom-scrollbar bg-gray-900 p-2 rounded border border-gray-800">
                                   {analysisResult || '暂无分析记录。'}
                               </div>
                           </div>
                       )}

                       <div className="space-y-4 flex-1 flex flex-col">
                          <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-gray-400">提示词列表 (Prompt Chain)</label>
                              <button onClick={addPrompt} className="text-xs flex items-center gap-1 text-[var(--theme-color)] hover:text-[var(--theme-color-light)]">
                                  <Plus className="w-3 h-3" /> 添加消息
                              </button>
                          </div>
                          
                          <div className="hidden md:block border border-gray-700 rounded-lg overflow-hidden">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-gray-900 text-gray-400 font-medium">
                                      <tr>
                                          <th className="px-4 py-3 w-16 text-center">排序</th>
                                          <th className="px-4 py-3 w-24">角色</th>
                                          <th className="px-4 py-3">内容摘要</th>
                                          <th className="px-4 py-3 w-20 text-center">启用</th>
                                          <th className="px-4 py-3 w-24 text-center">操作</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-700">
                                      {currentPreset.prompts.map((prompt, idx) => (
                                          <tr 
                                            key={prompt.id || idx} 
                                            draggable={isDragEnabled}
                                            onDragStart={(e) => onDragStart(e, idx)}
                                            onDragOver={(e) => onDragOver(e, idx)}
                                            onDragEnd={onDragEnd}
                                            className={`bg-gray-800 hover:bg-gray-750 transition-colors ${draggedPromptIndex === idx ? 'opacity-50' : ''}`}
                                          >
                                              <td className="px-4 py-3 text-center">
                                                  <div className="flex items-center justify-center gap-2">
                                                      <div 
                                                        className="cursor-grab active:cursor-grabbing p-1 text-gray-600 hover:text-gray-400"
                                                        onMouseEnter={() => setIsDragEnabled(true)}
                                                        onMouseLeave={() => setIsDragEnabled(false)}
                                                      >
                                                        <GripVertical className="w-4 h-4" />
                                                      </div>
                                                      <span className="text-gray-500 font-mono text-xs">{idx + 1}</span>
                                                  </div>
                                              </td>
                                              <td className="px-4 py-3">
                                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                                                      prompt.role === 'system' ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)]/30 text-[var(--theme-color)]' :
                                                      prompt.role === 'user' ? 'bg-blue-900/30 border-blue-700 text-blue-300' :
                                                      'bg-green-900/30 border-green-700 text-green-300'
                                                  }`}>
                                                      {prompt.role === 'system' ? 'System' : prompt.role === 'user' ? 'User' : 'Assistant'}
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3">
                                                  <div className="flex flex-col">
                                                      {prompt.name && <span className="text-xs text-[var(--theme-color)] font-bold mb-0.5">{prompt.name}</span>}
                                                      <span className="text-gray-300 line-clamp-1 text-xs opacity-80 font-mono">{prompt.content || '(空)'}</span>
                                                  </div>
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                  <button 
                                                      onClick={() => togglePromptEnabled(idx)}
                                                      className={`bg-transparent transition-colors ${prompt.enabled ? 'text-[var(--theme-color)]' : 'text-gray-600'}`}
                                                  >
                                                      {prompt.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                                  </button>
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                  <div className="flex items-center justify-center gap-2">
                                                      <button 
                                                          onClick={() => handleEditPrompt(idx, prompt)}
                                                          className="bg-transparent p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                                                          title="编辑"
                                                      >
                                                          <Edit2 className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button 
                                                          onClick={() => removePrompt(idx)}
                                                          className="bg-transparent p-1.5 hover:bg-gray-700 rounded text-gray-500 hover:text-red-400 transition-colors"
                                                          title="删除"
                                                      >
                                                          <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>

                          <div className="md:hidden space-y-3">
                              {currentPreset.prompts.map((prompt, idx) => (
                                  <div key={prompt.id || idx} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-3">
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 overflow-hidden">
                                              <span className="text-gray-500 font-mono text-xs shrink-0">#{idx + 1}</span>
                                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${
                                                  prompt.role === 'system' ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)]/30 text-[var(--theme-color)]' :
                                                  prompt.role === 'user' ? 'bg-blue-900/30 border-blue-700 text-blue-300' :
                                                  'bg-green-900/30 border-green-700 text-green-300'
                                              }`}>
                                                  {prompt.role === 'system' ? 'Sys' : prompt.role === 'user' ? 'User' : 'Ast'}
                                              </span>
                                              <span className="text-sm text-gray-200 font-medium truncate">
                                                  {prompt.name || <span className="text-gray-500 italic text-xs">未命名</span>}
                                              </span>
                                          </div>
                                          <button 
                                              onClick={() => togglePromptEnabled(idx)}
                                              className={`p-1.5 rounded transition-colors ${prompt.enabled ? 'text-[var(--theme-color)] bg-[var(--theme-color)]/10' : 'text-gray-500 bg-gray-700/50'}`}
                                          >
                                              {prompt.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                          </button>
                                      </div>
                                      <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                                          <div className="flex items-center gap-1">
                                              <button onClick={() => moveGeneratorPrompt(idx, idx - 1)} disabled={idx === 0} className="p-1.5 bg-gray-700/50 rounded disabled:opacity-30"><ArrowUp className="w-4 h-4"/></button>
                                              <button onClick={() => moveGeneratorPrompt(idx, idx + 1)} disabled={idx === currentPreset.prompts.length - 1} className="p-1.5 bg-gray-700/50 rounded disabled:opacity-30"><ArrowDown className="w-4 h-4"/></button>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <button onClick={() => handleEditPrompt(idx, prompt)} className="px-3 py-1.5 text-gray-300 bg-gray-700/50 rounded text-xs font-medium">编辑</button>
                                              <button onClick={() => removePrompt(idx)} className="px-3 py-1.5 text-red-400 bg-red-900/20 rounded text-xs font-medium">删除</button>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                       </div>
                    </div>
                  )
               })()}
            </div>
         </div>
      </div>

      <GeneratorPromptEditModal
        isOpen={showGeneratorPromptEditModal}
        prompt={tempEditingPrompt}
        onClose={() => {
          setShowGeneratorPromptEditModal(false)
          setTempEditingPrompt(null)
          setEditingGeneratorPromptIndex(null)
        }}
        onSave={handleSaveGeneratorPrompt}
        onUpdatePrompt={(updates) => setTempEditingPrompt(tempEditingPrompt ? { ...tempEditingPrompt, ...updates } : null)}
      />
    </div>
  )
}
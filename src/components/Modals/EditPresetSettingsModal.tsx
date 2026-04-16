import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
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
import React, { useState } from 'react'
import { GeneratorPreset, GeneratorPrompt } from '../../types'
import { GeneratorPromptEditModal } from './GeneratorPromptEditModal'

interface ConfirmState {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
}

interface EditPresetSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  editPresets: GeneratorPreset[]
  setEditPresets: (newPresets: GeneratorPreset[]) => void
  activeEditPresetId: string
  setActiveEditPresetId: (id: string) => void
  handleAddEditPreset: () => void
  handleDeleteEditPreset: (id: string) => void
  handleUpdateEditPreset: (id: string, updates: Partial<GeneratorPreset>) => void
  
  // Sub-modal states
  showEditPresetApiConfig: boolean
  setShowEditPresetApiConfig: (val: boolean) => void
  showEditPresetPromptEditModal: boolean
  setShowEditPresetPromptEditModal: (val: boolean) => void
  editingEditPresetPromptIndex: number | null
  setEditingEditPresetPromptIndex: (val: number | null) => void
  tempEditingEditPresetPrompt: GeneratorPrompt | null
  setTempEditingEditPresetPrompt: (val: GeneratorPrompt | null) => void
  handleSaveEditPresetPrompt: () => void
  
  // Shared UI states
  isDragEnabled: boolean
  setIsDragEnabled: (val: boolean) => void
  draggedEditPresetPromptIndex: number | null
  setDraggedEditPresetPromptIndex: (val: number | null) => void
}

export const EditPresetSettingsModal: React.FC<EditPresetSettingsModalProps> = (props) => {
  const {
    isOpen, onClose, editPresets, setEditPresets, activeEditPresetId, setActiveEditPresetId,
    handleAddEditPreset, handleDeleteEditPreset, handleUpdateEditPreset,
    showEditPresetApiConfig, setShowEditPresetApiConfig,
    showEditPresetPromptEditModal, setShowEditPresetPromptEditModal,
    editingEditPresetPromptIndex, setEditingEditPresetPromptIndex,
    tempEditingEditPresetPrompt, setTempEditingEditPresetPrompt, handleSaveEditPresetPrompt,
    isDragEnabled, setIsDragEnabled, draggedEditPresetPromptIndex, setDraggedEditPresetPromptIndex
  } = props

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  })

  if (!isOpen) return null

  const currentPresets = editPresets
  const activeId = activeEditPresetId
  const currentPreset = currentPresets.find(p => p.id === activeId)

  const handleExportPreset = (preset: GeneratorPreset) => {
    const dataStr = JSON.stringify(preset, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    const exportFileDefaultName = `edit-preset-${preset.name}.json`
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const handleImportPreset = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: any) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const preset = JSON.parse(event.target?.result as string)
          const newPreset = {
            ...preset,
            id: `edit_${Date.now()}_${Math.floor(Math.random() * 1000)}`
          }
          setEditPresets([...currentPresets, newPreset])
          setActiveEditPresetId(newPreset.id)
        } catch (err) {
          console.error('Failed to import preset:', err)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[900px] h-[700px] max-h-[90vh] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
         <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-gray-200">文本编辑预设</h3>
             <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
         </div>
         
         <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar: Preset List */}
            <div className="w-full md:w-48 md:h-auto border-b md:border-r md:border-b-0 border-gray-700 bg-gray-900/50 flex flex-col shrink-0 h-48">
               <div className="p-2 border-b border-gray-700">
                  <button 
                    onClick={handleImportPreset}
                    className="w-full py-1.5 mb-2 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> 导入预设
                  </button>

                  <button 
                    onClick={handleAddEditPreset}
                    className="w-full py-1.5 flex items-center justify-center gap-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-xs rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 新建预设
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {currentPresets.map(preset => (
                     <div 
                       key={preset.id}
                       onClick={() => setActiveEditPresetId(preset.id)}
                       className={`p-2 rounded text-sm cursor-pointer flex items-center justify-between group transition-colors ${
                          activeId === preset.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                       }`}
                     >
                        <span className="truncate flex-1">{preset.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                               onClick={(e) => { e.stopPropagation(); handleExportPreset(preset); }}
                               className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded transition-colors"
                               title="导出预设"
                            >
                               <Download className="w-3.5 h-3.5" />
                            </button>
                            <button 
                               onClick={(e) => { 
                                 e.stopPropagation(); 
                                 setConfirmState({
                                   isOpen: true,
                                   title: '删除预设',
                                   message: `确定要删除预设「${preset.name}」吗？此操作无法撤销。`,
                                   onConfirm: () => {
                                     handleDeleteEditPreset(preset.id);
                                     setConfirmState(prev => ({ ...prev, isOpen: false }));
                                   }
                                 });
                               }}
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
                      handleUpdateEditPreset(currentPreset.id, updates)
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
                      setEditingEditPresetPromptIndex(index)
                      setTempEditingEditPresetPrompt(prompt)
                      setShowEditPresetPromptEditModal(true)
                  }

                  const movePrompt = (fromIndex: number, toIndex: number) => {
                      const newPrompts = [...currentPreset.prompts]
                      const [movedItem] = newPrompts.splice(fromIndex, 1)
                      newPrompts.splice(toIndex, 0, movedItem)
                      updatePreset({ prompts: newPrompts })
                  }

                  const onDragStart = (_e: React.DragEvent, index: number) => {
                      setDraggedEditPresetPromptIndex(index)
                  }

                  const onDragOver = (e: React.DragEvent, index: number) => {
                      e.preventDefault()
                      if (draggedEditPresetPromptIndex === null) return
                      if (draggedEditPresetPromptIndex !== index) {
                          movePrompt(draggedEditPresetPromptIndex, index)
                          setDraggedEditPresetPromptIndex(index)
                      }
                  }

                  const onDragEnd = () => {
                      setDraggedEditPresetPromptIndex(null)
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
                               onClick={() => setShowEditPresetApiConfig(!showEditPresetApiConfig)}
                               className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors bg-gray-900 rounded-lg"
                           >
                               <div className="flex items-center gap-2">
                                   <Settings className="w-4 h-4 text-[var(--theme-color)]" />
                                   <span>独立 API 配置 (可选)</span>
                               </div>
                               {showEditPresetApiConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                           </button>
                           
                           {showEditPresetApiConfig && (
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
                                    </div>
                               </div>
                           )}
                       </div>

                       <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700/50 space-y-4">
                          {[
                             { label: '温度 (Temperature)', value: currentPreset.temperature ?? 0.7, setValue: (v: number) => updatePreset({ temperature: v }), min: 0, max: 2, step: 0.01 },
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

                       <div className="space-y-4 flex-1 flex flex-col">
                          <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-gray-400">提示词列表 (Prompt Chain)</label>
                              <button onClick={addPrompt} className="text-xs flex items-center gap-1 text-[var(--theme-color)] hover:text-[var(--theme-color-light)]">
                                  <Plus className="w-3 h-3" /> 添加消息
                              </button>
                          </div>

                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400">
                              <div className="font-bold mb-1">💡 可用宏</div>
                              <ul className="list-disc list-inside space-y-1">
                                  <li><code className="bg-amber-500/20 px-1 rounded">&#123;&#123;current_chapter&#125;&#125;</code> - 当前章节全部内容</li>
                                  <li><code className="bg-amber-500/20 px-1 rounded">&#123;&#123;current_chapter_title&#125;&#125;</code> - 当前章节标题</li>
                              </ul>
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
                                            className={`bg-gray-800 hover:bg-gray-750 transition-colors ${draggedEditPresetPromptIndex === idx ? 'opacity-50' : ''}`}
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
                                              <button onClick={() => movePrompt(idx, idx - 1)} disabled={idx === 0} className="p-1.5 bg-gray-700/50 rounded disabled:opacity-30"><ArrowUp className="w-4 h-4"/></button>
                                              <button onClick={() => movePrompt(idx, idx + 1)} disabled={idx === currentPreset.prompts.length - 1} className="p-1.5 bg-gray-700/50 rounded disabled:opacity-30"><ArrowDown className="w-4 h-4"/></button>
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
        isOpen={showEditPresetPromptEditModal}
        prompt={tempEditingEditPresetPrompt}
        onClose={() => {
          setShowEditPresetPromptEditModal(false)
          setTempEditingEditPresetPrompt(null)
          setEditingEditPresetPromptIndex(null)
        }}
        onSave={handleSaveEditPresetPrompt}
        onUpdatePrompt={(updates) => setTempEditingEditPresetPrompt(tempEditingEditPresetPrompt ? { ...tempEditingEditPresetPrompt, ...updates } : null)}
      />

      {confirmState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-gray-800 w-full max-w-sm rounded-xl shadow-2xl border border-gray-600 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-700">
              <h3 className="font-bold text-lg text-gray-100">{confirmState.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-sm leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="p-5 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-xl">
              <button 
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-sm"
              >
                取消
              </button>
              <button 
                onClick={confirmState.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-lg transition-all text-sm"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

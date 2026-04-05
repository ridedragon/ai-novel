import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  Eye,
  FilePlus,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Unlink,
  Upload,
  X
} from 'lucide-react'
import React from 'react'
import { Chapter, CompletionPreset, Novel, PromptItem } from '../../types'

interface AdvancedSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  // Preset State & Actions
  completionPresets: CompletionPreset[]
  activePresetId: string
  handlePresetChange: (id: string) => void
  handleImportPreset: () => void
  handleExportPreset: () => void
  handleDeletePreset: () => void
  handleSavePreset: () => void
  handleResetPreset: () => void
  handleOpenRenameModal: () => void
  handleOpenSaveAsModal: () => void
  onOpenPresetNameModal: () => void
  // Parameters
  contextLength: number
  setContextLength: (val: number) => void
  maxReplyLength: number
  setMaxReplyLength: (val: number) => void
  candidateCount: number
  setCandidateCount: (val: number) => void
  stream: boolean
  setStream: (val: boolean) => void
  temperature: number
  setTemperature: (val: number) => void
  frequencyPenalty: number
  setFrequencyPenalty: (val: number) => void
  presencePenalty: number
  setPresencePenalty: (val: number) => void
  topP: number
  setTopP: (val: number) => void
  topK: number
  setTopK: (val: number) => void
  maxRetries: number
  setMaxRetries: (val: number) => void
  // Prompts
  prompts: PromptItem[]
  setPrompts: (prompts: PromptItem[]) => void
  selectedPromptId: number
  setSelectedPromptId: (id: number) => void
  viewMode: 'settings' | 'list'
  setViewMode: (mode: 'settings' | 'list') => void
  // UI Helpers (passed from App to maintain state if needed, or moved here)
  isDragEnabled: boolean
  setIsDragEnabled: (val: boolean) => void
  draggedPromptIndex: number | null
  setDraggedPromptIndex: (val: number | null) => void
  handleDragStart: (e: React.DragEvent, index: number) => void
  handleDragOver: (e: React.DragEvent, index: number) => void
  handleDragEnd: () => void
  handleEditClick: (prompt?: PromptItem) => void
  handleDeletePrompt: () => void
  handleAddNewPrompt: () => void
  handleImportPrompt: () => void
  // Sub-Modals
  showEditModal: boolean
  setShowEditModal: (val: boolean) => void
  editingPrompt: PromptItem | null
  setEditingPrompt: (p: PromptItem | null) => void
  saveEditedPrompt: () => void
  // Context for preview
  activeNovel?: Novel
  activeChapter?: Chapter
  getChapterContext: (n?: Novel, c?: Chapter) => string
  getEffectiveChapterContent: (c?: Chapter) => string
  buildReferenceContext: (n?: Novel, wvId?: any, wvIdx?: any, charId?: any, charIdx?: any, inspId?: any, inspIdx?: any, outId?: any, outIdx?: any) => string
  buildWorldInfoContext: (n?: Novel, id?: any) => string
  selectedWorldviewSetIdForChat: any
  selectedWorldviewIndicesForChat: any
  selectedCharacterSetIdForChat: any
  selectedCharacterIndicesForChat: any
  selectedInspirationSetIdForChat: any
  selectedInspirationIndicesForChat: any
  selectedOutlineSetIdForChat: any
  selectedOutlineIndicesForChat: any
  activeOutlineSetId: any
}

export const AdvancedSettingsModal: React.FC<AdvancedSettingsModalProps> = (props) => {
  const {
    isOpen, onClose, completionPresets, activePresetId, handlePresetChange,
    handleImportPreset, handleExportPreset, handleDeletePreset, handleSavePreset,
    handleResetPreset, handleOpenRenameModal, handleOpenSaveAsModal,
    contextLength, setContextLength, maxReplyLength, setMaxReplyLength,
    candidateCount, setCandidateCount, stream, setStream,
    temperature, setTemperature, frequencyPenalty, setFrequencyPenalty,
    presencePenalty, setPresencePenalty, topP, setTopP, topK, setTopK,
    maxRetries, setMaxRetries, prompts, setPrompts, selectedPromptId, setSelectedPromptId,
    viewMode, setViewMode, isDragEnabled, setIsDragEnabled, draggedPromptIndex, setDraggedPromptIndex,
    handleDragStart, handleDragOver, handleDragEnd, handleEditClick, handleDeletePrompt,
    handleAddNewPrompt, handleImportPrompt, showEditModal, setShowEditModal,
    editingPrompt, setEditingPrompt, saveEditedPrompt,
    onOpenPresetNameModal,
    activeNovel, activeChapter, getChapterContext, getEffectiveChapterContent,
    buildReferenceContext, buildWorldInfoContext,
    selectedWorldviewSetIdForChat, selectedWorldviewIndicesForChat,
    selectedCharacterSetIdForChat, selectedCharacterIndicesForChat,
    selectedInspirationSetIdForChat, selectedInspirationIndicesForChat,
    selectedOutlineSetIdForChat, selectedOutlineIndicesForChat, activeOutlineSetId
  } = props

  const [showPresetDropdown, setShowPresetDropdown] = React.useState(false)
  const selectedPrompt = prompts.find(p => p.id === selectedPromptId) || prompts[0]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[500px] max-h-[90vh] rounded-lg shadow-2xl flex flex-col border border-gray-700 relative">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-900/50 rounded-t-lg shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-pink-500">🚀</span>
            <span className="font-semibold text-gray-200">对话补全源</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSavePreset} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="保存"><Save className="w-4 h-4 text-gray-400" /></button>
            <button
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title={selectedPrompt.isFixed ? "查看内容" : "编辑"}
              onClick={() => handleEditClick()}
            >
              {selectedPrompt.isFixed ? <Eye className="w-4 h-4 text-gray-400" /> : <Edit2 className="w-4 h-4 text-gray-400" />}
            </button>
            <button
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="复制当前提示词"
              onClick={() => {
                const newId = Math.max(...prompts.map(p => p.id), 0) + 1;
                const copiedPrompt = { ...selectedPrompt, id: newId, name: `${selectedPrompt.name} (副本)`, isFixed: false };
                setPrompts([...prompts, copiedPrompt]);
                setSelectedPromptId(newId);
              }}
            >
              <Copy className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-red-400"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {viewMode === 'settings' ? (
             <div className="space-y-4">
                
                {/* Preset Selector */}
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700 space-y-3">
                   <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-200">对话补全预设</span>
                      <div className="flex items-center gap-1">
                         <button
                           className="p-1.5 hover:bg-gray-700 rounded text-gray-400"
                           title="重置为默认预设"
                           onClick={handleResetPreset}
                         >
                           <Unlink className="w-3.5 h-3.5" />
                         </button>
                         <button onClick={handleImportPreset} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="导入"><Upload className="w-3.5 h-3.5" /></button>
                         <button onClick={handleExportPreset} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="导出"><Download className="w-3.5 h-3.5" /></button>
                         <button onClick={handleDeletePreset} className="p-1.5 hover:bg-gray-700 rounded text-red-400" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                   </div>
                   
                   <div className="flex flex-col md:flex-row gap-2 relative">
                      <div className="hidden md:block flex-1 relative">
                         <button 
                           onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                           className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm flex items-center justify-between hover:border-gray-500 transition-colors"
                         >
                           <span className="truncate">{completionPresets.find(p => p.id === activePresetId)?.name || 'Select Preset'}</span>
                           <ChevronDown className="w-4 h-4 text-gray-500" />
                         </button>

                         {showPresetDropdown && (
                           <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                             {completionPresets.map(preset => (
                               <button
                                 key={preset.id}
                                 onClick={() => { handlePresetChange(preset.id); setShowPresetDropdown(false); }}
                                 className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${activePresetId === preset.id ? 'bg-gray-700/50 text-[var(--theme-color-light)]' : 'text-gray-200'}`}
                               >
                                 {preset.name}
                               </button>
                             ))}
                           </div>
                         )}
                      </div>

                      <div className="md:hidden w-full space-y-2 max-h-60 overflow-y-auto border border-gray-700 rounded-lg p-2 bg-gray-900/30 custom-scrollbar">
                         {completionPresets.map(preset => (
                           <button
                             key={preset.id}
                             onClick={() => handlePresetChange(preset.id)}
                             className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors border ${
                                 activePresetId === preset.id 
                                 ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color-light)]' 
                                 : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
                             }`}
                           >
                             <div className="flex items-center justify-between">
                                 <span className="font-medium">{preset.name}</span>
                                 {activePresetId === preset.id && <Check className="w-4 h-4" />}
                             </div>
                           </button>
                         ))}
                      </div>
                      
                      <div className="flex items-center gap-1 justify-end md:justify-start">
                         <button onClick={handleSavePreset} className="p-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 text-gray-400" title="保存预设"><Save className="w-4 h-4" /></button>
                         <button onClick={handleOpenRenameModal} className="p-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 text-gray-400" title="重命名预设"><Edit2 className="w-4 h-4" /></button>
                         <button onClick={handleOpenSaveAsModal} className="p-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 text-gray-400" title="另存为新预设"><FilePlus className="w-4 h-4" /></button>
                      </div>
                   </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked readOnly className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]" />
                        <span className="text-gray-300">解锁上下文长度</span>
                    </div>
                    <span className="text-gray-400 text-xs">AI可见的最大上下文长度</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>上下文长度</span>
                      <span>{contextLength}</span>
                    </div>
                    <input type="range" min="1000" max="500000" value={contextLength} onChange={(e) => setContextLength(parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[var(--theme-color)]" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-gray-400">最大回复长度</label>
                  <input type="number" value={maxReplyLength} onChange={(e) => setMaxReplyLength(parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">每次生成多个备选回复</label>
                  <input type="number" value={candidateCount} onChange={(e) => setCandidateCount(parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                      <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]" />
                      <span className="text-sm font-medium text-gray-300">流式传输</span>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-700">
                  {[
                    { label: '温度', value: temperature, setValue: setTemperature, min: 0, max: 2, step: 0.01 },
                    { label: '频率惩罚', value: frequencyPenalty, setValue: setFrequencyPenalty, min: -2, max: 2, step: 0.01 },
                    { label: '存在惩罚', value: presencePenalty, setValue: setPresencePenalty, min: -2, max: 2, step: 0.01 },
                    { label: 'Top P', value: topP, setValue: setTopP, min: 0, max: 1, step: 0.01 },
                    { label: 'Top K', value: topK, setValue: setTopK, min: 0, max: 500, step: 1 },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{item.label}</span>
                        <span className="bg-gray-900 px-2 py-0.5 rounded border border-gray-700">{item.value.toFixed(2)}</span>
                      </div>
                      <input type="range" min={item.min} max={item.max} step={item.step} value={item.value} onChange={(e) => item.setValue(parseFloat(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[var(--theme-color)]" />
                    </div>
                  ))}

                  <div className="space-y-1 pt-2 border-t border-gray-700">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>失败重试次数</span>
                        <span className="bg-gray-900 px-2 py-0.5 rounded border border-gray-700">{maxRetries}</span>
                    </div>
                    <input type="range" min="0" max="10" step="1" value={maxRetries} onChange={(e) => setMaxRetries(parseInt(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[var(--theme-color)]" />
                  </div>
                </div>
             </div>
          ) : (
             <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 px-2">
                   <span>名称</span>
                   <span>词符</span>
                </div>
                {prompts.map((p, index) => (
                  <div 
                    key={p.id} 
                    draggable={isDragEnabled}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedPromptId(p.id)}
                    className={`flex items-center gap-2 p-2 rounded border transition-colors ${selectedPromptId === p.id ? 'bg-gray-700 border-gray-600' : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600'} ${draggedPromptIndex === index ? 'opacity-50' : ''}`}
                  >
                     <div 
                       className="cursor-grab active:cursor-grabbing p-1 -ml-1"
                       onMouseEnter={() => setIsDragEnabled(true)}
                       onMouseLeave={() => setIsDragEnabled(false)}
                     >
                       <GripVertical className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                     </div>
                     <span className="text-[var(--theme-color)] text-sm">{p.icon}</span>
                     <span className={`text-sm flex-1 truncate ${!p.active ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                       {p.name}
                     </span>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEditClick(p); }}
                          className="bg-transparent p-1 rounded hover:bg-gray-600 text-gray-400"
                          title={p.isFixed ? "查看内容" : "编辑"}
                        >
                           {p.isFixed ? <Eye className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); const newPrompts = [...prompts]; newPrompts[index].active = !newPrompts[index].active; setPrompts(newPrompts); }}
                          className={`bg-transparent p-1 rounded hover:bg-gray-600 ${p.active ? 'text-[var(--theme-color-light)]' : 'text-gray-500'}`}
                          title="启用/禁用 (Switch)"
                        >
                           {p.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (p.isFixed) return;
                            if (prompts.length <= 1) return;
                            const newPrompts = prompts.filter(item => item.id !== p.id);
                            setPrompts(newPrompts);
                            if (selectedPromptId === p.id) {
                              setSelectedPromptId(newPrompts[0]?.id || 0);
                            }
                          }}
                          className={`bg-transparent p-1 rounded hover:bg-gray-600 text-gray-500 hover:text-red-400 ${p.isFixed ? 'opacity-30 cursor-not-allowed' : ''}`}
                          title={p.isFixed ? "固定条目不可删除" : "删除此条目"}
                          disabled={p.isFixed}
                        >
                           <Trash2 className="w-3 h-3" />
                        </button>
                        <span className="text-xs text-gray-500 w-6 text-right">-</span>
                     </div>
                  </div>
                ))}
             </div>
          )}

        </div>

        {/* Bottom Toolbar Area */}
        <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg relative z-20">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>提示词</span>
            <span>总字符数: -</span>
          </div>
          
          <div className="flex items-center gap-2 relative">
            <div className="relative flex-1">
              <button 
                onClick={() => setViewMode(viewMode === 'settings' ? 'list' : 'settings')}
                className="w-full flex items-center justify-between bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-[var(--theme-color)] shrink-0">{selectedPrompt.icon}</span>
                  <span className="truncate">{selectedPrompt.name}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${viewMode === 'list' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <button 
              onClick={handleDeletePrompt}
              disabled={selectedPrompt.isFixed}
              className="p-2 bg-gray-900 border border-gray-700 rounded text-red-400 hover:text-red-300 hover:border-red-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={selectedPrompt.isFixed ? "固定条目不可删除" : "删除当前条目"}
            >
              <X className="w-4 h-4" />
            </button>

            <button onClick={handleImportPrompt} className="p-2 bg-gray-900 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="导入"><Upload className="w-4 h-4" /></button>
            <button onClick={handleExportPreset} className="p-2 bg-gray-900 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="导出"><Download className="w-4 h-4" /></button>
            <button onClick={handleResetPreset} className="p-2 bg-gray-900 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="重置为默认值"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={handleAddNewPrompt} className="p-2 bg-gray-900 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="添加新提示词条目"><Plus className="w-4 h-4" /></button>
            
             <button 
              onClick={() => handleEditClick()}
              className="absolute right-0 bottom-12 p-1.5 bg-gray-700 hover:bg-gray-600 rounded-full shadow text-white transition-colors"
              style={{ right: '-0.5rem', top: '-2.5rem' }}
              title={selectedPrompt.isFixed ? "查看详情" : "编辑详情"}
            >
              {selectedPrompt.isFixed ? <Eye className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Nested Edit Prompt Modal */}
        {showEditModal && editingPrompt && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full md:w-[600px] rounded-lg shadow-2xl border border-gray-600 flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-16 bg-gray-700 rounded overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">{editingPrompt.isFixed ? '查看' : '编辑'}</div>
                  </div>
                  <h2 className="text-xl font-bold text-gray-100">{editingPrompt.isFixed ? '查看内容' : '编辑'}</h2>
                </div>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                {editingPrompt.isFixed && (
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 text-xs text-blue-300 leading-relaxed">
                    <p className="font-bold mb-1">💡 固定条目说明：</p>
                    <p>此条目的内容是根据当前小说状态动态生成的，不可手动修改。下方显示的是当前将要发送给 AI 的内容预览。</p>
                  </div>
                )}
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-sm font-medium text-gray-300">姓名</label>
                     <input 
                       type="text" 
                       value={editingPrompt.name}
                       onChange={(e) => setEditingPrompt({...editingPrompt, name: e.target.value})}
                       className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none disabled:opacity-50"
                       placeholder="此提示词的名称"
                       disabled={editingPrompt.isFixed}
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-sm font-medium text-gray-300">角色</label>
                     <select 
                        value={editingPrompt.role}
                        onChange={(e) => setEditingPrompt({...editingPrompt, role: e.target.value as any})}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none disabled:opacity-50"
                        disabled={editingPrompt.isFixed}
                     >
                       <option value="system">系统</option>
                       <option value="user">用户</option>
                       <option value="assistant">助手</option>
                     </select>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-sm font-medium text-gray-300">位置</label>
                     <select 
                        value={editingPrompt.position}
                        onChange={(e) => setEditingPrompt({...editingPrompt, position: e.target.value as any})}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none disabled:opacity-50"
                        disabled={editingPrompt.isFixed}
                     >
                       <option value="relative">相对</option>
                       <option value="absolute">绝对</option>
                     </select>
                   </div>
                   <div className="space-y-1">
                     <label className="text-sm font-medium text-gray-300">触发器</label>
                     <select 
                        value={editingPrompt.trigger}
                        onChange={(e) => setEditingPrompt({...editingPrompt, trigger: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none disabled:opacity-50"
                        disabled={editingPrompt.isFixed}
                     >
                       <option value="All types (default)">All types (default)</option>
                     </select>
                   </div>
                 </div>

                 <div className="space-y-1">
                   <label className="text-sm font-medium text-gray-300">提示词</label>
                   <textarea
                     value={editingPrompt.isFixed ? (() => {
                       if (editingPrompt.fixedType === 'chat_history') {
                         const context = getChapterContext(activeNovel, activeChapter)
                         const currentContent = getEffectiveChapterContent(activeChapter)
                         const fullHistory = activeChapter ? `${context}### ${activeChapter.title}\n${currentContent}` : "(暂无历史记录)"
                         return fullHistory.length > contextLength ? "... (内容过长已截断)\n" + fullHistory.slice(-contextLength) : fullHistory
                       }
                       if (editingPrompt.fixedType === 'world_info') return buildReferenceContext(activeNovel, selectedWorldviewSetIdForChat, selectedWorldviewIndicesForChat, selectedCharacterSetIdForChat, selectedCharacterIndicesForChat, selectedInspirationSetIdForChat, selectedInspirationIndicesForChat, selectedOutlineSetIdForChat, selectedOutlineIndicesForChat) || buildWorldInfoContext(activeNovel, activeOutlineSetId) || "(暂无设定内容)"
                       if (editingPrompt.fixedType === 'outline') {
                          const set = activeNovel?.outlineSets?.find(s => s.id === activeOutlineSetId)
                          if (set && set.items.length > 0) {
                              return `【当前小说大纲策划】：\n` + set.items.map((item, idx) => `${idx + 1}. ${item.title}: ${item.summary}`).join('\n')
                          }
                          return "(暂无大纲内容)"
                       }
                       return ""
                     })() : editingPrompt.content}
                     onChange={(e) => !editingPrompt.isFixed && setEditingPrompt({...editingPrompt, content: e.target.value})}
                     className="w-full h-48 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none font-mono disabled:text-gray-400"
                     placeholder="要发送的提示词..."
                     readOnly={editingPrompt.isFixed}
                   />
                 </div>
              </div>

              <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-lg">
                 <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">取消</button>
                 {!editingPrompt.isFixed && (
                   <button onClick={saveEditedPrompt} className="px-4 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-sm rounded transition-colors flex items-center gap-2">
                     <Save className="w-4 h-4" /> 保存
                   </button>
                 )}
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  )
}
import React, { useState, useEffect } from 'react'
import { 
  Book, Plus, Trash2, Edit3, Settings, 
  GripVertical, ArrowUp, ArrowDown, Bot, 
  PlayCircle, StopCircle, Loader2, ChevronDown, 
  Folder, FileText, Check, X, MoreVertical
} from 'lucide-react'
import { Novel, OutlineSet, OutlineItem } from '../types'

interface OutlineManagerProps {
  novel: Novel
  activeOutlineSetId: string | null
  onSetActiveOutlineSetId: (id: string | null) => void
  onUpdateNovel: (updatedNovel: Novel) => void
  onStartAutoWrite: () => void
  isAutoWriting: boolean
  autoWriteStatus: string
  onStopAutoWrite: () => void
  includeFullOutlineInAutoWrite: boolean
  setIncludeFullOutlineInAutoWrite: (val: boolean) => void
  // Helper for generating outline content via AI
  onGenerateOutline?: () => void
  isGenerating?: boolean
  userPrompt?: string
  setUserPrompt?: (val: string) => void
  onShowSettings?: () => void
  modelName?: string
  sidebarHeader?: React.ReactNode
}

export const OutlineManager: React.FC<OutlineManagerProps> = ({
  novel,
  activeOutlineSetId,
  onSetActiveOutlineSetId,
  onUpdateNovel,
  onStartAutoWrite,
  isAutoWriting,
  autoWriteStatus,
  onStopAutoWrite,
  includeFullOutlineInAutoWrite,
  setIncludeFullOutlineInAutoWrite,
  onGenerateOutline,
  isGenerating,
  userPrompt,
  setUserPrompt,
  onShowSettings,
  modelName,
  sidebarHeader
}) => {
  const [newSetName, setNewSetName] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editSetName, setEditSetName] = useState('')
  
  // Chapter Drag & Drop
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
  
  // Chapter Editing
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null)
  const [editChapterTitle, setEditChapterTitle] = useState('')
  const [editChapterSummary, setEditChapterSummary] = useState('')

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  })

  const activeSet = novel.outlineSets?.find(s => s.id === activeOutlineSetId)

  // --- Set Management ---

  const handleAddSet = () => {
    if (!newSetName.trim()) return
    const newSet: OutlineSet = {
      id: crypto.randomUUID(),
      name: newSetName.trim(),
      items: []
    }
    const updatedSets = [...(novel.outlineSets || []), newSet]
    onUpdateNovel({ ...novel, outlineSets: updatedSets })
    setNewSetName('')
    onSetActiveOutlineSetId(newSet.id)
  }

  const handleDeleteSet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmState({
      isOpen: true,
      title: '删除大纲',
      message: '确定要删除这个大纲文件吗？无法恢复。',
      onConfirm: () => {
        const updatedSets = (novel.outlineSets || []).filter(s => s.id !== id)
        onUpdateNovel({ ...novel, outlineSets: updatedSets })
        if (activeOutlineSetId === id) {
          onSetActiveOutlineSetId(updatedSets.length > 0 ? updatedSets[0].id : null)
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const startRenameSet = (set: OutlineSet, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSetId(set.id)
    setEditSetName(set.name)
  }

  const confirmRenameSet = () => {
    if (!editingSetId || !editSetName.trim()) return
    const updatedSets = (novel.outlineSets || []).map(s => 
      s.id === editingSetId ? { ...s, name: editSetName.trim() } : s
    )
    onUpdateNovel({ ...novel, outlineSets: updatedSets })
    setEditingSetId(null)
  }

  // --- Chapter Management ---

  const updateItems = (newItems: OutlineItem[]) => {
    if (!activeSet) return
    const updatedSets = (novel.outlineSets || []).map(s => 
      s.id === activeSet.id ? { ...s, items: newItems } : s
    )
    onUpdateNovel({ ...novel, outlineSets: updatedSets })
  }

  const handleAddItem = () => {
    if (!activeSet) return
    const newItem: OutlineItem = { title: '新章节', summary: '' }
    updateItems([...activeSet.items, newItem])
    // Scroll to bottom or focus new item could be added here
  }

  const handleDeleteItem = (index: number) => {
    if (!activeSet) return
    setConfirmState({
      isOpen: true,
      title: '删除章节',
      message: '确定删除此章节规划吗？',
      onConfirm: () => {
        if (!activeSet) return
        const newItems = [...activeSet.items]
        newItems.splice(index, 1)
        updateItems(newItems)
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const handleMoveItem = (fromIndex: number, toIndex: number) => {
    if (!activeSet) return
    if (toIndex < 0 || toIndex >= activeSet.items.length) return
    
    const newItems = [...activeSet.items]
    const [moved] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, moved)
    updateItems(newItems)
  }

  // Drag Handlers
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Create a ghost image if needed, or let browser handle it
  }

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItemIndex === null || draggedItemIndex === index) return
    handleMoveItem(draggedItemIndex, index)
    setDraggedItemIndex(index)
  }

  const onDragEnd = () => {
    setDraggedItemIndex(null)
  }

  // Edit Chapter Modal
  const openEditChapter = (index: number, item: OutlineItem) => {
    setEditingChapterIndex(index)
    setEditChapterTitle(item.title)
    setEditChapterSummary(item.summary)
  }

  const saveEditChapter = () => {
    if (editingChapterIndex === null || !activeSet) return
    const newItems = [...activeSet.items]
    newItems[editingChapterIndex] = {
      title: editChapterTitle,
      summary: editChapterSummary
    }
    updateItems(newItems)
    setEditingChapterIndex(null)
  }

  return (
    <div className="flex flex-col md:flex-row h-full bg-gray-900 text-gray-100 overflow-hidden">
      
      {/* Sidebar: Set List */}
      <div className="w-full md:w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 h-48 md:h-auto">
        {sidebarHeader ? (
          <div className="p-4 border-b border-gray-700 shrink-0">
            {sidebarHeader}
          </div>
        ) : (
          <div className="p-4 border-b border-gray-700 flex items-center justify-between shrink-0">
            <h3 className="font-bold flex items-center gap-2 text-gray-200">
              <Book className="w-5 h-5 text-[var(--theme-color)]" />
              <span>大纲文件</span>
            </h3>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {novel.outlineSets?.map(set => (
            <div 
              key={set.id}
              onClick={() => onSetActiveOutlineSetId(set.id)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                activeOutlineSetId === set.id 
                  ? 'bg-[var(--theme-color)] text-white shadow-md' 
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {editingSetId === set.id ? (
                <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                  <input 
                    className="flex-1 bg-gray-900 text-white text-sm rounded px-2 py-1 outline-none border border-[var(--theme-color)]"
                    value={editSetName}
                    onChange={e => setEditSetName(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if(e.key === 'Enter') confirmRenameSet()
                      if(e.key === 'Escape') setEditingSetId(null)
                    }}
                    onBlur={confirmRenameSet}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Folder className={`w-4 h-4 shrink-0 ${activeOutlineSetId === set.id ? 'text-white' : 'text-gray-500'}`} />
                    <span className="truncate text-sm font-medium">{set.name}</span>
                  </div>
                  
                  <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activeOutlineSetId === set.id ? 'text-white' : 'text-gray-400'}`}>
                    <button 
                      onClick={(e) => startRenameSet(set, e)}
                      className="p-1 hover:bg-white/20 rounded"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteSet(set.id, e)}
                      className="p-1 hover:bg-white/20 rounded hover:text-red-200"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {(!novel.outlineSets || novel.outlineSets.length === 0) && (
            <div className="text-center py-8 text-gray-500 text-xs italic">
              暂无大纲文件，请新建
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <div className="flex gap-2">
            <input 
              value={newSetName}
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddSet()}
              placeholder="新大纲名称..."
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm focus:border-[var(--theme-color)] outline-none transition-colors"
            />
            <button 
              onClick={handleAddSet}
              disabled={!newSetName.trim()}
              className="p-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0 h-full overflow-hidden relative">
        {activeSet ? (
          <>
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/50 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 backdrop-blur-sm sticky top-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <h2 className="text-xl font-bold text-gray-100 truncate">{activeSet.name}</h2>
                <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">
                  {activeSet.items.length} 章
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-700 rounded-lg p-0.5 mr-2">
                   {onShowSettings && (
                     <button 
                        onClick={onShowSettings} 
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white rounded-md hover:bg-gray-600 transition-colors"
                     >
                        <Settings className="w-3.5 h-3.5" />
                        <span>{modelName || '设置'}</span>
                     </button>
                   )}
                </div>

                <button 
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">手动添加章节</span>
                </button>
              </div>
            </div>

            {/* AI Generation Input */}
            {onGenerateOutline && (
              <div className="p-4 bg-gray-800/30 border-b border-gray-700/50">
                 <div className="max-w-4xl mx-auto flex gap-3">
                    <div className="flex-1 relative">
                       <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-color)]" />
                       <input 
                          type="text" 
                          value={userPrompt || ''}
                          onChange={(e) => setUserPrompt && setUserPrompt(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onGenerateOutline()}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                          placeholder="AI 助手：描述你的大纲需求，例如'第一卷主要讲述主角觉醒的过程'..."
                       />
                    </div>
                    <button 
                       onClick={isGenerating ? undefined : onGenerateOutline}
                       disabled={isGenerating}
                       className={`px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg ${isGenerating ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white'}`}
                    >
                       {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                       {isGenerating ? '生成中...' : '生成大纲'}
                    </button>
                 </div>
              </div>
            )}

            {/* Chapter List (Cards) */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-4 pb-24">
                {activeSet.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500 border-2 border-dashed border-gray-700/50 rounded-xl bg-gray-800/20">
                    <Book className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-400">大纲为空</p>
                    <p className="text-sm mt-2">请手动添加章节，或使用上方的 AI 助手生成</p>
                  </div>
                ) : (
                  activeSet.items.map((item, idx) => (
                    <div 
                      key={idx}
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={onDragEnd}
                      onClick={() => openEditChapter(idx, item)}
                      className={`relative bg-gray-800 border border-gray-700 rounded-xl p-4 md:p-5 hover:border-[var(--theme-color)] hover:shadow-lg transition-all cursor-pointer group ${draggedItemIndex === idx ? 'opacity-40 ring-2 ring-[var(--theme-color)]' : ''}`}
                    >
                      {/* Drag Handle */}
                      <div 
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity md:flex hidden"
                        onClick={e => e.stopPropagation()}
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>

                      <div className="flex items-start gap-4 md:pl-8">
                        <div className="w-8 h-8 rounded-full bg-gray-900/80 border border-gray-700 flex items-center justify-center text-sm font-bold text-gray-400 shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                             <h4 className="text-base md:text-lg font-bold text-gray-200 mb-2 truncate pr-8">{item.title}</h4>
                             
                             {/* Mobile Actions Menu could go here, for now using direct buttons */}
                          </div>
                          <p className="text-sm text-gray-400 leading-relaxed line-clamp-3 md:line-clamp-2">{item.summary || <span className="italic opacity-50">点击添加摘要...</span>}</p>
                        </div>
                      </div>

                      {/* Hover Actions */}
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/90 rounded-lg shadow-sm border border-gray-700/50 p-1" onClick={e => e.stopPropagation()}>
                         <button 
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
                            title="上移"
                         >
                            <ArrowUp className="w-4 h-4" />
                         </button>
                         <button 
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            disabled={idx === activeSet.items.length - 1}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
                            title="下移"
                         >
                            <ArrowDown className="w-4 h-4" />
                         </button>
                         <div className="w-px h-4 bg-gray-600 mx-1"></div>
                         <button 
                            onClick={() => handleDeleteItem(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                            title="删除"
                         >
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Auto Write Footer Panel */}
            <div className="border-t border-gray-700 bg-gray-800 p-4 md:p-6 z-20">
               <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-6">
                  <div className="flex-1 space-y-2 w-full">
                     <h3 className="font-bold flex items-center gap-2 text-gray-200">
                        <Bot className="w-5 h-5 text-purple-500" />
                        自动化写作
                     </h3>
                     
                     <div 
                        className="flex items-center gap-3 cursor-pointer group"
                        onClick={() => setIncludeFullOutlineInAutoWrite(!includeFullOutlineInAutoWrite)}
                     >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${includeFullOutlineInAutoWrite ? 'bg-[var(--theme-color)] border-[var(--theme-color)]' : 'border-gray-500 bg-transparent'}`}>
                           {includeFullOutlineInAutoWrite && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className="text-sm text-gray-400 group-hover:text-gray-300 select-none">
                           在生成时附带完整大纲作为全局参考
                        </span>
                     </div>
                  </div>

                  <div className="w-full md:w-auto">
                     {isAutoWriting ? (
                        <div className="flex items-center gap-3 bg-gray-900 border border-purple-500/30 rounded-xl px-4 py-3 min-w-[300px]">
                           <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                           <div className="flex-1 min-w-0">
                              <div className="text-xs text-purple-400 font-medium mb-0.5">正在创作</div>
                              <div className="text-sm text-gray-200 truncate max-w-[200px]">{autoWriteStatus}</div>
                           </div>
                           <button 
                              onClick={onStopAutoWrite}
                              className="p-2 hover:bg-red-900/30 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                              title="停止"
                           >
                              <StopCircle className="w-5 h-5" />
                           </button>
                        </div>
                     ) : (
                        <button 
                           onClick={onStartAutoWrite}
                           disabled={activeSet.items.length === 0}
                           className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-purple-500/20"
                        >
                           <PlayCircle className="w-5 h-5" />
                           <span>开始全自动创作</span>
                        </button>
                     )}
                  </div>
               </div>
            </div>

          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
            <Book className="w-24 h-24 mb-6 opacity-10" />
            <h2 className="text-xl font-bold text-gray-400 mb-2">请选择一个大纲文件</h2>
            <p className="text-sm">在左侧列表选择或创建一个新的大纲文件以开始规划</p>
          </div>
        )}

        {/* Edit Modal */}
        {editingChapterIndex !== null && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="bg-gray-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-600 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center">
                   <h3 className="font-bold text-lg text-gray-100">编辑章节大纲</h3>
                   <button onClick={() => setEditingChapterIndex(null)} className="text-gray-400 hover:text-white">
                      <X className="w-6 h-6" />
                   </button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                   <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-400">章节标题</label>
                      <input 
                         value={editChapterTitle}
                         onChange={e => setEditChapterTitle(e.target.value)}
                         className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-[var(--theme-color)] outline-none"
                         placeholder="输入标题..."
                         autoFocus
                      />
                   </div>
                   
                   <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-400">剧情摘要</label>
                      <textarea 
                         value={editChapterSummary}
                         onChange={e => setEditChapterSummary(e.target.value)}
                         className="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none font-mono"
                         placeholder="输入本章详细剧情..."
                      />
                   </div>
                </div>

                <div className="p-5 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-xl">
                   <button 
                      onClick={() => setEditingChapterIndex(null)}
                      className="px-5 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                   >
                      取消
                   </button>
                   <button 
                      onClick={saveEditChapter}
                      className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white font-medium rounded-lg shadow-lg transition-all"
                   >
                      保存修改
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmState.isOpen && (
          <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
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
    </div>
  )
}

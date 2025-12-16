import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Edit3,
  FileText,
  Folder,
  Globe,
  Loader2,
  Plus,
  Settings,
  StopCircle,
  Trash2,
  X
} from 'lucide-react'
import React, { useState } from 'react'
import { Novel, WorldviewItem, WorldviewSet, CharacterSet, OutlineSet } from '../types'

interface WorldviewManagerProps {
  novel: Novel
  activeWorldviewSetId: string | null
  onSetActiveWorldviewSetId: (id: string | null) => void
  onUpdateNovel: (updatedNovel: Novel) => void
  
  // AI Generation Props
  onGenerateWorldview?: () => void
  isGenerating?: boolean
  userPrompt?: string
  setUserPrompt?: (val: string) => void
  onStopGeneration?: () => void
  onShowSettings?: () => void
  modelName?: string
  sidebarHeader?: React.ReactNode
}

export const WorldviewManager: React.FC<WorldviewManagerProps> = ({
  novel,
  activeWorldviewSetId,
  onSetActiveWorldviewSetId,
  onUpdateNovel,
  onGenerateWorldview,
  isGenerating,
  userPrompt,
  setUserPrompt,
  onStopGeneration,
  onShowSettings,
  modelName,
  sidebarHeader
}) => {
  // Local State for Set Management
  const [newSetName, setNewSetName] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editSetName, setEditSetName] = useState('')
  
  // Local State for Mobile Sidebar
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)

  // Local State for Entry Editing
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null)
  const [editEntryItem, setEditEntryItem] = useState('')
  const [editEntrySetting, setEditEntrySetting] = useState('')

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

  const activeSet = novel.worldviewSets?.find(s => s.id === activeWorldviewSetId)

  // --- Set Management Helpers ---

  const handleAddSet = () => {
    if (!newSetName.trim()) return
    
    const newId = crypto.randomUUID()
    const name = newSetName.trim()

    const newWorldviewSet: WorldviewSet = {
      id: newId,
      name: name,
      entries: []
    }
    
    const newCharacterSet: CharacterSet = {
        id: newId,
        name: name,
        characters: []
    }

    const newOutlineSet: OutlineSet = {
        id: newId,
        name: name,
        items: []
    }

    const updatedWorldviewSets = [...(novel.worldviewSets || []), newWorldviewSet]
    const updatedCharacterSets = [...(novel.characterSets || []), newCharacterSet]
    const updatedOutlineSets = [...(novel.outlineSets || []), newOutlineSet]
    
    onUpdateNovel({ 
        ...novel, 
        worldviewSets: updatedWorldviewSets,
        characterSets: updatedCharacterSets,
        outlineSets: updatedOutlineSets
    })
    
    setNewSetName('')
    onSetActiveWorldviewSetId(newId)
  }

  const handleDeleteSet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmState({
      isOpen: true,
      title: '删除世界观文件',
      message: '确定要删除这个世界观文件吗？里面的所有设定都会被删除。',
      onConfirm: () => {
        const updatedSets = (novel.worldviewSets || []).filter(s => s.id !== id)
        onUpdateNovel({ ...novel, worldviewSets: updatedSets })
        if (activeWorldviewSetId === id) {
          onSetActiveWorldviewSetId(updatedSets.length > 0 ? updatedSets[0].id : null)
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const startRenameSet = (set: WorldviewSet, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSetId(set.id)
    setEditSetName(set.name)
  }

  const confirmRenameSet = () => {
    if (!editingSetId || !editSetName.trim()) return
    const updatedSets = (novel.worldviewSets || []).map(s => 
      s.id === editingSetId ? { ...s, name: editSetName.trim() } : s
    )
    onUpdateNovel({ ...novel, worldviewSets: updatedSets })
    setEditingSetId(null)
  }

  // --- Entry Management Helpers ---

  const updateEntries = (newEntries: WorldviewItem[]) => {
    if (!activeSet) return
    const updatedSets = (novel.worldviewSets || []).map(s => 
      s.id === activeSet.id ? { ...s, entries: newEntries } : s
    )
    onUpdateNovel({ ...novel, worldviewSets: updatedSets })
  }

  const handleAddEntry = () => {
    if (!activeSet) return
    const newEntry: WorldviewItem = { item: '新设定', setting: '' }
    updateEntries([...activeSet.entries, newEntry])
    // Optionally open edit modal immediately
    const newIndex = activeSet.entries.length
    setSelectedEntryIndex(newIndex)
    setEditEntryItem('新设定')
    setEditEntrySetting('')
  }

  const handleDeleteEntry = (index: number) => {
    if (!activeSet) return
    const newEntries = [...activeSet.entries]
    newEntries.splice(index, 1)
    updateEntries(newEntries)
  }

  const openEditEntry = (index: number, entry: WorldviewItem) => {
    setSelectedEntryIndex(index)
    setEditEntryItem(entry.item)
    setEditEntrySetting(entry.setting)
  }

  const saveEditEntry = () => {
    if (selectedEntryIndex === null || !activeSet) return
    const newEntries = [...activeSet.entries]
    newEntries[selectedEntryIndex] = {
      item: editEntryItem,
      setting: editEntrySetting
    }
    updateEntries(newEntries)
    setSelectedEntryIndex(null)
  }

  const updateUserNotes = (notes: string) => {
    if (!activeSet) return
    const updatedSets = (novel.worldviewSets || []).map(s => 
      s.id === activeSet.id ? { ...s, userNotes: notes } : s
    )
    onUpdateNovel({ ...novel, worldviewSets: updatedSets })
  }

  return (
    <div className="w-full flex flex-col md:flex-row h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Sidebar: Set List */}
      <div className={`w-full md:w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 transition-all duration-300 ${isMobileListOpen ? 'h-auto max-h-[60vh]' : 'h-auto'} md:h-auto`}>
        {sidebarHeader && (
          <div className="p-3 md:p-4 border-b border-gray-700 shrink-0">
            {sidebarHeader}
          </div>
        )}

        {/* Title / Mobile Toggle */}
        <div 
          className="p-3 md:p-4 border-b border-gray-700 flex items-center justify-between shrink-0 cursor-pointer md:cursor-default hover:bg-gray-700/30 md:hover:bg-transparent transition-colors"
          onClick={() => setIsMobileListOpen(!isMobileListOpen)}
        >
          <h3 className="font-bold flex items-center gap-2 text-gray-200">
            <Globe className="w-5 h-5 text-[var(--theme-color)]" />
            <span>世界观文件列表</span>
            <span className="md:hidden text-xs text-gray-500 font-normal ml-2">
              ({novel.worldviewSets?.length || 0})
            </span>
          </h3>
          <div className="md:hidden text-gray-400">
             <ChevronDown className={`w-4 h-4 transition-transform ${isMobileListOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* List Content */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isMobileListOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
           <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {novel.worldviewSets?.map(set => (
                <div 
                  key={set.id}
                  onClick={() => {
                     onSetActiveWorldviewSetId(set.id)
                     if (window.innerWidth < 768) setIsMobileListOpen(false)
                  }}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    activeWorldviewSetId === set.id 
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
                           <Folder className={`w-4 h-4 shrink-0 ${activeWorldviewSetId === set.id ? 'text-white' : 'text-gray-500'}`} />
                           <span className="truncate text-sm font-medium">{set.name}</span>
                        </div>
                        
                        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activeWorldviewSetId === set.id ? 'text-white' : 'text-gray-400'}`}>
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
              {(!novel.worldviewSets || novel.worldviewSets.length === 0) && (
                 <div className="text-center py-8 text-gray-500 text-xs italic">
                    暂无世界观文件，请新建
                 </div>
              )}
           </div>

           <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
              <div className="flex gap-2">
                 <input 
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSet()}
                    placeholder="新世界观名称..."
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
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0 h-full overflow-hidden relative">
         {activeSet ? (
            <>
               {/* Toolbar */}
               <div className="p-3 md:p-4 border-b border-gray-700 bg-gray-800/50 flex flex-wrap items-center justify-between gap-3 md:gap-4 shrink-0 z-10 backdrop-blur-sm sticky top-0">
                  <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                     <h2 className="text-lg md:text-xl font-bold text-gray-100 truncate">{activeSet.name}</h2>
                     <span className="bg-gray-700 text-gray-400 text-[10px] md:text-xs px-2 py-0.5 rounded-full shrink-0">
                        {activeSet.entries.length} 条设定
                     </span>
                  </div>

                  <div className="flex items-center gap-1 md:gap-2">
                     <div className="flex items-center bg-gray-700 rounded-lg p-0.5 mr-1 md:mr-2">
                        {onShowSettings && (
                           <button 
                              onClick={onShowSettings} 
                              className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs text-gray-300 hover:text-white rounded-md hover:bg-gray-600 transition-colors"
                           >
                              <Settings className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="hidden md:inline">{modelName || '设置'}</span>
                           </button>
                        )}
                     </div>

                     <button 
                        onClick={handleAddEntry}
                        className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs md:text-sm rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
                     >
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">手动添加设定</span>
                        <span className="md:hidden">添加</span>
                     </button>
                  </div>
               </div>

               {/* AI Generation Input */}
               {onGenerateWorldview && (
                  <div className="p-3 md:p-4 bg-gray-800/30 border-b border-gray-700/50">
                     <div className="max-w-4xl mx-auto space-y-2">
                        <div className="flex gap-2 md:gap-3">
                           <div className="flex-1 relative">
                              <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-[var(--theme-color)]" />
                              <input 
                                 type="text" 
                                 value={userPrompt || ''}
                                 onChange={(e) => setUserPrompt && setUserPrompt(e.target.value)}
                                 onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onGenerateWorldview()}
                                 className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-xs md:text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                                 placeholder="AI 助手：描述你的世界观需求 (如：赛博朋克风格的社会阶层)..."
                              />
                           </div>
                           {isGenerating ? (
                              <button 
                                 onClick={onStopGeneration}
                                 className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-red-600 hover:bg-red-700 text-white"
                              >
                                 <StopCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                 <span className="hidden md:inline">停止</span>
                              </button>
                           ) : (
                              <button 
                                 onClick={onGenerateWorldview}
                                 className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white"
                              >
                                 <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                 <span className="hidden md:inline">生成设定</span>
                                 <span className="md:hidden">生成</span>
                              </button>
                           )}
                        </div>
                     </div>
                  </div>
               )}

               {/* Content Area */}
               <div className="flex-1 overflow-y-auto p-2 md:p-8 custom-scrollbar flex flex-col min-h-0">
                  <div className="max-w-4xl mx-auto w-full space-y-4 pb-8">
                     {/* User Notes Area */}
                     <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-2">
                           <FileText className="w-3 h-3" />
                           <span>用户输入记录 & 设定上下文 (AI 生成时会参考此内容)</span>
                        </div>
                        <textarea 
                           value={activeSet.userNotes || ''}
                           onChange={(e) => updateUserNotes(e.target.value)}
                           className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-xs md:text-sm text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none transition-all focus:bg-gray-900 focus:h-48 placeholder-gray-500 font-mono"
                           placeholder="用户的指令历史将自动记录在此处...&#10;你也可以手动添加关于这组世界观的全局设定、注意事项等。&#10;这些内容将作为上下文发送给 AI。"
                        />
                     </div>

                     {/* Entries Grid/List */}
                     {activeSet.entries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 md:py-20 text-gray-500 border-2 border-dashed border-gray-700/50 rounded-xl bg-gray-800/20">
                           <Globe className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-20" />
                           <p className="text-base md:text-lg font-medium text-gray-400">暂无设定</p>
                           <p className="text-xs md:text-sm mt-1">请手动添加设定，或使用上方的 AI 助手生成</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-1 gap-3 md:gap-4">
                           {activeSet.entries.map((entry, idx) => (
                              <div 
                                 key={idx}
                                 onClick={() => openEditEntry(idx, entry)}
                                 className="bg-gray-800 border border-gray-700 rounded-lg md:rounded-xl p-3 md:p-4 hover:border-[var(--theme-color)] hover:shadow-lg transition-all cursor-pointer group flex flex-col relative"
                              >
                                 <div className="flex items-start gap-3 md:gap-4">
                                    <div className="p-2 bg-gray-900/50 rounded-lg text-[var(--theme-color)] shrink-0 mt-0.5">
                                       <Globe className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                       <div className="flex justify-between items-start mb-1">
                                          <h4 className="font-bold text-gray-200 text-sm md:text-lg truncate pr-8">{entry.item || '未命名设定'}</h4>
                                       </div>
                                       <p className="text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                                          {entry.setting || <span className="italic opacity-50">点击添加详细设定...</span>}
                                       </p>
                                    </div>
                                 </div>

                                 <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteEntry(idx); }}
                                    className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="删除设定"
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
               <Globe className="w-24 h-24 mb-6 opacity-10" />
               <h2 className="text-xl font-bold text-gray-400 mb-2">请选择一个世界观文件</h2>
               <p className="text-sm">在左侧列表选择或创建一个新的文件</p>
            </div>
         )}

         {/* Edit Modal */}
         {selectedEntryIndex !== null && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-gray-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-600 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                  <div className="p-5 border-b border-gray-700 flex justify-between items-center">
                     <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[var(--theme-color)]" />
                        <h3 className="font-bold text-lg text-gray-100">编辑设定详情</h3>
                     </div>
                     <button onClick={() => setSelectedEntryIndex(null)} className="text-gray-400 hover:text-white">
                        <X className="w-6 h-6" />
                     </button>
                  </div>
                  
                  <div className="p-6 space-y-5 overflow-y-auto">
                     <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">设定项名称</label>
                        <input 
                           value={editEntryItem}
                           onChange={e => setEditEntryItem(e.target.value)}
                           className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-base focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                           placeholder="输入设定项名称 (如：地理环境)..."
                           autoFocus
                        />
                     </div>
                     
                     <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">详细设定内容</label>
                        <textarea 
                           value={editEntrySetting}
                           onChange={e => setEditEntrySetting(e.target.value)}
                           className="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none font-mono"
                           placeholder="输入详细的设定内容..."
                        />
                     </div>
                  </div>

                  <div className="p-5 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-xl">
                     <button 
                        onClick={() => setSelectedEntryIndex(null)}
                        className="px-5 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                     >
                        取消
                     </button>
                     <button 
                        onClick={saveEditEntry}
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

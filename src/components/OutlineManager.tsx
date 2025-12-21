import {
  ArrowDown,
  ArrowUp,
  Book,
  Bot,
  Check,
  ChevronDown,
  Edit3,
  FileText,
  Folder,
  Globe,
  GripVertical,
  Lightbulb,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Settings,
  StopCircle,
  Trash2,
  Users,
  X,
  Eye
} from 'lucide-react'
import React, { useState } from 'react'
import { Novel, OutlineItem, OutlineSet, WorldviewSet, CharacterSet, InspirationSet } from '../types'

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
  onRegenerateAll?: () => void
  onRegenerateItem?: (index: number) => void
  isGenerating?: boolean
  onStopGeneration?: () => void
  regeneratingItemIndices?: Set<number>
  userPrompt?: string
  setUserPrompt?: (val: string) => void
  onShowSettings?: () => void
  modelName?: string
  sidebarHeader?: React.ReactNode
  
  // New props for selection
  selectedCharacterSetId?: string | null
  setSelectedCharacterSetId?: (id: string | null) => void
  selectedWorldviewSetId?: string | null
  setSelectedWorldviewSetId?: (id: string | null) => void
  selectedInspirationEntries?: { setId: string, index: number }[]
  setSelectedInspirationEntries?: React.Dispatch<React.SetStateAction<{ setId: string, index: number }[]>>
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
  onRegenerateAll,
  onRegenerateItem,
  isGenerating,
  onStopGeneration,
  regeneratingItemIndices,
  userPrompt,
  setUserPrompt,
  onShowSettings,
  modelName,
  sidebarHeader,
  selectedCharacterSetId,
  setSelectedCharacterSetId,
  selectedWorldviewSetId,
  setSelectedWorldviewSetId,
  selectedInspirationEntries,
  setSelectedInspirationEntries
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

  // Chapter Analysis Viewing
  const [viewingAnalysisIndex, setViewingAnalysisIndex] = useState<number | null>(null)

  // Mobile: Toggle Sidebar List
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)
  
  // Selectors State
  const [showWorldviewSelector, setShowWorldviewSelector] = useState(false)
  const [showCharacterSelector, setShowCharacterSelector] = useState(false)
  const [showInspirationSelector, setShowInspirationSelector] = useState(false)

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
    
    const newId = crypto.randomUUID()
    const name = newSetName.trim()

    const newOutlineSet: OutlineSet = {
      id: newId,
      name: name,
      items: []
    }
    
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

    const newInspirationSet: InspirationSet = {
        id: newId,
        name: name,
        items: []
    }

    const updatedWorldviewSets = [...(novel.worldviewSets || []), newWorldviewSet]
    const updatedCharacterSets = [...(novel.characterSets || []), newCharacterSet]
    const updatedOutlineSets = [...(novel.outlineSets || []), newOutlineSet]
    const updatedInspirationSets = [...(novel.inspirationSets || []), newInspirationSet]
    
    onUpdateNovel({ 
        ...novel, 
        worldviewSets: updatedWorldviewSets,
        characterSets: updatedCharacterSets,
        outlineSets: updatedOutlineSets,
        inspirationSets: updatedInspirationSets
    })

    setNewSetName('')
    onSetActiveOutlineSetId(newId)
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

  const updateUserNotes = (notes: string) => {
    if (!activeSet) return
    const updatedSets = (novel.outlineSets || []).map(s => 
      s.id === activeSet.id ? { ...s, userNotes: notes } : s
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

  const handleClearAll = () => {
    if (!activeSet) return
    setConfirmState({
      isOpen: true,
      title: '清空大纲',
      message: '确定要清空当前大纲的所有章节吗？此操作无法撤销。',
      onConfirm: () => {
        updateItems([])
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
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

  const handleRegenerateAllClick = () => {
    setConfirmState({
      isOpen: true,
      title: '重新生成全部大纲',
      message: '确定要重新生成全部大纲吗？这将覆盖现有的大纲内容，无法撤销。',
      onConfirm: () => {
        if (onRegenerateAll) onRegenerateAll()
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
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
            <Book className="w-5 h-5 text-[var(--theme-color)]" />
            <span>大纲文件列表</span>
            <span className="md:hidden text-xs text-gray-500 font-normal ml-2">
              ({novel.outlineSets?.length || 0})
            </span>
          </h3>
          <div className="md:hidden text-gray-400">
             {isMobileListOpen ? <ArrowUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* List Content - Collapsible on Mobile */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isMobileListOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {novel.outlineSets?.map(set => (
              <div 
                key={set.id}
                onClick={() => {
                   onSetActiveOutlineSetId(set.id)
                   // Auto close on mobile selection
                   if (window.innerWidth < 768) setIsMobileListOpen(false)
                }}
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

          <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
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
                  {(activeSet.items || []).length} 章
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
                  onClick={handleClearAll}
                  disabled={(activeSet.items || []).length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-red-900/30 hover:bg-red-900/60 text-red-200 text-xs md:text-sm rounded-lg transition-colors border border-red-900/50 hover:border-red-700/50 disabled:opacity-30 disabled:cursor-not-allowed mr-2"
                  title="清空当前大纲的所有章节"
                >
                  <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">清空</span>
                </button>

                <button 
                  onClick={handleAddItem}
                  className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs md:text-sm rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
                >
                  <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">手动添加章节</span>
                  <span className="md:hidden">添加</span>
                </button>
              </div>
            </div>

            {/* AI Generation Input */}
            {onGenerateOutline && (
              <div className="p-3 md:p-4 bg-gray-800/30 border-b border-gray-700/50">
                 <div className="max-w-4xl mx-auto space-y-2">
                    {/* Context Selectors */}
                    <div className="flex flex-wrap items-center gap-2">
                       <span className="text-xs text-gray-400 shrink-0">参考:</span>
                       
                       {/* Worldview Selector */}
                       <div className="relative">
                          <button
                             onClick={() => { setShowWorldviewSelector(!showWorldviewSelector); setShowCharacterSelector(false); setShowInspirationSelector(false); }}
                             className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 border border-gray-600 transition-colors"
                          >
                             <Globe className="w-3 h-3 text-[var(--theme-color)]" />
                             {selectedWorldviewSetId
                                ? novel.worldviewSets?.find(s => s.id === selectedWorldviewSetId)?.name || '世界观已删除'
                                : '选择世界观'}
                             <ChevronDown className="w-3 h-3" />
                          </button>
                          {showWorldviewSelector && (
                             <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowWorldviewSelector(false)}></div>
                                <div 
                                   className="absolute top-full left-0 mt-1 w-48 border border-gray-600 rounded-lg shadow-2xl z-30 max-h-60 overflow-y-auto ring-1 ring-black/20"
                                   style={{ backgroundColor: '#1f2937' }}
                                >
                                   <button
                                      onClick={() => { setSelectedWorldviewSetId && setSelectedWorldviewSetId(null); setShowWorldviewSelector(false); }}
                                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:text-white border-b border-gray-600 transition-colors bg-transparent hover:bg-gray-700"
                                   >
                                      不使用世界观
                                   </button>
                                   {novel.worldviewSets?.map(ws => (
                                      <button
                                         key={ws.id}
                                         onClick={() => { setSelectedWorldviewSetId && setSelectedWorldviewSetId(ws.id); setShowWorldviewSelector(false); }}
                                         className={`w-full text-left px-3 py-2 text-xs hover:text-white flex items-center gap-2 transition-colors bg-transparent hover:bg-gray-700 ${selectedWorldviewSetId === ws.id ? 'text-[var(--theme-color)] font-medium' : 'text-gray-300'}`}
                                      >
                                         <span className="truncate flex-1">{ws.name}</span>
                                         {selectedWorldviewSetId === ws.id && <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-color)] shrink-0"></div>}
                                      </button>
                                   ))}
                                </div>
                             </>
                          )}
                       </div>

                       {/* Character Selector */}
                       <div className="relative">
                          <button
                             onClick={() => { setShowCharacterSelector(!showCharacterSelector); setShowWorldviewSelector(false); setShowInspirationSelector(false); }}
                             className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 border border-gray-600 transition-colors"
                          >
                             <Users className="w-3 h-3 text-[var(--theme-color)]" />
                             {selectedCharacterSetId
                                ? novel.characterSets?.find(s => s.id === selectedCharacterSetId)?.name || '角色集已删除'
                                : '选择角色集'}
                             <ChevronDown className="w-3 h-3" />
                          </button>
                          {showCharacterSelector && (
                             <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowCharacterSelector(false)}></div>
                                <div 
                                   className="absolute top-full left-0 mt-1 w-48 border border-gray-600 rounded-lg shadow-2xl z-30 max-h-60 overflow-y-auto ring-1 ring-black/20"
                                   style={{ backgroundColor: '#1f2937' }}
                                >
                                   <button
                                      onClick={() => { setSelectedCharacterSetId && setSelectedCharacterSetId(null); setShowCharacterSelector(false); }}
                                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:text-white border-b border-gray-600 transition-colors bg-transparent hover:bg-gray-700"
                                   >
                                      不使用角色集
                                   </button>
                                   {novel.characterSets?.map(cs => (
                                      <button
                                         key={cs.id}
                                         onClick={() => { setSelectedCharacterSetId && setSelectedCharacterSetId(cs.id); setShowCharacterSelector(false); }}
                                         className={`w-full text-left px-3 py-2 text-xs hover:text-white flex items-center gap-2 transition-colors bg-transparent hover:bg-gray-700 ${selectedCharacterSetId === cs.id ? 'text-[var(--theme-color)] font-medium' : 'text-gray-300'}`}
                                      >
                                         <span className="truncate flex-1">{cs.name}</span>
                                         {selectedCharacterSetId === cs.id && <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-color)] shrink-0"></div>}
                                      </button>
                                   ))}
                                </div>
                             </>
                          )}
                       </div>

                       {/* Inspiration Selector */}
                       {setSelectedInspirationEntries && (
                          <div className="relative">
                             <button
                                onClick={() => { setShowInspirationSelector(!showInspirationSelector); setShowWorldviewSelector(false); setShowCharacterSelector(false); }}
                                className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 border border-gray-600 transition-colors"
                             >
                                <Lightbulb className="w-3 h-3 text-[var(--theme-color)]" />
                                {selectedInspirationEntries && selectedInspirationEntries.length > 0
                                   ? `已选 ${selectedInspirationEntries.length} 条灵感`
                                   : '选择灵感'}
                                <ChevronDown className="w-3 h-3" />
                             </button>
                             {showInspirationSelector && (
                                <>
                                   <div className="fixed inset-0 z-20" onClick={() => setShowInspirationSelector(false)}></div>
                                   <div 
                                      className="absolute top-full left-0 mt-1 w-64 border border-gray-600 rounded-lg shadow-2xl z-30 max-h-80 overflow-y-auto ring-1 ring-black/20"
                                      style={{ backgroundColor: '#1f2937' }}
                                   >
                                      <button
                                         onClick={() => { setSelectedInspirationEntries([]); setShowInspirationSelector(false); }}
                                         className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:text-white border-b border-gray-600 transition-colors bg-transparent hover:bg-gray-700"
                                      >
                                         清空选择
                                      </button>
                                      {novel.inspirationSets?.map(is => (
                                         <div key={is.id} className="border-t border-gray-700/50 first:border-0">
                                            <div className="px-3 py-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider bg-gray-800/50 sticky top-0">
                                               {is.name}
                                            </div>
                                            {is.items.length === 0 ? (
                                               <div className="px-3 py-2 text-xs text-gray-600 italic">空集</div>
                                            ) : (
                                               is.items.map((item, idx) => {
                                                  const isSelected = selectedInspirationEntries?.some(e => e.setId === is.id && e.index === idx)
                                                  return (
                                                     <button
                                                        key={idx}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (setSelectedInspirationEntries) {
                                                                setSelectedInspirationEntries(prev => {
                                                                    const newEntries = [...prev]
                                                                    const currentIsSelected = newEntries.some(e => e.setId === is.id && e.index === idx)
                                                                    if (currentIsSelected) {
                                                                        const filterIndex = newEntries.findIndex(e => e.setId === is.id && e.index === idx)
                                                                        if (filterIndex !== -1) newEntries.splice(filterIndex, 1)
                                                                    } else {
                                                                        newEntries.push({ setId: is.id, index: idx })
                                                                    }
                                                                    return newEntries
                                                                })
                                                            }
                                                        }}
                                                        className={`w-full text-left px-3 py-2 text-xs hover:text-white flex items-center gap-2 transition-colors bg-transparent hover:bg-gray-700 ${isSelected ? 'text-[var(--theme-color)] font-medium bg-gray-700/50' : 'text-gray-300'}`}
                                                     >
                                                        <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[var(--theme-color)] border-[var(--theme-color)]' : 'border-gray-500'}`}>
                                                            {isSelected && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                        </div>
                                                        <span className="truncate flex-1">{item.title || '未命名'}</span>
                                                     </button>
                                                  )
                                               })
                                            )}
                                         </div>
                                      ))}
                                      {(!novel.inspirationSets || novel.inspirationSets.filter(is => is.name === activeSet?.name).length === 0) && (
                                         <div className="px-3 py-4 text-center text-xs text-gray-500">暂无同名灵感集</div>
                                      )}
                                   </div>
                                </>
                             )}
                          </div>
                       )}
                    </div>

                    <div className="flex gap-2 md:gap-3">
                        <div className="flex-1 relative">
                           <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-[var(--theme-color)]" />
                           <input 
                              type="text" 
                              value={userPrompt || ''}
                              onChange={(e) => setUserPrompt && setUserPrompt(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onGenerateOutline()}
                              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-xs md:text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                              placeholder="AI 助手：描述你的大纲需求..."
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
                              onClick={onGenerateOutline}
                              className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white"
                           >
                              <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              <span className="hidden md:inline">生成大纲</span>
                              <span className="md:hidden">生成</span>
                           </button>
                        )}
                        {onRegenerateAll && (activeSet.items || []).length > 0 && (
                           <button 
                              onClick={isGenerating ? undefined : handleRegenerateAllClick}
                              disabled={isGenerating}
                              className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all bg-red-600 hover:bg-red-700 text-white shadow-lg shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="重新生成全部大纲 (覆盖)"
                           >
                              <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                              <span className="hidden md:inline">重生成全部</span>
                           </button>
                        )}
                     </div>
                 </div>
              </div>
            )}

            {/* Chapter List (Cards) */}
            <div className="flex-1 overflow-y-auto p-2 md:p-8 custom-scrollbar flex flex-col min-h-0">
              <div className="max-w-4xl mx-auto w-full space-y-3 md:space-y-4 pb-4 md:pb-8 flex flex-col min-h-full">
                
                {/* User Notes Area */}
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 shrink-0">
                    <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        <span>用户输入记录 & 设定上下文 (AI 生成时会参考此内容)</span>
                    </div>
                    <textarea 
                        value={activeSet.userNotes || ''}
                        onChange={(e) => updateUserNotes(e.target.value)}
                        className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-xs md:text-sm text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none transition-all focus:bg-gray-900 focus:h-48 placeholder-gray-500 font-mono"
                        placeholder="用户的指令历史将自动记录在此处...&#10;你也可以手动添加关于大纲的全局设定、注意事项等。&#10;这些内容将作为上下文发送给 AI。"
                    />
                </div>

                {(activeSet.items || []).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12 md:py-20 text-gray-500 border-2 border-dashed border-gray-700/50 rounded-xl bg-gray-800/20">
                    <Book className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-20" />
                    <p className="text-base md:text-lg font-medium text-gray-400">大纲为空</p>
                    <p className="text-xs md:text-sm mt-1">请手动添加章节，或使用上方的 AI 助手生成</p>
                  </div>
                ) : (
                  (activeSet.items || []).map((item, idx) => (
                    <div 
                      key={idx}
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={onDragEnd}
                      onClick={() => openEditChapter(idx, item)}
                      className={`relative bg-gray-800 border border-gray-700 rounded-lg md:rounded-xl p-3 md:p-5 hover:border-[var(--theme-color)] hover:shadow-lg transition-all cursor-pointer group ${draggedItemIndex === idx ? 'opacity-40 ring-2 ring-[var(--theme-color)]' : ''}`}
                    >
                      {/* Drag Handle */}
                      <div 
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-gray-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity md:flex hidden"
                        onClick={e => e.stopPropagation()}
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>

                      <div className="flex items-start gap-3 md:gap-4 md:pl-8">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gray-900/80 border border-gray-700 flex items-center justify-center text-xs md:text-sm font-bold text-gray-400 shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                             <h4 className="text-sm md:text-lg font-bold text-gray-200 mb-1 md:mb-2 truncate pr-6 md:pr-8">{item.title}</h4>
                          </div>
                          <p className="text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-2">{item.summary || <span className="italic opacity-50">点击添加摘要...</span>}</p>
                        </div>
                      </div>

                      {/* Hover Actions (Visible on Mobile? Maybe keep as top-right absolute but smaller) */}
                      <div className="absolute top-2 right-2 md:top-3 md:right-3 flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/90 rounded-lg shadow-sm border border-gray-700/50 p-0.5 md:p-1" onClick={e => e.stopPropagation()}>
                         <button 
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 md:p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
                            title="上移"
                         >
                            <ArrowUp className="w-3.5 h-3.5 md:w-4 md:h-4" />
                         </button>
                         <button 
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            disabled={idx === (activeSet.items || []).length - 1}
                            className="p-1 md:p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
                            title="下移"
                         >
                            <ArrowDown className="w-3.5 h-3.5 md:w-4 md:h-4" />
                         </button>
                         <div className="w-px h-3 md:h-4 bg-gray-600 mx-0.5 md:mx-1"></div>
                         <button 
                            onClick={() => handleDeleteItem(idx)}
                            className="p-1 md:p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                            title="删除"
                         >
                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                         </button>
                         {onRegenerateItem && (
                            <>
                               <div className="w-px h-3 md:h-4 bg-gray-600 mx-0.5 md:mx-1"></div>
                               <button 
                                  onClick={(e) => {
                                     e.stopPropagation();
                                     onRegenerateItem(idx);
                                  }}
                                  disabled={regeneratingItemIndices?.has(idx)}
                                  className="p-1 md:p-1.5 text-gray-400 hover:text-[var(--theme-color)] hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="AI 重新生成本章"
                               >
                                  {regeneratingItemIndices?.has(idx) ? (
                                     <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin text-[var(--theme-color)]" />
                                  ) : (
                                     <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  )}
                               </button>
                            </>
                         )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Auto Write Footer Panel */}
            <div className="border-t border-gray-700 bg-gray-800 p-3 md:p-6 z-20 shrink-0">
               <div className="max-w-4xl mx-auto flex flex-row items-center justify-between gap-3 md:gap-6">
                  {/* Left: Options */}
                  <div className="flex flex-col md:block md:flex-1 space-y-0 md:space-y-2">
                     <h3 className="hidden md:flex font-bold items-center gap-2 text-gray-200">
                        <Bot className="w-5 h-5 text-purple-500" />
                        自动化写作
                     </h3>
                     
                     <div 
                        className="flex items-center gap-2 md:gap-3 cursor-pointer group"
                        onClick={() => setIncludeFullOutlineInAutoWrite(!includeFullOutlineInAutoWrite)}
                     >
                        <div className={`w-4 h-4 md:w-5 md:h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${includeFullOutlineInAutoWrite ? 'bg-[var(--theme-color)] border-[var(--theme-color)]' : 'border-gray-500 bg-transparent'}`}>
                           {includeFullOutlineInAutoWrite && <Check className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" />}
                        </div>
                        <span className="text-xs md:text-sm text-gray-400 group-hover:text-gray-300 select-none whitespace-nowrap">
                           <span className="md:hidden">全局参考</span>
                           <span className="hidden md:inline">在生成时附带完整大纲作为全局参考</span>
                        </span>
                     </div>
                  </div>

                  {/* Right: Action */}
                  <div className="flex-1 md:flex-none md:w-auto flex justify-end min-w-0">
                     {isAutoWriting ? (
                        <div className="flex items-center gap-2 md:gap-3 bg-gray-900 border border-purple-500/30 rounded-lg md:rounded-xl px-3 py-2 md:px-4 md:py-3 w-full md:w-auto min-w-0">
                           <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-purple-500 animate-spin shrink-0" />
                           <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="hidden md:block text-xs text-purple-400 font-medium mb-0.5">正在创作</div>
                              <div className="text-xs md:text-sm text-gray-200 truncate">{autoWriteStatus}</div>
                           </div>
                           <button 
                              onClick={onStopAutoWrite}
                              className="p-1.5 md:p-2 hover:bg-red-900/30 rounded-lg text-red-400 hover:text-red-300 transition-colors shrink-0"
                              title="停止"
                           >
                              <StopCircle className="w-4 h-4 md:w-5 md:h-5" />
                           </button>
                        </div>
                     ) : (
                        <button 
                           onClick={onStartAutoWrite}
                           disabled={(activeSet.items || []).length === 0}
                           className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 md:px-8 md:py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg md:rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-purple-500/20 text-xs md:text-base whitespace-nowrap"
                        >
                           <PlayCircle className="w-4 h-4 md:w-5 md:h-5" />
                           <span>开始自动创作</span>
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

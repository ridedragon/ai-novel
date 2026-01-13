import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Book,
  Bot,
  Check,
  ChevronDown,
  Edit3,
  FileText,
  Folder,
  GripVertical,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Send,
  Settings,
  StopCircle,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { CharacterSet, InspirationSet, Novel, OutlineItem, OutlineSet, WorldviewSet } from '../types'
import { ReferenceSelector } from './ReferenceSelector'

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
  onGenerateOutline?: (mode?: 'generate' | 'chat') => void
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
  activePresetId?: string
  lastNonChatPresetId?: string
  onReturnToMainWithContent?: (content: string) => void
  onSetActivePresetId?: (id: string) => void
  
  // Reference Selection Props
  selectedWorldviewSetId: string | null
  selectedWorldviewIndices: number[]
  onSelectWorldviewSet: (id: string | null) => void
  onToggleWorldviewItem: (setId: string, index: number) => void
  showWorldviewSelector: boolean
  onToggleWorldviewSelector: (open: boolean) => void

  selectedCharacterSetId: string | null
  selectedCharacterIndices: number[]
  onSelectCharacterSet: (id: string | null) => void
  onToggleCharacterItem: (setId: string, index: number) => void
  showCharacterSelector: boolean
  onToggleCharacterSelector: (open: boolean) => void

  selectedInspirationSetId: string | null
  selectedInspirationIndices: number[]
  onSelectInspirationSet: (id: string | null) => void
  onToggleInspirationItem: (setId: string, index: number) => void
  showInspirationSelector: boolean
  onToggleInspirationSelector: (open: boolean) => void

  selectedOutlineSetId: string | null
  selectedOutlineIndices: number[]
  onSelectOutlineSet: (id: string | null) => void
  onToggleOutlineItem: (setId: string, index: number) => void
  showOutlineSelector: boolean
  onToggleOutlineSelector: (open: boolean) => void

  selectedReferenceType: string | null
  selectedReferenceIndices: number[]
  onSelectReferenceSet: (id: string | null) => void
  onToggleReferenceItem: (setId: string, index: number) => void
  showReferenceSelector: boolean
  onToggleReferenceSelector: (open: boolean) => void
}

export const OutlineManager: React.FC<OutlineManagerProps> = React.memo(({
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
  activePresetId,
  lastNonChatPresetId,
  onReturnToMainWithContent,
  onSetActivePresetId,
  selectedWorldviewSetId,
  selectedWorldviewIndices,
  onSelectWorldviewSet,
  onToggleWorldviewItem,
  showWorldviewSelector,
  onToggleWorldviewSelector,
  selectedCharacterSetId,
  selectedCharacterIndices,
  onSelectCharacterSet,
  onToggleCharacterItem,
  showCharacterSelector,
  onToggleCharacterSelector,
  selectedInspirationSetId,
  selectedInspirationIndices,
  onSelectInspirationSet,
  onToggleInspirationItem,
  showInspirationSelector,
  onToggleInspirationSelector,
  selectedOutlineSetId,
  selectedOutlineIndices,
  onSelectOutlineSet,
  onToggleOutlineItem,
  showOutlineSelector,
  onToggleOutlineSelector,
  selectedReferenceType,
  selectedReferenceIndices,
  onSelectReferenceSet,
  onToggleReferenceItem,
  showReferenceSelector,
  onToggleReferenceSelector
}) => {
  // Local State for Set Management
  const [showChat, setShowChat] = useState(false)
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

  const activeSet = novel?.outlineSets?.find(s => s.id === activeOutlineSetId)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeSet?.chatHistory, showChat])

  // Sync preset with view mode on mount
  useEffect(() => {
    if (onSetActivePresetId) {
      if (showChat) {
        onSetActivePresetId('chat')
      } else if (lastNonChatPresetId) {
        onSetActivePresetId(lastNonChatPresetId)
      }
    }
  }, [])

  // --- Set Management ---

  const handleAddSet = () => {
    if (!newSetName.trim()) return
    
    const newId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2)
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

    const newPlotOutlineSet = {
        id: newId,
        name: name,
        items: []
    }

    onUpdateNovel({
        ...novel,
        worldviewSets: [...(novel.worldviewSets || []), newWorldviewSet],
        characterSets: [...(novel.characterSets || []), newCharacterSet],
        outlineSets: [...(novel.outlineSets || []), newOutlineSet],
        inspirationSets: [...(novel.inspirationSets || []), newInspirationSet],
        plotOutlineSets: [...(novel.plotOutlineSets || []), newPlotOutlineSet]
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

  const handleClearChat = () => {
    if (!activeSet) return
    const updatedSets = (novel.outlineSets || []).map(s =>
      s.id === activeSet.id ? { ...s, chatHistory: [] } : s
    )
    onUpdateNovel({ ...novel, outlineSets: updatedSets })
  }

  const handleDeleteChatMessage = (index: number) => {
    if (!activeSet || !activeSet.chatHistory) return
    const newChatHistory = [...activeSet.chatHistory]
    newChatHistory.splice(index, 1)
    const updatedSets = (novel.outlineSets || []).map(s =>
      s.id === activeSet.id ? { ...s, chatHistory: newChatHistory } : s
    )
    onUpdateNovel({ ...novel, outlineSets: updatedSets })
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
                   onClick={() => {
                      if (showChat) {
                         setShowChat(false);
                         if (onSetActivePresetId && lastNonChatPresetId) onSetActivePresetId(lastNonChatPresetId);
                      } else {
                         setShowChat(true);
                         if (onSetActivePresetId) onSetActivePresetId('chat');
                      }
                   }}
                   className={`flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors border mr-2 ${showChat ? 'bg-[var(--theme-color)] text-white border-[var(--theme-color)]' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
                >
                   {showChat ? <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                   <span className="hidden sm:inline">{showChat ? '返回' : '聊天'}</span>
                </button>

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

            {/* AI Generation Input (Only shown when NOT in independent chat view) */}
            {onGenerateOutline && !showChat && (
              <div className="p-3 md:p-4 bg-gray-800/30 border-b border-gray-700/50">
                 <div className="w-full space-y-2">
                    {/* Context Selectors */}
                    <div className="flex flex-wrap items-center gap-2">
                       <span className="text-xs text-gray-400 shrink-0">参考:</span>
                       
                       <ReferenceSelector
                          novel={novel}
                          type="worldview"
                          selectedSetId={selectedWorldviewSetId}
                          selectedItemIndices={selectedWorldviewIndices}
                          onSelectSet={onSelectWorldviewSet}
                          onToggleItem={onToggleWorldviewItem}
                          isOpen={showWorldviewSelector}
                          onToggleOpen={(open) => {
                             onToggleWorldviewSelector(open);
                             if (open) { onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                          }}
                       />

                       <ReferenceSelector
                          novel={novel}
                          type="reference"
                          selectedSetId={selectedReferenceType}
                          selectedItemIndices={selectedReferenceIndices}
                          onSelectSet={onSelectReferenceSet}
                          onToggleItem={onToggleReferenceItem}
                          isOpen={showReferenceSelector}
                          onToggleOpen={(open) => {
                             onToggleReferenceSelector(open);
                             if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
                          }}
                       />

                       <ReferenceSelector
                          novel={novel}
                          type="character"
                          selectedSetId={selectedCharacterSetId}
                          selectedItemIndices={selectedCharacterIndices}
                          onSelectSet={onSelectCharacterSet}
                          onToggleItem={onToggleCharacterItem}
                          isOpen={showCharacterSelector}
                          onToggleOpen={(open) => {
                             onToggleCharacterSelector(open);
                             if (open) { onToggleWorldviewSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                          }}
                       />

                       <ReferenceSelector
                          novel={novel}
                          type="inspiration"
                          selectedSetId={selectedInspirationSetId}
                          selectedItemIndices={selectedInspirationIndices}
                          onSelectSet={onSelectInspirationSet}
                          onToggleItem={onToggleInspirationItem}
                          isOpen={showInspirationSelector}
                          onToggleOpen={(open) => {
                             onToggleInspirationSelector(open);
                             if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                          }}
                       />

                       <ReferenceSelector
                          novel={novel}
                          type="outline"
                          selectedSetId={selectedOutlineSetId}
                          selectedItemIndices={selectedOutlineIndices}
                          onSelectSet={onSelectOutlineSet}
                          onToggleItem={onToggleOutlineItem}
                          isOpen={showOutlineSelector}
                          onToggleOpen={(open) => {
                             onToggleOutlineSelector(open);
                             if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleReferenceSelector(false); }
                          }}
                       />
                    </div>

                    <div className="flex gap-2 md:gap-3">
                        <div className="flex-1 relative">
                           <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-[var(--theme-color)]" />
                           <input
                              type="text"
                              value={userPrompt || ''}
                              onChange={(e) => setUserPrompt && setUserPrompt(e.target.value)}
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter' && !isGenerating) {
                                    onGenerateOutline('generate')
                                 }
                              }}
                              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-xs md:text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                              placeholder="输入创作指令，或点击右侧 AI 按钮优化..."
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
                           <div className="flex gap-2">
                                 <button
                                    onClick={() => onGenerateOutline('generate')}
                                    className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white"
                                 >
                                    <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    <span className="hidden md:inline">生成大纲</span>
                                    <span className="md:hidden">生成</span>
                                 </button>
                              </div>
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

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 md:p-8 custom-scrollbar flex flex-col min-h-0">
               {showChat ? (
                  <div className="flex-1 flex flex-col w-full h-full">
                     <div className="flex items-center justify-between mb-4 shrink-0">
                        <div className="flex items-center gap-2 text-gray-400">
                           <Bot className="w-4 h-4" />
                           <span className="text-sm font-medium">大纲讨论对话</span>
                        </div>
                        <div className="flex items-center gap-3">
                           <button
                              onClick={handleClearChat}
                              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                           >
                              清空对话
                           </button>
                           <button
                              onClick={() => {
                                 setShowChat(false);
                                 if (onSetActivePresetId && lastNonChatPresetId) onSetActivePresetId(lastNonChatPresetId);
                              }}
                              className="p-1.5 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
                              title="返回列表"
                           >
                              <ArrowLeft className="w-5 h-5" />
                           </button>
                        </div>
                     </div>

                     <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 pb-4">
                        {activeSet.chatHistory?.map((msg, i) => (
                           <div key={i} className={`flex flex-col group/msg ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                              <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[var(--theme-color)] text-white'}`}>
                                    {msg.role === 'user' ? 'U' : 'AI'}
                                 </div>
                                 <span className="text-xs text-gray-500">
                                    {msg.role === 'user' ? '用户' : '大纲助手'}
                                 </span>
                                 <button
                                    onClick={() => handleDeleteChatMessage(i)}
                                    className="opacity-0 group-hover/msg:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"
                                    title="删除此消息"
                                 >
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                                 msg.role === 'user'
                                    ? 'bg-[var(--theme-color)] text-white rounded-tr-none'
                                    : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'
                              }`}>
                                 <div className="whitespace-pre-wrap">
                                     {typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map(c => ('text' in c ? c.text : '')).join('') : '')}
                                 </div>
                              </div>
                           </div>
                        ))}
                        <div ref={chatEndRef} />
                        {(!activeSet.chatHistory || activeSet.chatHistory.length === 0) && (
                           <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20">
                              <Bot className="w-16 h-16 mb-4 opacity-10" />
                              <p>开始与 AI 讨论你的大纲吧...</p>
                           </div>
                        )}
                     </div>

                     {/* Chat Input at Bottom */}
                     <div className="pt-4 border-t border-gray-700 shrink-0 space-y-3">
                        {/* Reference Selectors */}
                        <div className="flex flex-wrap items-center gap-2">
                           <span className="text-xs text-gray-500 shrink-0">参考:</span>
                           
                           <ReferenceSelector
                              novel={novel}
                              type="worldview"
                              selectedSetId={selectedWorldviewSetId}
                              selectedItemIndices={selectedWorldviewIndices}
                              onSelectSet={onSelectWorldviewSet}
                              onToggleItem={onToggleWorldviewItem}
                              isOpen={showWorldviewSelector}
                              onToggleOpen={(open) => {
                                 onToggleWorldviewSelector(open);
                                 if (open) { onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                              }}
                           />

                           <ReferenceSelector
                              novel={novel}
                              type="reference"
                              selectedSetId={selectedReferenceType}
                              selectedItemIndices={selectedReferenceIndices}
                              onSelectSet={onSelectReferenceSet}
                              onToggleItem={onToggleReferenceItem}
                              isOpen={showReferenceSelector}
                              onToggleOpen={(open) => {
                                 onToggleReferenceSelector(open);
                                 if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
                              }}
                           />

                           <ReferenceSelector
                              novel={novel}
                              type="character"
                              selectedSetId={selectedCharacterSetId}
                              selectedItemIndices={selectedCharacterIndices}
                              onSelectSet={onSelectCharacterSet}
                              onToggleItem={onToggleCharacterItem}
                              isOpen={showCharacterSelector}
                              onToggleOpen={(open) => {
                                 onToggleCharacterSelector(open);
                                 if (open) { onToggleWorldviewSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                              }}
                           />

                           <ReferenceSelector
                              novel={novel}
                              type="inspiration"
                              selectedSetId={selectedInspirationSetId}
                              selectedItemIndices={selectedInspirationIndices}
                              onSelectSet={onSelectInspirationSet}
                              onToggleItem={onToggleInspirationItem}
                              isOpen={showInspirationSelector}
                              onToggleOpen={(open) => {
                                 onToggleInspirationSelector(open);
                                 if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleOutlineSelector(false); onToggleReferenceSelector(false); }
                              }}
                           />

                           <ReferenceSelector
                              novel={novel}
                              type="outline"
                              selectedSetId={selectedOutlineSetId}
                              selectedItemIndices={selectedOutlineIndices}
                              onSelectSet={onSelectOutlineSet}
                              onToggleItem={onToggleOutlineItem}
                              isOpen={showOutlineSelector}
                              onToggleOpen={(open) => {
                                 onToggleOutlineSelector(open);
                                 if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleReferenceSelector(false); }
                              }}
                           />
                        </div>

                        <div className="flex gap-2 md:gap-3">
                           <div className="flex-1 relative">
                              <textarea
                                 value={userPrompt || ''}
                                 onChange={(e) => setUserPrompt && setUserPrompt(e.target.value)}
                                 onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
                                       e.preventDefault();
                                       onGenerateOutline && onGenerateOutline('chat');
                                    }
                                 }}
                                 className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all resize-none h-24 custom-scrollbar"
                                 placeholder="输入你的想法，与 AI 讨论..."
                              />
                           </div>
                           <div className="flex flex-col gap-2">
                              {isGenerating ? (
                                 <button
                                    onClick={onStopGeneration}
                                    className="p-3 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg transition-all"
                                    title="停止生成"
                                 >
                                    <StopCircle className="w-6 h-6" />
                                 </button>
                              ) : (
                                 <div className="flex flex-col gap-2">
                                    <button
                                       onClick={() => onGenerateOutline && onGenerateOutline('chat')}
                                       className={`p-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white shadow-lg transition-all ${!userPrompt?.trim() ? 'text-white/50' : ''}`}
                                       title="发送对话"
                                    >
                                       <Send className="w-5 h-5" />
                                    </button>
                                      <button
                                         onClick={() => {
                                            if (onReturnToMainWithContent) {
                                               const history = activeSet.chatHistory || [];
                                               const formattedHistory = history.map(m =>
                                                  `${m.role === 'user' ? '用户' : '大纲助手'}: ${m.content}`
                                               ).join('\n\n');
                                               const finalContent = userPrompt?.trim()
                                                  ? `${formattedHistory}\n\n用户最新想法: ${userPrompt}`
                                                  : formattedHistory;
                                               onReturnToMainWithContent(finalContent);
                                               setShowChat(false);
                                               if (onSetActivePresetId && lastNonChatPresetId) {
                                                  onSetActivePresetId(lastNonChatPresetId);
                                               }
                                            } else if (onGenerateOutline) {
                                               onGenerateOutline('generate');
                                            }
                                         }}
                                         className={`p-3 rounded-xl bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white shadow-lg transition-all flex items-center justify-center gap-1 ${!userPrompt?.trim() && (!activeSet.chatHistory || activeSet.chatHistory.length === 0) ? 'text-white/70' : ''}`}
                                         title="将对话发送给 AI 助手并返回"
                                      >
                                         <Wand2 className="w-5 h-5" />
                                         <span className="text-[10px] font-bold">生成</span>
                                      </button>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
               ) : (
              <div className="w-full space-y-3 md:space-y-4 pb-4 md:pb-8 flex flex-col min-h-full">
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
                  <div className="space-y-1">
                    {(activeSet.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDragEnd={onDragEnd}
                        onClick={() => openEditChapter(idx, item)}
                        className={`group flex items-center gap-3 p-2.5 rounded-none border transition-all cursor-pointer relative bg-gray-800/40 border-gray-700/50 hover:bg-gray-700/40 ${draggedItemIndex === idx ? 'opacity-40 ring-2 ring-indigo-500' : ''}`}
                      >
                         <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="p-1 hover:bg-gray-700 rounded transition-colors md:flex hidden cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
                               <GripVertical className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                            <div className="p-1.5 rounded text-gray-500 group-hover:text-[var(--theme-color)] transition-colors">
                               <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-3">
                                  <span className="text-[13px] font-medium truncate text-gray-300">
                                     <span className="mr-2 text-gray-500 font-mono text-[11px]">{idx + 1}.</span>
                                     {item.title}
                                  </span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-3 shrink-0">
                            <span className="px-1.5 py-0.5 rounded-none text-[10px] font-bold border whitespace-nowrap leading-none bg-rose-900/20 text-rose-500 border-rose-900/50">
                               大纲
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                               <button
                                  onClick={() => handleMoveItem(idx, idx - 1)}
                                  disabled={idx === 0}
                                  className="p-1 hover:bg-gray-700 rounded-none text-gray-400 hover:text-gray-200 disabled:opacity-20"
                                  title="上移"
                               >
                                  <ArrowUp className="w-3.5 h-3.5" />
                               </button>
                               <button
                                  onClick={() => handleMoveItem(idx, idx + 1)}
                                  disabled={idx === (activeSet.items || []).length - 1}
                                  className="p-1 hover:bg-gray-700 rounded-none text-gray-400 hover:text-gray-200 disabled:opacity-20"
                                  title="下移"
                               >
                                  <ArrowDown className="w-3.5 h-3.5" />
                               </button>
                               {onRegenerateItem && (
                                  <button
                                     onClick={() => onRegenerateItem(idx)}
                                     disabled={regeneratingItemIndices?.has(idx)}
                                     className="p-1 hover:bg-gray-700 rounded-none text-gray-400 hover:text-[var(--theme-color)] disabled:opacity-50"
                                     title="AI 重新生成本章"
                                  >
                                     {regeneratingItemIndices?.has(idx) ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--theme-color)]" />
                                     ) : (
                                        <RefreshCw className="w-3.5 h-3.5" />
                                     )}
                                  </button>
                               )}
                               <button
                                  onClick={() => handleDeleteItem(idx)}
                                  className="p-1 hover:bg-red-900/30 rounded-none text-gray-400 hover:text-red-500 transition-all"
                                  title="删除"
                               >
                                  <Trash2 className="w-3.5 h-3.5" />
                               </button>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
               )}
            </div>

            {/* Auto Write Footer Panel */}
            <div className="border-t border-gray-700 bg-gray-800 p-3 md:p-6 z-20 shrink-0">
               <div className="w-full flex flex-row items-center justify-between gap-3 md:gap-6">
                  {/* Left: Options */}
                  <div className="flex flex-col md:block md:flex-1 space-y-0 md:space-y-2">
                     <h3 className="hidden md:flex font-bold items-center gap-2 text-gray-200">
                        <Bot className="w-5 h-5 text-[var(--theme-color)]" />
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
                           <span className="hidden md:inline">在生成时附带完整粗纲作为全局参考</span>
                        </span>
                     </div>
                  </div>

                  {/* Right: Action */}
                  <div className="flex-1 md:flex-none md:w-auto flex justify-end min-w-0">
                     {isAutoWriting ? (
                        <div className="flex items-center gap-2 md:gap-3 bg-gray-900 border border-[var(--theme-color)]/30 rounded-lg md:rounded-xl px-3 py-2 md:px-4 md:py-3 w-full md:w-auto min-w-0">
                           <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-[var(--theme-color)] animate-spin shrink-0" />
                           <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="hidden md:block text-xs text-[var(--theme-color)] font-medium mb-0.5">正在创作</div>
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
                           className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 md:px-8 md:py-3 bg-gradient-to-r from-[var(--theme-color)] to-blue-600 hover:from-[var(--theme-color-hover)] hover:to-blue-500 text-white font-bold rounded-lg md:rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[var(--theme-color)]/20 text-xs md:text-base whitespace-nowrap"
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
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
             <div className="bg-gray-800 w-full h-full md:h-[90vh] md:max-w-6xl md:rounded-xl shadow-2xl border border-gray-600 flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center">
                   <h3 className="font-bold text-lg text-gray-100">编辑章节大纲</h3>
                   <button onClick={() => setEditingChapterIndex(null)} className="text-gray-400 hover:text-white">
                      <X className="w-6 h-6" />
                   </button>
                </div>
                
                <div className="flex-1 p-6 space-y-5 overflow-y-auto flex flex-col">
                   <div className="space-y-2 shrink-0">
                      <label className="text-sm font-medium text-gray-400">章节标题</label>
                      <input
                         value={editChapterTitle}
                         onChange={e => setEditChapterTitle(e.target.value)}
                         className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-lg font-bold text-white focus:border-[var(--theme-color)] outline-none"
                         placeholder="输入标题..."
                         autoFocus
                      />
                   </div>
                   
                   <div className="space-y-2 flex-1 flex flex-col">
                      <label className="text-sm font-medium text-gray-400">剧情摘要</label>
                      <textarea
                         value={editChapterSummary}
                         onChange={e => setEditChapterSummary(e.target.value)}
                         className="w-full flex-1 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none font-mono"
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
})
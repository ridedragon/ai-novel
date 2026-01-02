import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  Folder,
  LayoutList,
  Plus,
  Send,
  Settings,
  StopCircle,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { Novel, PlotOutlineItem } from '../types'
import { ReferenceSelector } from './ReferenceSelector'

interface PlotOutlineManagerProps {
  novel: Novel
  activePlotOutlineSetId: string | null
  onSetActivePlotOutlineSetId: (id: string | null) => void
  onUpdateNovel: (updatedNovel: Novel) => void
  
  // AI Generation Props
  onGeneratePlotOutline?: (mode?: 'generate' | 'chat') => void
  isGenerating?: boolean
  userPrompt?: string
  setUserPrompt?: (val: string) => void
  onStopGeneration?: () => void
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
}

const TreeItem: React.FC<{
  item: PlotOutlineItem
  depth: number
  onEdit: (item: PlotOutlineItem) => void
  onAddChild: (parentId: string) => void
  onDelete: (id: string) => void
  expandedItems: Set<string>
  onToggleExpand: (id: string) => void
}> = ({ item, depth, onEdit, onAddChild, onDelete, expandedItems, onToggleExpand }) => {
  const isExpanded = expandedItems.has(item.id)
  const hasChildren = item.children && item.children.length > 0

  return (
    <div className="flex flex-col">
      <div 
        className="group flex items-center gap-2 p-2 hover:bg-gray-800/50 rounded transition-colors border border-transparent hover:border-gray-700/50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button 
          onClick={() => onToggleExpand(item.id)}
          className={`p-1 hover:bg-gray-700 rounded transition-colors ${hasChildren ? 'visible' : 'invisible'}`}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </button>
        
        <div className="p-1 text-gray-500">
          <FileText className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(item)}>
          <span className="text-sm font-medium text-gray-200 truncate block">{item.title}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-900/20 text-blue-400 border border-blue-900/50 mr-2">
            {item.type || '剧情'}
          </span>
          <button 
            onClick={() => onAddChild(item.id)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="添加子项"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => onDelete(item.id)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="flex flex-col">
          {item.children?.map(child => (
            <TreeItem 
              key={child.id} 
              item={child} 
              depth={depth + 1} 
              onEdit={onEdit} 
              onAddChild={onAddChild} 
              onDelete={onDelete}
              expandedItems={expandedItems}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const PlotOutlineManager: React.FC<PlotOutlineManagerProps> = (props) => {
  const {
    novel,
    activePlotOutlineSetId,
    onSetActivePlotOutlineSetId,
    onUpdateNovel,
    onGeneratePlotOutline,
    isGenerating,
    userPrompt,
    setUserPrompt,
    onStopGeneration,
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
    onToggleOutlineSelector
  } = props

  const [showChat, setShowChat] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editSetName, setEditSetName] = useState('')
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  
  // Edit Item State
  const [editingItem, setEditingItem] = useState<PlotOutlineItem | null>(null)
  
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

  const activeSet = novel.plotOutlineSets?.find(s => s.id === activePlotOutlineSetId)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeSet?.chatHistory, showChat])

  const handleAddSet = () => {
    if (!newSetName.trim()) return
    const newId = crypto.randomUUID()
    const name = newSetName.trim()

    onUpdateNovel({
      ...novel,
      plotOutlineSets: [...(novel.plotOutlineSets || []), { id: newId, name, items: [] }],
      characterSets: [...(novel.characterSets || []), { id: newId, name, characters: [] }],
      worldviewSets: [...(novel.worldviewSets || []), { id: newId, name, entries: [] }],
      outlineSets: [...(novel.outlineSets || []), { id: newId, name, items: [] }],
      inspirationSets: [...(novel.inspirationSets || []), { id: newId, name, items: [] }]
    })

    setNewSetName('')
    onSetActivePlotOutlineSetId(newId)
  }

  const handleDeleteSet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmState({
      isOpen: true,
      title: '删除剧情粗纲文件',
      message: '确定要删除这个剧情粗纲文件吗？里面的所有内容都会被删除。',
      onConfirm: () => {
        const updatedSets = (novel.plotOutlineSets || []).filter(s => s.id !== id)
        onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
        if (activePlotOutlineSetId === id) {
          onSetActivePlotOutlineSetId(updatedSets.length > 0 ? updatedSets[0].id : null)
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const confirmRenameSet = () => {
    if (!editingSetId || !editSetName.trim()) return
    const updatedSets = (novel.plotOutlineSets || []).map(s => 
      s.id === editingSetId ? { ...s, name: editSetName.trim() } : s
    )
    onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
    setEditingSetId(null)
  }

  const updateItems = (newItems: PlotOutlineItem[]) => {
    if (!activeSet) return
    const updatedSets = (novel.plotOutlineSets || []).map(s => 
      s.id === activeSet.id ? { ...s, items: newItems } : s
    )
    onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
  }

  const findAndReplaceItem = (items: PlotOutlineItem[], newItem: PlotOutlineItem): PlotOutlineItem[] => {
    return items.map(item => {
      if (item.id === newItem.id) return newItem
      if (item.children) return { ...item, children: findAndReplaceItem(item.children, newItem) }
      return item
    })
  }

  const findAndDeleteItem = (items: PlotOutlineItem[], id: string): PlotOutlineItem[] => {
    return items.filter(item => item.id !== id).map(item => {
      if (item.children) return { ...item, children: findAndDeleteItem(item.children, id) }
      return item
    })
  }

  const findAndAddItem = (items: PlotOutlineItem[], parentId: string, newItem: PlotOutlineItem): PlotOutlineItem[] => {
    return items.map(item => {
      if (item.id === parentId) {
        return { ...item, children: [...(item.children || []), newItem] }
      }
      if (item.children) return { ...item, children: findAndAddItem(item.children, parentId, newItem) }
      return item
    })
  }

  const handleAddItem = (parentId: string | null = null) => {
    if (!activeSet) return
    const newItem: PlotOutlineItem = {
      id: crypto.randomUUID(),
      title: '新项',
      description: '',
      type: '剧情'
    }
    
    if (!parentId) {
      updateItems([...activeSet.items, newItem])
    } else {
      updateItems(findAndAddItem(activeSet.items, parentId, newItem))
      setExpandedItems(prev => new Set(prev).add(parentId))
    }
    setEditingItem(newItem)
  }

  const handleSaveItemEdit = () => {
    if (!editingItem || !activeSet) return
    updateItems(findAndReplaceItem(activeSet.items, editingItem))
    setEditingItem(null)
  }

  const handleDeleteItem = (id: string) => {
    if (!activeSet) return
    setConfirmState({
      isOpen: true,
      title: '删除项',
      message: '确定要删除此项及其所有子项吗？',
      onConfirm: () => {
        updateItems(findAndDeleteItem(activeSet.items, id))
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const handleClearChat = () => {
    if (!activeSet) return
    const updatedSets = (novel.plotOutlineSets || []).map(s =>
      s.id === activeSet.id ? { ...s, chatHistory: [] } : s
    )
    onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
  }

  const handleDeleteChatMessage = (index: number) => {
    if (!activeSet || !activeSet.chatHistory) return
    const newChatHistory = [...activeSet.chatHistory]
    newChatHistory.splice(index, 1)
    const updatedSets = (novel.plotOutlineSets || []).map(s =>
      s.id === activeSet.id ? { ...s, chatHistory: newChatHistory } : s
    )
    onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
  }

  const handleClearAll = () => {
    if (!activeSet) return
    setConfirmState({
      isOpen: true,
      title: '清空剧情粗纲',
      message: '确定要清空当前剧情粗纲的所有设定吗？此操作无法撤销。',
      onConfirm: () => {
        updateItems([])
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const updateUserNotes = (notes: string) => {
    if (!activeSet) return
    const updatedSets = (novel.plotOutlineSets || []).map(s =>
      s.id === activeSet.id ? { ...s, userNotes: notes } : s
    )
    onUpdateNovel({ ...novel, plotOutlineSets: updatedSets })
  }

  return (
    <div className="w-full flex flex-col md:flex-row h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full md:w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 transition-all duration-300 ${isMobileListOpen ? 'h-auto max-h-[60vh]' : 'h-auto'} md:h-auto`}>
        {sidebarHeader && (
          <div className="p-3 md:p-4 border-b border-gray-700 shrink-0">
            {sidebarHeader}
          </div>
        )}

        <div 
          className="p-3 md:p-4 border-b border-gray-700 flex items-center justify-between shrink-0 cursor-pointer md:cursor-default hover:bg-gray-700/30 md:hover:bg-transparent transition-colors"
          onClick={() => setIsMobileListOpen(!isMobileListOpen)}
        >
          <h3 className="font-bold flex items-center gap-2 text-gray-200">
            <LayoutList className="w-5 h-5 text-[var(--theme-color)]" />
            <span>剧情粗纲列表</span>
            <span className="md:hidden text-xs text-gray-500 font-normal ml-2">
              ({novel.plotOutlineSets?.length || 0})
            </span>
          </h3>
          <div className="md:hidden text-gray-400">
            <ChevronDown className={`w-4 h-4 transition-transform ${isMobileListOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isMobileListOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {novel.plotOutlineSets?.map(set => (
              <div 
                key={set.id}
                onClick={() => {
                  onSetActivePlotOutlineSetId(set.id)
                  if (window.innerWidth < 768) setIsMobileListOpen(false)
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  activePlotOutlineSetId === set.id 
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
                      <Folder className={`w-4 h-4 shrink-0 ${activePlotOutlineSetId === set.id ? 'text-white' : 'text-gray-500'}`} />
                      <span className="truncate text-sm font-medium">{set.name}</span>
                    </div>
                    <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activePlotOutlineSetId === set.id ? 'text-white' : 'text-gray-400'}`}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingSetId(set.id); setEditSetName(set.name); }} className="p-1 hover:bg-white/20 rounded"><Edit3 className="w-3 h-3" /></button>
                      <button onClick={(e) => handleDeleteSet(set.id, e)} className="p-1 hover:bg-white/20 rounded hover:text-red-200"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {(!novel.plotOutlineSets || novel.plotOutlineSets.length === 0) && (
              <div className="text-center py-8 text-gray-500 text-xs italic">
                暂无剧情粗纲文件，请新建
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
            <div className="flex gap-2">
              <input 
                value={newSetName} 
                onChange={e => setNewSetName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleAddSet()} 
                placeholder="新剧情粗纲名称..." 
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
                        {activeSet.items.length} 个根节点
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
                        <span className="hidden sm:inline">{showChat ? '返回' : 'AI聊天'}</span>
                     </button>

                     <button 
                        onClick={handleClearAll}
                        disabled={activeSet.items.length === 0}
                        className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-red-900/30 hover:bg-red-900/60 text-red-200 text-xs md:text-sm rounded-lg transition-colors border border-red-900/50 hover:border-red-700/50 disabled:opacity-30 disabled:cursor-not-allowed mr-2"
                        title="清空当前剧情粗纲"
                     >
                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">清空</span>
                     </button>

                     <button 
                        onClick={() => handleAddItem()}
                        className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs md:text-sm rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
                     >
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">添加根节点</span>
                        <span className="md:hidden">添加</span>
                     </button>
                  </div>
               </div>

               {/* AI Generation Input (Only shown when NOT in independent chat view) */}
               {onGeneratePlotOutline && !showChat && (
                  <div className="p-3 md:p-4 bg-gray-800/30 border-b border-gray-700/50">
                     <div className="w-full space-y-2">
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
                                 if (open) { onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
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
                                 if (open) { onToggleWorldviewSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
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
                                 if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleOutlineSelector(false); }
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
                                 if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); }
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
                                       onGeneratePlotOutline('generate')
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
                                    onClick={() => onGeneratePlotOutline('generate')}
                                    className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white"
                                 >
                                    <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    <span className="hidden md:inline">生成剧情粗纲</span>
                                    <span className="md:hidden">生成</span>
                                 </button>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               )}

               {/* Content Area */}
               <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar flex flex-col min-h-0">
                  {showChat ? (
                     <div className="flex-1 flex flex-col w-full h-full">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                           <div className="flex items-center gap-2 text-gray-400">
                              <Bot className="w-4 h-4" />
                              <span className="text-sm font-medium">剧情粗纲讨论对话</span>
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
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}>
                                       {msg.role === 'user' ? 'U' : 'AI'}
                                    </div>
                                    <span className="text-xs text-gray-500">
                                       {msg.role === 'user' ? '用户' : '剧情助手'}
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
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                 </div>
                              </div>
                           ))}
                           <div ref={chatEndRef} />
                           {(!activeSet.chatHistory || activeSet.chatHistory.length === 0) && (
                              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20">
                                 <Bot className="w-16 h-16 mb-4 opacity-10" />
                                 <p>开始与 AI 讨论你的剧情粗纲吧...</p>
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
                                    if (open) { onToggleCharacterSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
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
                                    if (open) { onToggleWorldviewSelector(false); onToggleInspirationSelector(false); onToggleOutlineSelector(false); }
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
                                    if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleOutlineSelector(false); }
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
                                    if (open) { onToggleWorldviewSelector(false); onToggleCharacterSelector(false); onToggleInspirationSelector(false); }
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
                                          onGeneratePlotOutline && onGeneratePlotOutline('chat');
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
                                          onClick={() => onGeneratePlotOutline && onGeneratePlotOutline('chat')}
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
                                                   `${m.role === 'user' ? '用户' : '剧情助手'}: ${m.content}`
                                                ).join('\n\n');
                                                const finalContent = userPrompt?.trim()
                                                   ? `${formattedHistory}\n\n用户最新想法: ${userPrompt}`
                                                   : formattedHistory;
                                                onReturnToMainWithContent(finalContent);
                                                setShowChat(false);
                                                if (onSetActivePresetId && lastNonChatPresetId) {
                                                   onSetActivePresetId(lastNonChatPresetId);
                                                }
                                             } else if (onGeneratePlotOutline) {
                                                onGeneratePlotOutline('generate');
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
                  <div className="w-full space-y-4 pb-8">
                     {/* User Notes Area */}
                     <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                        <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-2">
                           <FileText className="w-3 h-3" />
                           <span>用户输入记录 & 剧情上下文 (AI 生成时会参考此内容)</span>
                        </div>
                        <textarea 
                           value={activeSet.userNotes || ''}
                           onChange={(e) => updateUserNotes(e.target.value)}
                           className="w-full h-24 bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-xs md:text-sm text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none transition-all focus:bg-gray-900 focus:h-48 placeholder-gray-500 font-mono"
                           placeholder="用户的指令历史将自动记录在此处...&#10;你也可以手动添加关于这组剧情粗纲的全局设定、注意事项等。&#10;这些内容将作为上下文发送给 AI。"
                        />
                     </div>

                     <div className="space-y-1">
                        {activeSet.items.map(item => (
                           <TreeItem 
                           key={item.id} 
                           item={item} 
                           depth={0} 
                           onEdit={setEditingItem} 
                           onAddChild={handleAddItem}
                           onDelete={handleDeleteItem}
                           expandedItems={expandedItems}
                           onToggleExpand={(id) => setExpandedItems(prev => {
                              const next = new Set(prev)
                              if (next.has(id)) next.delete(id)
                              else next.add(id)
                              return next
                           })}
                           />
                        ))}
                        {activeSet.items.length === 0 && (
                           <div className="flex flex-col items-center justify-center py-20 text-gray-500 border-2 border-dashed border-gray-700/50 rounded-xl bg-gray-800/20">
                              <LayoutList className="w-16 h-16 mb-4 opacity-10" />
                              <p>暂无项，请点击上方“添加根节点”或使用 AI 生成</p>
                           </div>
                        )}
                     </div>
                  </div>
                  )}
               </div>
            </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
               <LayoutList className="w-24 h-24 mb-6 opacity-10" />
               <h2 className="text-xl font-bold text-gray-400 mb-2">请选择一个剧情粗纲文件</h2>
               <p className="text-sm">在左侧列表选择或创建一个新的文件</p>
            </div>
         )}

         {/* Edit Modal */}
         {editingItem && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
               <div className="bg-gray-800 w-full h-full md:h-[90vh] md:max-w-6xl md:rounded-xl shadow-2xl border border-gray-600 flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="p-5 border-b border-gray-700 flex justify-between items-center">
                     <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[var(--theme-color)]" />
                        <h3 className="font-bold text-lg text-gray-100">编辑剧情项</h3>
                     </div>
                     <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-white">
                        <X className="w-6 h-6" />
                     </button>
                  </div>
                  
                  <div className="flex-1 p-6 space-y-5 overflow-y-auto flex flex-col">
                     <div className="space-y-2 shrink-0">
                        <label className="text-sm font-medium text-gray-400">名称</label>
                        <input
                           value={editingItem.title}
                           onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
                           className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-base focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                           placeholder="输入剧情项名称..."
                           autoFocus
                        />
                     </div>

                     <div className="space-y-2 shrink-0">
                        <label className="text-sm font-medium text-gray-400">类型</label>
                        <input
                           value={editingItem.type}
                           onChange={e => setEditingItem({ ...editingItem, type: e.target.value })}
                           className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-base focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                           placeholder="输入类型 (如：剧情, 场景)..."
                        />
                     </div>
                     
                     <div className="space-y-2 flex-1 flex flex-col">
                        <label className="text-sm font-medium text-gray-400">描述内容</label>
                        <textarea
                           value={editingItem.description}
                           onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                           className="w-full flex-1 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed text-gray-200 focus:border-[var(--theme-color)] outline-none resize-none font-mono"
                           placeholder="输入剧情详情或描述内容..."
                        />
                     </div>
                  </div>

                  <div className="p-5 border-t border-gray-700 flex justify-end gap-3 bg-gray-800 rounded-b-xl">
                     <button 
                        onClick={() => setEditingItem(null)}
                        className="px-5 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                     >
                        取消
                     </button>
                     <button 
                        onClick={handleSaveItemEdit}
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
            <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
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
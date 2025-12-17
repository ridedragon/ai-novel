import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Edit3,
  FileText,
  Folder,
  Globe,
  Lightbulb,
  Loader2,
  Plus,
  Settings,
  StopCircle,
  Trash2,
  Users,
  X
} from 'lucide-react'
import React, { useState } from 'react'
import { CharacterItem, CharacterSet, Novel, WorldviewSet, OutlineSet, InspirationSet } from '../types'

interface CharacterManagerProps {
  novel: Novel
  activeCharacterSetId: string | null
  onSetActiveCharacterSetId: (id: string | null) => void
  onUpdateNovel: (updatedNovel: Novel) => void
  
  // AI Generation Props
  onGenerateCharacters?: () => void
  isGenerating?: boolean
  userPrompt?: string
  setUserPrompt?: (val: string) => void
  onStopGeneration?: () => void
  onShowSettings?: () => void
  modelName?: string
  sidebarHeader?: React.ReactNode

  // Context Selection
  selectedWorldviewSetId?: string | null
  setSelectedWorldviewSetId?: (id: string | null) => void
  selectedInspirationEntry?: { setId: string, index: number } | null
  setSelectedInspirationEntry?: (val: { setId: string, index: number } | null) => void
}

export const CharacterManager: React.FC<CharacterManagerProps> = ({
  novel,
  activeCharacterSetId,
  onSetActiveCharacterSetId,
  onUpdateNovel,
  onGenerateCharacters,
  isGenerating,
  userPrompt,
  setUserPrompt,
  onStopGeneration,
  onShowSettings,
  modelName,
  sidebarHeader,
  selectedWorldviewSetId,
  setSelectedWorldviewSetId,
  selectedInspirationEntry,
  setSelectedInspirationEntry
}) => {
  // Local State for Set Management
  const [newSetName, setNewSetName] = useState('')
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editSetName, setEditSetName] = useState('')
  
  // Local State for Mobile Sidebar
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)

  // Local State for Entry Editing
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null)
  const [editCharName, setEditCharName] = useState('')
  const [editCharBio, setEditCharBio] = useState('')

  // Local State for Selectors
  const [showWorldviewSelector, setShowWorldviewSelector] = useState(false)
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

  const activeSet = novel.characterSets?.find(s => s.id === activeCharacterSetId)

  // --- Set Management Helpers ---

  const handleAddSet = () => {
    if (!newSetName.trim()) return
    
    const newId = crypto.randomUUID()
    const name = newSetName.trim()

    const newCharacterSet: CharacterSet = {
      id: newId,
      name: name,
      characters: []
    }
    
    const newWorldviewSet: WorldviewSet = {
        id: newId,
        name: name,
        entries: []
    }
    
    const newOutlineSet: OutlineSet = {
        id: newId,
        name: name,
        items: []
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
    onSetActiveCharacterSetId(newId)
  }

  const handleDeleteSet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmState({
      isOpen: true,
      title: '删除角色文件',
      message: '确定要删除这个角色文件吗？里面的所有角色都会被删除。',
      onConfirm: () => {
        const updatedSets = (novel.characterSets || []).filter(s => s.id !== id)
        onUpdateNovel({ ...novel, characterSets: updatedSets })
        if (activeCharacterSetId === id) {
          onSetActiveCharacterSetId(updatedSets.length > 0 ? updatedSets[0].id : null)
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  const startRenameSet = (set: CharacterSet, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSetId(set.id)
    setEditSetName(set.name)
  }

  const confirmRenameSet = () => {
    if (!editingSetId || !editSetName.trim()) return
    const updatedSets = (novel.characterSets || []).map(s => 
      s.id === editingSetId ? { ...s, name: editSetName.trim() } : s
    )
    onUpdateNovel({ ...novel, characterSets: updatedSets })
    setEditingSetId(null)
  }

  // --- Character Management Helpers ---

  const updateCharacters = (newCharacters: CharacterItem[]) => {
    if (!activeSet) return
    const updatedSets = (novel.characterSets || []).map(s => 
      s.id === activeSet.id ? { ...s, characters: newCharacters } : s
    )
    onUpdateNovel({ ...novel, characterSets: updatedSets })
  }

  const handleAddCharacter = () => {
    if (!activeSet) return
    const newCharacter: CharacterItem = { name: '新角色', bio: '' }
    updateCharacters([...activeSet.characters, newCharacter])
    // Optionally open edit modal
    const newIndex = activeSet.characters.length
    setSelectedCharacterIndex(newIndex)
    setEditCharName('新角色')
    setEditCharBio('')
  }

  const handleDeleteCharacter = (index: number) => {
    if (!activeSet) return
    const newCharacters = [...activeSet.characters]
    newCharacters.splice(index, 1)
    updateCharacters(newCharacters)
  }

  const openEditCharacter = (index: number, char: CharacterItem) => {
    setSelectedCharacterIndex(index)
    setEditCharName(char.name)
    setEditCharBio(char.bio)
  }

  const saveEditCharacter = () => {
    if (selectedCharacterIndex === null || !activeSet) return
    const newCharacters = [...activeSet.characters]
    newCharacters[selectedCharacterIndex] = {
      name: editCharName,
      bio: editCharBio
    }
    updateCharacters(newCharacters)
    setSelectedCharacterIndex(null)
  }

  const updateUserNotes = (notes: string) => {
    if (!activeSet) return
    const updatedSets = (novel.characterSets || []).map(s => 
      s.id === activeSet.id ? { ...s, userNotes: notes } : s
    )
    onUpdateNovel({ ...novel, characterSets: updatedSets })
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
            <Users className="w-5 h-5 text-[var(--theme-color)]" />
            <span>角色文件列表</span>
            <span className="md:hidden text-xs text-gray-500 font-normal ml-2">
              ({novel.characterSets?.length || 0})
            </span>
          </h3>
          <div className="md:hidden text-gray-400">
             <ChevronDown className={`w-4 h-4 transition-transform ${isMobileListOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* List Content */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isMobileListOpen ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
           <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {novel.characterSets?.map(set => (
                <div 
                  key={set.id}
                  onClick={() => {
                     onSetActiveCharacterSetId(set.id)
                     if (window.innerWidth < 768) setIsMobileListOpen(false)
                  }}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    activeCharacterSetId === set.id 
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
                           <Folder className={`w-4 h-4 shrink-0 ${activeCharacterSetId === set.id ? 'text-white' : 'text-gray-500'}`} />
                           <span className="truncate text-sm font-medium">{set.name}</span>
                        </div>
                        
                        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activeCharacterSetId === set.id ? 'text-white' : 'text-gray-400'}`}>
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
              {(!novel.characterSets || novel.characterSets.length === 0) && (
                 <div className="text-center py-8 text-gray-500 text-xs italic">
                    暂无角色文件，请新建
                 </div>
              )}
           </div>

           <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
              <div className="flex gap-2">
                 <input 
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSet()}
                    placeholder="新角色集名称..."
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
                        {activeSet.characters.length} 个角色
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
                        onClick={handleAddCharacter}
                        className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs md:text-sm rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
                     >
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">手动添加角色</span>
                        <span className="md:hidden">添加</span>
                     </button>
                  </div>
               </div>

               {/* AI Generation Input */}
               {onGenerateCharacters && (
                  <div className="p-3 md:p-4 bg-gray-800/30 border-b border-gray-700/50">
                     <div className="max-w-4xl mx-auto space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                           <span className="text-xs text-gray-400 shrink-0">参考:</span>
                           {/* Worldview Selector */}
                           <div className="relative">
                              <button
                                 onClick={() => { setShowWorldviewSelector(!showWorldviewSelector); setShowInspirationSelector(false); }}
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

                           {/* Inspiration Selector */}
                           {setSelectedInspirationEntry && (
                              <div className="relative">
                                 <button
                                    onClick={() => { setShowInspirationSelector(!showInspirationSelector); setShowWorldviewSelector(false); }}
                                    className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 border border-gray-600 transition-colors"
                                 >
                                    <Lightbulb className="w-3 h-3 text-[var(--theme-color)]" />
                                    {selectedInspirationEntry
                                       ? (() => {
                                            const set = novel.inspirationSets?.find(s => s.id === selectedInspirationEntry.setId)
                                            const item = set?.items[selectedInspirationEntry.index]
                                            return item?.title || '灵感已删除'
                                         })()
                                       : '选择灵感'}
                                    <ChevronDown className="w-3 h-3" />
                                 </button>
                                 {showInspirationSelector && (
                                    <>
                                       <div className="fixed inset-0 z-20" onClick={() => setShowInspirationSelector(false)}></div>
                                       <div 
                                          className="absolute top-full left-0 mt-1 w-56 border border-gray-600 rounded-lg shadow-2xl z-30 max-h-80 overflow-y-auto ring-1 ring-black/20"
                                          style={{ backgroundColor: '#1f2937' }}
                                       >
                                          <button
                                             onClick={() => { setSelectedInspirationEntry(null); setShowInspirationSelector(false); }}
                                             className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:text-white border-b border-gray-600 transition-colors bg-transparent hover:bg-gray-700"
                                          >
                                             不使用灵感
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
                                                      const isSelected = selectedInspirationEntry?.setId === is.id && selectedInspirationEntry?.index === idx
                                                      return (
                                                         <button
                                                            key={idx}
                                                            onClick={() => { setSelectedInspirationEntry({ setId: is.id, index: idx }); setShowInspirationSelector(false); }}
                                                            className={`w-full text-left px-3 py-2 text-xs hover:text-white flex items-center gap-2 transition-colors bg-transparent hover:bg-gray-700 ${isSelected ? 'text-[var(--theme-color)] font-medium' : 'text-gray-300'}`}
                                                         >
                                                            <span className="truncate flex-1">{item.title || '未命名'}</span>
                                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-color)] shrink-0"></div>}
                                                         </button>
                                                      )
                                                   })
                                                )}
                                             </div>
                                          ))}
                                          {(!novel.inspirationSets || novel.inspirationSets.length === 0) && (
                                             <div className="px-3 py-4 text-center text-xs text-gray-500">暂无灵感集</div>
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
                                 onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onGenerateCharacters()}
                                 className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-xs md:text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                                 placeholder="AI 助手：描述角色特征 (如：一个冷酷的杀手，擅长使用飞刀)..."
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
                                 onClick={onGenerateCharacters}
                                 className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 transition-all shadow-lg shrink-0 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white"
                              >
                                 <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                 <span className="hidden md:inline">生成角色</span>
                                 <span className="md:hidden">生成</span>
                              </button>
                           )}
                        </div>
                     </div>
                  </div>
               )}

               {/* Content Area */}
               <div className="flex-1 overflow-y-auto p-2 md:p-8 custom-scrollbar flex flex-col min-h-0">
                  <div className="max-w-6xl mx-auto w-full space-y-4 pb-8">
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
                           placeholder="用户的指令历史将自动记录在此处...&#10;你也可以手动添加关于这组角色的全局设定、注意事项等。&#10;这些内容将作为上下文发送给 AI。"
                        />
                     </div>

                     {/* Character Grid */}
                     {activeSet.characters.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 md:py-20 text-gray-500 border-2 border-dashed border-gray-700/50 rounded-xl bg-gray-800/20">
                           <Users className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-20" />
                           <p className="text-base md:text-lg font-medium text-gray-400">暂无角色</p>
                           <p className="text-xs md:text-sm mt-1">请手动添加角色，或使用上方的 AI 助手生成</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                           {activeSet.characters.map((char, idx) => (
                              <div 
                                 key={idx}
                                 onClick={() => openEditCharacter(idx, char)}
                                 className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-[var(--theme-color)] hover:shadow-lg transition-all group flex flex-col h-[280px] md:h-[320px] cursor-pointer relative"
                              >
                                 <div className="bg-gray-900/50 p-3 md:p-4 border-b border-gray-700 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                       <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs md:text-sm shrink-0 shadow-lg">
                                          {char.name.slice(0, 1) || '?'}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                          <h4 className="font-bold text-gray-200 truncate text-sm md:text-base">{char.name || '未命名角色'}</h4>
                                       </div>
                                    </div>
                                    <button 
                                       onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteCharacter(idx)
                                       }}
                                       className="bg-transparent p-1.5 md:p-2 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                       title="删除角色"
                                    >
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                                 
                                 <div className="p-4 md:p-5 flex-1 bg-gray-800 relative overflow-hidden">
                                    <div className="h-full text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-[8] whitespace-pre-wrap">
                                       {char.bio || <span className="italic opacity-50">暂无角色设定...</span>}
                                    </div>
                                    
                                    {/* Decorative Icon */}
                                    <div className="absolute -bottom-4 -right-4 opacity-[0.03] pointer-events-none text-gray-100">
                                       <Users className="w-24 h-24 md:w-32 md:h-32" />
                                    </div>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
               <Users className="w-24 h-24 mb-6 opacity-10" />
               <h2 className="text-xl font-bold text-gray-400 mb-2">请选择一个角色文件</h2>
               <p className="text-sm">在左侧列表选择或创建一个新的文件</p>
            </div>
         )}

         {/* Edit Modal */}
         {selectedCharacterIndex !== null && (
            <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div 
                 className="bg-gray-800 w-full md:w-[800px] h-[90vh] md:h-[80vh] rounded-xl shadow-2xl border border-gray-600 flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200"
                 onClick={(e) => e.stopPropagation()}
               >
                  {/* Sidebar (Visuals) */}
                  <div className="w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700 flex flex-row md:flex-col items-center p-4 md:p-8 shrink-0 gap-4 md:gap-0">
                     <div className="w-16 h-16 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl md:text-4xl shadow-2xl md:mb-6 shrink-0">
                        {editCharName.slice(0, 1) || '?'}
                     </div>
                     <div className="flex-1 md:w-full flex flex-col items-start md:items-center min-w-0">
                       <h2 className="text-lg md:text-xl font-bold text-gray-100 text-left md:text-center md:mb-2 truncate w-full">{editCharName || '未命名'}</h2>
                       <p className="text-xs text-gray-500 text-left md:text-center md:mb-8 truncate w-full">
                          {activeSet?.name}
                       </p>
                     </div>
                     
                     <div className="w-auto md:w-full space-y-2 mt-0 md:mt-auto shrink-0">
                        <button 
                           onClick={() => setSelectedCharacterIndex(null)}
                           className="px-4 md:w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                        >
                           关闭
                        </button>
                     </div>
                  </div>
                  
                  {/* Main Edit Area */}
                  <div className="flex-1 flex flex-col bg-gray-800 h-full overflow-hidden">
                     <div className="p-6 border-b border-gray-700 bg-gray-800 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                           <FileText className="w-5 h-5 text-[var(--theme-color)]" />
                           <span className="font-bold text-lg">角色详情</span>
                        </div>
                        <button 
                           onClick={() => setSelectedCharacterIndex(null)}
                           className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white"
                        >
                           <X className="w-5 h-5" />
                        </button>
                     </div>
                     
                     <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                        <div className="space-y-2">
                           <label className="text-sm font-medium text-gray-400">角色名称</label>
                           <input 
                              value={editCharName}
                              onChange={(e) => setEditCharName(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-base focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                              placeholder="输入角色名称..."
                           />
                        </div>
                        
                        <div className="space-y-2 flex-1 flex flex-col min-h-[300px]">
                           <label className="text-sm font-medium text-gray-400">角色设定 (Bio)</label>
                           <textarea 
                              value={editCharBio}
                              onChange={(e) => setEditCharBio(e.target.value)}
                              className="w-full flex-1 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none resize-none transition-all font-mono"
                              placeholder="输入详细的角色设定、背景故事、性格特征等..."
                           />
                        </div>
                     </div>

                     {/* Footer Actions */}
                     <div className="p-4 border-t border-gray-700 bg-gray-800 flex justify-end gap-3">
                        <button 
                           onClick={saveEditCharacter}
                           className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white font-medium rounded-lg shadow-lg transition-all"
                        >
                           保存修改
                        </button>
                     </div>
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

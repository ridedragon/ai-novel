import { X } from 'lucide-react'
import React from 'react'
import { Novel, OutlineItem } from '../../types'

interface OutlineEditModalProps {
  isOpen: boolean
  editingOutlineItemIndex: number | null
  setEditingOutlineItemIndex: (index: number | null) => void
  activeNovel?: Novel
  activeOutlineSetId: string | null
  updateOutlineItemsInSet: (setId: string, newItems: OutlineItem[]) => void
}

export const OutlineEditModal: React.FC<OutlineEditModalProps> = (props) => {
  const {
    isOpen,
    editingOutlineItemIndex,
    setEditingOutlineItemIndex,
    activeNovel,
    activeOutlineSetId,
    updateOutlineItemsInSet
  } = props

  if (!isOpen || editingOutlineItemIndex === null || !activeNovel || !activeOutlineSetId) return null

  const set = activeNovel.outlineSets?.find(s => s.id === activeOutlineSetId)
  const item = set?.items[editingOutlineItemIndex]
  
  if (!set || !item) {
     return null
  }

  const updateItem = (updates: Partial<OutlineItem>) => {
     const newItems = [...set.items]
     newItems[editingOutlineItemIndex] = { ...item, ...updates }
     updateOutlineItemsInSet(set.id, newItems)
  }

  return (
     <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
        <div 
           className="bg-gray-800 w-full h-full md:w-[800px] md:h-[80vh] md:rounded-xl shadow-2xl border-none md:border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
           onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-900 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-400">
                     {editingOutlineItemIndex + 1}
                  </div>
                  <span className="font-bold text-lg text-gray-200">编辑章节大纲</span>
               </div>
               <button 
                  onClick={() => setEditingOutlineItemIndex(null)}
                  className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
               >
                  <X className="w-6 h-6" />
               </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-gray-800">
               <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">章节标题</label>
                  <input 
                     value={item.title}
                     onChange={(e) => updateItem({ title: e.target.value })}
                     className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-lg font-bold focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                     placeholder="输入章节标题..."
                  />
               </div>
               
               <div className="space-y-2 flex-1 flex flex-col min-h-[50vh]">
                  <label className="text-sm font-medium text-gray-400">章节摘要</label>
                  <textarea 
                     value={item.summary}
                     onChange={(e) => updateItem({ summary: e.target.value })}
                     className="w-full flex-1 bg-gray-900 border border-gray-600 rounded-lg p-4 text-base leading-relaxed focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none resize-none transition-all font-mono"
                     placeholder="输入详细的章节剧情摘要..."
                  />
               </div>
            </div>

            {/* Footer (Mobile Only Save hint or just Close) */}
            <div className="p-4 border-t border-gray-700 bg-gray-900 md:hidden">
               <button 
                  onClick={() => setEditingOutlineItemIndex(null)}
                  className="w-full py-3 bg-[var(--theme-color)] text-white rounded-lg font-medium shadow-lg"
               >
                  完成
               </button>
            </div>
        </div>
     </div>
  )
}
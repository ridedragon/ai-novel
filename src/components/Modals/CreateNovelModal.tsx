import React from 'react'

interface CreateNovelModalProps {
  isOpen: boolean
  onClose: () => void
  newNovelTitle: string
  setNewNovelTitle: (val: string) => void
  newNovelVolume: string
  setNewNovelVolume: (val: string) => void
  onConfirm: () => void
}

export const CreateNovelModal: React.FC<CreateNovelModalProps> = ({
  isOpen,
  onClose,
  newNovelTitle,
  setNewNovelTitle,
  newNovelVolume,
  setNewNovelVolume,
  onConfirm
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-[95%] md:w-[400px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-center">
           <h3 className="text-lg font-bold text-gray-200">创建新小说</h3>
        </div>
        
        <div className="p-6 space-y-4">
           <div className="space-y-2">
             <label className="text-sm font-medium text-gray-300">小说名称</label>
             <input 
               type="text" 
               value={newNovelTitle}
               onChange={(e) => setNewNovelTitle(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
               placeholder="请输入小说标题"
               autoFocus
               onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirm()
                  if (e.key === 'Escape') onClose()
               }}
             />
           </div>
           <div className="space-y-2">
             <label className="text-sm font-medium text-gray-300">开始卷名称 (可选)</label>
             <input 
               type="text" 
               value={newNovelVolume}
               onChange={(e) => setNewNovelVolume(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
               placeholder="例如：第一卷"
               onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirm()
                  if (e.key === 'Escape') onClose()
               }}
             />
           </div>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-center gap-3">
           <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded transition-colors border border-gray-600">
             取消
           </button>
           <button onClick={onConfirm} disabled={!newNovelTitle.trim()} className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors shadow">
             创建
           </button>
        </div>
      </div>
    </div>
  )
}
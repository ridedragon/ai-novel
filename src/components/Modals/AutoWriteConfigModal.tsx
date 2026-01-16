import { PlayCircle, X } from 'lucide-react'
import React from 'react'
import { NovelVolume } from '../../types'

interface AutoWriteConfigModalProps {
  isOpen: boolean
  onClose: () => void
  volumes: NovelVolume[]
  autoWriteMode: 'existing' | 'new'
  setAutoWriteMode: (mode: 'existing' | 'new') => void
  autoWriteSelectedVolumeId: string
  setAutoWriteSelectedVolumeId: (id: string) => void
  autoWriteNewVolumeName: string
  setAutoWriteNewVolumeName: (name: string) => void
  handleConfirmAutoWrite: () => void
}

export const AutoWriteConfigModal: React.FC<AutoWriteConfigModalProps> = (props) => {
  const {
    isOpen, onClose, volumes, autoWriteMode, setAutoWriteMode,
    autoWriteSelectedVolumeId, setAutoWriteSelectedVolumeId,
    autoWriteNewVolumeName, setAutoWriteNewVolumeName, handleConfirmAutoWrite
  } = props

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-[95%] md:w-[400px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-center relative">
           <h3 className="text-lg font-bold text-gray-200">开始全自动创作</h3>
           <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-white md:hidden">
             <X className="w-5 h-5" />
           </button>
        </div>
        
        <div className="p-6 space-y-6">
           <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                 <input 
                    type="radio" 
                    checked={autoWriteMode === 'existing'}
                    onChange={() => setAutoWriteMode('existing')}
                    disabled={volumes.length === 0}
                    className="w-4 h-4 text-[var(--theme-color)] bg-gray-700 border-gray-600 focus:ring-[var(--theme-color)]"
                 />
                 <span className={`text-sm ${volumes.length === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                    归入已有分卷
                 </span>
              </label>
              
              {autoWriteMode === 'existing' && (
                 <div className="pl-7">
                    <select 
                       value={autoWriteSelectedVolumeId}
                       onChange={(e) => setAutoWriteSelectedVolumeId(e.target.value)}
                       className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
                    >
                       {volumes.map(v => (
                          <option key={v.id} value={v.id}>{v.title}</option>
                       ))}
                    </select>
                 </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                 <input 
                    type="radio" 
                    checked={autoWriteMode === 'new'}
                    onChange={() => setAutoWriteMode('new')}
                    className="w-4 h-4 text-[var(--theme-color)] bg-gray-700 border-gray-600 focus:ring-[var(--theme-color)]"
                 />
                 <span className="text-sm text-gray-300">
                    新建分卷
                 </span>
              </label>

              {autoWriteMode === 'new' && (
                 <div className="pl-7">
                    <input 
                       type="text"
                       value={autoWriteNewVolumeName}
                       onChange={(e) => setAutoWriteNewVolumeName(e.target.value)}
                       className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
                       placeholder="输入新分卷名称"
                       autoFocus
                       onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmAutoWrite()
                          if (e.key === 'Escape') onClose()
                       }}
                    />
                 </div>
              )}
           </div>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-center gap-3">
           <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded transition-colors border border-gray-600">
             取消
           </button>
           <button 
              onClick={handleConfirmAutoWrite} 
              disabled={autoWriteMode === 'new' && !autoWriteNewVolumeName.trim()}
              className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors shadow flex items-center gap-2"
           >
             <PlayCircle className="w-4 h-4" />
             开始
           </button>
        </div>
      </div>
    </div>
  )
}
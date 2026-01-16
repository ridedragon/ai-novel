import React from 'react'

interface PresetNameModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  presetNameInput: string
  setPresetNameInput: (val: string) => void
  title?: string
}

export const PresetNameModal: React.FC<PresetNameModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  presetNameInput,
  setPresetNameInput,
  title = "Preset name:"
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-[95%] md:w-[400px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-center">
           <h3 className="text-lg font-bold text-gray-200">{title}</h3>
        </div>
        
        <div className="p-6 space-y-4">
           <p className="text-sm text-gray-400 text-center">Hint: Use a character/group name to bind preset to a specific chat.</p>
           <input 
             type="text" 
             value={presetNameInput}
             onChange={(e) => setPresetNameInput(e.target.value)}
             className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none text-center"
             autoFocus
             onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm()
                if (e.key === 'Escape') onClose()
             }}
           />
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-center gap-3">
           <button onClick={onConfirm} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors shadow">保存</button>
           <button onClick={onClose} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded transition-colors border border-gray-600">取消</button>
        </div>
      </div>
    </div>
  )
}
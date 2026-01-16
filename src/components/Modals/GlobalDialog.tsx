import React from 'react'

interface GlobalDialogProps {
  isOpen: boolean
  type: 'alert' | 'confirm' | 'prompt' | 'select'
  title: string
  message: string
  inputValue: string
  setInputValue: (val: string) => void
  selectOptions?: { label: string; value: string }[]
  onConfirm: (value?: string) => void
  onCancel: () => void
}

export const GlobalDialog: React.FC<GlobalDialogProps> = (props) => {
  const {
    isOpen, type, title, message, inputValue, setInputValue,
    selectOptions, onConfirm, onCancel
  } = props

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-[95%] md:w-[400px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-center">
           <h3 className="text-lg font-bold text-gray-200">{title}</h3>
        </div>
        
        <div className="p-6 space-y-4">
           {message && (
             <p className="text-gray-300 text-center text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
           )}
           
           {type === 'prompt' && (
             <input 
               type="text" 
               value={inputValue}
               onChange={(e) => setInputValue(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
               autoFocus
               onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirm(inputValue)
                  if (e.key === 'Escape') onCancel()
               }}
             />
           )}

           {type === 'select' && selectOptions && (
             <select
               value={inputValue}
               onChange={(e) => setInputValue(e.target.value)}
               className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
             >
               {selectOptions.map(option => (
                 <option key={option.value} value={option.value}>
                   {option.label}
                 </option>
               ))}
             </select>
           )}
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-center gap-3">
           {type !== 'alert' && (
             <button 
               onClick={onCancel} 
               className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm rounded transition-colors border border-gray-600"
             >
               取消
             </button>
           )}
           <button 
             onClick={() => onConfirm(inputValue)} 
             className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-sm rounded transition-colors shadow"
           >
             确定
           </button>
        </div>
      </div>
    </div>
  )
}
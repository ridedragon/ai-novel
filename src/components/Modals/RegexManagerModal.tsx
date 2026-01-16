import {
  Edit2,
  List,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X
} from 'lucide-react'
import React from 'react'
import { CompletionPreset, RegexScript } from '../../types'
import { RegexEditorModal } from './RegexEditorModal'

interface RegexManagerModalProps {
  isOpen: boolean
  onClose: () => void
  globalRegexScripts: RegexScript[]
  completionPresets: CompletionPreset[]
  activePresetId: string
  handleAddNewRegex: (type: 'global' | 'preset') => void
  handleDeleteRegex: (id: string, type: 'global' | 'preset') => void
  handleEditRegex: (script: RegexScript, type: 'global' | 'preset') => void
  handleToggleRegexDisabled: (id: string, type: 'global' | 'preset') => void
  
  // Editor Sub-modal
  showRegexEditor: boolean
  setShowRegexEditor: (val: boolean) => void
  editingRegexScript: RegexScript | null
  setEditingRegexScript: (s: RegexScript | null) => void
  regexEditorMode: 'global' | 'preset'
  setRegexEditorMode: (mode: 'global' | 'preset') => void
  handleSaveRegex: () => void
}

export const RegexManagerModal: React.FC<RegexManagerModalProps> = (props) => {
  const {
    isOpen, onClose, globalRegexScripts, completionPresets, activePresetId,
    handleAddNewRegex, handleDeleteRegex, handleEditRegex, handleToggleRegexDisabled,
    showRegexEditor, setShowRegexEditor, editingRegexScript, setEditingRegexScript,
    regexEditorMode, setRegexEditorMode, handleSaveRegex
  } = props

  if (!isOpen) return null

  const activePreset = completionPresets.find(p => p.id === activePresetId)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[500px] h-[600px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
         <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
             <h3 className="text-lg font-bold text-gray-200">正则脚本管理</h3>
             <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Global Scripts */}
            <div className="space-y-2">
               <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-300">全局正则脚本</span>
                  <button onClick={() => handleAddNewRegex('global')} className="p-1 hover:bg-gray-700 rounded text-[var(--theme-color)]"><Plus className="w-4 h-4" /></button>
               </div>
               <p className="text-xs text-gray-500">影响所有角色，保存在本地设定中。</p>
               
               <div className="space-y-2">
                  {globalRegexScripts.map(script => (
                     <div key={script.id} className="flex items-center gap-2 p-3 bg-gray-900/50 rounded border border-gray-700">
                        <List className="w-4 h-4 text-gray-500" />
                        <span className="flex-1 text-sm text-gray-200 truncate">{script.scriptName}</span>
                        
                        <div className="flex items-center gap-1">
                           <button 
                             onClick={() => handleToggleRegexDisabled(script.id, 'global')}
                             className={`bg-transparent p-1.5 rounded hover:bg-gray-700 ${script.disabled ? 'text-gray-500' : 'text-[var(--theme-color)]'}`}
                           >
                              {script.disabled ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                           </button>
                           <button onClick={() => handleEditRegex(script, 'global')} className="bg-transparent p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"><Edit2 className="w-4 h-4" /></button>
                           <button onClick={() => handleDeleteRegex(script.id, 'global')} className="bg-transparent p-1.5 rounded hover:bg-gray-700 text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

            {/* Preset Scripts */}
            <div className="space-y-2 pt-4 border-t border-gray-700">
               <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-300">预设正则脚本</span>
                  <button onClick={() => handleAddNewRegex('preset')} className="p-1 hover:bg-gray-700 rounded text-[var(--theme-color)]"><Plus className="w-4 h-4" /></button>
               </div>
               <p className="text-xs text-gray-500">只影响当前预设 ({activePreset?.name})。</p>
               
               <div className="space-y-2">
                  {activePreset?.regexScripts?.map(script => (
                     <div key={script.id} className="flex items-center gap-2 p-3 bg-gray-900/50 rounded border border-gray-700">
                        <List className="w-4 h-4 text-gray-500" />
                        <span className="flex-1 text-sm text-gray-200 truncate">{script.scriptName}</span>
                        
                        <div className="flex items-center gap-1">
                           <button 
                             onClick={() => handleToggleRegexDisabled(script.id, 'preset')}
                             className={`bg-transparent p-1.5 rounded hover:bg-gray-700 ${script.disabled ? 'text-gray-500' : 'text-[var(--theme-color)]'}`}
                           >
                              {script.disabled ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                           </button>
                           <button onClick={() => handleEditRegex(script, 'preset')} className="bg-transparent p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"><Edit2 className="w-4 h-4" /></button>
                           <button onClick={() => handleDeleteRegex(script.id, 'preset')} className="bg-transparent p-1.5 rounded hover:bg-gray-700 text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>

      <RegexEditorModal
        isOpen={showRegexEditor}
        onClose={() => setShowRegexEditor(false)}
        editingRegexScript={editingRegexScript}
        setEditingRegexScript={setEditingRegexScript}
        onSave={handleSaveRegex}
      />
    </div>
  )
}
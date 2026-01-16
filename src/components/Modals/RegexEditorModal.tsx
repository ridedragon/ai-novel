import { Bot, X } from 'lucide-react'
import React from 'react'
import { RegexScript } from '../../types'

interface RegexEditorModalProps {
  isOpen: boolean
  onClose: () => void
  editingRegexScript: RegexScript | null
  setEditingRegexScript: (s: RegexScript | null) => void
  onSave: () => void
}

export const RegexEditorModal: React.FC<RegexEditorModalProps> = ({
  isOpen,
  onClose,
  editingRegexScript,
  setEditingRegexScript,
  onSave
}) => {
  if (!isOpen || !editingRegexScript) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[600px] max-h-[90vh] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
         <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-200">正则表达式编辑器</h3>
                <button className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 flex items-center gap-1">
                   <Bot className="w-3 h-3" /> 测试模式
                </button>
             </div>
             <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
         </div>

         <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            <div className="space-y-1">
               <label className="text-sm font-medium text-gray-400">脚本名称</label>
               <input 
                  type="text" 
                  value={editingRegexScript.scriptName}
                  onChange={(e) => setEditingRegexScript({...editingRegexScript, scriptName: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none"
               />
            </div>

            <div className="space-y-1">
               <label className="text-sm font-medium text-gray-400">查找正则表达式</label>
               <input 
                  type="text" 
                  value={editingRegexScript.findRegex}
                  onChange={(e) => setEditingRegexScript({...editingRegexScript, findRegex: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none font-mono"
                  placeholder="/(.*)/s"
               />
            </div>

            <div className="space-y-1">
               <label className="text-sm font-medium text-gray-400">替换为</label>
               <textarea 
                  value={editingRegexScript.replaceString}
                  onChange={(e) => setEditingRegexScript({...editingRegexScript, replaceString: e.target.value})}
                  className="w-full h-24 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none font-mono"
               />
            </div>
            
            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">作用范围</label>
                  <div className="space-y-2">
                     <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingRegexScript.placement.includes(1)}
                          onChange={(e) => {
                             const newPlacement = e.target.checked 
                                ? [...editingRegexScript.placement, 1]
                                : editingRegexScript.placement.filter(p => p !== 1)
                             setEditingRegexScript({...editingRegexScript, placement: newPlacement})
                          }}
                          className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]"
                        />
                        用户输入 (Context)
                     </label>
                     <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingRegexScript.placement.includes(2)}
                          onChange={(e) => {
                             const newPlacement = e.target.checked 
                                ? [...editingRegexScript.placement, 2]
                                : editingRegexScript.placement.filter(p => p !== 2)
                             setEditingRegexScript({...editingRegexScript, placement: newPlacement})
                          }}
                          className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]"
                        />
                        AI 输出
                     </label>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">其他选项</label>
                  <div className="space-y-2">
                     <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingRegexScript.disabled}
                          onChange={(e) => setEditingRegexScript({...editingRegexScript, disabled: e.target.checked})}
                          className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]"
                        />
                        已禁用
                     </label>
                     <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingRegexScript.runOnEdit}
                          onChange={(e) => setEditingRegexScript({...editingRegexScript, runOnEdit: e.target.checked})}
                          className="rounded bg-gray-700 border-gray-600 text-[var(--theme-color)]"
                        />
                        在编辑时运行
                     </label>
                  </div>
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-sm font-medium text-gray-400">修剪掉 (Trim Strings)</label>
               <p className="text-xs text-gray-500 mb-1">在替换之前全局修剪正则表达式匹配中任何不需要的部分。用回车键分隔每个元素。</p>
               <textarea 
                  value={editingRegexScript.trimStrings.join('\n')}
                  onChange={(e) => setEditingRegexScript({...editingRegexScript, trimStrings: e.target.value.split('\n')})}
                  className="w-full h-20 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-[var(--theme-color)] outline-none font-mono"
               />
            </div>
         </div>

         <div className="p-4 bg-gray-900 border-t border-gray-700 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors border border-gray-600">取消</button>
             <button onClick={onSave} className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-sm rounded transition-colors shadow">保存</button>
         </div>
      </div>
    </div>
  )
}
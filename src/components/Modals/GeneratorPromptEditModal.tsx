import { Save, X } from 'lucide-react'
import React from 'react'
import { GeneratorPrompt } from '../../types'

interface GeneratorPromptEditModalProps {
  isOpen: boolean
  prompt: GeneratorPrompt | null
  onClose: () => void
  onSave: () => void
  onUpdatePrompt: (updates: Partial<GeneratorPrompt>) => void
}

export const GeneratorPromptEditModal: React.FC<GeneratorPromptEditModalProps> = ({
  isOpen,
  prompt,
  onClose,
  onSave,
  onUpdatePrompt
}) => {
  if (!isOpen || !prompt) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full md:w-[700px] rounded-lg shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-200">编辑提示词</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">姓名</label>
              <input
                type="text"
                value={prompt.name || ''}
                onChange={(e) => onUpdatePrompt({ name: e.target.value })}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2.5 text-sm focus:border-[var(--theme-color)] outline-none"
                placeholder="此提示词的名称 (可选)"
              />
              <p className="text-xs text-gray-500">此提示词的名称。</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">角色</label>
              <select
                value={prompt.role}
                onChange={(e) => onUpdatePrompt({ role: e.target.value as any })}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2.5 text-sm focus:border-[var(--theme-color)] outline-none"
              >
                <option value="system">系统 (System)</option>
                <option value="user">用户 (User)</option>
                <option value="assistant">助手 (Assistant)</option>
              </select>
              <p className="text-xs text-gray-500">此消息归用于谁。</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">提示词</label>
            <textarea
              value={prompt.content}
              onChange={(e) => onUpdatePrompt({ content: e.target.value })}
              className="w-full h-64 bg-gray-900 border border-gray-600 rounded px-3 py-2.5 text-sm focus:border-[var(--theme-color)] outline-none font-mono resize-none leading-relaxed"
              placeholder="输入提示词内容..."
            />
          </div>
        </div>
        <div className="p-4 border-t border-gray-700 bg-gray-800 shrink-0 flex items-center justify-end">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors border border-gray-600"
            >
              取消
            </button>
            <button
              onClick={onSave}
              className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white text-sm rounded transition-colors shadow flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
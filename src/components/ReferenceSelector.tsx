import {
  Book,
  Check,
  ChevronDown,
  Globe,
  Lightbulb,
  Users
} from 'lucide-react'
import React from 'react'
import { Novel } from '../types'

interface ReferenceSelectorProps {
  novel: Novel | undefined
  type: 'worldview' | 'character' | 'inspiration' | 'outline'
  selectedSetId: string | null
  selectedItemIndices: number[]
  onSelectSet: (setId: string | null) => void
  onToggleItem: (setId: string, index: number) => void
  isOpen: boolean
  onToggleOpen: (open: boolean) => void
}

export const ReferenceSelector: React.FC<ReferenceSelectorProps> = ({
  novel,
  type,
  selectedSetId,
  selectedItemIndices,
  onSelectSet,
  onToggleItem,
  isOpen,
  onToggleOpen
}) => {
  if (!novel) return null

  const getIcon = () => {
    switch (type) {
      case 'worldview': return <Globe className="w-3 h-3" />
      case 'character': return <Users className="w-3 h-3" />
      case 'inspiration': return <Lightbulb className="w-3 h-3" />
      case 'outline': return <Book className="w-3 h-3" />
    }
  }

  const getLabel = () => {
    const labels = {
      worldview: '世界观',
      character: '角色集',
      inspiration: '灵感',
      outline: '大纲'
    }
    
    if (selectedSetId) {
      const sets = {
        worldview: novel.worldviewSets,
        character: novel.characterSets,
        inspiration: novel.inspirationSets,
        outline: novel.outlineSets
      }
      const set = (sets[type] as any[])?.find(s => s.id === selectedSetId)
      if (set) {
        let text = set.name
        if (selectedItemIndices.length > 0) {
          text += ` (${selectedItemIndices.length})`
        }
        return text
      }
    }
    return labels[type]
  }

  const getSets = () => {
    switch (type) {
      case 'worldview': return novel.worldviewSets || []
      case 'character': return novel.characterSets || []
      case 'inspiration': return novel.inspirationSets || []
      case 'outline': return novel.outlineSets || []
    }
  }

  const sets = getSets()

  return (
    <div className="relative">
      <button
        onClick={() => onToggleOpen(!isOpen)}
        className={`flex items-center gap-1 text-[10px] md:text-xs px-2 py-1 rounded border transition-colors ${
          selectedSetId ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color-light)]' : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
        }`}
      >
        {getIcon()}
        <span className="max-w-[80px] truncate">{getLabel()}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onToggleOpen(false)}></div>
          <div className="absolute bottom-full left-0 mb-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 max-h-80 overflow-y-auto custom-scrollbar">
            <button
              onClick={() => { onSelectSet(null); onToggleOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-700 border-b border-gray-700"
            >
              不使用
            </button>
            {sets.map((set: any) => (
              <div key={set.id} className="border-b border-gray-700 last:border-0">
                <button
                  onClick={() => onSelectSet(set.id === selectedSetId ? null : set.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 flex items-center justify-between font-bold ${
                    selectedSetId === set.id ? 'text-[var(--theme-color-light)] bg-gray-700/50' : 'text-gray-300'
                  }`}
                >
                  <span className="truncate">{set.name}</span>
                  {selectedSetId === set.id && selectedItemIndices.length === 0 && <Check className="w-3 h-3" />}
                </button>
                
                {/* Items */}
                <div className="bg-gray-900/30">
                  {(set.entries || set.characters || set.items || []).map((item: any, idx: number) => {
                    const isSelected = selectedSetId === set.id && selectedItemIndices.includes(idx)
                    const title = item.item || item.name || item.title || `条目 ${idx + 1}`
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => onToggleItem(set.id, idx)}
                        className={`w-full text-left px-6 py-1.5 text-[10px] md:text-xs hover:bg-gray-700 flex items-center gap-2 transition-colors ${
                          isSelected ? 'text-[var(--theme-color-light)] bg-gray-700/30' : 'text-gray-500'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[var(--theme-color)] border-[var(--theme-color)]' : 'border-gray-600'
                        }`}>
                          {isSelected && <Check className="w-2 h-2 text-white" />}
                        </div>
                        <span className="truncate">{title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
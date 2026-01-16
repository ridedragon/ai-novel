import { X } from 'lucide-react'
import React from 'react'

interface AnalysisResultModalProps {
  isOpen: boolean
  onClose: () => void
  analysisResult: string
}

export const AnalysisResultModal: React.FC<AnalysisResultModalProps> = ({
  isOpen,
  onClose,
  analysisResult
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-800 w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl border border-gray-600 flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-lg text-gray-100">本章分析结果</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {analysisResult ? (
              analysisResult
            ) : (
              <span className="text-gray-500 italic">
                暂无分析内容，请先运行“两阶段优化”或单独的分析任务。
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
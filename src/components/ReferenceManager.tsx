import {
  FileText,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import React, { useState } from 'react'
import { Novel, ReferenceFile } from '../types'

interface ReferenceManagerProps {
  novel: Novel
  onUpdateNovel: (updatedNovel: Novel) => void
  sidebarHeader?: React.ReactNode
  onBack?: () => void
}

export const ReferenceManager: React.FC<ReferenceManagerProps> = ({
  novel,
  onUpdateNovel,
  sidebarHeader,
  onBack
}) => {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [isUploading, setIsLoading] = useState(false)

  const activeFile = novel.referenceFiles?.find(f => f.id === selectedFileId)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsLoading(true)
    const newFiles: ReferenceFile[] = [...(novel.referenceFiles || [])]

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const content = await readFileAsText(file)
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: content,
          type: file.type || 'text/plain',
          size: file.size,
          lastModified: file.lastModified
        })
      } catch (err) {
        console.error(`Failed to read file ${file.name}`, err)
      }
    }

    onUpdateNovel({
      ...novel,
      referenceFiles: newFiles
    })
    setIsLoading(false)
    // Reset input
    e.target.value = ''
  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })
  }

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这个参考文件吗？')) {
      const updatedFiles = (novel.referenceFiles || []).filter(f => f.id !== id)
      onUpdateNovel({ ...novel, referenceFiles: updatedFiles })
      if (selectedFileId === id) setSelectedFileId(null)
    }
  }

  return (
    <div className="w-full flex flex-col md:flex-row h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Sidebar: File List */}
      <div className="w-full md:w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
        {sidebarHeader && (
          <div className="p-3 md:p-4 border-b border-gray-700 shrink-0">
            {sidebarHeader}
          </div>
        )}

        <div className="p-3 md:p-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <h3 className="font-bold flex items-center gap-2 text-gray-200">
            <FileText className="w-5 h-5 text-blue-400" />
            <span>参考资料列表</span>
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {novel.referenceFiles?.map(file => (
            <div
              key={file.id}
              onClick={() => setSelectedFileId(file.id)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                selectedFileId === file.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText className={`w-4 h-4 shrink-0 ${selectedFileId === file.id ? 'text-white' : 'text-gray-500'}`} />
                <span className="truncate text-sm font-medium">{file.name}</span>
              </div>
              <button
                onClick={(e) => handleDeleteFile(file.id, e)}
                className={`p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded ${selectedFileId === file.id ? 'text-white' : 'text-gray-400'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {(!novel.referenceFiles || novel.referenceFiles.length === 0) && (
            <div className="text-center py-8 text-gray-500 text-xs italic">
              暂无参考资料，请上传
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
          <label className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer transition-colors shadow-lg shadow-blue-900/20">
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">上传资料 (TXT)</span>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".txt,.md"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Main Content: File Viewer */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0 h-full overflow-hidden relative">
        {activeFile ? (
          <>
            <div className="p-3 md:p-4 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between shrink-0 z-10 backdrop-blur-sm sticky top-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <h2 className="text-lg md:text-xl font-bold text-gray-100 truncate">{activeFile.name}</h2>
                <span className="bg-gray-700 text-gray-400 text-[10px] md:text-xs px-2 py-0.5 rounded-full shrink-0">
                  {(activeFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                onClick={() => setSelectedFileId(null)}
                className="p-2 hover:bg-gray-700 rounded-full text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              <div className="max-w-4xl mx-auto">
                <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6 shadow-inner min-h-full">
                  <pre className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono break-words">
                    {activeFile.content}
                  </pre>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 text-blue-500/30">
              <Upload className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-gray-400 mb-2">资料库</h2>
            <p className="text-sm max-w-xs text-center leading-relaxed">
              在此处上传背景资料、大纲草稿或设定笔记。上传后，点击左侧列表即可查看内容。
            </p>
            <div className="mt-8 flex gap-4">
               <label className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 cursor-pointer">
                  立即上传资料
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".txt,.md"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
               </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileDown,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
// @ts-ignore
import * as mammoth from 'mammoth'
import { Novel, ReferenceFile, ReferenceFolder } from '../types'

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
  // Safety check
  if (!novel) return <div className="flex-1 flex items-center justify-center text-gray-500">数据加载中...</div>

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [isUploading, setIsLoading] = useState(false)

  // 弹窗状态
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderNameInput, setFolderNameInput] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'file' | 'folder' } | null>(null)

  const activeFile = novel?.referenceFiles?.find(f => f.id === selectedFileId)

  // 筛选当前文件夹下的文件和子文件夹
  const currentFiles = useMemo(() => {
    return (novel?.referenceFiles || []).filter(f => (f.parentId || null) === currentFolderId)
  }, [novel?.referenceFiles, currentFolderId])

  const currentSubFolders = useMemo(() => {
    return (novel?.referenceFolders || []).filter(f => (f.parentId || null) === currentFolderId)
  }, [novel?.referenceFolders, currentFolderId])

  // 面包屑导航
  const breadcrumbs = useMemo(() => {
    const path: ReferenceFolder[] = []
    let currId = currentFolderId
    while (currId) {
      const folder = novel?.referenceFolders?.find(f => f.id === currId)
      if (folder) {
        path.unshift(folder)
        currId = folder.parentId || null
      } else {
        break
      }
    }
    return path
  }, [novel?.referenceFolders, currentFolderId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsLoading(true)
    const newFiles: ReferenceFile[] = [...(novel.referenceFiles || [])]

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        let content = ''
        const isImage = file.type.startsWith('image/')
        const isPdf = file.type === 'application/pdf'
        const isDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')

        if (isImage || isPdf || (isDoc && file.name.endsWith('.docx'))) {
          content = await readFileAsDataURL(file)
        } else {
          // Default to text for md, txt, etc.
          content = await readFileAsText(file)
        }

        newFiles.push({
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
          name: file.name,
          content: content,
          type: file.type || 'text/plain',
          size: file.size,
          lastModified: file.lastModified,
          parentId: currentFolderId || undefined
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

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(file)
    })
  }

  const handleCreateFolder = () => {
    if (!folderNameInput.trim()) return

    const newFolders: ReferenceFolder[] = [...(novel.referenceFolders || [])]
    newFolders.push({
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
      name: folderNameInput.trim(),
      parentId: currentFolderId || undefined
    })

    onUpdateNovel({
      ...novel,
      referenceFolders: newFolders
    })
    setShowFolderModal(false)
    setFolderNameInput('')
  }

  const confirmDelete = () => {
    if (!deleteConfirm) return

    if (deleteConfirm.type === 'file') {
      const updatedFiles = (novel.referenceFiles || []).filter(f => f.id !== deleteConfirm.id)
      onUpdateNovel({ ...novel, referenceFiles: updatedFiles })
      if (selectedFileId === deleteConfirm.id) setSelectedFileId(null)
    } else {
      // 删除文件夹
      const updatedFolders = (novel.referenceFolders || []).filter(f => f.id !== deleteConfirm.id)
      const updatedFiles = (novel.referenceFiles || []).filter(f => f.parentId !== deleteConfirm.id)
      
      onUpdateNovel({
        ...novel,
        referenceFolders: updatedFolders,
        referenceFiles: updatedFiles
      })
      
      if (currentFolderId === deleteConfirm.id) {
        setCurrentFolderId(null)
      }
    }
    setDeleteConfirm(null)
  }

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirm({ id, type: 'file' })
  }

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirm({ id, type: 'folder' })
  }

  const renderFileIcon = (type: string, isSelected: boolean) => {
    const iconClass = `w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-gray-500'}`
    if (type.startsWith('image/')) return <ImageIcon className={iconClass} />
    if (type === 'application/pdf') return <File className={iconClass} />
    return <FileText className={iconClass} />
  }

  const WordPreview = ({ file }: { file: ReferenceFile }) => {
    const [html, setHtml] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      const convert = async () => {
        try {
          setLoading(true)
          const base64Content = file.content.split(',')[1]
          if (!base64Content) {
            throw new Error('无效的文件内容')
          }
          const arrayBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0)).buffer
          const result = await mammoth.convertToHtml({ arrayBuffer })
          setHtml(result.value)
        } catch (err) {
          console.error('Word conversion failed:', err)
          setError('Word 文档解析失败，请尝试下载后查看。')
        } finally {
          setLoading(false)
        }
      }
      convert()
    }, [file])

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-400">正在解析文档...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-800/30 border border-gray-700/50 rounded-xl">
          <FileText className="w-16 h-16 text-red-500/40 mb-4" />
          <p className="text-gray-400 mb-6">{error}</p>
          <a href={file.content} download={file.name} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all">
            <FileDown className="w-4 h-4" />
            <span>下载查看</span>
          </a>
        </div>
      )
    }

    return (
      <div className="bg-white text-gray-900 p-8 rounded-xl shadow-inner max-h-[80vh] overflow-y-auto prose prose-slate max-w-none">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  }

  const renderFilePreview = (file: ReferenceFile) => {
    if (file.type.startsWith('image/')) {
      return (
        <div className="flex flex-col items-center">
          <img src={file.content} alt={file.name} className="max-w-full h-auto rounded-lg shadow-lg" />
          <a href={file.content} download={file.name} className="mt-4 flex items-center gap-2 text-blue-400 hover:text-blue-300">
            <FileDown className="w-4 h-4" />
            <span>下载原图</span>
          </a>
        </div>
      )
    }

    if (file.type === 'application/pdf') {
      const isDataUrl = file.content.startsWith('data:')
      const pdfUrl = isDataUrl ? file.content : `data:application/pdf;base64,${file.content}`
      
      return (
        <div className="flex flex-col gap-4">
          <div className="w-full h-[80vh] bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <object
              data={pdfUrl}
              type="application/pdf"
              className="w-full h-full"
            >
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <FileText className="w-16 h-16 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-6">您的浏览器暂不支持直接预览 PDF，请下载后查看。</p>
                <a href={pdfUrl} download={file.name} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all">
                  <FileDown className="w-4 h-4" />
                  <span>下载 PDF</span>
                </a>
              </div>
            </object>
          </div>
          <a href={pdfUrl} download={file.name} className="flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700">
            <FileDown className="w-4 h-4" />
            <span>下载 PDF 文件</span>
          </a>
        </div>
      )
    }

    if (file.type.includes('word') || file.type.includes('officedocument') || file.name.endsWith('.docx')) {
      return <WordPreview file={file} />
    }

    // Default text preview (TXT, MD)
    return (
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6 shadow-inner min-h-full">
        <pre className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono break-words">
          {file.content}
        </pre>
      </div>
    )
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

        <div className="p-3 md:p-4 border-b border-gray-700 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2 text-gray-200">
              <FileText className="w-5 h-5 text-blue-400" />
              <span>参考资料库</span>
            </h3>
            <button
              onClick={() => setShowFolderModal(true)}
              className="p-1.5 hover:bg-gray-700 rounded-md text-gray-400 hover:text-blue-400 transition-colors"
              title="新建文件夹"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
          
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-[10px] text-gray-500 overflow-hidden">
            <span
              className={`cursor-pointer hover:text-blue-400 truncate ${!currentFolderId ? 'text-blue-400' : ''}`}
              onClick={() => {
                setCurrentFolderId(null)
                setSelectedFileId(null)
              }}
            >
              根目录
            </span>
            {breadcrumbs.map(f => (
              <React.Fragment key={f.id}>
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span
                  className={`cursor-pointer hover:text-blue-400 truncate ${currentFolderId === f.id ? 'text-blue-400' : ''}`}
                  onClick={() => {
                    setCurrentFolderId(f.id)
                    setSelectedFileId(null)
                  }}
                >
                  {f.name}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {currentFolderId && (
             <div
              onClick={() => {
                const parent = novel.referenceFolders?.find(f => f.id === currentFolderId)?.parentId || null
                setCurrentFolderId(parent)
                setSelectedFileId(null)
              }}
              className="flex items-center gap-3 px-3 py-2 text-gray-500 hover:bg-gray-700 hover:text-gray-200 rounded-lg cursor-pointer transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-medium">返回上级</span>
            </div>
          )}

          {currentSubFolders.map(folder => (
            <div
              key={folder.id}
              onClick={() => {
                setCurrentFolderId(folder.id)
                setSelectedFileId(null)
              }}
              className="group flex items-center justify-between px-3 py-2.5 text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded-lg cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Folder className="w-4 h-4 shrink-0 text-yellow-500/70" />
                <span className="truncate text-sm font-medium">{folder.name}</span>
              </div>
              <button
                onClick={(e) => handleDeleteFolder(folder.id, e)}
                className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded text-gray-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {currentFiles.map(file => (
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
                {renderFileIcon(file.type, selectedFileId === file.id)}
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
          
          {currentSubFolders.length === 0 && currentFiles.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-xs italic">
              当前目录下暂无内容
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-700 bg-gray-800 shrink-0">
          <label className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer transition-colors shadow-lg shadow-blue-900/20">
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">上传资料</span>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".txt,.md,.pdf,.doc,.docx,image/*"
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
                {renderFilePreview(activeFile)}
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
                    accept=".txt,.md,.pdf,.doc,.docx,image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
               </label>
            </div>
          </div>
        )}
      </div>

      {/* Custom Modals */}
      {showFolderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-100">新建文件夹</h3>
              <button onClick={() => setShowFolderModal(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <input
                autoFocus
                type="text"
                placeholder="请输入文件夹名称"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div className="p-4 bg-gray-800/50 flex gap-3 justify-end">
              <button
                onClick={() => setShowFolderModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-900/20"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-100 mb-2">确认删除</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {deleteConfirm.type === 'folder'
                  ? '确定要删除这个文件夹及其所有内容吗？此操作不可撤销。'
                  : '确定要删除这个参考文件吗？此操作不可撤销。'}
              </p>
            </div>
            <div className="p-4 bg-gray-800/50 flex gap-3 justify-center">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-lg shadow-red-900/20"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
import {
  MessageSquare,
  Plus,
  Send,
  StopCircle,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import OpenAI from 'openai'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Chapter, ChatMessage, Novel } from '../types'

interface AIChatModalProps {
  isOpen: boolean
  onClose: () => void
  novel: Novel | undefined
  activeChapter: Chapter | undefined
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  onAttach: (content: string) => void
}

export function AIChatModal({
  isOpen,
  onClose,
  novel,
  activeChapter,
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  onAttach
}: AIChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!isOpen) return null

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    abortControllerRef.current = new AbortController()

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        dangerouslyAllowBrowser: true
      })

      const chatMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ]

      // Add context if available
      if (activeChapter?.content) {
        chatMessages.splice(1, 0, { 
          role: 'system', 
          content: `当前正在处理的章节内容：\n\n${activeChapter.content}` 
        })
      }

      const response = await openai.chat.completions.create({
        model,
        messages: chatMessages,
        stream: true,
      }, {
        signal: abortControllerRef.current.signal
      })

      let assistantContent = ''
      setMessages([...newMessages, { role: 'assistant', content: '' }])

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || ''
        assistantContent += content
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
          return updated
        })
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      console.error('Chat Error:', err)
      setMessages(prev => [...prev, { role: 'system', content: `错误: ${err.message}` }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl border border-gray-600 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gray-900 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-[var(--theme-color)]" />
            <h3 className="text-lg font-bold text-gray-200">AI 创作助手</h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearChat}
              className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400 transition-colors"
              title="清空对话"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-900/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Wand2 className="w-12 h-12 opacity-20" />
              <p className="text-sm">您可以让 AI 帮您修改、润色或续写当前章节。</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user' 
                  ? 'bg-[var(--theme-color)] text-white' 
                  : msg.role === 'system'
                    ? 'bg-red-900/20 border border-red-900/50 text-red-200'
                    : 'bg-gray-800 border border-gray-700 text-gray-200'
              }`}>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                {msg.role === 'assistant' && msg.content && !isLoading && (
                  <div className="mt-2 pt-2 border-t border-gray-700 flex justify-end">
                    <button 
                      onClick={() => onAttach(msg.content)}
                      className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-[var(--theme-color-light)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      附加到正文优化
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gray-900/50 border-t border-gray-700">
          <div className="relative flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入您的修改要求..."
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg p-3 pr-12 text-sm focus:border-[var(--theme-color)] outline-none resize-none h-24"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <div className="absolute right-2 bottom-2">
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
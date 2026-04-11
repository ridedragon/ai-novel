import {
  MessageSquare,
  Plus,
  Send,
  StopCircle,
  Trash2,
  Wand2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import terminal from 'virtual:terminal'
import { Chapter, ChatMessage, Novel, PromptItem } from '../types'

interface AIChatModalProps {
  isOpen: boolean
  onClose: () => void
  novel: Novel | undefined
  activeOutlineSetId: string | null
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  prompts: PromptItem[]
  context?: string
  onAttach: (content: string) => void
}

// 流式AI请求函数
const streamAIRequest = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: any[];
  onData: (chunk: string) => void;
  onError: (error: string) => void;
  onComplete: () => void;
  signal: AbortSignal | undefined;
}) => {
  try {
    const response = await fetch('http://localhost:3001/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      }),
      signal: params.signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      params.onError(errorData.error || 'API请求失败');
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      params.onError('无法获取响应流');
      return;
    }

    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            params.onComplete();
            break;
          }
          params.onData(data);
        }
      }
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      params.onError(error.message || '网络错误');
    }
  }
};

export function AIChatModal({
  isOpen,
  onClose,
  novel,
  activeOutlineSetId,
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  prompts,
  context,
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
      // 1. 查找与当前大纲集同名的世界观和角色集
      let targetName = ''
      if (activeOutlineSetId) {
        targetName = novel?.outlineSets?.find(s => s.id === activeOutlineSetId)?.name || ''
      }

      // 2. 构建消息列表 (遵守 System Ref / User Task 规则)
      const chatMessages: any[] = [
        { role: 'system', content: systemPrompt }
      ]

      // Worldview & Characters (System)
      const worldviewSets = novel?.worldviewSets || []
      const relevantWorldview = activeOutlineSetId
        ? worldviewSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
        : worldviewSets.slice(0, 1)
      
      if (relevantWorldview.length > 0) {
          let worldInfo = '【当前小说世界观设定】：\n'
          relevantWorldview.forEach(set => {
               set.entries.forEach(entry => {
                   worldInfo += `· ${entry.item}: ${entry.setting}\n`
               })
          })
          chatMessages.push({ role: 'system', content: worldInfo })
      }
      
      const characterSets = novel?.characterSets || []
      const relevantCharacters = activeOutlineSetId
        ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
        : characterSets.slice(0, 1)

      if (relevantCharacters.length > 0) {
          let charInfo = '【当前小说角色档案】：\n'
          relevantCharacters.forEach(set => {
               set.characters.forEach(char => {
                   charInfo += `· ${char.name}: ${char.bio}\n`
               })
          })
          chatMessages.push({ role: 'system', content: charInfo })
      }

      // Outline (System)
      if (activeOutlineSetId) {
          const currentOutlineSet = novel?.outlineSets?.find(s => s.id === activeOutlineSetId)
          if (currentOutlineSet && currentOutlineSet.items?.length > 0) {
              const outlineStr = `【当前小说大纲策划】：\n` + currentOutlineSet.items.map((item, idx) => `${idx + 1}. ${item.title}: ${item.summary}`).join('\n')
              chatMessages.push({ role: 'system', content: outlineStr })
          }
      }

      // Context (System)
      if (context) {
        chatMessages.push({ role: 'system', content: `【当前创作上下文参考】：\n${context}` })
      }

      // 其他灵感/提示词 (透传预设角色和内容)
      prompts.filter(p => p.active && !p.isFixed).forEach(p => {
        if (p.content && p.content.trim()) {
          chatMessages.push({ role: p.role, content: p.content })
        }
      })

      // 对话历史
      chatMessages.push(...newMessages.map(m => ({ role: m.role, content: m.content })))

      terminal.log(`
>> AI REQUEST [自由对话助手]
>> -----------------------------------------------------------
>> Model:       ${model}
>> -----------------------------------------------------------
      `);

      let assistantContent = ''
      setMessages([...newMessages, { role: 'assistant', content: '' }])

      // 使用流式API
      await new Promise<void>((resolve, reject) => {
        streamAIRequest({
          apiKey: apiKey,
          baseUrl: baseUrl,
          model: model,
          messages: chatMessages,
          onData: (chunk) => {
            assistantContent += chunk
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
              return updated
            })
          },
          onError: (error) => {
            reject(new Error(error))
          },
          onComplete: () => {
            resolve()
          },
          signal: abortControllerRef.current?.signal,
        })
      })

      terminal.log(`[Chat Assistant Output]:\n${assistantContent.slice(0, 500)}${assistantContent.length > 500 ? '...' : ''}`);
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
                  <ReactMarkdown>{typeof msg.content === 'string' ? msg.content : ''}</ReactMarkdown>
                </div>
                {msg.role === 'assistant' && msg.content && !isLoading && (
                  <div className="mt-2 pt-2 border-t border-gray-700 flex justify-end">
                    <button
                      onClick={() => typeof msg.content === 'string' && onAttach(msg.content)}
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
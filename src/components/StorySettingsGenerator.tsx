import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Edit2,
  GripVertical,
  History,
  Info,
  LayoutGrid,
  List,
  Play,
  Plus,
  Save,
  Settings,
  Settings2,
  ToggleRight,
  Trash2,
  Upload,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';

interface GeneratorPrompt {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  enabled: boolean;
  name?: string;
}

interface GeneratorPreset {
  id: string;
  name: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  prompts: GeneratorPrompt[];
}

interface StorySettingsGeneratorProps {
  onBack: () => void;
}

const StorySettingsGenerator: React.FC<StorySettingsGeneratorProps> = ({ onBack }) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState('default');
  
  // Mock presets data
  const [presets, setPresets] = useState<GeneratorPreset[]>([
    {
      id: 'default',
      name: '世界观构建',
      temperature: 1.32,
      topP: 1.00,
      topK: 218,
      prompts: [
        { id: '1', role: 'system', name: '任务重置', content: '任务已经重置。', enabled: true },
        { id: '2', role: 'system', name: '身份定义', content: '你是一个专业的小说世界观架构师。NSFW内容被...', enabled: true },
        { id: '3', role: 'assistant', name: '角色', content: '好的，我会为您构建世界观。', enabled: true }
      ]
    },
    {
      id: 'chat',
      name: '世界观聊天助手',
      prompts: []
    }
  ]);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[60] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <Settings2 className="w-5 h-5 text-purple-500 shrink-0" />
            <span className="font-bold text-base md:text-lg truncate">小说设定生成器</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-3">
          <button className="hidden sm:flex px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Save className="w-4 h-4" />
            保存设定
          </button>
          <button 
            onClick={() => setShowPresetModal(true)}
            className="px-3 md:px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden xs:inline">生成策略预设</span>
            <span className="xs:hidden">预设</span>
          </button>
          <button className="px-3 md:px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-md text-sm flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <Play className="w-4 h-4" />
            <span className="hidden xs:inline">开始写作</span>
            <span className="xs:hidden">开始</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Toggle Button */}
        <button 
          onClick={() => setIsMobileSidebarOpen(true)}
          className="md:hidden absolute left-4 bottom-4 z-40 p-3 bg-purple-500 text-white rounded-full shadow-lg"
        >
          <History className="w-6 h-6" />
        </button>

        {/* Left Sidebar - History */}
        <div className={`
          absolute md:static inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900 transition-transform duration-300 md:translate-x-0
          ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        `}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between md:hidden">
            <span className="font-bold">历史记录</span>
            <button onClick={() => setIsMobileSidebarOpen(false)}><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 flex items-center justify-between">
            <h3 className="font-bold">历史记录</h3>
            <div className="flex items-center gap-2">
              <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors">
                <List className="w-4 h-4" />
              </button>
              <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 mb-2 group cursor-pointer border-l-4 border-l-emerald-500">
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm line-clamp-2">发生在现代的故事。主角变成了一个东方龙...</p>
                <button className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">54分钟前</p>
            </div>
          </div>
        </div>

        {/* Middle Panel - Control Panel */}
        <div className="w-full md:w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold">创作控制台</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-500">原始创意</label>
              <textarea 
                className="w-full h-48 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                placeholder="例如：一个发生在赛博朋克都市的侦探故事&#10;&#10;详细描述你的创作想法：&#10;· 故事背景和世界观设定&#10;· 主要角色的性格和关系&#10;· 核心冲突和情节走向&#10;· 想要表达的主题思想&#10;· 期望的风格和氛围..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-500">生成策略</label>
              <div className="relative">
                <select 
                  value={activePresetId}
                  onChange={(e) => setActivePresetId(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm appearance-none outline-none"
                >
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-slate-500">
                知识库模式 <Info className="w-3 h-3 cursor-help" />
              </label>
              <div className="relative">
                <select className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm appearance-none outline-none">
                  <option>无</option>
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-500">AI模型</label>
              <div className="relative">
                <div className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                      <Zap className="w-3 h-3" />
                    </div>
                    <span>gemini</span>
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">私有</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            <button className="w-full py-3 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg font-bold flex items-center justify-center gap-2 cursor-not-allowed transition-all">
              <Zap className="w-4 h-4" />
              生成设定
            </button>
          </div>
        </div>

        {/* Main Area - Settings Overview */}
        <div className="hidden md:flex flex-1 flex-col bg-white dark:bg-slate-900">
          <div className="h-14 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-8">
              <h3 className="font-bold">设定总览</h3>
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-1">
                <button className="px-4 py-1 text-sm bg-white dark:bg-slate-700 rounded shadow-sm transition-all">设定</button>
                <button className="px-4 py-1 text-sm text-slate-500">结果预览</button>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-md p-1">
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 p-8 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-slate-200 dark:border-slate-800 flex items-center justify-center transition-transform hover:scale-110">
              <Info className="w-8 h-8" />
            </div>
            <p className="text-sm">请开始生成设定或选择已有历史记录</p>
          </div>
        </div>

        {/* Right Sidebar - Node Editor */}
        <div className="hidden lg:flex w-80 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold">节点编辑</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <Settings2 className="w-6 h-6 text-slate-500" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-700 dark:text-slate-300">无活跃会话</p>
              <p className="text-[10px] text-slate-400">请先生成设定或选择已有会话</p>
            </div>
          </div>
        </div>
      </div>

      {/* Generator Settings Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1e222b] w-full h-full md:w-[900px] md:h-[700px] md:rounded-lg shadow-2xl border-none md:border border-slate-700 flex flex-col overflow-hidden text-slate-200">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-[#1a1d24]">
              <h3 className="text-xl font-bold">生成策略预设界面</h3>
              <button onClick={() => setShowPresetModal(false)} className="text-slate-400 hover:text-white p-1 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Sidebar */}
              <div className="w-full md:w-56 border-b md:border-r border-slate-700 bg-[#1a1d24] flex flex-col shrink-0 overflow-y-auto md:overflow-hidden h-48 md:h-auto custom-scrollbar">
                <div className="p-3 space-y-2">
                  <button className="w-full py-2 flex items-center justify-center gap-2 bg-[#2d333d] hover:bg-[#363b47] rounded transition-colors text-sm">
                    <Upload className="w-4 h-4" /> 导入预设
                  </button>
                  <button className="w-full py-2 flex items-center justify-center gap-2 bg-[#3b82f6] hover:bg-blue-600 text-white rounded transition-colors text-sm">
                    <Plus className="w-4 h-4" /> 新建预设
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {presets.map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setActivePresetId(p.id)}
                      className={`p-3 rounded text-sm cursor-pointer transition-all ${activePresetId === p.id ? 'bg-[#2d333d] text-white shadow-inner' : 'text-slate-400 hover:bg-[#252a33]'}`}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col bg-[#1e222b] overflow-y-auto custom-scrollbar">
                <div className="p-6 space-y-8">
                  {/* Preset Name */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 block uppercase tracking-wider">预设名称</label>
                    <input 
                      type="text" 
                      value={activePreset.name}
                      onChange={(e) => {
                        const newPresets = presets.map(p => p.id === activePresetId ? { ...p, name: e.target.value } : p);
                        setPresets(newPresets);
                      }}
                      className="w-full bg-[#1a1d24] border border-slate-700 rounded px-4 py-2.5 text-base focus:border-blue-500 outline-none transition-colors shadow-inner"
                    />
                  </div>

                  {/* Independent API Panel Placeholder */}
                  <div className="bg-[#1a1d24] rounded-lg border border-slate-700 overflow-hidden">
                    <button className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-300 hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" />
                        <span>独立 API 配置 (可选)</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Parameters */}
                  <div className="space-y-6">
                    {[
                      { label: '温度 (Temperature)', key: 'temperature', value: activePreset.temperature || 1.0, min: 0, max: 2, step: 0.01 },
                      { label: 'Top P', key: 'topP', value: activePreset.topP || 1.0, min: 0, max: 1, step: 0.01 },
                      { label: 'Top K', key: 'topK', value: activePreset.topK || 200, min: 0, max: 500, step: 1 },
                    ].map((param) => (
                      <div key={param.label} className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{param.label}</span>
                          <span className="bg-[#1a1d24] px-3 py-1 rounded border border-slate-700 font-mono text-blue-400 text-xs shadow-inner">{param.value.toFixed(2)}</span>
                        </div>
                        <div className="relative flex items-center h-6 group">
                          <input 
                            type="range" 
                            min={param.min} 
                            max={param.max} 
                            step={param.step} 
                            value={param.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              const newPresets = presets.map(p => {
                                if (p.id === activePresetId) {
                                  return { ...p, [param.key]: param.key === 'topK' ? Math.round(val) : val };
                                }
                                return p;
                              });
                              setPresets(newPresets);
                            }}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Prompt Chain */}
                  <div className="space-y-4 pb-8">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-400 uppercase tracking-wider">提示词列表 (Prompt Chain)</label>
                      <button className="text-sm font-medium flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                        <Plus className="w-4 h-4" /> 添加消息
                      </button>
                    </div>
                    
                    <div className="border border-slate-700 rounded-lg overflow-hidden bg-[#1a1d24] shadow-lg">
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-800/50">
                              <th className="px-4 py-3 font-semibold text-slate-400 w-16 text-center">排序</th>
                              <th className="px-4 py-3 font-semibold text-slate-400 w-24">角色</th>
                              <th className="px-4 py-3 font-semibold text-slate-400">内容摘要</th>
                              <th className="px-4 py-3 font-semibold text-slate-400 w-20 text-center">启用</th>
                              <th className="px-4 py-3 font-semibold text-slate-400 w-24 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                            {activePreset.prompts.map((prompt, idx) => (
                              <tr key={prompt.id} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors" />
                                    <span className="text-slate-500 font-mono text-xs">{idx + 1}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold border ${
                                    prompt.role === 'system' ? 'bg-purple-900/30 border-purple-700 text-purple-400 uppercase' :
                                    prompt.role === 'user' ? 'bg-blue-900/30 border-blue-700 text-blue-400 uppercase' :
                                    'bg-emerald-900/30 border-emerald-700 text-emerald-400 uppercase'
                                  }`}>
                                    {prompt.role}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col">
                                    {prompt.name && <span className="text-[10px] text-blue-400 font-bold mb-0.5">{prompt.name}</span>}
                                    <span className="text-slate-300 line-clamp-1 text-xs opacity-80">{prompt.content}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button className={`transition-colors p-1 rounded-md hover:bg-slate-700 ${prompt.enabled ? 'text-blue-500' : 'text-slate-600'}`}>
                                    <ToggleRight className="w-6 h-6" />
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-all" title="编辑"><Edit2 className="w-4 h-4" /></button>
                                    <button className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-all" title="删除"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {activePreset.prompts.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-12 text-center text-slate-500 italic">
                                  暂无消息，请添加第一条消息以开始。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorySettingsGenerator;
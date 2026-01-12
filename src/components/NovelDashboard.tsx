import {
  Activity,
  ArrowUpDown,
  BookOpen,
  Bot,
  CheckCircle,
  Download,
  Edit2,
  Filter,
  FolderHeart,
  GitBranch,
  Layers,
  LayoutGrid,
  Library,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { Novel } from '../types';

interface NovelDashboardProps {
  novels: Novel[];
  onSelectNovel: (id: string) => void;
  onCreateNovel: () => void;
  onDeleteNovel: (id: string) => void;
  onUpdateNovel: (id: string, updates: Partial<Novel>) => void;
  onExportNovel: (novel: Novel) => void;
  onOpenSettings: () => void;
  onNavigate?: (target: 'dashboard' | 'automation' | 'workflow' | 'library') => void;
}

export const NovelDashboard: React.FC<NovelDashboardProps> = ({
  novels,
  onSelectNovel,
  onCreateNovel,
  onDeleteNovel,
  onUpdateNovel,
  onExportNovel,
  onOpenSettings,
  onNavigate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [selectedStatus, setSelectedStatus] = useState<string>('全部');
  const [sortBy, setSortBy] = useState<'updated' | 'words' | 'created'>('updated');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [editingNovel, setEditingNovel] = useState<Novel | null>(null);
  
  // 派生状态计算
  const availableCategories = React.useMemo(() => {
    const cats = new Set<string>(['全部', '科幻', '悬疑', '奇幻', '言情', '都市']);
    novels.forEach(n => {
        if (n.category) cats.add(n.category);
    });
    return Array.from(cats);
  }, [novels]);

  const filteredNovels = novels.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.description && n.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === '全部' || n.category === selectedCategory;
    const matchesStatus = selectedStatus === '全部' || n.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'updated') return b.createdAt - a.createdAt;
    if (sortBy === 'created') return b.createdAt - a.createdAt;
    if (sortBy === 'words') {
      const aWords = a.chapters?.reduce((acc, c) => acc + (c.content?.length || 0), 0) || 0;
      const bWords = b.chapters?.reduce((acc, c) => acc + (c.content?.length || 0), 0) || 0;
      return bWords - aWords;
    }
    return 0;
  });

  const totalChapters = novels.reduce((acc, curr) => acc + (curr.chapters?.length || 0), 0);
  const totalWords = novels.reduce((acc, curr) => acc + (curr.chapters?.reduce((cAcc, c) => cAcc + (c.content?.length || 0), 0) || 0), 0);
  
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex transition-colors duration-300 font-sans selection:bg-[var(--theme-color)]/30" style={{ backgroundColor: 'var(--theme-color-dark, #0F172A)' }}>
      
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 h-full w-20 flex flex-col items-center py-8 bg-white dark:bg-[#1E293B] border-r border-slate-200 dark:border-slate-800 z-50" style={{ backgroundColor: 'var(--theme-color-dark-lighter, #1E293B)', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="mb-10 text-primary">
          <Library className="w-10 h-10" />
        </div>
        
        <nav className="flex flex-col gap-8 flex-1 w-full px-2 items-center">
          <button
            onClick={() => onNavigate?.('dashboard')}
            className="p-3 bg-[var(--theme-color)]/10 text-[var(--theme-color)] rounded-xl transition-all hover:scale-105 active:scale-95"
            title="我的小说"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>
          
          <button 
            onClick={() => onNavigate?.('automation')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
            title="自动化中心"
          >
            <Zap className="w-6 h-6" />
          </button>
          
          <button
            onClick={() => onNavigate?.('workflow')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
            title="工作流"
          >
            <GitBranch className="w-6 h-6" />
          </button>
          
          <button
            onClick={() => onNavigate?.('library')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
            title="资料库"
          >
            <FolderHeart className="w-6 h-6" />
          </button>
        </nav>
        
        <div className="mt-auto flex flex-col gap-6 items-center w-full">
          <button 
            onClick={onOpenSettings}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
          >
            <Settings className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[var(--theme-color)] to-[var(--theme-color-light)] flex items-center justify-center text-white font-bold ring-2 ring-white dark:ring-slate-800 shadow-lg">
            AI
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-20 p-8 flex-1 w-full" style={{ backgroundColor: 'var(--theme-color-dark, #0F172A)' }}>
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6 relative">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-slate-900 dark:text-white">我的小说库</h1>
            <p className="text-slate-500 dark:text-slate-400">目前已有 {novels.length} 本作品正在创作中</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Search Bar */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-[var(--theme-color)] transition-colors" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-64 bg-white dark:bg-[#1E293B] dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all shadow-sm text-sm"
                placeholder="搜索作品..."
                style={{ backgroundColor: 'var(--theme-color-dark-lighter, #1E293B)' }}
              />
            </div>
            
            {/* Filter Toggle */}
            <div className="relative">
              <button 
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm ${showFilterPanel ? 'ring-2 ring-[var(--theme-color)] border-transparent' : ''}`}
                style={{ backgroundColor: 'var(--theme-color-dark-lighter, #1E293B)' }}
              >
                <Filter className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <span className="font-medium text-sm text-slate-700 dark:text-slate-200">筛选类型</span>
              </button>

              {/* Filter Panel */}
              {showFilterPanel && (
                <div className="absolute right-0 mt-3 w-80 bg-white/90 dark:bg-[#1E293B]/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl p-6 z-[60] shadow-2xl animate-in slide-in-from-top-2 duration-200">
                  <div className="flex flex-col gap-6">
                    {/* Categories */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 text-slate-400">
                        <Layers className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">作品题材</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableCategories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                              selectedCategory === cat
                                ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)] text-[var(--theme-color)]'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 text-slate-400">
                        <Activity className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">创作状态</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setSelectedStatus('连载中')}
                          className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                            selectedStatus === '连载中'
                              ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)] text-[var(--theme-color)]'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-color)] animate-pulse"></span>
                          连载中
                        </button>
                        <button 
                          onClick={() => setSelectedStatus('已完结')}
                          className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                            selectedStatus === '已完结'
                              ? 'bg-[var(--theme-color)]/10 border-[var(--theme-color)] text-[var(--theme-color)]'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          已完结
                        </button>
                      </div>
                    </div>

                    {/* Sort */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 text-slate-400">
                        <ArrowUpDown className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">排序方式</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {[
                          { id: 'updated', label: '最后更新时间' },
                          { id: 'words', label: '字数总计' },
                          { id: 'created', label: '创建日期' }
                        ].map(opt => (
                          <button 
                            key={opt.id}
                            onClick={() => setSortBy(opt.id as any)}
                            className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors group ${
                              sortBy === opt.id
                                ? 'bg-slate-100 dark:bg-slate-800 text-[var(--theme-color)] font-medium'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {sortBy === opt.id && <CheckCircle className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Filter Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700/50">
                      <button 
                        onClick={() => {
                          setSelectedCategory('全部');
                          setSelectedStatus('全部');
                          setSortBy('updated');
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                      >
                        重置条件
                      </button>
                      <button 
                        onClick={() => setShowFilterPanel(false)}
                        className="px-4 py-1.5 bg-[var(--theme-color)] text-white text-xs font-bold rounded-lg hover:bg-[var(--theme-color-hover)] transition-all shadow-lg shadow-[var(--theme-color)]/20 active:scale-95"
                      >
                        完成
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Create Button */}
            <button
              onClick={onCreateNovel}
              className="flex items-center gap-2 px-6 py-2.5 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-xl shadow-lg shadow-[var(--theme-color)]/20 transition-all hover:shadow-[var(--theme-color)]/30 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold text-sm">创建新小说</span>
            </button>
          </div>
        </header>

        {/* Novel Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredNovels.map(novel => (
            <div 
              key={novel.id}
              onClick={() => onSelectNovel(novel.id)}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 bg-slate-800"
            >
              {/* Cover Image */}
              <img 
                alt={novel.title} 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                src={novel.coverUrl || '/src/默认封面/默认封面.jpg'} 
                onError={(e) => (e.currentTarget.src = '/src/默认封面/默认封面.jpg')}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent"></div>
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-slate-900/60 backdrop-blur-[2px] flex flex-col justify-center items-center gap-4 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingNovel(novel); }}
                  className="w-12 h-12 bg-[var(--theme-color)] hover:bg-[var(--theme-color-light)] rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <div className="flex gap-3">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onExportNovel(novel); }}
                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white backdrop-blur-md transition-colors"
                    title="下载/导出"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteNovel(novel.id); }}
                    className="p-2.5 bg-red-500/20 hover:bg-red-500/40 rounded-xl text-white backdrop-blur-md transition-colors border border-red-500/30"
                    title="删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Card Info */}
              <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                {novel.category && (
                  <span className="inline-block px-2 py-1 bg-[var(--theme-color)]/90 backdrop-blur-md text-[10px] font-bold text-white rounded uppercase mb-2 shadow-sm">
                    {novel.category}
                  </span>
                )}
                <h3 className="text-xl font-bold text-white mb-1 leading-tight shadow-black/50 drop-shadow-md">{novel.title}</h3>
                <p className="text-slate-200 text-sm line-clamp-2 mb-4 opacity-90 font-light leading-relaxed">
                  {novel.description || "暂无简介，点击进入创作..."}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                    <BookOpen className="w-3.5 h-3.5" /> 
                    {novel.chapters?.length || 0} 章节
                  </span>
                  <span className="opacity-80">{formatDate(novel.createdAt)} 更新</span>
                </div>
              </div>
            </div>
          ))}

          {/* New Novel Card */}
          <div 
            onClick={onCreateNovel}
            className="group border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl aspect-[3/4] flex flex-col items-center justify-center p-6 text-center hover:border-[var(--theme-color)]/50 hover:bg-[var(--theme-color)]/5 dark:hover:bg-[var(--theme-color)]/5 transition-all cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-[var(--theme-color)]/10 dark:group-hover:bg-[var(--theme-color)]/20 flex items-center justify-center text-slate-400 group-hover:text-[var(--theme-color)] transition-all mb-4">
              <Plus className="w-8 h-8" />
            </div>
            <h4 className="font-bold mb-1 text-slate-700 dark:text-slate-200 group-hover:text-[var(--theme-color)] transition-colors">新建作品</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">开启你的下一段灵感之旅</p>
          </div>
        </div>

        {/* Footer Stats */}
        <footer className="mt-20 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-8 items-center justify-between opacity-60">
          <div className="flex gap-12">
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(totalWords)}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">累计创作字数</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalChapters}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">生成章节数</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{novels.length}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">在更作品</div>
            </div>
          </div>
          <div className="text-sm text-slate-500 font-medium">
            当前版本: v2.4.0-stable © 2024 AI Creative Studio
          </div>
        </footer>
      </main>

      {/* Floating Action Button (Bot) */}
      <button
        onClick={() => onNavigate?.('automation')}
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-tr from-[var(--theme-color)] to-[var(--theme-color-light)] rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-transform z-[100] group"
        title="快速开始自动化"
      >
        <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform" />
      </button>

      {/* Edit Novel Modal */}
      {editingNovel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">编辑作品信息</h3>
              <button onClick={() => setEditingNovel(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">作品名称</label>
                <input
                  type="text"
                  value={editingNovel.title}
                  onChange={(e) => setEditingNovel({...editingNovel, title: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
                />
              </div>

              {/* Cover URL */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">封面图片 URL</label>
                <div className="flex gap-4">
                    <img
                      src={editingNovel.coverUrl || '/src/默认封面/默认封面.jpg'}
                      alt="Cover"
                      className="w-16 h-20 object-cover rounded-lg bg-slate-200"
                      onError={(e) => (e.currentTarget.src = '/src/默认封面/默认封面.jpg')}
                    />
                    <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={editingNovel.coverUrl || ''}
                          onChange={(e) => setEditingNovel({...editingNovel, coverUrl: e.target.value})}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all text-sm"
                          placeholder="https://..."
                        />
                        <p className="text-xs text-slate-500">输入图片链接，或保留为空使用默认封面</p>
                    </div>
                </div>
              </div>

              {/* Category & Status */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">作品题材</label>
                    <input
                      type="text"
                      value={editingNovel.category || ''}
                      onChange={(e) => setEditingNovel({...editingNovel, category: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
                      placeholder="例如：科幻、悬疑..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">连载状态</label>
                    <select
                      value={editingNovel.status || '连载中'}
                      onChange={(e) => setEditingNovel({...editingNovel, status: e.target.value as any})}
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
                    >
                        <option value="连载中">连载中</option>
                        <option value="已完结">已完结</option>
                    </select>
                  </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">作品简介</label>
                <textarea
                  value={editingNovel.description || ''}
                  onChange={(e) => setEditingNovel({...editingNovel, description: e.target.value})}
                  className="w-full h-32 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all resize-none"
                  placeholder="请输入作品简介..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setEditingNovel(null)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={() => {
                    if (editingNovel) {
                        onUpdateNovel(editingNovel.id, {
                            title: editingNovel.title,
                            description: editingNovel.description,
                            coverUrl: editingNovel.coverUrl,
                            category: editingNovel.category,
                            status: editingNovel.status
                        });
                        setEditingNovel(null);
                    }
                }}
                className="px-6 py-2.5 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-xl shadow-lg shadow-[var(--theme-color)]/20 transition-all font-bold"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
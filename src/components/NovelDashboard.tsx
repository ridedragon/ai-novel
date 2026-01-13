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
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-20 flex-col items-center py-8 bg-white dark:bg-[#1E293B] border-r border-slate-200 dark:border-slate-800 z-50" style={{ backgroundColor: 'var(--theme-color-dark-lighter, #1E293B)', borderColor: 'rgba(255,255,255,0.1)' }}>
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
      <main className="ml-0 md:ml-20 p-4 md:p-8 flex-1 w-full pb-24 md:pb-8" style={{ backgroundColor: 'var(--theme-color-dark, #0F172A)' }}>
        {/* Header Section */}
        <header className="fixed md:relative top-0 left-0 right-0 z-40 bg-[var(--theme-color-dark)]/80 md:bg-transparent backdrop-blur-md md:backdrop-blur-none border-b border-white/5 md:border-none px-4 h-16 md:h-auto flex md:flex-col md:items-start items-center justify-between mb-0 md:mb-12 gap-0 md:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--theme-color)]/10 flex items-center justify-center text-[var(--theme-color)] md:hidden">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">我的小说库</h1>
              <p className="text-xs md:text-base text-slate-500 dark:text-slate-400 hidden md:block mt-2">目前已有 {novels.length} 本作品正在创作中</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {/* Search Bar - Mobile: Button toggle, Desktop: Expanded */}
            <div className="relative group">
              <div className="hidden md:block relative">
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
              {/* Mobile Search Button */}
              <button className="md:hidden w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                <Search className="w-6 h-6" />
              </button>
            </div>
            
            {/* Filter Toggle */}
            <div className="relative">
              {/* Desktop Filter Button */}
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`hidden md:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm ${showFilterPanel ? 'ring-2 ring-[var(--theme-color)] border-transparent' : ''}`}
                style={{ backgroundColor: 'var(--theme-color-dark-lighter, #1E293B)' }}
              >
                <Filter className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <span className="font-medium text-sm text-slate-700 dark:text-slate-200">筛选类型</span>
              </button>

              {/* Mobile Filter Button */}
              <button
                onClick={() => setShowFilterPanel(true)}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-sm font-medium"
              >
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">筛选</span>
              </button>

              {/* Filter Panel - Adaptive: Dropdown on Desktop, Bottom Sheet on Mobile */}
              {showFilterPanel && (
                <>
                  {/* Mobile Overlay */}
                  <div className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" onClick={() => setShowFilterPanel(false)} />
                  
                  <div className={`
                    z-[101]
                    md:absolute md:right-0 md:mt-3 md:w-80 md:rounded-2xl md:top-full
                    fixed bottom-0 left-0 right-0 rounded-t-3xl
                    bg-white/90 dark:bg-[#1E293B]/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700
                    p-6 shadow-2xl animate-in slide-in-from-bottom-10 md:slide-in-from-top-2 duration-200
                    safe-area-bottom
                  `}>
                    {/* Mobile Handle */}
                    <div className="md:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
                    
                    <div className="flex items-center justify-between mb-6 md:hidden">
                      <h2 className="text-xl font-bold text-white">筛选与排序</h2>
                      <button
                        onClick={() => {
                          setSelectedCategory('全部');
                          setSelectedStatus('全部');
                          setSortBy('updated');
                        }}
                        className="text-slate-400 text-sm"
                      >
                        重置
                      </button>
                    </div>

                    <div className="flex flex-col gap-6 max-h-[60vh] overflow-y-auto">
                      {/* Categories */}
                      <div>
                        <div className="flex items-center gap-2 mb-3 text-slate-400">
                          <Layers className="w-4 h-4 md:w-4 md:h-4 w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">作品题材</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableCategories.map(cat => (
                            <button
                              key={cat}
                              onClick={() => setSelectedCategory(cat)}
                              className={`px-4 py-2 md:px-3 md:py-1.5 text-sm md:text-xs font-medium rounded-xl md:rounded-lg border transition-all ${
                                selectedCategory === cat
                                  ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)] shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
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
                          <Activity className="w-4 h-4 md:w-4 md:h-4 w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">创作状态</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:gap-2">
                          <button
                            onClick={() => setSelectedStatus('连载中')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 md:px-3 md:py-2 text-sm md:text-xs font-medium rounded-xl md:rounded-lg border transition-all ${
                              selectedStatus === '连载中'
                                ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)] shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            <span className="w-2 h-2 md:w-1.5 md:h-1.5 rounded-full bg-[var(--theme-color)] animate-pulse"></span>
                            连载中
                          </button>
                          <button
                            onClick={() => setSelectedStatus('已完结')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 md:px-3 md:py-2 text-sm md:text-xs font-medium rounded-xl md:rounded-lg border transition-all ${
                              selectedStatus === '已完结'
                                ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)] shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            <span className="w-2 h-2 md:w-1.5 md:h-1.5 rounded-full bg-slate-500"></span>
                            已完结
                          </button>
                        </div>
                      </div>

                      {/* Sort */}
                      <div>
                        <div className="flex items-center gap-2 mb-3 text-slate-400">
                          <ArrowUpDown className="w-4 h-4 md:w-4 md:h-4 w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">排序方式</span>
                        </div>
                        <div className="flex flex-col gap-2 md:gap-1">
                          {[
                            { id: 'updated', label: '最后更新时间' },
                            { id: 'words', label: '字数总计' },
                            { id: 'created', label: '创建日期' }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setSortBy(opt.id as any)}
                              className={`flex items-center justify-between w-full px-4 py-3 md:px-3 md:py-2 text-sm rounded-xl md:rounded-lg transition-colors group border ${
                                sortBy === opt.id
                                  ? 'bg-white/5 border-white/5 text-white font-medium'
                                  : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {sortBy === opt.id && <CheckCircle className="w-4 h-4 text-[var(--theme-color)]" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filter Actions (Desktop Only - Mobile has it at bottom) */}
                      <div className="hidden md:flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700/50">
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
                    
                    {/* Mobile Apply Button */}
                    <div className="mt-8 md:hidden">
                      <button
                        onClick={() => setShowFilterPanel(false)}
                        className="w-full py-4 bg-[var(--theme-color)] text-white font-bold rounded-2xl shadow-xl shadow-[var(--theme-color)]/20 active:scale-[0.98] transition-all"
                      >
                        应用筛选
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Create Button (Desktop) */}
            <button
              onClick={onCreateNovel}
              className="hidden md:flex items-center gap-2 px-6 py-2.5 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-xl shadow-lg shadow-[var(--theme-color)]/20 transition-all hover:shadow-[var(--theme-color)]/30 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold text-sm">创建新小说</span>
            </button>
          </div>
        </header>
        
        {/* Mobile Spacer for fixed header */}
        <div className="h-16 md:hidden"></div>
        
        <div className="mb-6 md:hidden">
           <p className="text-sm text-slate-400">目前已有 {novels.length} 本作品正在创作中</p>
        </div>

        {/* Novel Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8">
          {filteredNovels.map(novel => (
            <div
              key={novel.id}
              onClick={() => onSelectNovel(novel.id)}
              className="group relative aspect-[3/4.2] rounded-2xl overflow-hidden cursor-pointer shadow-lg md:shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 bg-slate-800 active:scale-95 md:active:scale-100"
            >
              {/* Cover Image */}
              <img
                alt={novel.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                src={novel.coverUrl || '/src/默认封面/默认封面.jpg'}
                onError={(e) => (e.currentTarget.src = '/src/默认封面/默认封面.jpg')}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30 to-transparent"></div>
              
              {/* Overlay Actions (Desktop) */}
              <div className="hidden md:flex absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-slate-900/60 backdrop-blur-[2px] flex-col justify-center items-center gap-4 z-10">
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
              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-6 z-20">
                {novel.category && (
                  <span className="inline-block px-1.5 py-0.5 md:px-2 md:py-1 bg-[var(--theme-color)]/80 md:bg-[var(--theme-color)]/90 backdrop-blur-md text-[8px] md:text-[10px] font-bold text-white rounded uppercase mb-1.5 md:mb-2 shadow-sm">
                    {novel.category}
                  </span>
                )}
                <h3 className="text-sm md:text-xl font-bold text-white mb-0.5 md:mb-1 leading-tight shadow-black/50 drop-shadow-md truncate">{novel.title}</h3>
                <p className="hidden md:block text-slate-200 text-sm line-clamp-2 mb-4 opacity-90 font-light leading-relaxed">
                  {novel.description || "暂无简介，点击进入创作..."}
                </p>
                <div className="flex items-center justify-between text-[10px] md:text-xs text-slate-300 md:font-medium opacity-80 md:opacity-100">
                  <span className="flex items-center gap-1 md:gap-1.5 md:bg-black/20 md:px-2 md:py-1 md:rounded-lg md:backdrop-blur-sm">
                    <span className="hidden md:inline"><BookOpen className="w-3.5 h-3.5" /></span>
                    {novel.chapters?.length || 0} 章节
                  </span>
                  <span>{formatDate(novel.createdAt)} 更新</span>
                </div>
              </div>
            </div>
          ))}

          {/* New Novel Card */}
          <div
            onClick={onCreateNovel}
            className="group border-2 border-dashed border-white/10 md:border-slate-300 dark:md:border-slate-700 rounded-2xl aspect-[3/4.2] flex flex-col items-center justify-center p-4 md:p-6 text-center hover:bg-white/5 md:hover:border-[var(--theme-color)]/50 md:hover:bg-[var(--theme-color)]/5 active:scale-95 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white/5 md:bg-slate-100 dark:md:bg-slate-800 group-hover:bg-[var(--theme-color)]/10 dark:group-hover:bg-[var(--theme-color)]/20 flex items-center justify-center text-slate-400 group-hover:text-[var(--theme-color)] transition-all mb-2 md:mb-4">
              <Plus className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h4 className="font-bold text-xs md:text-base mb-0 md:mb-1 text-slate-200 md:text-slate-700 dark:md:text-slate-200 group-hover:text-[var(--theme-color)] transition-colors">新建作品</h4>
            <p className="hidden md:block text-sm text-slate-500 dark:text-slate-400">开启你的下一段灵感之旅</p>
          </div>
        </div>

        {/* Footer Stats (Desktop) */}
        <footer className="hidden md:flex mt-20 pt-8 border-t border-slate-200 dark:border-slate-800 flex-wrap gap-8 items-center justify-between opacity-60">
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

        {/* Footer Stats (Mobile) */}
        <div className="md:hidden mt-12 pt-6 border-t border-white/5 grid grid-cols-3 gap-2 opacity-60 text-center">
          <div>
            <div className="text-lg font-bold">{formatNumber(totalWords)}</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">累计字数</div>
          </div>
          <div>
            <div className="text-lg font-bold">{totalChapters}</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">生成章节</div>
          </div>
          <div>
            <div className="text-lg font-bold">{novels.length}</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">作品数量</div>
          </div>
        </div>
      </main>

      {/* Floating Action Button (Mobile Only) */}
      <button
        onClick={onCreateNovel}
        className="fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-tr from-[var(--theme-color)] to-purple-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-[var(--theme-color)]/40 active:scale-90 transition-transform z-30 md:hidden"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0F172A]/95 backdrop-blur-lg border-t border-white/5 flex items-center justify-around px-6 z-40 safe-area-bottom md:hidden">
        <a className="text-[var(--theme-color)] flex flex-col items-center gap-1" href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('dashboard'); }}>
          <LayoutGrid className="w-6 h-6" />
        </a>
        <a className="text-slate-500 flex flex-col items-center gap-1" href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('automation'); }}>
          <Zap className="w-6 h-6" />
        </a>
        <a className="text-slate-500 flex flex-col items-center gap-1" href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('library'); }}>
          <FolderHeart className="w-6 h-6" />
        </a>
        <div
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-full bg-gradient-to-tr from-[var(--theme-color)] to-purple-500 ring-1 ring-white/20"
        ></div>
      </nav>

      {/* Floating Action Button (Desktop Only) */}
      <button
        onClick={() => onNavigate?.('automation')}
        className="hidden md:flex fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-tr from-[var(--theme-color)] to-[var(--theme-color-light)] rounded-full items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-transform z-[100] group"
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
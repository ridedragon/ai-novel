import {
  BookOpen,
  Bot,
  Calendar,
  Download,
  Edit2,
  Filter,
  FolderHeart,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
  Zap
} from 'lucide-react';
import React, { useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editCover, setEditCover] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<'连载中' | '已完结'>('连载中');

  // Get unique categories for filter
  const allCategories = Array.from(new Set(novels.map(n => n.category).filter(Boolean))) as string[];

  const filteredNovels = novels.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.description && n.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === '全部' || n.category === selectedCategory;
    const matchesStatus = selectedStatus === '全部' || n.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'updated') return b.createdAt - a.createdAt; // 暂时用创建时间代替最后更新
    if (sortBy === 'created') return b.createdAt - a.createdAt;
    if (sortBy === 'words') {
      const aWords = a.chapters?.reduce((acc, c) => acc + (c.content?.length || 0), 0) || 0;
      const bWords = b.chapters?.reduce((acc, c) => acc + (c.content?.length || 0), 0) || 0;
      return bWords - aWords;
    }
    return 0;
  });

  const openEditModal = (novel: Novel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNovel(novel);
    setEditTitle(novel.title);
    setEditCover(novel.coverUrl || '');
    setEditDesc(novel.description || '');
    setEditCategory(novel.category || '');
    setEditStatus(novel.status || '连载中');
  };

  const closeEditModal = () => {
    setEditingNovel(null);
    setEditTitle('');
    setEditCover('');
    setEditDesc('');
    setEditCategory('');
  };

  const handleSaveEdit = () => {
    if (editingNovel) {
      onUpdateNovel(editingNovel.id, {
        title: editTitle,
        coverUrl: editCover,
        description: editDesc,
        category: editCategory,
        status: editStatus
      });
      closeEditModal();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('图片大小不能超过 2MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setEditCover(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Helper to format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  // Calculate stats
  const totalChapters = novels.reduce((acc, curr) => acc + (curr.chapters?.length || 0), 0);
  const totalWords = novels.reduce((acc, curr) => acc + (curr.chapters?.reduce((cAcc, c) => cAcc + (c.content?.length || 0), 0) || 0), 0);
  
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const [showSearchInput, setShowSearchInput] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-slate-100 flex transition-colors duration-300 font-sans overflow-x-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-20 hidden md:flex flex-col items-center py-8 bg-gray-800 border-r border-gray-700 z-50">
        <div className="mb-10 text-[var(--theme-color)]">
          <BookOpen className="w-10 h-10" />
        </div>
        <nav className="flex flex-col gap-8 flex-1 w-full px-2">
          <button
            onClick={() => onNavigate?.('dashboard')}
            className="p-3 bg-[var(--theme-color)]/10 text-[var(--theme-color)] rounded-xl transition-all flex justify-center"
            title="我的小说"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>
          <button
            onClick={() => onNavigate?.('automation')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] rounded-xl transition-all flex justify-center"
            title="自动化中心"
          >
            <Zap className="w-6 h-6" />
          </button>
          <button
            onClick={() => onNavigate?.('workflow')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] rounded-xl transition-all flex justify-center"
            title="工作流"
          >
            <GitBranch className="w-6 h-6" />
          </button>
          <button
            onClick={() => onNavigate?.('library')}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] rounded-xl transition-all flex justify-center"
            title="资料库"
          >
            <FolderHeart className="w-6 h-6" />
          </button>
        </nav>
        <div className="mt-auto flex flex-col gap-6 w-full px-2">
          <button
            onClick={onOpenSettings}
            className="p-3 text-slate-400 hover:text-[var(--theme-color)] rounded-xl transition-all flex justify-center"
          >
            <Settings className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-[var(--theme-color)] to-purple-500 flex items-center justify-center text-white font-bold ring-2 ring-gray-700 cursor-default select-none">
            User
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-gray-900/80 backdrop-blur-md border-b border-white/5 px-4 h-16 flex md:hidden items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--theme-color)]/10 flex items-center justify-center text-[var(--theme-color)]">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">我的小说库</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearchInput(!showSearchInput)}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-lg text-sm font-medium ${showFilterPanel ? 'ring-2 ring-[var(--theme-color)]' : ''}`}
          >
            <Filter className="w-4 h-4" />
            <span>筛选</span>
          </button>
        </div>
        {showSearchInput && (
          <div className="absolute top-16 left-0 right-0 p-4 bg-gray-900 border-b border-white/5 animate-in slide-in-from-top duration-200">
            <input
              autoFocus
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-xl outline-none text-sm"
              placeholder="搜索作品..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="md:ml-20 p-4 md:p-8 max-w-[1600px] w-full mx-auto pt-20 md:pt-8 pb-28 md:pb-8">
        <header className="hidden md:flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">我的小说库</h1>
            <p className="text-slate-400">目前已有 {novels.length} 本作品正在创作中</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                className="pl-10 pr-4 py-2.5 w-64 bg-gray-800 border border-gray-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all text-sm"
                placeholder="搜索作品..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-700 transition-all ${showFilterPanel ? 'ring-2 ring-[var(--theme-color)]' : ''}`}
              >
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-sm">筛选类型</span>
              </button>

              {showFilterPanel && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setShowFilterPanel(false)}></div>
                  <div className="absolute right-0 mt-3 w-80 bg-gray-800 border border-gray-700 shadow-2xl rounded-2xl p-6 z-[60] overflow-hidden backdrop-blur-xl bg-gray-800/90 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex flex-col gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-3 text-slate-400">
                          <LayoutGrid className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">作品题材</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setSelectedCategory('全部')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${selectedCategory === '全部' ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)] shadow-lg shadow-[var(--theme-color)]/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                          >
                            全部
                          </button>
                          {allCategories.map(cat => (
                            <button
                              key={cat}
                              onClick={() => setSelectedCategory(cat)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${selectedCategory === cat ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)] shadow-lg shadow-[var(--theme-color)]/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-3 text-slate-400">
                          <Zap className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">创作状态</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSelectedStatus('全部')}
                            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${selectedStatus === '全部' ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                          >
                            全部
                          </button>
                          <button
                            onClick={() => setSelectedStatus('连载中')}
                            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${selectedStatus === '连载中' ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full bg-blue-400 ${selectedStatus === '连载中' ? 'animate-pulse' : ''}`}></span>
                            连载中
                          </button>
                          <button
                            onClick={() => setSelectedStatus('已完结')}
                            className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${selectedStatus === '已完结' ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                            已完结
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-3 text-slate-400">
                          <List className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">排序方式</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          {[
                            { id: 'updated', label: '最后更新时间' },
                            { id: 'words', label: '字数总计' },
                            { id: 'created', label: '创建日期' }
                          ].map(option => (
                            <button
                              key={option.id}
                              onClick={() => setSortBy(option.id as any)}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors group"
                            >
                              <span className={`${sortBy === option.id ? 'text-white' : 'text-slate-400'} group-hover:text-white`}>{option.label}</span>
                              {sortBy === option.id && <Save className="w-4 h-4 text-[var(--theme-color)]" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <button
                          onClick={() => {
                            setSelectedCategory('全部');
                            setSelectedStatus('全部');
                            setSortBy('updated');
                          }}
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          重置条件
                        </button>
                        <button
                          onClick={() => setShowFilterPanel(false)}
                          className="px-4 py-1.5 bg-[var(--theme-color)] text-white text-xs font-bold rounded-lg hover:bg-[var(--theme-color-hover)] transition-all shadow-lg shadow-[var(--theme-color)]/20"
                        >
                          应用筛选
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onCreateNovel}
              className="flex items-center gap-2 px-6 py-2.5 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-xl shadow-lg shadow-blue-900/20 transition-all text-sm font-semibold"
            >
              <Plus className="w-5 h-5" />
              <span>创建新小说</span>
            </button>
          </div>
        </header>

        {/* Mobile Info Text */}
        <div className="md:hidden mb-6">
          <p className="text-sm text-slate-400">目前已有 {novels.length} 本作品正在创作中</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-8">
          {filteredNovels.map(novel => (
            <div
              key={novel.id}
              onClick={() => onSelectNovel(novel.id)}
              className="group relative aspect-[3/4.2] md:aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer shadow-xl transition-transform hover:-translate-y-2 active:scale-95 md:active:scale-100 bg-gray-800 border border-gray-700"
            >
              <img
                alt={novel.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                src={novel.coverUrl || '/src/默认封面/默认封面.jpg'}
                onError={(e) => {
                  if (novel.coverUrl) {
                    // 如果自定义封面加载失败，尝试加载默认封面
                    (e.target as HTMLImageElement).src = '/src/默认封面/默认封面.jpg';
                  } else {
                    // 如果默认封面也加载失败，则隐藏并显示渐变背景
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement?.classList.add('bg-gradient-to-br', 'from-gray-800', 'to-gray-900');
                  }
                }}
              />
              
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-900/30 md:via-gray-900/40 to-transparent"></div>
              
              {/* Desktop Actions */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hidden md:flex flex-col justify-center items-center gap-4 backdrop-blur-[2px]">
                <button
                  onClick={(e) => openEditModal(novel, e)}
                  className="w-12 h-12 bg-[var(--theme-color)] rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
                  title="编辑信息"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onExportNovel(novel); }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white backdrop-blur-md transition-colors"
                    title="导出"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteNovel(novel.id); }}
                    className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-lg backdrop-blur-md transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Mobile Quick Edit Icon */}
              <button
                onClick={(e) => openEditModal(novel, e)}
                className="absolute top-2 right-2 p-2 bg-black/40 backdrop-blur-md rounded-lg md:hidden z-10"
              >
                <Edit2 className="w-4 h-4 text-white" />
              </button>

              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-6">
                {novel.category && (
                  <span className="inline-block px-1.5 py-0.5 md:px-2 md:py-0.5 bg-[var(--theme-color)]/80 text-[8px] md:text-[10px] font-bold text-white rounded uppercase mb-1.5 md:mb-2">
                    {novel.category}
                  </span>
                )}
                
                <h3 className="text-sm md:text-xl font-bold text-white mb-0.5 md:mb-1 leading-tight line-clamp-1 md:line-clamp-2 shadow-black drop-shadow-md">{novel.title}</h3>
                <p className="hidden md:block text-gray-300 text-xs line-clamp-2 mb-4 opacity-90 h-8">
                  {novel.description || "暂无简介..."}
                </p>
                <div className="flex items-center justify-between text-[10px] md:text-xs text-gray-400 md:border-t md:border-white/10 md:pt-3">
                  <span className="flex items-center gap-1">
                    <List className="w-3 h-3" /> {novel.chapters?.length || 0} 章节
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 md:hidden" /> {formatDate(novel.createdAt).slice(-5)}
                    <span className="hidden md:inline">{formatDate(novel.createdAt)}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* New Novel Card */}
          <div
            onClick={onCreateNovel}
            className="group border-2 border-dashed border-gray-700 hover:border-[var(--theme-color)]/50 rounded-2xl aspect-[3/4.2] md:aspect-[3/4] flex flex-col items-center justify-center p-4 md:p-6 text-center hover:bg-gray-800/50 transition-all cursor-pointer active:scale-95"
          >
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-gray-800 group-hover:bg-[var(--theme-color)] flex items-center justify-center text-gray-500 group-hover:text-white transition-all mb-2 md:mb-4">
              <Plus className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h4 className="font-bold mb-0.5 md:mb-1 text-gray-300 group-hover:text-white text-xs md:text-base">新建作品</h4>
            <p className="hidden md:block text-sm text-gray-500">开启你的下一段灵感之旅</p>
          </div>
        </div>

        <footer className="mt-12 md:mt-20 pt-6 md:pt-8 border-t border-gray-800 flex flex-wrap gap-4 md:gap-8 items-center justify-between opacity-60">
          <div className="flex gap-12">
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-white">{formatNumber(totalWords)}</div>
              <div className="text-xs uppercase tracking-widest font-medium text-gray-500">累计创作字数</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-white">{totalChapters}</div>
              <div className="text-xs uppercase tracking-widest font-medium text-gray-500">生成章节数</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-bold text-white">{novels.length}</div>
              <div className="text-xs uppercase tracking-widest font-medium text-gray-500">在更作品</div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            AI Novel Studio v2.5
          </div>
        </footer>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-gray-900/95 backdrop-blur-lg border-t border-white/5 flex md:hidden items-center justify-around px-6 z-40 pb-safe">
        <button onClick={() => onNavigate?.('dashboard')} className="text-[var(--theme-color)]"><LayoutGrid className="w-6 h-6" /></button>
        <button onClick={() => onNavigate?.('automation')} className="text-slate-500"><Zap className="w-6 h-6" /></button>
        <button onClick={() => onNavigate?.('library')} className="text-slate-500"><FolderHeart className="w-6 h-6" /></button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[var(--theme-color)] to-purple-500 ring-1 ring-white/20"></div>
      </nav>

      {/* Mobile Filter Sheet */}
      {showFilterPanel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity flex flex-col justify-end md:hidden">
          <div className="fixed inset-0" onClick={() => setShowFilterPanel(false)}></div>
          <div className="relative bg-gray-800/90 backdrop-blur-2xl w-full rounded-t-3xl p-6 pb-safe border-t border-white/10 animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6"></div>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold">筛选与排序</h2>
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
            
            <div className="space-y-8 max-h-[60vh] overflow-y-auto hide-scrollbar">
              <section>
                <div className="flex items-center gap-2 mb-4 text-slate-400">
                  <LayoutGrid className="w-[20px] h-[20px]" />
                  <span className="text-xs font-bold uppercase tracking-wider">作品题材</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory('全部')}
                    className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${selectedCategory === '全部' ? 'bg-[var(--theme-color)]/30 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-white/10 bg-white/5 text-slate-400'}`}
                  >
                    全部
                  </button>
                  {allCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${selectedCategory === cat ? 'bg-[var(--theme-color)]/30 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-white/10 bg-white/5 text-slate-400'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 text-slate-400">
                  <Zap className="w-[20px] h-[20px]" />
                  <span className="text-xs font-bold uppercase tracking-wider">创作状态</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedStatus('连载中')}
                    className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border transition-all ${selectedStatus === '连载中' ? 'bg-[var(--theme-color)]/30 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-white/10 bg-white/5 text-slate-400'}`}
                  >
                    <span className={`w-2 h-2 rounded-full bg-blue-400 ${selectedStatus === '连载中' ? 'animate-pulse' : ''}`}></span>
                    连载中
                  </button>
                  <button
                    onClick={() => setSelectedStatus('已完结')}
                    className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border transition-all ${selectedStatus === '已完结' ? 'bg-[var(--theme-color)]/30 border-[var(--theme-color)] text-[var(--theme-color)]' : 'border-white/10 bg-white/5 text-slate-400'}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                    已完结
                  </button>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 text-slate-400">
                  <List className="w-[20px] h-[20px]" />
                  <span className="text-xs font-bold uppercase tracking-wider">排序方式</span>
                </div>
                <div className="space-y-2">
                  {[
                    { id: 'updated', label: '最后更新时间' },
                    { id: 'words', label: '字数总计' },
                    { id: 'created', label: '创建日期' }
                  ].map(option => (
                    <button
                      key={option.id}
                      onClick={() => setSortBy(option.id as any)}
                      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm transition-colors border ${sortBy === option.id ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)]/50 text-white font-medium' : 'bg-white/5 border-transparent text-slate-400'}`}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.id && <Save className="w-4 h-4 text-[var(--theme-color)]" />}
                    </button>
                  ))}
                </div>
              </section>
            </div>
            
            <div className="mt-8">
              <button
                onClick={() => setShowFilterPanel(false)}
                className="w-full py-4 bg-[var(--theme-color)] text-white font-bold rounded-2xl shadow-xl shadow-[var(--theme-color)]/20 active:scale-[0.98] transition-all"
              >
                应用筛选
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (Desktop Only) */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 hidden md:flex bg-gradient-to-tr from-[var(--theme-color)] to-purple-600 rounded-full items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform z-[40]"
        title="AI 助手"
      >
        <Bot className="w-7 h-7" />
      </button>

      {/* Edit Modal */}
      {editingNovel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-lg text-white">编辑作品信息</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">作品标题</label>
                <input 
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                  placeholder="请输入标题"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">封面图片</label>
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        value={editCover.startsWith('data:') ? '本地上传图片' : editCover}
                        onChange={(e) => setEditCover(e.target.value)}
                        disabled={editCover.startsWith('data:')}
                        className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="https://..."
                      />
                      <button
                        onClick={triggerFileUpload}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors border border-gray-600 flex items-center gap-2"
                        title="从本地上传"
                      >
                        <Upload className="w-4 h-4" />
                        <span>上传</span>
                      </button>
                      {editCover.startsWith('data:') && (
                        <button
                          onClick={() => setEditCover('')}
                          className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded-lg text-sm transition-colors border border-red-800/50"
                          title="清除本地图片"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                  <div className="w-10 h-10 rounded bg-gray-700 flex-shrink-0 overflow-hidden border border-gray-600 flex items-center justify-center">
                    {editCover ? (
                      <img src={editCover} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500">支持网络图片链接或本地上传，推荐比例 3:4，文件需小于 2MB</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">作品简介</label>
                <textarea 
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all resize-none h-32"
                  placeholder="请输入作品简介..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">作品类型</label>
                <input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none transition-all"
                  placeholder="例如：玄幻、都市、言情..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">创作状态</label>
                <div className="flex gap-2">
                  {(['连载中', '已完结'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setEditStatus(s)}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-all ${editStatus === s ? 'bg-[var(--theme-color)]/20 border-[var(--theme-color)] text-[var(--theme-color)]' : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
              <button 
                onClick={closeEditModal}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors border border-gray-600"
              >
                取消
              </button>
              <button 
                onClick={handleSaveEdit}
                className="px-6 py-2 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-lg text-sm transition-colors shadow-lg shadow-[var(--theme-color)]/20 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> 保存更改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import {
  Filter,
  Plus,
  Search,
  Trash2,
  X
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
  const [showSearchInput, setShowSearchInput] = useState(false);
  
  const allCategories = Array.from(new Set(novels.map(n => n.category).filter(Boolean))) as string[];

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
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 relative">
      <style>{`
        .glass-sheet {
            background: rgba(30, 41, 59, 0.85);
            backdrop-filter: blur(24px);
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
        }
        .chip-active {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
            border-color: rgba(59, 130, 246, 0.6);
            color: #60A5FA;
            box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
        }
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-white/5 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <span className="material-icons-round">auto_stories</span>
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
            onClick={() => setShowFilterPanel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-white/10 rounded-lg text-sm font-medium"
          >
            <Filter className="w-4 h-4" />
            <span>筛选</span>
          </button>
        </div>

        {showSearchInput && (
          <div className="absolute top-16 left-0 right-0 p-4 bg-[#0F172A] border-b border-white/5 animate-in slide-in-from-top duration-200 z-50">
            <div className="relative">
              <input
                autoFocus
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl outline-none text-sm focus:border-blue-500 transition-colors"
                placeholder="搜索作品..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <button
                onClick={() => setShowSearchInput(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Grid */}
      <main className="pt-20 pb-28 px-4 max-w-lg mx-auto w-full">
        <div className="mb-6">
          <p className="text-sm text-slate-400">目前已有 {novels.length} 本作品正在创作中</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {filteredNovels.map(novel => (
            <div
              key={novel.id}
              onClick={() => onSelectNovel(novel.id)}
              className="group relative aspect-[3/4.2] rounded-2xl overflow-hidden cursor-pointer shadow-lg active:scale-95 transition-transform bg-[#1E293B]"
            >
              <img
                alt={novel.title}
                className="absolute inset-0 w-full h-full object-cover"
                src={novel.coverUrl || '/src/默认封面/默认封面.jpg'}
                onError={(e) => (e.currentTarget.src = '/src/默认封面/默认封面.jpg')}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                {novel.category && (
                  <span className="inline-block px-1.5 py-0.5 bg-blue-500/80 text-[8px] font-bold text-white rounded uppercase mb-1.5">
                    {novel.category}
                  </span>
                )}
                <h3 className="text-sm font-bold text-white mb-0.5 truncate">{novel.title}</h3>
                <div className="flex items-center justify-between text-[10px] text-slate-300 opacity-80">
                  <span>{novel.chapters?.length || 0} 章节</span>
                  <span>{formatDate(novel.createdAt)} 更新</span>
                </div>
              </div>
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteNovel(novel.id); }}
                  className="p-1.5 bg-red-500/20 backdrop-blur-md rounded-lg text-red-200 border border-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          <div
            onClick={onCreateNovel}
            className="border-2 border-dashed border-white/10 rounded-2xl aspect-[3/4.2] flex flex-col items-center justify-center p-4 text-center hover:bg-white/5 active:scale-95 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-slate-400 mb-2">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold">新建作品</span>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 grid grid-cols-3 gap-2 opacity-60 text-center">
          <div>
            <div className="text-lg font-bold">{formatNumber(totalWords)}</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">累计字数</div>
          </div>
          <div>
            <div className="text-lg font-bold">{totalChapters}</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">生成章节</div>
          </div>
          <div>
            <div className="text-lg font-bold">24</div>
            <div className="text-[8px] uppercase tracking-wider font-medium">模型连接</div>
          </div>
        </div>
      </main>

      {/* Floating Action Button */}
      <button
        onClick={onCreateNovel}
        className="fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-blue-500/40 active:scale-90 transition-transform z-30"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0F172A]/95 backdrop-blur-lg border-t border-white/5 flex items-center justify-around px-6 z-40 pb-safe">
        <button onClick={() => onNavigate?.('dashboard')} className="text-blue-500">
          <span className="material-icons-round">grid_view</span>
        </button>
        <button onClick={() => onNavigate?.('automation')} className="text-slate-500">
          <span className="material-icons-round">bolt</span>
        </button>
        <button onClick={() => onNavigate?.('library')} className="text-slate-500">
          <span className="material-icons-round">folder_special</span>
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 ring-1 ring-white/20"></div>
      </nav>

      {/* Filter Sheet */}
      {showFilterPanel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setShowFilterPanel(false)}></div>
          <div className="glass-sheet w-full rounded-t-3xl p-6 pb-safe animate-in slide-in-from-bottom duration-300">
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
                  <span className="material-symbols-outlined text-[20px]">category</span>
                  <span className="text-xs font-bold uppercase tracking-wider">作品题材</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['全部', '科幻', '悬疑', '奇幻', '言情', '都市'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${selectedCategory === cat ? 'chip-active' : 'border-white/10 bg-white/5 text-slate-400'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 text-slate-400">
                  <span className="material-symbols-outlined text-[20px]">motion_photos_on</span>
                  <span className="text-xs font-bold uppercase tracking-wider">创作状态</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedStatus('连载中')}
                    className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border transition-all ${selectedStatus === '连载中' ? 'chip-active' : 'border-white/10 bg-white/5 text-slate-400'}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    连载中
                  </button>
                  <button
                    onClick={() => setSelectedStatus('已完结')}
                    className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border transition-all ${selectedStatus === '已完结' ? 'chip-active' : 'border-white/10 bg-white/5 text-slate-400'}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                    已完结
                  </button>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 text-slate-400">
                  <span className="material-symbols-outlined text-[20px]">sort</span>
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
                      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm transition-colors border ${sortBy === option.id ? 'bg-white/10 border-white/10 text-white' : 'bg-transparent border-transparent text-slate-400'}`}
                    >
                      <span className="font-medium">{option.label}</span>
                      {sortBy === option.id && <span className="material-symbols-outlined text-blue-500">check_circle</span>}
                    </button>
                  ))}
                </div>
              </section>
            </div>
            
            <div className="mt-8">
              <button
                onClick={() => setShowFilterPanel(false)}
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all"
              >
                应用筛选
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

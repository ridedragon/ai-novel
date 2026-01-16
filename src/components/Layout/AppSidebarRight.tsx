import {
  BookOpen,
  ExternalLink,
  Lightbulb,
  Users,
  Zap
} from 'lucide-react';
import React from 'react';
import { Novel } from '../../types';

interface AppSidebarRightProps {
  activeNovel: Novel | null;
  creationModule: 'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference';
  handleSwitchModule: (target: 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference') => void;
  setShowOutline: (show: boolean) => void;
  setCreationModule: (module: 'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference') => void;
}

export const AppSidebarRight: React.FC<AppSidebarRightProps> = ({
  activeNovel,
  creationModule,
  handleSwitchModule,
  setShowOutline,
  setCreationModule,
}) => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#12151e]/30 p-1 shrink-0 custom-bg-transition">
        <button onClick={() => { setShowOutline(true); handleSwitchModule('worldview'); }} className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-colors ${creationModule === 'worldview' ? 'text-[var(--theme-color)] bg-[var(--theme-color)]/10 dark:bg-[var(--theme-color)]/5' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>世界观</button>
        <button onClick={() => { setShowOutline(true); handleSwitchModule('characters'); }} className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-colors ${creationModule === 'characters' ? 'text-[var(--theme-color)] bg-[var(--theme-color)]/10 dark:bg-[var(--theme-color)]/5' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>角色集</button>
        <button onClick={() => { setShowOutline(true); handleSwitchModule('outline'); }} className={`flex-1 py-2 text-[11px] font-bold rounded-md transition-colors ${creationModule === 'outline' ? 'text-[var(--theme-color)] bg-[var(--theme-color)]/10 dark:bg-[var(--theme-color)]/5' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>大纲</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
        {/* Module Preview Area */}
        {creationModule === 'worldview' && activeNovel?.worldviewSets?.[0]?.entries.slice(0, 3).map((entry, i) => (
          <div key={i} className="p-4 bg-white dark:bg-[#12151e]/40 rounded-xl border border-slate-200 dark:border-[#1e2433] hover:border-[var(--theme-color)]/40 transition-all cursor-pointer group relative overflow-hidden custom-input-bg">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/30"></div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{entry.item}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{entry.setting}</p>
          </div>
        ))}
        {creationModule === 'characters' && activeNovel?.characterSets?.[0]?.characters.slice(0, 3).map((char, i) => (
          <div key={i} className="p-4 bg-white dark:bg-[#12151e]/40 rounded-xl border border-slate-200 dark:border-[#1e2433] hover:border-[var(--theme-color)]/40 transition-all cursor-pointer group relative overflow-hidden custom-input-bg">
            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--theme-color)]/30"></div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-[var(--theme-color)]" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{char.name}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{char.bio}</p>
          </div>
        ))}
        {creationModule === 'outline' && activeNovel?.outlineSets?.[0]?.items.slice(0, 3).map((item, i) => (
          <div key={i} className="p-4 bg-white dark:bg-[#12151e]/40 rounded-xl border border-slate-200 dark:border-[#1e2433] hover:border-[var(--theme-color)]/40 transition-all cursor-pointer group relative overflow-hidden custom-input-bg">
            <div className="absolute top-0 left-0 w-1 h-full bg-pink-500/30"></div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-pink-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.title}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>
          </div>
        ))}
        
        <div className="p-5 bg-[var(--theme-color)]/5 rounded-xl border border-[var(--theme-color)]/20 space-y-4">
          <div className="flex items-center gap-2 text-[var(--theme-color)]">
            <Lightbulb className="w-5 h-5 fill-[var(--theme-color)]/20" />
            <span className="text-[10px] font-bold uppercase tracking-widest">AI Suggestion</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic">"建议点击上方按钮进入详情页进行深度策划。"</p>
          <button
            className="w-full py-2.5 bg-[var(--theme-color)]/10 hover:bg-[var(--theme-color)]/20 text-[var(--theme-color)] text-[11px] font-bold rounded-lg transition-all border border-[var(--theme-color)]/20"
            onClick={() => setShowOutline(true)}
          >
            查看全部详情
          </button>
        </div>
      </div>
      <div className="p-5 border-t border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#12151e]/20 shrink-0 custom-bg-transition">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-[#12151e] rounded-lg border border-slate-200 dark:border-[#1e2433] text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-500 transition-all group custom-input-bg"
          onClick={() => { setShowOutline(true); setCreationModule('menu'); }}
        >
          <span>进入自动化中心</span>
          <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
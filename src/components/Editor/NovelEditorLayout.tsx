import { Book, BookOpen, FileText, Globe, Lightbulb, Menu, Users } from 'lucide-react';
import React, { ReactNode } from 'react';
import { useLayout } from '../../contexts/LayoutContext';

interface NovelEditorLayoutProps {
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  sidebarLeft?: ReactNode;
  sidebarRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onNavigate?: (target: 'dashboard' | 'automation' | 'workflow' | 'library') => void;
  onOpenSettings?: () => void;
  showOutline?: boolean;
  setShowOutline?: (show: boolean) => void;
  creationModule?: 'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference';
  onSwitchModule?: (module: 'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference') => void;
}

export const NovelEditorLayout: React.FC<NovelEditorLayoutProps> = ({
  headerLeft,
  headerRight,
  sidebarLeft,
  sidebarRight,
  children,
  footer,
  onNavigate,
  onOpenSettings,
  showOutline,
  setShowOutline,
  creationModule,
  onSwitchModule,
}) => {
  const { isMobileSidebarOpen, setIsMobileSidebarOpen } = useLayout();

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white dark:bg-[#09090b] text-slate-600 dark:text-slate-300 antialiased font-sans custom-bg-transition">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between px-1.5 md:px-6 shrink-0 z-40 custom-header-transition overflow-hidden">
        <div className="flex items-center gap-0.5 md:gap-2">
          {headerLeft}
        </div>
        <div className="flex items-center gap-1 md:gap-3">
          {headerRight}
          <div className="hidden md:flex w-10 h-10 rounded-xl bg-[var(--theme-color)]/10 items-center justify-center text-[var(--theme-color)] shadow-lg border border-white/5 ml-2 uppercase font-bold text-xs">
            AI
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Chapters */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#09090b] flex flex-col shrink-0 transition-transform duration-300 custom-sidebar-transition
          md:relative md:translate-x-0
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {sidebarLeft}
        </aside>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 bg-white dark:bg-[#09090b] flex flex-col relative overflow-hidden w-full custom-bg-transition pb-16 md:pb-0">
          {children}
          
          {/* Footer */}
          {footer && (
            <div className="hidden md:flex h-8 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#09090b] px-6 items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium shrink-0 custom-bg-transition">
              {footer}
            </div>
          )}
        </main>

        {/* Right Sidebar - Worldview/Characters/Outline */}
        <aside className="hidden lg:flex w-72 border-l border-slate-200 dark:border-[#1e2433] bg-slate-50 dark:bg-[#09090b] flex-col shrink-0 custom-sidebar-transition">
          {sidebarRight}
        </aside>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-lg border-t border-slate-200 dark:border-white/5 flex items-center justify-around px-2 z-40 safe-area-bottom md:hidden">
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'menu' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('menu');
          }}
          title="菜单"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px]">菜单</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'inspiration' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('inspiration');
          }}
          title="灵感"
        >
          <Lightbulb className="w-5 h-5" />
          <span className="text-[9px]">灵感</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'worldview' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('worldview');
          }}
          title="世界"
        >
          <Globe className="w-5 h-5" />
          <span className="text-[9px]">世界</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'characters' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('characters');
          }}
          title="角色"
        >
          <Users className="w-5 h-5" />
          <span className="text-[9px]">角色</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'plotOutline' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('plotOutline');
          }}
          title="粗纲"
        >
          <Book className="w-5 h-5" />
          <span className="text-[9px]">粗纲</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${creationModule === 'outline' ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => {
            setShowOutline?.(true);
            onSwitchModule?.('outline');
          }}
          title="大纲"
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[9px]">大纲</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-0.5 ${!showOutline ? "text-[var(--theme-color)]" : "text-slate-400 dark:text-slate-500"}`}
          onClick={() => setShowOutline?.(false)}
          title="正文"
        >
          <FileText className="w-5 h-5" />
          <span className="text-[9px]">正文</span>
        </button>
      </nav>
    </div>
  );
};
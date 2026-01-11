import React, { ReactNode } from 'react';
import { useLayout } from '../../contexts/LayoutContext';

interface NovelEditorLayoutProps {
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  sidebarLeft?: ReactNode;
  sidebarRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export const NovelEditorLayout: React.FC<NovelEditorLayoutProps> = ({
  headerLeft,
  headerRight,
  sidebarLeft,
  sidebarRight,
  children,
  footer
}) => {
  const { isMobileSidebarOpen, setIsMobileSidebarOpen } = useLayout();

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#0a0c12] text-slate-300 antialiased font-sans">
      {/* Header */}
      <header className="shrink-0 z-50 bg-[#0a0c12] border-b border-[#1e2433]">
        <div className="h-12 md:h-16 flex items-center justify-between px-3 md:px-6 border-b border-white/5 bg-[#0a0c12]/80 backdrop-blur-md">
          <div className="flex items-center gap-2 md:gap-3">
            {headerLeft}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {headerRight}
            <div className="hidden md:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center text-primary shadow-lg border border-white/5 ml-2 uppercase font-bold text-xs">
              AI
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Chapters */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 border-r border-[#1e2433] bg-[#0a0c12] flex flex-col shrink-0 transition-transform duration-300
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
        <main className="flex-1 bg-[#0f172a] flex flex-col relative overflow-hidden w-full">
          {children}
          
          {/* Footer */}
          {footer && (
            <div className="hidden md:flex h-8 border-t border-white/5 bg-[#0f172a] px-6 items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-medium shrink-0">
              {footer}
            </div>
          )}
        </main>

        {/* Right Sidebar - Worldview/Characters/Outline */}
        <aside className="hidden lg:flex w-72 border-l border-[#1e2433] bg-[#0a0c12] flex-col shrink-0">
          {sidebarRight}
        </aside>
      </div>
    </div>
  );
};
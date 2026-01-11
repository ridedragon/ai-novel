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
      <header className="h-12 border-b border-[#1e2433] bg-[#0a0c12] flex items-center justify-between px-3 md:px-6 shrink-0 z-40">
        <div className="flex items-center gap-2">
          {headerLeft}
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {headerRight}
          <div className="hidden md:flex w-8 h-8 rounded-full bg-gradient-to-tr from-[#8b5cf6] to-[#3b82f6] items-center justify-center text-[10px] font-bold text-white shadow-lg border border-white/10 ml-2 uppercase">
            AI
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
        <main className="flex-1 bg-[#0a0c12] flex flex-col relative overflow-hidden w-full">
          {children}
          
          {/* Footer */}
          {footer && (
            <div className="hidden md:flex h-8 border-t border-[#1e2433] bg-[#0a0c12] px-6 items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-medium shrink-0">
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
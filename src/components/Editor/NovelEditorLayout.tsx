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
    <div className="h-screen overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 antialiased font-sans transition-colors">
      {/* Header */}
      <header className="h-16 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md flex items-center justify-between px-3 md:px-6 shrink-0 z-40 transition-colors">
        <div className="flex items-center gap-2">
          {headerLeft}
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {headerRight}
          <div className="hidden md:flex w-10 h-10 rounded-xl bg-[var(--theme-color)]/10 items-center justify-center text-[var(--theme-color)] shadow-lg border border-white/5 ml-2 uppercase font-bold text-xs">
            AI
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Chapters */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col shrink-0 transition-transform duration-300
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
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col relative overflow-hidden w-full transition-colors">
          {children}
          
          {/* Footer */}
          {footer && (
            <div className="hidden md:flex h-8 border-t border-gray-200 dark:border-white/5 bg-white dark:bg-gray-900 px-6 items-center justify-between text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-widest font-medium shrink-0 transition-colors">
              {footer}
            </div>
          )}
        </main>

        {/* Right Sidebar - Worldview/Characters/Outline */}
        <aside className="hidden lg:flex w-72 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-col shrink-0 transition-colors">
          {sidebarRight}
        </aside>
      </div>
    </div>
  );
};
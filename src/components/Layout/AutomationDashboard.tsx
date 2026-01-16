import {
  Book,
  Bot,
  GitBranch,
  Globe,
  LayoutList,
  Lightbulb,
  Users,
  Wand2
} from 'lucide-react';
import React, { Suspense, lazy } from 'react';
import { Novel } from '../../types';

// 懒加载重型组件
const CharacterManager = lazy(() => import('../CharacterManager').then(m => ({ default: m.CharacterManager })));
const InspirationManager = lazy(() => import('../InspirationManager').then(m => ({ default: m.InspirationManager })));
const OutlineManager = lazy(() => import('../OutlineManager').then(m => ({ default: m.OutlineManager })));
const PlotOutlineManager = lazy(() => import('../PlotOutlineManager').then(m => ({ default: m.PlotOutlineManager })));
const ReferenceManager = lazy(() => import('../ReferenceManager').then(m => ({ default: m.ReferenceManager })));
const WorldviewManager = lazy(() => import('../WorldviewManager').then(m => ({ default: m.WorldviewManager })));

interface AutomationDashboardProps {
  creationModule: 'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference';
  setCreationModule: (module: any) => void;
  activeNovel: Novel | null;
  globalCreationPrompt: string;
  setGlobalCreationPrompt: (prompt: string) => void;
  setShowWorkflowEditor: (show: boolean) => void;
  handleSwitchModule: (module: any) => void;
  // 各模块所需的 Props (透传)
  inspirationProps: any;
  characterProps: any;
  worldviewProps: any;
  outlineProps: any;
  plotOutlineProps: any;
  referenceProps: any;
}

export const AutomationDashboard: React.FC<AutomationDashboardProps> = ({
  creationModule,
  activeNovel,
  globalCreationPrompt,
  setGlobalCreationPrompt,
  setShowWorkflowEditor,
  handleSwitchModule,
  inspirationProps,
  characterProps,
  worldviewProps,
  outlineProps,
  plotOutlineProps,
  referenceProps,
}) => {
  return (
    <div className={`flex-1 bg-white dark:bg-[#0a0c12] flex flex-col custom-bg-transition ${(creationModule === 'characters' || creationModule === 'worldview' || creationModule === 'outline' || creationModule === 'inspiration' || creationModule === 'plotOutline' || creationModule === 'reference') ? 'p-0 overflow-hidden' : 'p-4 md:p-8 overflow-y-auto'}`}>
      <div className={`${(creationModule === 'characters' || creationModule === 'worldview' || creationModule === 'outline' || creationModule === 'inspiration' || creationModule === 'plotOutline' || creationModule === 'reference') ? 'w-full h-full' : 'max-w-4xl mx-auto w-full space-y-6'}`}>
        {/* Dashboard Menu */}
        {creationModule === 'menu' && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-3xl font-bold flex items-center gap-3 justify-center mb-8 text-slate-900 dark:text-white">
              <Wand2 className="w-8 h-8 text-[var(--theme-color)]" />
              自动化创作中心
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[
                { id: 'reference', icon: Book, color: 'text-primary', label: '资料库', desc: '上传参考文档，记录考据笔记，作为 AI 的知识基石' },
                { id: 'inspiration', icon: Lightbulb, color: 'text-yellow-400', label: '灵感', desc: '捕捉稍纵即逝的创意，AI 辅助发散思维' },
                { id: 'worldview', icon: Globe, color: 'text-emerald-400', label: '世界观', desc: '构建宏大的世界背景' },
                { id: 'plotOutline', icon: LayoutList, color: 'text-pink-400', label: '剧情粗纲', desc: '规划故事整体框架，支持多级子项' },
                { id: 'characters', icon: Users, color: 'text-orange-400', label: '角色集', desc: '创建和管理小说中的角色' },
                { id: 'outline', icon: Book, color: 'text-indigo-400', label: '章节大纲', desc: '规划详细章节结构' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSwitchModule(item.id as any)}
                  className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-6 hover:border-[var(--theme-color)] hover:shadow-lg transition-all flex flex-col items-center gap-4 group text-center h-64 justify-center custom-input-bg"
                >
                  <div className={`p-4 bg-slate-100 dark:bg-gray-700/50 rounded-full group-hover:bg-[var(--theme-color)]/20 group-hover:text-[var(--theme-color)] transition-colors ${item.color}`}>
                    <item.icon className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-2">{item.label}</h3>
                    <p className="text-sm text-slate-500 dark:text-gray-400">{item.desc}</p>
                  </div>
                </button>
              ))}

              <button
                onClick={() => setShowWorkflowEditor(true)}
                className="bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-500/50 rounded-xl p-6 hover:border-indigo-400 hover:shadow-indigo-500/20 hover:shadow-xl transition-all flex flex-col items-center gap-4 group text-center h-64 justify-center custom-input-bg"
              >
                <div className="p-4 bg-indigo-100 dark:bg-indigo-500/20 rounded-full group-hover:bg-indigo-200 dark:group-hover:bg-indigo-500/30 text-indigo-500 dark:text-indigo-400">
                  <GitBranch className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-100 mb-2">可视化工作流</h3>
                  <p className="text-sm text-indigo-600/70 dark:text-indigo-300/70">串联多步骤自动化任务，实现全自动小说创作</p>
                </div>
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-6 custom-input-bg">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-5 h-5 text-[var(--theme-color)]" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-gray-200">全局创作提示词</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">
                在此设置的提示词将作为系统指令（System Prompt）自动附加到世界观、角色集和故事大纲的生成请求中。
                <br/>例如："所有生成的内容都必须符合克苏鲁神话风格，充满不可名状的恐怖。"
              </p>
              <textarea
                value={globalCreationPrompt}
                onChange={(e) => setGlobalCreationPrompt(e.target.value)}
                className="w-full h-24 min-h-[6rem] bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-600 rounded-lg p-3 text-sm text-slate-900 dark:text-gray-200 focus:border-[var(--theme-color)] outline-none resize-y placeholder-slate-400"
                placeholder="输入全局提示词..."
              />
            </div>
          </div>
        )}

        <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-400">加载中...</div>}>
          {creationModule === 'inspiration' && activeNovel && (
            <InspirationManager {...inspirationProps} />
          )}
          {creationModule === 'characters' && activeNovel && (
            <CharacterManager {...characterProps} />
          )}
          {creationModule === 'worldview' && activeNovel && (
            <WorldviewManager {...worldviewProps} />
          )}
          {creationModule === 'outline' && activeNovel && (
            <OutlineManager {...outlineProps} />
          )}
          {creationModule === 'plotOutline' && activeNovel && (
            <PlotOutlineManager {...plotOutlineProps} />
          )}
          {creationModule === 'reference' && activeNovel && (
            <ReferenceManager {...referenceProps} />
          )}
        </Suspense>
      </div>
    </div>
  );
};
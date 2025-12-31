import { BookOpen, Database, Settings2, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';
import StorySettingsGenerator from './StorySettingsGenerator';

interface AdvancedFeaturesProps {
  onClose: () => void;
}

const AdvancedFeatures: React.FC<AdvancedFeaturesProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'main' | 'story-settings'>('main');

  if (activeTab === 'story-settings') {
    return <StorySettingsGenerator onBack={() => setActiveTab('main')} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-blue-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Settings2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">高级功能</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              onClick={() => setActiveTab('story-settings')}
              className="p-6 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 transition-all group flex flex-col items-center gap-4"
            >
              <div className="p-4 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">
                <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">我的设定</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理故事角色、世界观等核心设定</p>
              </div>
            </button>

            <button className="p-6 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all group flex flex-col items-center gap-4">
              <div className="p-4 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                <BookOpen className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">AI拆书</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">智能分析经典作品，提取创作灵感</p>
              </div>
            </button>

            <button className="p-6 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition-all group flex flex-col items-center gap-4">
              <div className="p-4 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                <Database className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">我的知识库</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">积累素材、背景资料与专业知识</p>
              </div>
            </button>
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedFeatures;
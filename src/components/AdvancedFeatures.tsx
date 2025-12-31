import { Settings2, X } from 'lucide-react';
import React from 'react';

interface AdvancedFeaturesProps {
  onClose: () => void;
}

const AdvancedFeatures: React.FC<AdvancedFeaturesProps> = ({ onClose }) => {
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
        
        <div className="flex-1 overflow-y-auto p-8 text-center">
          <div className="max-w-md mx-auto py-12">
            <Settings2 className="w-20 h-20 text-slate-300 dark:text-slate-600 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-2">即将推出</h3>
            <p className="text-slate-500 dark:text-slate-400">
              这里是高级功能的占位符。我们正在努力开发更强大的自动化创作工具，敬请期待。
            </p>
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
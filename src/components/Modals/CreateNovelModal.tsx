import { Upload, X } from 'lucide-react';
import React, { useRef } from 'react';

interface CreateNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  newNovelData: {
    title: string;
    volume: string;
    coverUrl: string;
    category: string;
    status: '连载中' | '已完结';
    description: string;
  };
  setNewNovelData: (data: CreateNovelModalProps['newNovelData']) => void;
  onConfirm: () => void;
}

export const CreateNovelModal: React.FC<CreateNovelModalProps> = ({
  isOpen,
  onClose,
  newNovelData,
  setNewNovelData,
  onConfirm
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewNovelData({
          ...newNovelData,
          coverUrl: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFieldChange = (field: keyof CreateNovelModalProps['newNovelData'], value: string) => {
    setNewNovelData({
      ...newNovelData,
      [field]: value
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#18181b] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">创建新作品</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
              作品名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newNovelData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
              placeholder="请输入小说标题"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newNovelData.title.trim()) onConfirm();
                if (e.key === 'Escape') onClose();
              }}
            />
            {!newNovelData.title.trim() && newNovelData.title !== '' && (
              <p className="text-xs text-red-400">名称不能为空</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">封面图片</label>
            <div className="flex flex-col md:flex-row gap-4">
              <img
                src={newNovelData.coverUrl || '/src/默认封面/默认封面.jpg'}
                alt="Cover"
                className="w-24 h-32 md:w-16 md:h-20 object-cover rounded-lg bg-slate-200 flex-shrink-0 self-center md:self-auto shadow-sm"
                onError={(e) => (e.currentTarget.src = '/src/默认封面/默认封面.jpg')}
              />
              <div className="flex-1 space-y-2 w-full min-w-0">
                <div className="flex gap-2 w-full">
                  <input
                    type="text"
                    value={newNovelData.coverUrl}
                    onChange={(e) => handleFieldChange('coverUrl', e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all text-sm min-w-0"
                    placeholder="输入图片链接或上传..."
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    title="上传封面"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">输入图片链接，或点击上传按钮选择本地图片（支持最大5MB）</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">作品题材</label>
              <input
                type="text"
                value={newNovelData.category}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
                placeholder="例如：科幻、悬疑..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">连载状态</label>
              <select
                value={newNovelData.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
              >
                <option value="连载中">连载中</option>
                <option value="已完结">已完结</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">作品简介</label>
            <textarea
              value={newNovelData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="w-full h-32 px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all resize-none"
              placeholder="请输入作品简介..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">开始卷名称 (可选)</label>
            <input
              type="text"
              value={newNovelData.volume}
              onChange={(e) => handleFieldChange('volume', e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--theme-color)] focus:border-transparent outline-none transition-all"
              placeholder="例如：第一卷"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newNovelData.title.trim()) onConfirm();
                if (e.key === 'Escape') onClose();
              }}
            />
          </div>
        </div>

        <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#09090b]/50 flex justify-end items-center gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium text-sm"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!newNovelData.title.trim()}
            className="px-6 py-2.5 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-[var(--theme-color)]/20 transition-all font-bold text-sm"
          >
            创建作品
          </button>
        </div>
      </div>
    </div>
  );
};

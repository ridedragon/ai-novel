import { ChevronDown, Play, RefreshCw, SkipForward, Settings } from 'lucide-react';
import { Novel, OutlineItem } from '../../../../../types';
import { WorkflowNodeData } from '../../../types';

interface ChapterStartSelectorProps {
  data: WorkflowNodeData;
  activeNovel: Novel | undefined;
  onUpdate: (updates: Partial<WorkflowNodeData>) => void;
  isMobile?: boolean;
}

const resolvePending = (ids: string[], sets: any[] | undefined): string[] => {
  return ids.map(id => {
    if (id.startsWith('pending:')) {
      const name = id.substring(8);
      const real = sets?.find(s => s.name === name);
      return real?.id || id;
    }
    return id;
  });
};

export const ChapterStartSelector = ({
  data,
  activeNovel,
  onUpdate,
  isMobile = false,
}: ChapterStartSelectorProps) => {
  const getOutlineSet = () => {
    let outlineSetId = data.selectedOutlineSets?.length
      ? resolvePending([data.selectedOutlineSets[0]], activeNovel?.outlineSets)[0]
      : null;
    
    if (!outlineSetId) {
      outlineSetId =
        activeNovel?.outlineSets?.find(s => s.name === data.folderName)?.id ||
        activeNovel?.outlineSets?.[0]?.id ||
        null;
    }
    
    return activeNovel?.outlineSets?.find(s => s.id === outlineSetId);
  };

  const currentSet = getOutlineSet();
  const outlineItems: OutlineItem[] = currentSet?.items || [];

  const startChapterMode = data.startChapterMode || 'auto';
  const startChapterIndex = data.startChapterIndex ?? 0;
  const enableAutoDetect = data.enableAutoDetect !== false; // 默认开启

  const getCompletedChapterCount = () => {
    if (!activeNovel?.chapters) return 0;
    const storyChapters = activeNovel.chapters.filter(c => !c.subtype || c.subtype === 'story');
    return storyChapters.filter(c => c.content && c.content.trim()).length;
  };

  const completedCount = getCompletedChapterCount();
  const totalOutlineCount = outlineItems.length;

  const getAutoStartIndex = () => {
    if (!outlineItems.length) return 0;
    let autoStart = 0;
    // 获取当前卷ID，用于正确匹配章节
    const currentVolumeId = activeNovel?.volumes?.[0]?.id || null;
    outlineItems.forEach((item, k) => {
      // 核心修复：无论是否为标准章节标题，都必须检查卷ID
      // 因为每卷的章节标题都从"第一章"重新开始，如果不检查卷ID，
      // 会错误地将上一卷的同名章节（如"第一章"）认为是已存在，导致显示错误的起始章节
      const ex = activeNovel?.chapters?.find(c =>
        c.title === item.title && (currentVolumeId ? c.volumeId === currentVolumeId : !c.volumeId),
      );
      if (autoStart === k && (!ex || !ex.content?.trim())) autoStart = k;
      else if (autoStart === k) autoStart = k + 1;
    });
    return Math.min(autoStart, outlineItems.length - 1);
  };

  const handleModeChange = (mode: 'auto' | 'continue' | 'restart') => {
    const updates: Partial<WorkflowNodeData> = { startChapterMode: mode };
    if (mode === 'restart') {
      updates.startChapterIndex = 0;
    } else if (mode === 'continue') {
      updates.startChapterIndex = getAutoStartIndex();
    }
    onUpdate(updates);
  };

  const handleChapterChange = (index: number) => {
    onUpdate({ startChapterIndex: index });
  };

  const handleAutoDetectToggle = (enabled: boolean) => {
    onUpdate({ enableAutoDetect: enabled });
  };

  const modeOptions = [
    { 
      value: 'auto', 
      label: '自动检测', 
      icon: RefreshCw, 
      description: '自动跳过已完成章节',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30'
    },
    { 
      value: 'continue', 
      label: '继续写作', 
      icon: SkipForward, 
      description: `从第 ${getAutoStartIndex() + 1} 章继续`,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      borderColor: 'border-emerald-500/30'
    },
    { 
      value: 'restart', 
      label: '从头开始', 
      icon: Play, 
      description: '重新生成所有章节',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/20',
      borderColor: 'border-amber-500/30'
    },
  ];

  if (!outlineItems.length) {
    return (
      <div className={isMobile ? "space-y-4 pt-6 border-t border-gray-800" : "space-y-4 pt-6 border-t border-gray-700/30"}>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <SkipForward className="w-3.5 h-3.5 text-indigo-400" /> 起始章节设置
        </label>
        <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/50 text-center">
          <p className="text-xs text-gray-500">当前未关联有效大纲集</p>
          <p className="text-[10px] text-gray-600 mt-1">请确保项目中存在大纲，或在"关联参考资料集"中选择大纲</p>
        </div>
      </div>
    );
  }

  return (
    <div className={isMobile ? "space-y-4 pt-6 border-t border-gray-800" : "space-y-4 pt-6 border-t border-gray-700/30"}>
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
        <SkipForward className="w-3.5 h-3.5 text-indigo-400" /> 起始章节设置
      </label>

      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-gray-400">大纲章节总数:</span>
          <span className="text-indigo-300 font-bold">{totalOutlineCount} 章</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">已完成章节:</span>
          <span className="text-emerald-300 font-bold">{completedCount} 章</span>
        </div>
        {currentSet && (
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-gray-700/30">
            <span className="text-gray-400">当前大纲:</span>
            <span className="text-pink-300 font-bold">{currentSet.name}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-500 uppercase">生成模式</label>
        <div className={isMobile ? "space-y-2" : "grid grid-cols-3 gap-2"}>
          {modeOptions.map(option => (
            <button
              key={option.value}
              onClick={() => handleModeChange(option.value as 'auto' | 'continue' | 'restart')}
              className={`p-2.5 rounded-lg border transition-all text-left ${
                startChapterMode === option.value
                  ? `${option.bgColor} ${option.borderColor} border`
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <option.icon className={`w-3 h-3 ${startChapterMode === option.value ? option.color : 'text-gray-500'}`} />
                <span className={`text-xs font-bold ${startChapterMode === option.value ? option.color : 'text-gray-400'}`}>
                  {option.label}
                </span>
              </div>
              <p className="text-[9px] text-gray-500 leading-relaxed">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-gray-500" />
            <div>
              <div className="text-xs font-medium text-gray-300">自动检测跳过已完成章节</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {enableAutoDetect ? '开启：自动跳过已有内容的章节' : '关闭：始终从指定位置开始'}
              </div>
            </div>
          </div>
          <button
            onClick={() => handleAutoDetectToggle(!enableAutoDetect)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              enableAutoDetect ? 'bg-indigo-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                enableAutoDetect ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {(startChapterMode === 'continue' || startChapterMode === 'restart') && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-[10px] font-bold text-gray-500 uppercase">指定起始章节</label>
          <div className="relative">
            <select
              value={startChapterIndex}
              onChange={e => handleChapterChange(parseInt(e.target.value))}
              className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
            >
              {outlineItems.map((item, index) => {
                const isCompleted = activeNovel?.chapters?.some(
                  c => c.title === item.title && c.content && c.content.trim()
                );
                return (
                  <option key={index} value={index}>
                    第 {index + 1} 章: {item.title}
                    {isCompleted ? ' ✓' : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
          <p className="text-[10px] text-gray-500">
            {startChapterMode === 'restart' 
              ? '⚠️ 从头开始将重新生成所有章节，已存在的内容会被覆盖'
              : '💡 从选中的章节开始生成，之前的章节保持不变'
            }
          </p>
        </div>
      )}
    </div>
  );
};

import { BookOpen, Download, GitBranch, Home, Menu, Network, Settings, Zap } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 导入重构后的 Hooks
import { useAIGenerators } from './hooks/useAIGenerators';
import { useAppConfig } from './hooks/useAppConfig';
import { useAutoWriteManager } from './hooks/useAutoWriteManager';
import { useCompletionPresets } from './hooks/useCompletionPresets';
import { useGeneratorPresets } from './hooks/useGeneratorPresets';
import { useNovelData } from './hooks/useNovelData';

// 核心编辑器与布局组件
import { ChapterEditor } from './components/Editor/ChapterEditor';
import { NovelEditorLayout } from './components/Editor/NovelEditorLayout';
import { AppSidebarLeft } from './components/Layout/AppSidebarLeft';
import { AppSidebarRight } from './components/Layout/AppSidebarRight';
import { AutomationDashboard } from './components/Layout/AutomationDashboard';
import { NovelDashboard } from './components/NovelDashboard';

// 懒加载弹窗与大型组件
const GlobalSettingsModal = lazy(() =>
  import('./components/GlobalSettingsModal').then(m => ({ default: m.GlobalSettingsModal })),
);
const MobileWorkflowEditor = lazy(() =>
  import('./components/MobileWorkflowEditor').then(m => ({ default: m.MobileWorkflowEditor })),
);
const WorkflowEditor = lazy(() => import('./components/WorkflowEditor').then(m => ({ default: m.WorkflowEditor })));
const AdvancedSettingsModal = lazy(() =>
  import('./components/Modals/AdvancedSettingsModal').then(m => ({ default: m.AdvancedSettingsModal })),
);
const AnalysisResultModal = lazy(() =>
  import('./components/Modals/AnalysisResultModal').then(m => ({ default: m.AnalysisResultModal })),
);
const AutoWriteConfigModal = lazy(() =>
  import('./components/Modals/AutoWriteConfigModal').then(m => ({ default: m.AutoWriteConfigModal })),
);
const CreateNovelModal = lazy(() =>
  import('./components/Modals/CreateNovelModal').then(m => ({ default: m.CreateNovelModal })),
);
const GeneratorPromptEditModal = lazy(() =>
  import('./components/Modals/GeneratorPromptEditModal').then(m => ({ default: m.GeneratorPromptEditModal })),
);
const GeneratorSettingsModal = lazy(() =>
  import('./components/Modals/GeneratorSettingsModal').then(m => ({ default: m.GeneratorSettingsModal })),
);
const GlobalDialog = lazy(() => import('./components/Modals/GlobalDialog').then(m => ({ default: m.GlobalDialog })));
const OutlineEditModal = lazy(() =>
  import('./components/Modals/OutlineEditModal').then(m => ({ default: m.OutlineEditModal })),
);
const PresetNameModal = lazy(() =>
  import('./components/Modals/PresetNameModal').then(m => ({ default: m.PresetNameModal })),
);
const RegexManagerModal = lazy(() =>
  import('./components/Modals/RegexManagerModal').then(m => ({ default: m.RegexManagerModal })),
);

import { useLayout } from './contexts/LayoutContext';
import { GeneratorPrompt, Novel, PromptItem } from './types';
import { buildReferenceContext, buildWorldInfoContext } from './utils/aiHelpers';
import { ensureChapterVersions } from './utils/chapterUtils';
import { handleExportNovel, handleExportVolume } from './utils/exportUtils';
import { keepAliveManager } from './utils/KeepAliveManager';
import { storage } from './utils/storage';
import { checkAndGenerateSummary } from './utils/SummaryManager';

function App() {
  // --- 1. 初始化核心 Hooks ---
  const config = useAppConfig();
  const novelData = useNovelData();
  const generators = useGeneratorPresets();
  const autoWrite = useAutoWriteManager();
  const completion = useCompletionPresets();
  const aiGenerators = useAIGenerators();
  const { setIsMobileSidebarOpen } = useLayout();

  // --- 2. 局部 UI 状态 ---
  const [showOutline, setShowOutline] = useState(false);
  const [creationModule, setCreationModule] = useState<
    'menu' | 'outline' | 'plotOutline' | 'characters' | 'worldview' | 'inspiration' | 'reference'
  >('menu');
  const [keepAliveMode, setKeepAliveMode] = useState(false);
  const [isEditingChapter, setIsEditingChapter] = useState(false);
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);

  // 弹窗控制
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showCreateNovelModal, setShowCreateNovelModal] = useState(false);
  const [showAutoWriteModal, setShowAutoWriteModal] = useState(false);
  const [showAnalysisResultModal, setShowAnalysisResultModal] = useState(false);
  const [showRegexModal, setShowRegexModal] = useState(false);
  const [showGeneratorSettingsModal, setShowGeneratorSettingsModal] = useState(false);
  const [generatorSettingsType, setGeneratorSettingsType] = useState<
    'outline' | 'character' | 'worldview' | 'inspiration' | 'plotOutline' | 'optimize' | 'analysis'
  >('outline');
  const [editingOutlineItemIndex, setEditingOutlineItemIndex] = useState<number | null>(null);
  const [showPresetNameModal, setShowPresetNameModal] = useState(false);
  const [presetModalMode, setPresetModalMode] = useState<'rename' | 'save_as'>('rename');
  const [viewMode, setViewMode] = useState<'settings' | 'list'>('settings');
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [draggedPromptIndex, setDraggedPromptIndex] = useState<number | null>(null);
  const [showGeneratorApiConfig, setShowGeneratorApiConfig] = useState(false);
  const [editingGeneratorPromptIndex, setEditingGeneratorPromptIndex] = useState<number | null>(null);
  const [tempEditingPrompt, setTempEditingPrompt] = useState<GeneratorPrompt | null>(null);

  // 各模块的 User Prompt 状态
  const [inspirationUserPrompt, setInspirationUserPrompt] = useState('');
  const [worldviewUserPrompt, setWorldviewUserPrompt] = useState('');
  const [characterUserPrompt, setCharacterUserPrompt] = useState('');
  const [outlineUserPrompt, setOutlineUserPrompt] = useState('');
  const [plotOutlineUserPrompt, setPlotOutlineUserPrompt] = useState('');

  // AI 生成控制 Refs
  const outlineAbortControllerRef = useRef<AbortController | null>(null);
  const characterAbortControllerRef = useRef<AbortController | null>(null);
  const worldviewAbortControllerRef = useRef<AbortController | null>(null);
  const inspirationAbortControllerRef = useRef<AbortController | null>(null);
  const plotOutlineAbortControllerRef = useRef<AbortController | null>(null);
  const generateAbortControllerRef = useRef<AbortController | null>(null);

  // 参考选择器状态
  const [selectedWorldviewSetId, setSelectedWorldviewSetId] = useState<string | null>(null);
  const [selectedWorldviewIndices, setSelectedWorldviewIndices] = useState<number[]>([]);
  const [showWorldviewSelector, setShowWorldviewSelector] = useState(false);

  const [selectedCharacterSetId, setSelectedCharacterSetId] = useState<string | null>(null);
  const [selectedCharacterIndices, setSelectedCharacterIndices] = useState<number[]>([]);
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);

  const [selectedInspirationSetId, setSelectedInspirationSetId] = useState<string | null>(null);
  const [selectedInspirationIndices, setSelectedInspirationIndices] = useState<number[]>([]);
  const [showInspirationSelector, setShowInspirationSelector] = useState(false);

  const [selectedOutlineSetId, setSelectedOutlineSetId] = useState<string | null>(null);
  const [selectedOutlineIndices, setSelectedOutlineIndices] = useState<number[]>([]);
  const [showOutlineSelector, setShowOutlineSelector] = useState(false);

  const [selectedReferenceType, setSelectedReferenceType] = useState<string | null>(null);
  const [selectedReferenceIndices, setSelectedReferenceIndices] = useState<number[]>([]);
  const [showReferenceSelector, setShowReferenceSelector] = useState(false);

  // 辅助函数：切换条目选择
  const handleToggleItem = (
    type: 'worldview' | 'character' | 'inspiration' | 'outline' | 'reference',
    setId: string,
    index: number,
  ) => {
    const setIndicesMap = {
      worldview: setSelectedWorldviewIndices,
      character: setSelectedCharacterIndices,
      inspiration: setSelectedInspirationIndices,
      outline: setSelectedOutlineIndices,
      reference: setSelectedReferenceIndices,
    };

    setIndicesMap[type](prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      return [...prev, index];
    });
  };

  // 对话框状态
  const [dialog, setDialog] = useState<any>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    inputValue: '',
    onConfirm: () => {},
  });
  const closeDialog = () => setDialog((prev: any) => ({ ...prev, isOpen: false }));

  // --- 3. 派生状态与业务逻辑 ---
  const activeChapter = useMemo(
    () => novelData.chapters.find(c => c.id === novelData.activeChapterId) || novelData.chapters[0],
    [novelData.chapters, novelData.activeChapterId],
  );

  const activePreset = useMemo(
    () => completion.completionPresets.find(p => p.id === completion.activePresetId),
    [completion.completionPresets, completion.activePresetId],
  );

  useEffect(() => {
    if (novelData.activeChapterId) {
      storage.getChapterVersions(novelData.activeChapterId).then(versions => {
        if (versions && versions.length > 0) {
          novelData.setChapters(prev =>
            prev.map(c => {
              if (c.id === novelData.activeChapterId && !autoWrite.optimizingChapterIds.has(c.id)) {
                return ensureChapterVersions({ ...c, versions });
              }
              return c;
            }),
          );
        }
      });
    }
  }, [novelData.activeChapterId]);

  const handleSwitchModule = useCallback(
    (target: any) => {
      setCreationModule(target);
      if (!showOutline) setShowOutline(true);
    },
    [showOutline],
  );

  const getActiveScripts = useCallback(() => {
    const activePreset = completion.completionPresets.find(p => p.id === completion.activePresetId);
    return [...config.globalRegexScripts, ...(activePreset?.regexScripts || [])];
  }, [config.globalRegexScripts, completion.completionPresets, completion.activePresetId]);

  const handleOptimizeAction = useCallback(
    async (tid?: number, content?: string) => {
      await autoWrite.handleOptimize({
        targetId: tid || novelData.activeChapterId!,
        initialContent: content,
        activeNovelId: novelData.activeNovelId,
        novelsRef: novelData.novelsRef,
        optimizePresets: generators.optimizePresets,
        activeOptimizePresetId: generators.activeOptimizePresetId,
        optimizeModel: config.optimizeModel,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        maxRetries: config.maxRetries,
        twoStepOptimization: config.twoStepOptimization,
        analysisPresets: generators.analysisPresets,
        activeAnalysisPresetId: generators.activeAnalysisPresetId,
        analysisModel: config.analysisModel,
        setChapters: novelData.setChapters,
        getActiveScripts,
        onError: msg => {
          setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog });
        },
      });
    },
    [novelData, generators, config, getActiveScripts, autoWrite],
  );

  const [newNovelTitle, setNewNovelTitle] = useState('');
  const [newNovelVolume, setNewNovelVolume] = useState('');

  // 版本切换辅助函数
  const handleVersionStep = useCallback(
    (step: number) => {
      novelData.setChapters(prev => {
        const c = prev.find(ch => ch.id === novelData.activeChapterId);
        if (!c || !c.versions || c.versions.length <= 1) return prev;
        const idx = c.versions.findIndex(v => v.id === c.activeVersionId);
        const nextIdx = (idx + step + c.versions.length) % c.versions.length;
        const nextV = c.versions[nextIdx];
        return prev.map(ch => (ch.id === c.id ? { ...ch, activeVersionId: nextV.id, content: nextV.content } : ch));
      });
    },
    [novelData],
  );

  const handleChapterComplete = async (
    chapterId: number,
    content: string,
    updatedNovel?: Novel,
    forceFinal?: boolean,
    runId?: string | null,
  ) => {
    if (config.longTextMode && novelData.activeNovelId) {
      return await checkAndGenerateSummary(
        chapterId,
        content,
        novelData.activeNovelId,
        updatedNovel ? [updatedNovel] : novelData.novelsRef.current,
        novelData.setNovels,
        {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.outlineModel || config.model,
          smallSummaryInterval: Number(config.smallSummaryInterval),
          bigSummaryInterval: Number(config.bigSummaryInterval),
          smallSummaryPrompt: config.smallSummaryPrompt,
          bigSummaryPrompt: config.bigSummaryPrompt,
          contextChapterCount: Number(config.contextChapterCount) || 1,
          contextScope: config.contextScope,
          runId,
        },
        msg => console.log(msg),
        msg => console.error(msg),
        undefined,
        forceFinal,
      );
    }
  };

  const handleSendToModule = useCallback((module: 'worldview' | 'character' | 'outline', content: string) => {
    if (module === 'worldview') {
      setWorldviewUserPrompt(content);
      setCreationModule('worldview');
    } else if (module === 'character') {
      setCharacterUserPrompt(content);
      setCreationModule('characters');
    } else if (module === 'outline') {
      setOutlineUserPrompt(content);
      setCreationModule('outline');
    }
  }, []);

  const handleReturnToMainWithContent = useCallback((content: string) => {
    setCreationModule('menu'); // 暂定返回主菜单，或者如果有关联的 ChapterEditor 逻辑，可以在这里处理
    // 如果需要将内容填充到主编辑器，可以在这里操作
    console.log('Return with content:', content);
  }, []);

  // --- 4. 渲染分发 ---

  if (!novelData.activeNovelId) {
    return (
      <Suspense fallback={null}>
        <NovelDashboard
          novels={novelData.novels}
          onSelectNovel={id => {
            novelData.setActiveNovelId(id);
            novelData.setActiveChapterId(null);
          }}
          onCreateNovel={() => {
            setNewNovelTitle('');
            setNewNovelVolume('');
            setShowCreateNovelModal(true);
          }}
          onDeleteNovel={novelData.deleteNovel}
          onUpdateNovel={(id, updates) => novelData.updateNovel(id, updates)}
          onExportNovel={handleExportNovel}
          onOpenSettings={() => setShowSettings(true)}
          onNavigate={target => {
            if (target === 'workflow') setShowWorkflowEditor(true);
            else if (target === 'automation') {
              const firstId = novelData.novels[0]?.id;
              if (firstId) {
                novelData.setActiveNovelId(firstId);
                setShowOutline(true);
                setCreationModule('menu');
              }
            }
          }}
        />
        <CreateNovelModal
          isOpen={showCreateNovelModal}
          onClose={() => setShowCreateNovelModal(false)}
          onConfirm={() => {
            novelData.addNovel(newNovelTitle, newNovelVolume);
            setShowCreateNovelModal(false);
          }}
          newNovelTitle={newNovelTitle}
          setNewNovelTitle={setNewNovelTitle}
          newNovelVolume={newNovelVolume}
          setNewNovelVolume={setNewNovelVolume}
        />
        <GlobalSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          {...config}
          handleScanSummaries={() => {}}
          handleRecalibrateSummaries={() => {}}
          isLoading={autoWrite.isLoading}
        />
      </Suspense>
    );
  }

  return (
    <NovelEditorLayout
      headerLeft={
        <>
          <button className="md:hidden p-1.5 text-slate-500" onClick={() => setIsMobileSidebarOpen(true)}>
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <button className="p-1.5 text-slate-500" onClick={() => novelData.setActiveNovelId(null)}>
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button
            className="hidden md:block p-2 text-slate-500"
            onClick={() => novelData.activeNovel && handleExportNovel(novelData.activeNovel)}
          >
            <Download className="w-[18px] h-[18px]" />
          </button>
          <button
            className={`p-1.5 ${showOutline ? 'text-primary' : 'text-slate-500'}`}
            onClick={() => {
              if (!showOutline) setCreationModule('menu');
              setShowOutline(!showOutline);
            }}
          >
            <BookOpen className="w-[18px] h-[18px]" />
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-[11px]"
            onClick={() => setShowAdvancedSettings(true)}
          >
            <Network className="w-4 h-4 text-primary" /> <span className="hidden md:inline">对话补全源</span>
          </button>
        </>
      }
      headerRight={
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${keepAliveMode ? 'text-green-500' : 'text-slate-500'}`}
            onClick={() => {
              setKeepAliveMode(!keepAliveMode);
              keepAliveMode ? keepAliveManager.disable() : keepAliveManager.enable();
            }}
          >
            <Zap className="w-4 h-4" /> <span className="hidden md:inline">防断连</span>
          </button>
          <button className="p-2 text-slate-500" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4" />
          </button>
          <button
            className="bg-primary/10 text-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
            onClick={() => setShowWorkflowEditor(true)}
          >
            <GitBranch className="w-4 h-4" /> <span className="hidden lg:inline">可视化工作流</span>
          </button>
        </div>
      }
      sidebarLeft={
        <AppSidebarLeft
          chapters={novelData.chapters}
          volumes={novelData.volumes}
          chaptersByVolume={novelData.chaptersByVolume}
          activeChapterId={novelData.activeChapterId}
          setActiveChapterId={novelData.setActiveChapterId}
          setShowOutline={setShowOutline}
          handleToggleVolumeCollapse={vid =>
            novelData.setVolumes(vs => vs.map(v => (v.id === vid ? { ...v, collapsed: !v.collapsed } : v)))
          }
          handleExportVolume={vid => {
            const vol = novelData.volumes.find(v => v.id === vid);
            if (vol) handleExportVolume(vol, novelData.chapters);
          }}
          handleDeleteChapter={id =>
            setDialog({
              isOpen: true,
              type: 'confirm',
              title: '删除章节',
              message: '确定删除吗？',
              onConfirm: () => {
                novelData.deleteChapter(id);
                closeDialog();
              },
            })
          }
          handleAddVolume={() =>
            setDialog({
              isOpen: true,
              type: 'prompt',
              title: '新建分卷',
              message: '请输入分卷名称：',
              onConfirm: (n: any) => {
                if (n) novelData.addVolume(n);
                closeDialog();
              },
            })
          }
          handleRenameVolume={(id, t) =>
            setDialog({
              isOpen: true,
              type: 'prompt',
              title: '重命名',
              message: '',
              inputValue: t,
              onConfirm: (n: any) => {
                if (n) novelData.renameVolume(id, n);
                closeDialog();
              },
            })
          }
          handleDeleteVolume={id =>
            setDialog({
              isOpen: true,
              type: 'confirm',
              title: '删除分卷',
              message: '确定吗？',
              onConfirm: () => {
                novelData.deleteVolume(id);
                closeDialog();
              },
            })
          }
          addNewChapter={novelData.addChapter}
        />
      }
      sidebarRight={
        <AppSidebarRight
          activeNovel={novelData.activeNovel || null}
          creationModule={creationModule}
          handleSwitchModule={handleSwitchModule}
          setShowOutline={setShowOutline}
          setCreationModule={setCreationModule}
        />
      }
      footer={
        <div className="flex justify-between w-full px-4 text-[10px] text-slate-500">
          <span>{activeChapter?.content ? `字数: ${activeChapter.content.length}` : '无正文'}</span>
          <div className="flex gap-4">
            <button onClick={() => setShowOutline(!showOutline)}>Focus Mode</button>
            <span>UTF-8</span>
          </div>
        </div>
      }
    >
      {showOutline ? (
        <AutomationDashboard
          creationModule={creationModule}
          setCreationModule={setCreationModule}
          activeNovel={novelData.activeNovel || null}
          globalCreationPrompt={config.globalCreationPrompt}
          setGlobalCreationPrompt={config.setGlobalCreationPrompt}
          setShowWorkflowEditor={setShowWorkflowEditor}
          handleSwitchModule={handleSwitchModule}
          inspirationProps={{
            ...novelData,
            ...aiGenerators,
            ...generators,
            userPrompt: inspirationUserPrompt,
            setUserPrompt: setInspirationUserPrompt,
            onShowSettings: () => {
              setGeneratorSettingsType('inspiration');
              setShowGeneratorSettingsModal(true);
            },

            // Reference Selectors Props
            // Reference Selectors Props
            selectedWorldviewSetId,
            selectedWorldviewIndices,
            onSelectWorldviewSet: (id: string | null) => {
              setSelectedWorldviewSetId(id);
              setSelectedWorldviewIndices([]);
            },
            onToggleWorldviewItem: (setId: string, idx: number) => handleToggleItem('worldview', setId, idx),
            showWorldviewSelector,
            onToggleWorldviewSelector: setShowWorldviewSelector,

            selectedCharacterSetId,
            selectedCharacterIndices,
            onSelectCharacterSet: (id: string | null) => {
              setSelectedCharacterSetId(id);
              setSelectedCharacterIndices([]);
            },
            onToggleCharacterItem: (setId: string, idx: number) => handleToggleItem('character', setId, idx),
            showCharacterSelector,
            onToggleCharacterSelector: setShowCharacterSelector,

            selectedInspirationSetId,
            selectedInspirationIndices,
            onSelectInspirationSet: (id: string | null) => {
              setSelectedInspirationSetId(id);
              setSelectedInspirationIndices([]);
            },
            onToggleInspirationItem: (setId: string, idx: number) => handleToggleItem('inspiration', setId, idx),
            showInspirationSelector,
            onToggleInspirationSelector: setShowInspirationSelector,

            selectedOutlineSetId,
            selectedOutlineIndices,
            onSelectOutlineSet: (id: string | null) => {
              setSelectedOutlineSetId(id);
              setSelectedOutlineIndices([]);
            },
            onToggleOutlineItem: (setId: string, idx: number) => handleToggleItem('outline', setId, idx),
            showOutlineSelector,
            onToggleOutlineSelector: setShowOutlineSelector,

            selectedReferenceType,
            selectedReferenceIndices,
            onSelectReferenceSet: (id: string | null) => {
              setSelectedReferenceType(id);
              setSelectedReferenceIndices([]);
            },
            onToggleReferenceItem: (setId: string, idx: number) => handleToggleItem('reference', setId, idx),
            showReferenceSelector,
            onToggleReferenceSelector: setShowReferenceSelector,

            onGenerateInspiration: (mode: 'generate' | 'chat' = 'generate') =>
              aiGenerators.handleGenerateInspiration({
                mode,
                source: 'module',
                activeNovel: novelData.activeNovel || undefined,
                activeInspirationSetId: novelData.activeInspirationSetId,
                activeInspirationPresetId: generators.activeInspirationPresetId,
                lastNonChatInspirationPresetId: generators.lastNonChatInspirationPresetId,
                inspirationPresets: generators.inspirationPresets,
                inspirationModel: config.inspirationModel,
                globalApiKey: config.apiKey,
                globalBaseUrl: config.baseUrl,
                globalModel: config.model,
                globalCreationPrompt: config.globalCreationPrompt,
                maxRetries: config.maxRetries,
                userPrompt: inspirationUserPrompt,
                activeChapter: activeChapter,
                contextLength: activePreset?.contextLength || 4000,
                selectedRefs: {
                  worldviewSetId: selectedWorldviewSetId,
                  worldviewIndices: selectedWorldviewIndices,
                  characterSetId: selectedCharacterSetId,
                  characterIndices: selectedCharacterIndices,
                  inspirationSetId: selectedInspirationSetId,
                  inspirationIndices: selectedInspirationIndices,
                  outlineSetId: selectedOutlineSetId,
                  outlineIndices: selectedOutlineIndices,
                },
                onNovelsUpdate: novelData.setNovels,
                onError: (msg: string) =>
                  setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog }),
                onSuccess: () => {
                  if (inspirationUserPrompt) setInspirationUserPrompt('');
                },
                inspirationAbortControllerRef,
              }),
            onStopGeneration: () => inspirationAbortControllerRef.current?.abort(),
            onSendToModule: handleSendToModule,
            onReturnToMainWithContent: handleReturnToMainWithContent,
          }}
          characterProps={{
            ...novelData,
            ...aiGenerators,
            ...generators,
            userPrompt: characterUserPrompt,
            setUserPrompt: setCharacterUserPrompt,
            onShowSettings: () => {
              setGeneratorSettingsType('character');
              setShowGeneratorSettingsModal(true);
            },

            // Reference Selectors Props
            // Reference Selectors Props
            selectedWorldviewSetId,
            selectedWorldviewIndices,
            onSelectWorldviewSet: (id: string | null) => {
              setSelectedWorldviewSetId(id);
              setSelectedWorldviewIndices([]);
            },
            onToggleWorldviewItem: (setId: string, idx: number) => handleToggleItem('worldview', setId, idx),
            showWorldviewSelector,
            onToggleWorldviewSelector: setShowWorldviewSelector,

            selectedCharacterSetId,
            selectedCharacterIndices,
            onSelectCharacterSet: (id: string | null) => {
              setSelectedCharacterSetId(id);
              setSelectedCharacterIndices([]);
            },
            onToggleCharacterItem: (setId: string, idx: number) => handleToggleItem('character', setId, idx),
            showCharacterSelector,
            onToggleCharacterSelector: setShowCharacterSelector,

            selectedInspirationSetId,
            selectedInspirationIndices,
            onSelectInspirationSet: (id: string | null) => {
              setSelectedInspirationSetId(id);
              setSelectedInspirationIndices([]);
            },
            onToggleInspirationItem: (setId: string, idx: number) => handleToggleItem('inspiration', setId, idx),
            showInspirationSelector,
            onToggleInspirationSelector: setShowInspirationSelector,

            selectedOutlineSetId,
            selectedOutlineIndices,
            onSelectOutlineSet: (id: string | null) => {
              setSelectedOutlineSetId(id);
              setSelectedOutlineIndices([]);
            },
            onToggleOutlineItem: (setId: string, idx: number) => handleToggleItem('outline', setId, idx),
            showOutlineSelector,
            onToggleOutlineSelector: setShowOutlineSelector,

            selectedReferenceType,
            selectedReferenceIndices,
            onSelectReferenceSet: (id: string | null) => {
              setSelectedReferenceType(id);
              setSelectedReferenceIndices([]);
            },
            onToggleReferenceItem: (setId: string, idx: number) => handleToggleItem('reference', setId, idx),
            showReferenceSelector,
            onToggleReferenceSelector: setShowReferenceSelector,

            onGenerateCharacters: (mode: 'generate' | 'chat' = 'generate') =>
              aiGenerators.handleGenerateCharacters({
                mode,
                source: 'module',
                activeNovel: novelData.activeNovel || undefined,
                activeCharacterSetId: novelData.activeCharacterSetId,
                activeCharacterPresetId: generators.activeCharacterPresetId,
                lastNonChatCharacterPresetId: generators.lastNonChatCharacterPresetId,
                characterPresets: generators.characterPresets,
                characterModel: config.characterModel,
                globalApiKey: config.apiKey,
                globalBaseUrl: config.baseUrl,
                globalModel: config.model,
                globalCreationPrompt: config.globalCreationPrompt,
                maxRetries: config.maxRetries,
                userPrompt: characterUserPrompt,
                activeChapter: activeChapter,
                contextLength: activePreset?.contextLength || 4000,
                selectedRefs: {
                  worldviewSetId: selectedWorldviewSetId,
                  worldviewIndices: selectedWorldviewIndices,
                  characterSetId: selectedCharacterSetId,
                  characterIndices: selectedCharacterIndices,
                  inspirationSetId: selectedInspirationSetId,
                  inspirationIndices: selectedInspirationIndices,
                  outlineSetId: selectedOutlineSetId,
                  outlineIndices: selectedOutlineIndices,
                },
                onNovelsUpdate: novelData.setNovels,
                onError: (msg: string) =>
                  setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog }),
                onSuccess: () => {
                  if (characterUserPrompt) setCharacterUserPrompt('');
                },
                characterAbortControllerRef,
              }),
            onStopGeneration: () => characterAbortControllerRef.current?.abort(),
            onSendToModule: handleSendToModule,
            onReturnToMainWithContent: handleReturnToMainWithContent,
          }}
          worldviewProps={{
            ...novelData,
            ...aiGenerators,
            ...generators,
            userPrompt: worldviewUserPrompt,
            setUserPrompt: setWorldviewUserPrompt,
            onShowSettings: () => {
              setGeneratorSettingsType('worldview');
              setShowGeneratorSettingsModal(true);
            },

            // Reference Selectors Props
            // Reference Selectors Props
            selectedWorldviewSetId,
            selectedWorldviewIndices,
            onSelectWorldviewSet: (id: string | null) => {
              setSelectedWorldviewSetId(id);
              setSelectedWorldviewIndices([]);
            },
            onToggleWorldviewItem: (setId: string, idx: number) => handleToggleItem('worldview', setId, idx),
            showWorldviewSelector,
            onToggleWorldviewSelector: setShowWorldviewSelector,

            selectedCharacterSetId,
            selectedCharacterIndices,
            onSelectCharacterSet: (id: string | null) => {
              setSelectedCharacterSetId(id);
              setSelectedCharacterIndices([]);
            },
            onToggleCharacterItem: (setId: string, idx: number) => handleToggleItem('character', setId, idx),
            showCharacterSelector,
            onToggleCharacterSelector: setShowCharacterSelector,

            selectedInspirationSetId,
            selectedInspirationIndices,
            onSelectInspirationSet: (id: string | null) => {
              setSelectedInspirationSetId(id);
              setSelectedInspirationIndices([]);
            },
            onToggleInspirationItem: (setId: string, idx: number) => handleToggleItem('inspiration', setId, idx),
            showInspirationSelector,
            onToggleInspirationSelector: setShowInspirationSelector,

            selectedOutlineSetId,
            selectedOutlineIndices,
            onSelectOutlineSet: (id: string | null) => {
              setSelectedOutlineSetId(id);
              setSelectedOutlineIndices([]);
            },
            onToggleOutlineItem: (setId: string, idx: number) => handleToggleItem('outline', setId, idx),
            showOutlineSelector,
            onToggleOutlineSelector: setShowOutlineSelector,

            selectedReferenceType,
            selectedReferenceIndices,
            onSelectReferenceSet: (id: string | null) => {
              setSelectedReferenceType(id);
              setSelectedReferenceIndices([]);
            },
            onToggleReferenceItem: (setId: string, idx: number) => handleToggleItem('reference', setId, idx),
            showReferenceSelector,
            onToggleReferenceSelector: setShowReferenceSelector,

            onGenerateWorldview: (mode: 'generate' | 'chat' = 'generate') =>
              aiGenerators.handleGenerateWorldview({
                mode,
                source: 'module',
                activeNovel: novelData.activeNovel || undefined,
                activeWorldviewSetId: novelData.activeWorldviewSetId,
                activeWorldviewPresetId: generators.activeWorldviewPresetId,
                lastNonChatWorldviewPresetId: generators.lastNonChatWorldviewPresetId,
                worldviewPresets: generators.worldviewPresets,
                worldviewModel: config.worldviewModel,
                globalApiKey: config.apiKey,
                globalBaseUrl: config.baseUrl,
                globalModel: config.model,
                globalCreationPrompt: config.globalCreationPrompt,
                maxRetries: config.maxRetries,
                userPrompt: worldviewUserPrompt,
                activeChapter: activeChapter,
                contextLength: activePreset?.contextLength || 4000,
                selectedRefs: {
                  worldviewSetId: selectedWorldviewSetId,
                  worldviewIndices: selectedWorldviewIndices,
                  characterSetId: selectedCharacterSetId,
                  characterIndices: selectedCharacterIndices,
                  inspirationSetId: selectedInspirationSetId,
                  inspirationIndices: selectedInspirationIndices,
                  outlineSetId: selectedOutlineSetId,
                  outlineIndices: selectedOutlineIndices,
                },
                onNovelsUpdate: novelData.setNovels,
                onError: (msg: string) =>
                  setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog }),
                onSuccess: () => {
                  if (worldviewUserPrompt) setWorldviewUserPrompt('');
                },
                worldviewAbortControllerRef,
              }),
            onStopGeneration: () => worldviewAbortControllerRef.current?.abort(),
            onSendToModule: handleSendToModule,
            onReturnToMainWithContent: handleReturnToMainWithContent,
          }}
          outlineProps={{
            ...novelData,
            ...aiGenerators,
            ...generators,
            ...autoWrite,
            userPrompt: outlineUserPrompt,
            setUserPrompt: setOutlineUserPrompt,
            onShowSettings: () => {
              setGeneratorSettingsType('outline');
              setShowGeneratorSettingsModal(true);
            },

            // Reference Selectors Props
            // Reference Selectors Props
            selectedWorldviewSetId,
            selectedWorldviewIndices,
            onSelectWorldviewSet: (id: string | null) => {
              setSelectedWorldviewSetId(id);
              setSelectedWorldviewIndices([]);
            },
            onToggleWorldviewItem: (setId: string, idx: number) => handleToggleItem('worldview', setId, idx),
            showWorldviewSelector,
            onToggleWorldviewSelector: setShowWorldviewSelector,

            selectedCharacterSetId,
            selectedCharacterIndices,
            onSelectCharacterSet: (id: string | null) => {
              setSelectedCharacterSetId(id);
              setSelectedCharacterIndices([]);
            },
            onToggleCharacterItem: (setId: string, idx: number) => handleToggleItem('character', setId, idx),
            showCharacterSelector,
            onToggleCharacterSelector: setShowCharacterSelector,

            selectedInspirationSetId,
            selectedInspirationIndices,
            onSelectInspirationSet: (id: string | null) => {
              setSelectedInspirationSetId(id);
              setSelectedInspirationIndices([]);
            },
            onToggleInspirationItem: (setId: string, idx: number) => handleToggleItem('inspiration', setId, idx),
            showInspirationSelector,
            onToggleInspirationSelector: setShowInspirationSelector,

            selectedOutlineSetId,
            selectedOutlineIndices,
            onSelectOutlineSet: (id: string | null) => {
              setSelectedOutlineSetId(id);
              setSelectedOutlineIndices([]);
            },
            onToggleOutlineItem: (setId: string, idx: number) => handleToggleItem('outline', setId, idx),
            showOutlineSelector,
            onToggleOutlineSelector: setShowOutlineSelector,

            selectedReferenceType,
            selectedReferenceIndices,
            onSelectReferenceSet: (id: string | null) => {
              setSelectedReferenceType(id);
              setSelectedReferenceIndices([]);
            },
            onToggleReferenceItem: (setId: string, idx: number) => handleToggleItem('reference', setId, idx),
            showReferenceSelector,
            onToggleReferenceSelector: setShowReferenceSelector,

            onGenerateOutline: (mode: 'append' | 'replace' | 'chat' = 'append') =>
              aiGenerators.handleGenerateOutline({
                mode,
                source: 'module',
                activeNovel: novelData.activeNovel || undefined,
                activeOutlineSetId: novelData.activeOutlineSetId,
                activeOutlinePresetId: generators.activeOutlinePresetId,
                lastNonChatOutlinePresetId: generators.lastNonChatOutlinePresetId,
                outlinePresets: generators.outlinePresets,
                outlineModel: config.outlineModel,
                globalApiKey: config.apiKey,
                globalBaseUrl: config.baseUrl,
                globalModel: config.model,
                globalCreationPrompt: config.globalCreationPrompt,
                maxRetries: config.maxRetries,
                userPrompt: outlineUserPrompt,
                activeChapter: activeChapter,
                contextLength: activePreset?.contextLength || 4000,
                selectedRefs: {
                  worldviewSetId: selectedWorldviewSetId,
                  worldviewIndices: selectedWorldviewIndices,
                  characterSetId: selectedCharacterSetId,
                  characterIndices: selectedCharacterIndices,
                  inspirationSetId: selectedInspirationSetId,
                  inspirationIndices: selectedInspirationIndices,
                  outlineSetId: selectedOutlineSetId,
                  outlineIndices: selectedOutlineIndices,
                },
                onNovelsUpdate: novelData.setNovels,
                onError: (msg: string) =>
                  setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog }),
                onSuccess: () => {
                  if (outlineUserPrompt) setOutlineUserPrompt('');
                },
                outlineAbortControllerRef,
                onStatusUpdate: () => {},
              }),
            onStopGeneration: () => outlineAbortControllerRef.current?.abort(),
            onReturnToMainWithContent: handleReturnToMainWithContent,
          }}
          plotOutlineProps={{
            ...novelData,
            ...aiGenerators,
            ...generators,
            userPrompt: plotOutlineUserPrompt,
            setUserPrompt: setPlotOutlineUserPrompt,
            onShowSettings: () => {
              setGeneratorSettingsType('plotOutline');
              setShowGeneratorSettingsModal(true);
            },

            // Reference Selectors Props
            selectedWorldviewSetId,
            selectedWorldviewIndices,
            onSelectWorldviewSet: (id: string | null) => {
              setSelectedWorldviewSetId(id);
              setSelectedWorldviewIndices([]);
            },
            onToggleWorldviewItem: (setId: string, idx: number) => handleToggleItem('worldview', setId, idx),
            showWorldviewSelector,
            onToggleWorldviewSelector: setShowWorldviewSelector,

            selectedCharacterSetId,
            selectedCharacterIndices,
            onSelectCharacterSet: (id: string | null) => {
              setSelectedCharacterSetId(id);
              setSelectedCharacterIndices([]);
            },
            onToggleCharacterItem: (setId: string, idx: number) => handleToggleItem('character', setId, idx),
            showCharacterSelector,
            onToggleCharacterSelector: setShowCharacterSelector,

            selectedInspirationSetId,
            selectedInspirationIndices,
            onSelectInspirationSet: (id: string | null) => {
              setSelectedInspirationSetId(id);
              setSelectedInspirationIndices([]);
            },
            onToggleInspirationItem: (setId: string, idx: number) => handleToggleItem('inspiration', setId, idx),
            showInspirationSelector,
            onToggleInspirationSelector: setShowInspirationSelector,

            selectedOutlineSetId,
            selectedOutlineIndices,
            onSelectOutlineSet: (id: string | null) => {
              setSelectedOutlineSetId(id);
              setSelectedOutlineIndices([]);
            },
            onToggleOutlineItem: (setId: string, idx: number) => handleToggleItem('outline', setId, idx),
            showOutlineSelector,
            onToggleOutlineSelector: setShowOutlineSelector,

            selectedReferenceType,
            selectedReferenceIndices,
            onSelectReferenceSet: (id: string | null) => {
              setSelectedReferenceType(id);
              setSelectedReferenceIndices([]);
            },
            onToggleReferenceItem: (setId: string, idx: number) => handleToggleItem('reference', setId, idx),
            showReferenceSelector,
            onToggleReferenceSelector: setShowReferenceSelector,

            onGeneratePlotOutline: (mode: 'generate' | 'chat' = 'generate') =>
              aiGenerators.handleGeneratePlotOutline({
                mode,
                source: 'module',
                activeNovel: novelData.activeNovel || undefined,
                activePlotOutlineSetId: novelData.activePlotOutlineSetId,
                activePlotOutlinePresetId: generators.activePlotOutlinePresetId,
                lastNonChatPlotOutlinePresetId: generators.lastNonChatPlotOutlinePresetId,
                plotOutlinePresets: generators.plotOutlinePresets,
                plotOutlineModel: config.plotOutlineModel,
                globalApiKey: config.apiKey,
                globalBaseUrl: config.baseUrl,
                globalModel: config.model,
                globalCreationPrompt: config.globalCreationPrompt,
                maxRetries: config.maxRetries,
                userPrompt: plotOutlineUserPrompt,
                selectedRefs: {
                  worldviewSetId: selectedWorldviewSetId,
                  worldviewIndices: selectedWorldviewIndices,
                  characterSetId: selectedCharacterSetId,
                  characterIndices: selectedCharacterIndices,
                  inspirationSetId: selectedInspirationSetId,
                  inspirationIndices: selectedInspirationIndices,
                  outlineSetId: selectedOutlineSetId,
                  outlineIndices: selectedOutlineIndices,
                },
                onNovelsUpdate: novelData.setNovels,
                onError: (msg: string) =>
                  setDialog({ isOpen: true, type: 'alert', title: '错误', message: msg, onConfirm: closeDialog }),
                onSuccess: () => {
                  if (plotOutlineUserPrompt) setPlotOutlineUserPrompt('');
                },
                generateAbortControllerRef: plotOutlineAbortControllerRef,
              }),
            onStopGeneration: () => plotOutlineAbortControllerRef.current?.abort(),
            onSendToModule: handleSendToModule,
            onReturnToMainWithContent: handleReturnToMainWithContent,
          }}
          referenceProps={{ ...novelData }}
        />
      ) : (
        <ChapterEditor
          activeChapter={activeChapter}
          activeChapterId={novelData.activeChapterId}
          isEditingChapter={isEditingChapter}
          onToggleEdit={c => {
            if (isEditingChapter && c !== undefined)
              novelData.setChapters(prev =>
                prev.map(ch => (ch.id === novelData.activeChapterId ? { ...ch, content: c } : ch)),
              );
            setIsEditingChapter(!isEditingChapter);
          }}
          onChapterContentChange={e =>
            novelData.setChapters(prev =>
              prev.map(c => (c.id === novelData.activeChapterId ? { ...c, content: e.target.value } : c)),
            )
          }
          onOptimize={(tid, content) =>
            autoWrite.handleOptimize({
              targetId: tid || novelData.activeChapterId!,
              initialContent: content,
              ...config,
              ...generators,
              setChapters: novelData.setChapters,
              novelsRef: novelData.novelsRef,
              activeNovelId: novelData.activeNovelId,
              getActiveScripts,
              onError: m =>
                setDialog({ isOpen: true, type: 'alert', title: '错误', message: m, onConfirm: closeDialog }),
            })
          }
          onStopOptimize={autoWrite.stopOptimize}
          optimizingChapterIds={autoWrite.optimizingChapterIds}
          activeOptimizePresetId={generators.activeOptimizePresetId}
          autoOptimize={config.autoOptimize}
          setAutoOptimize={config.setAutoOptimize}
          onShowAnalysisResult={() => setShowAnalysisResultModal(true)}
          longTextMode={config.longTextMode}
          setLongTextMode={config.setLongTextMode}
          contextScope={config.contextScope}
          setContextScope={config.setContextScope}
          onShowOptimizeSettings={() => {
            setGeneratorSettingsType('optimize');
            setShowGeneratorSettingsModal(true);
          }}
          onPrevVersion={() => handleVersionStep(-1)}
          onNextVersion={() => handleVersionStep(1)}
          onSwitchVersion={async v =>
            novelData.setChapters(prev =>
              prev.map(c =>
                c.id === novelData.activeChapterId ? { ...c, activeVersionId: v.id, content: v.content } : c,
              ),
            )
          }
          onDeleteChapter={id =>
            setDialog({
              isOpen: true,
              type: 'confirm',
              title: '删除章节',
              message: '确定吗？',
              onConfirm: () => {
                novelData.deleteChapter(id);
                closeDialog();
              },
            })
          }
        />
      )}

      {/* 全局弹窗组件库 */}
      <Suspense fallback={null}>
        {showSettings && (
          <GlobalSettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            {...config}
            handleScanSummaries={() => {}}
            handleRecalibrateSummaries={() => {}}
            isLoading={autoWrite.isLoading}
          />
        )}
        {showAdvancedSettings && (
          <AdvancedSettingsModal
            isOpen={showAdvancedSettings}
            onClose={() => setShowAdvancedSettings(false)}
            {...completion}
            maxRetries={config.maxRetries}
            setMaxRetries={config.setMaxRetries}
            selectedPromptId={1}
            setSelectedPromptId={() => {}}
            viewMode={viewMode}
            setViewMode={setViewMode}
            isDragEnabled={isDragEnabled}
            setIsDragEnabled={setIsDragEnabled}
            draggedPromptIndex={draggedPromptIndex}
            setDraggedPromptIndex={setDraggedPromptIndex}
            handleDragStart={() => {}}
            handleDragOver={() => {}}
            handleDragEnd={() => {}}
            handleEditClick={p => {
              setEditingPrompt(p || null);
              setShowEditModal(true);
            }}
            handleDeletePrompt={() => {}}
            handleAddNewPrompt={() => {}}
            handleImportPrompt={() => {}}
            showEditModal={showEditModal}
            setShowEditModal={setShowEditModal}
            editingPrompt={editingPrompt}
            setEditingPrompt={setEditingPrompt}
            saveEditedPrompt={() => {
              if (editingPrompt) {
                completion.setPrompts(prev => prev.map(p => (p.id === editingPrompt.id ? editingPrompt : p)));
                setShowEditModal(false);
              }
            }}
            onOpenPresetNameModal={() => {
              setPresetModalMode('rename');
              setShowPresetNameModal(true);
            }}
            handlePresetChange={completion.setActivePresetId}
            handleImportPreset={() => {}}
            handleExportPreset={() => {}}
            handleDeletePreset={() => completion.deletePreset(completion.activePresetId)}
            handleSavePreset={completion.saveCurrentPreset}
            handleResetPreset={completion.resetPreset}
            handleOpenRenameModal={() => {
              setPresetModalMode('rename');
              setShowPresetNameModal(true);
            }}
            handleOpenSaveAsModal={() => {
              setPresetModalMode('save_as');
              setShowPresetNameModal(true);
            }}
            activeNovel={novelData.activeNovel}
            activeChapter={activeChapter}
            getChapterContext={() => ''}
            getEffectiveChapterContent={() => ''}
            buildReferenceContext={buildReferenceContext}
            buildWorldInfoContext={buildWorldInfoContext}
            selectedWorldviewSetIdForChat={null}
            selectedWorldviewIndicesForChat={[]}
            selectedCharacterSetIdForChat={null}
            selectedCharacterIndicesForChat={[]}
            selectedInspirationSetIdForChat={null}
            selectedInspirationIndicesForChat={[]}
            selectedOutlineSetIdForChat={null}
            selectedOutlineIndicesForChat={[]}
            activeOutlineSetId={novelData.activeOutlineSetId}
          />
        )}
        {showWorkflowEditor &&
          (config.isMobile ? (
            <MobileWorkflowEditor
              isOpen={showWorkflowEditor}
              onClose={() => setShowWorkflowEditor(false)}
              activeNovel={novelData.activeNovel}
              globalConfig={{
                ...config,
                ...completion,
                ...generators,
                consecutiveChapterCount: Number(config.consecutiveChapterCount) || 1,
                smallSummaryInterval: Number(config.smallSummaryInterval) || 3,
                bigSummaryInterval: Number(config.bigSummaryInterval) || 6,
                contextChapterCount: Number(config.contextChapterCount) || undefined,
                getActiveScripts,
                onChapterComplete: handleChapterComplete as any,
              }}
              onUpdateNovel={(n: Novel) => novelData.updateNovel(n.id, n)}
              onSelectChapter={novelData.setActiveChapterId}
              onStartAutoWrite={() => {}}
            />
          ) : (
            <WorkflowEditor
              isOpen={showWorkflowEditor}
              onClose={() => setShowWorkflowEditor(false)}
              activeNovel={novelData.activeNovel}
              globalConfig={{
                ...config,
                ...completion,
                ...generators,
                consecutiveChapterCount: Number(config.consecutiveChapterCount) || 1,
                smallSummaryInterval: Number(config.smallSummaryInterval) || 3,
                bigSummaryInterval: Number(config.bigSummaryInterval) || 6,
                contextChapterCount: Number(config.contextChapterCount) || undefined,
                getActiveScripts,
                onChapterComplete: handleChapterComplete as any,
              }}
              onUpdateNovel={(n: Novel) => novelData.updateNovel(n.id, n)}
              onSelectChapter={novelData.setActiveChapterId}
              onStartAutoWrite={() => {}}
            />
          ))}
        {showAnalysisResultModal && (
          <AnalysisResultModal
            isOpen={showAnalysisResultModal}
            onClose={() => setShowAnalysisResultModal(false)}
            analysisResult={activeChapter?.analysisResult || ''}
          />
        )}
        {showRegexModal && (
          <RegexManagerModal
            isOpen={showRegexModal}
            onClose={() => setShowRegexModal(false)}
            {...completion}
            globalRegexScripts={config.globalRegexScripts}
            handleAddNewRegex={() => {}}
            handleDeleteRegex={() => {}}
            handleEditRegex={() => {}}
            handleToggleRegexDisabled={() => {}}
            showRegexEditor={false}
            setShowRegexEditor={() => {}}
            editingRegexScript={null}
            setEditingRegexScript={() => {}}
            regexEditorMode="global"
            setRegexEditorMode={() => {}}
            handleSaveRegex={() => {}}
          />
        )}
        {showGeneratorSettingsModal && (
          <GeneratorSettingsModal
            isOpen={showGeneratorSettingsModal}
            onClose={() => setShowGeneratorSettingsModal(false)}
            generatorSettingsType={generatorSettingsType}
            setGeneratorSettingsType={setGeneratorSettingsType}
            getGeneratorPresets={() => generators.outlinePresets}
            setGeneratorPresets={() => {}}
            getActiveGeneratorPresetId={() => generators.activeOutlinePresetId}
            setActiveGeneratorPresetId={() => {}}
            handleAddNewGeneratorPreset={() => {}}
            handleDeleteGeneratorPreset={() => {}}
            handleExportGeneratorPreset={() => {}}
            handleImportGeneratorPreset={() => {}}
            twoStepOptimization={config.twoStepOptimization}
            setTwoStepOptimization={config.setTwoStepOptimization}
            analysisResult=""
            showGeneratorApiConfig={showGeneratorApiConfig}
            setShowGeneratorApiConfig={setShowGeneratorApiConfig}
            showGeneratorPromptEditModal={false}
            setShowGeneratorPromptEditModal={() => {}}
            editingGeneratorPromptIndex={editingGeneratorPromptIndex}
            setEditingGeneratorPromptIndex={setEditingGeneratorPromptIndex}
            tempEditingPrompt={tempEditingPrompt}
            setTempEditingPrompt={setTempEditingPrompt}
            handleSaveGeneratorPrompt={() => {}}
            isDragEnabled={isDragEnabled}
            setIsDragEnabled={setIsDragEnabled}
            draggedPromptIndex={draggedPromptIndex}
            setDraggedPromptIndex={setDraggedPromptIndex}
          />
        )}
        {editingOutlineItemIndex !== null && (
          <OutlineEditModal
            isOpen={editingOutlineItemIndex !== null}
            editingOutlineItemIndex={editingOutlineItemIndex}
            setEditingOutlineItemIndex={setEditingOutlineItemIndex}
            activeNovel={novelData.activeNovel}
            activeOutlineSetId={novelData.activeOutlineSetId}
            updateOutlineItemsInSet={(id, items) =>
              novelData.updateOutlineSets(
                (novelData.activeNovel?.outlineSets || []).map(s => (s.id === id ? { ...s, items } : s)),
              )
            }
          />
        )}
        {showPresetNameModal && (
          <PresetNameModal
            isOpen={showPresetNameModal}
            onClose={() => setShowPresetNameModal(false)}
            onConfirm={() => {
              const name = completion.completionPresets.find(p => p.id === completion.activePresetId)?.name || '';
              if (presetModalMode === 'rename') completion.renamePreset(completion.activePresetId, name);
              else completion.saveAsNewPreset(name);
              setShowPresetNameModal(false);
            }}
            presetNameInput={completion.completionPresets.find(p => p.id === completion.activePresetId)?.name || ''}
            setPresetNameInput={() => {}}
            title={presetModalMode === 'rename' ? '重命名预设' : '另存为'}
          />
        )}
        <GlobalDialog isOpen={dialog.isOpen} {...dialog} onCancel={closeDialog} />
      </Suspense>
    </NovelEditorLayout>
  );
}

export default App;

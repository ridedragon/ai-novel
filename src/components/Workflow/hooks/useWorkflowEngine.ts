import { Edge } from '@xyflow/react';
import OpenAI from 'openai';
import { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, GeneratorPrompt, LoopInstruction, Novel, ReferenceFolder, Chapter, NovelVolume } from '../../../types';
import { AutoWriteEngine, getChapterContextMessages } from '../../../utils/auto-write';
import { keepAliveManager } from '../../../utils/KeepAliveManager';
import { storage } from '../../../utils/storage';
import { workflowManager } from '../../../utils/WorkflowManager';
import { debugLogger, volumeFolderDebugTracker, infoClearDebugTracker, saveToVolumeDebugTracker } from '../../../utils/log';
import { LOOP_CONFIGURATOR_PROMPT, NODE_CONFIGS, WORKFLOW_DSL_PROMPT } from '../constants';
import { MacroContext } from '../macros';
import {
  NodeTypeKey,
  OutputEntry,
  WorkflowData,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowStartOptions,
} from '../types';
import { cleanAndParseJSON, extractEntries, extractTargetEndChapter, parseAnyNumber } from '../utils/workflowHelpers';

export const useWorkflowEngine = (options: {
  activeNovel: Novel | undefined;
  globalConfig: any;
  allPresets: Record<string, GeneratorPreset[]>;
  activeWorkflowId: string;
  nodesRef: React.MutableRefObject<WorkflowNode[]>;
  workflowsRef: React.MutableRefObject<WorkflowData[]>;
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onUpdateNovel?: (novel: Novel) => void;
  getOrderedNodes: () => WorkflowNode[];
  isMobile?: boolean;
  clearAutoSaveTimeout?: () => void;
  setWorkflows?: React.Dispatch<React.SetStateAction<WorkflowData[]>>;
}) => {
  const {
    activeNovel,
    globalConfig,
    allPresets,
    activeWorkflowId,
    nodesRef,
    workflowsRef,
    setNodes,
    setEdges,
    onUpdateNovel,
    getOrderedNodes,
    isMobile = false,
    clearAutoSaveTimeout,
    setWorkflows,
  } = options;

  const [isRunning, setIsRunning] = useState(workflowManager.getState().isRunning);
  const [isPaused, setIsPaused] = useState(workflowManager.getState().isPaused);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(workflowManager.getState().currentNodeIndex);
  const [error, setError] = useState<string | null>(null);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeNovelRef = useRef(activeNovel);
  const resumeAttemptedRef = useRef(false);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);

  // 初始化时检查并恢复工作流状态
  useEffect(() => {
    const checkAndResumeWorkflow = async () => {
      // 避免重复尝试恢复
      if (resumeAttemptedRef.current) return;
      resumeAttemptedRef.current = true;

      const state = workflowManager.getState();
      if (state.isRunning && state.activeWorkflowId === activeWorkflowId) {
        terminal.log(`[Workflow Engine] Resuming workflow execution from saved state`);
        
        const orderedNodes = getOrderedNodes();
        if (orderedNodes.length > 0 && state.currentNodeIndex >= 0) {
          terminal.log(`[Workflow Engine] Workflow state found, will resume when runWorkflow is available`);
          // 工作流状态已在 WorkflowManager 中恢复
          // 具体的执行恢复会在工作流编辑器打开时处理
        }
      }
    };

    checkAndResumeWorkflow();
  }, [activeWorkflowId, getOrderedNodes]);

  // 同步全局工作流状态
  useEffect(() => {
    const unsubscribeState = workflowManager.subscribe(state => {
      if (state.activeWorkflowId === activeWorkflowId || !activeWorkflowId || activeWorkflowId === 'default') {
        setIsRunning(state.isRunning);
        setIsPaused(state.isPaused);
        setCurrentNodeIndex(state.currentNodeIndex);
        if (state.error) setError(state.error);
      }
    });

    const unsubscribeNodes = workflowManager.subscribeToNodeUpdates(update => {
      setNodes(nds =>
        nds.map(n => {
          if (n.id === update.nodeId) {
            return { ...n, data: { ...n.data, ...update.data } };
          }
          return n;
        }),
      );
    });

    return () => {
      unsubscribeState();
      unsubscribeNodes();
    };
  }, [activeWorkflowId, setNodes]);

  // 辅助函数：同步节点状态并持久化
  const syncNodeStatus = useCallback(
    async (nodeId: string, updates: Partial<WorkflowNodeData>, currentIndex: number) => {
      // 核心修复：即使 abort 也要保存已完成的状态，只有 pending 状态才跳过
      // 这样可以确保工作流异常终止时，已完成节点的 outputEntries 不会丢失
      const isCompletedState = updates.status === 'completed' || updates.status === 'failed';
      if (abortControllerRef.current?.signal.aborted && !isCompletedState) return;

      const latestNodes = nodesRef.current.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
      nodesRef.current = latestNodes;
      setNodes(latestNodes);

      // 调试：确认 volumes 数据是否正确保存
      if (updates.volumes) {
        const volCount = (updates.volumes as any[]).length;
        terminal.log(`[syncNodeStatus] 保存 volumes 到节点 ${nodeId}, 数量: ${volCount}`);
        // 立即验证 nodesRef.current 中的数据
        const savedNode = nodesRef.current.find(n => n.id === nodeId);
        const savedVolCount = (savedNode?.data.volumes as any[])?.length || 0;
        terminal.log(`[syncNodeStatus] 验证 nodesRef.current: 节点${nodeId} volumes数量=${savedVolCount}`);
      }

      workflowManager.broadcastNodeUpdate(nodeId, updates);

      const currentWfs = workflowsRef.current.map(w => {
        if (w.id === activeWorkflowId) {
          return {
            ...w,
            nodes: latestNodes,
            currentNodeIndex: currentIndex,
            lastModified: Date.now(),
            contextSnapshot: workflowManager.getSnapshot(),
          };
        }
        return w;
      });

      try {
        await storage.saveWorkflows(currentWfs);
      } catch (e) {
        terminal.error(`[WORKFLOW ENGINE] 持久化失败: ${e}`);
      }
    },
    [activeWorkflowId, nodesRef, workflowsRef, setNodes],
  );

  // 节流函数：用于控制节点标签更新频率
  const lastLabelUpdateRef = useRef<{ [nodeId: string]: number }>({});
  const throttleLabelUpdate = useCallback((nodeId: string, label: string) => {
    const now = Date.now();
    const lastUpdate = lastLabelUpdateRef.current[nodeId] || 0;
    // 节流：至少 500ms 更新一次标签
    if (now - lastUpdate < 500) return false;
    lastLabelUpdateRef.current[nodeId] = now;
    return true;
  }, []);

  // 统一的连线动画管理函数
  // 第四次修复：匹配从当前节点出发的边（e.source === nodeId）
  // 动画应显示从当前执行节点到下一个节点的连线流动，例如"世界观→粗纲"当世界观正在执行时
  // 这样用户可以清晰看到数据从哪个节点流向下一个节点
  const setEdgeAnimation = useCallback((nodeId: string, animated: boolean) => {
    setEdges(eds => eds.map(e => {
      if (e.source === nodeId) {
        return { ...e, animated };
      }
      return e;
    }));
  }, [setEdges]);

  // 清除所有连线动画
  const clearAllEdgeAnimations = useCallback(() => {
    // 直接更新，确保状态同步
    setEdges(eds => eds.map(e => ({ ...e, animated: false })));
  }, [setEdges]);

  const normalizeStartOptions = (input?: number | WorkflowStartOptions): WorkflowStartOptions => {
    if (typeof input === 'number') {
      return { startIndex: input };
    }
    return {
      startIndex: input?.startIndex ?? 0,
      targetVolumeId: input?.targetVolumeId,
      mode: input?.mode,
    };
  };

  const collectDescendantFolderIds = (folders: ReferenceFolder[] = [], parentIds: Set<string>) => {
    const collected = new Set<string>(parentIds);
    let changed = true;

    while (changed) {
      changed = false;
      folders.forEach(folder => {
        if (folder.parentId && collected.has(folder.parentId) && !collected.has(folder.id)) {
          collected.add(folder.id);
          changed = true;
        }
      });
    }

    return collected;
  };

  const clearNovelContentByVolumes = (novel: Novel, volumeIds: string[], clearFollowingVolumes: boolean) => {
    if (!volumeIds.length) return novel;

    const volumeOrder = novel.volumes || [];
    const startOrderIndex = volumeOrder.findIndex(v => v.id === volumeIds[0]);
    const affectedVolumeIds = new Set(
      clearFollowingVolumes && startOrderIndex >= 0
        ? volumeOrder.slice(startOrderIndex).map(v => v.id)
        : volumeIds,
    );
    const affectedVolumeTitles = new Set(
      volumeOrder.filter(v => affectedVolumeIds.has(v.id)).map(v => v.title).filter(Boolean),
    );

    const nextReferenceFolders = [...(novel.referenceFolders || [])];
    const directFolderIds = new Set(
      nextReferenceFolders
        .filter(folder => affectedVolumeTitles.has(folder.name))
        .map(folder => folder.id),
    );
    const allFolderIds = collectDescendantFolderIds(nextReferenceFolders, directFolderIds);

    return {
      ...novel,
      chapters: (novel.chapters || []).map(chapter => {
        if (!chapter.volumeId || !affectedVolumeIds.has(chapter.volumeId)) {
          return chapter;
        }

        return {
          ...chapter,
          content: '',
          sourceContent: '',
          optimizedContent: '',
          showingVersion: 'source' as const,
          versions: [],
          activeVersionId: undefined,
          analysisResult: undefined,
          logicScore: undefined,
        };
      }),
      outlineSets: (novel.outlineSets || []).map(set =>
        affectedVolumeTitles.has(set.name) ? { ...set, items: [] } : set,
      ),
      characterSets: (novel.characterSets || []).map(set =>
        affectedVolumeTitles.has(set.name) ? { ...set, characters: [] } : set,
      ),
      worldviewSets: (novel.worldviewSets || []).map(set =>
        affectedVolumeTitles.has(set.name) ? { ...set, entries: [] } : set,
      ),
      inspirationSets: (novel.inspirationSets || []).map(set =>
        affectedVolumeTitles.has(set.name) ? { ...set, items: [] } : set,
      ),
      plotOutlineSets: (novel.plotOutlineSets || []).map(set =>
        affectedVolumeTitles.has(set.name) ? { ...set, items: [] } : set,
      ),
      referenceFiles: (novel.referenceFiles || []).filter(file => !file.parentId || !allFolderIds.has(file.parentId)),
    };
  };

  // 执行引擎核心逻辑
  const runWorkflow = async (opts?: number | WorkflowStartOptions) => {
    const normalizedOpts = normalizeStartOptions(opts);
    const startIndex = normalizedOpts.startIndex ?? workflowManager.getState().currentNodeIndex ?? 0;
    const mode = normalizedOpts.mode;
    const targetVolumeId = normalizedOpts.targetVolumeId;
    const logPrefix = isMobile ? '[Mobile Workflow]' : '[WORKFLOW]';
    terminal.log(
      `${logPrefix} 准备执行工作流, 起始索引: ${startIndex}, 模式: ${mode || 'normal'}, 目标卷: ${targetVolumeId || '未指定'}`,
    );

    const logMemory = () => {
      if ((performance as any).memory) {
        const mem = (performance as any).memory;
        terminal.log(
          `[MEM] Used: ${Math.round(mem.usedJSHeapSize / 1048576)}MB, Total: ${Math.round(
            mem.totalJSHeapSize / 1048576,
          )}MB, Limit: ${Math.round(mem.jsHeapSizeLimit / 1048576)}MB`,
        );
      }
    };

    if (!globalConfig?.apiKey) {
      setError('请先在主设置中配置 API Key');
      return;
    }

    const currentWf = workflowsRef.current.find(w => w.id === activeWorkflowId);
    workflowManager.start(activeWorkflowId, startIndex, currentWf?.contextSnapshot);
    const startRunId = workflowManager.getCurrentRunId();

    setError(null);
    stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();

    try {
      await keepAliveManager.enable();
    } catch (e) {
      console.warn(`${logPrefix} KeepAlive failed:`, e);
    }

    try {
      if (!activeNovel) {
        workflowManager.clearStartVolumeLock();
        workflowManager.stop();
        return;
      }

      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        const volumeStateMap = new Map();
        (activeNovelRef.current?.volumes || []).forEach(v => volumeStateMap.set(v.id, v.collapsed));

        const mergedNovel: Novel = {
          ...newNovel,
          volumes: (newNovel.volumes || []).map(v => ({
            ...v,
            collapsed: volumeStateMap.has(v.id) ? volumeStateMap.get(v.id) : v.collapsed,
          })),
        };
        localNovel = mergedNovel;

        // 在大型对象更新前 yield 一次，确保浏览器有时间处理用户输入
        await new Promise(resolve => setTimeout(resolve, 0));

        if (onUpdateNovel) {
          onUpdateNovel(mergedNovel);
        }
      };

      let sortedNodes = getOrderedNodes();
      if (sortedNodes.length === 0) {
        setError('工作流中没有任何节点可执行');
        workflowManager.stop();
        return;
      }

      const targetVolumeIndex = targetVolumeId
        ? localNovel.volumes?.findIndex(v => v.id === targetVolumeId) ?? -1
        : -1;

      if (targetVolumeId && targetVolumeIndex === -1) {
        setError('目标卷不存在，无法启动工作流');
        workflowManager.stop();
        return;
      }

      // 保存用户指定的目标卷信息
      const userSpecifiedTargetVolumeId = targetVolumeId;
      const userSpecifiedTargetVolumeIndex = targetVolumeIndex;

      if (userSpecifiedTargetVolumeId && userSpecifiedTargetVolumeIndex >= 0) {
        workflowManager.lockStartVolume(userSpecifiedTargetVolumeId, userSpecifiedTargetVolumeIndex);
        workflowManager.setActiveVolumeAnchor(userSpecifiedTargetVolumeId);
        workflowManager.setCurrentVolumeIndex(userSpecifiedTargetVolumeIndex);
      } else {
        workflowManager.clearStartVolumeLock();
      }

      if (userSpecifiedTargetVolumeId && mode) {
        localNovel = clearNovelContentByVolumes(localNovel, [userSpecifiedTargetVolumeId], mode === 'full');
        await updateLocalAndGlobal(localNovel);
      }

      const checkActive = () => {
        if (stopRequestedRef.current) return false;
        if (!workflowManager.isRunActive(startRunId)) {
          terminal.warn(`${logPrefix} 侦测到过时执行实例 (RunID: ${startRunId})，拦截更新。`);
          return false;
        }
        return true;
      };

      const resetNodeData = (n: WorkflowNode): WorkflowNode => {
        const updates: any = { status: 'pending', outputEntries: [], loopInstructions: [] };
        if (n.data.typeKey === 'chapter') {
          updates.label = NODE_CONFIGS.chapter.defaultLabel;
        }
        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = { ...n.data.loopConfig, currentIndex: 0 };
        }
        if (n.data.typeKey === 'loopConfigurator') {
          updates.globalLoopInstructions = [];
          updates.generatedLoopConfig = '';
        }
        return { ...n, data: { ...n.data, ...updates } };
      };

      const initialResetNodes = nodesRef.current.map(n => {
        const nodeInSorted = sortedNodes.findIndex(sn => sn.id === n.id);
        return nodeInSorted >= startIndex ? resetNodeData(n) : n;
      });
      nodesRef.current = initialResetNodes;
      setNodes(initialResetNodes);

      // 初始化时清除所有连线动画
      clearAllEdgeAnimations();

      sortedNodes = sortedNodes.map((sn, idx) => (idx >= startIndex ? resetNodeData(sn) : sn));

      // 构建宏上下文：供 interpolateWithMacros 使用
      // 宏组件可以在任何节点的指令和提示词中使用，获取其他节点的全部内容
      const buildMacroContext = (currentIndex: number): Partial<MacroContext> => {
        const previousNodes: MacroContext['previousNodes'] = [];
        for (let j = 0; j < currentIndex; j++) {
          const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
          previousNodes.push({ id: pNode.id, typeKey: pNode.data.typeKey, data: pNode.data });
        }
        const allNodes: MacroContext['allNodes'] = nodesRef.current.map(n => ({
          id: n.id, typeKey: n.data.typeKey, data: n.data
        }));
        return {
          previousNodes,
          allNodes,
          currentNode: { id: sortedNodes[currentIndex].id, typeKey: sortedNodes[currentIndex].data.typeKey, data: sortedNodes[currentIndex].data },
          globalVariables: workflowManager.getState().globalContext.variables,
          activeVolumeAnchor: workflowManager.getActiveVolumeAnchor(),
          currentVolumeIndex: workflowManager.getCurrentVolumeIndex(),
          novelData: localNovel,
        };
      };

      // 核心重构：动态构建上下文函数
      // 解决"循环中只使用最新内容"和"节点信息传递"的问题
      const buildDynamicContext = (currentIndex: number) => {
        const dynamicContextMessages: any[] = [];
        let dynamicFolder = '';

        // 本卷模式支持：寻找当前上下文的作用域
        // 如果开启了本卷模式，我们将根据当前分卷索引找到对应的文件夹节点作为隔离边界
        let boundaryIndex = 0;
        let currentVolumeConfig: any = null;
        let totalVolumesFromConfig = 0;
        
        if (globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume') {
          // 获取当前分卷索引
          const currentVolIdx = workflowManager.getCurrentVolumeIndex();
          
          // 遍历找到当前分卷对应的文件夹节点
          for (let j = currentIndex - 1; j >= 0; j--) {
            const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
            
            // 如果是文件夹类型节点
            if (pNode.data.typeKey === 'createFolder' || 
                pNode.data.typeKey === 'reuseDirectory' ||
                pNode.data.typeKey === 'multiCreateFolder') {
              
              // 如果是 multiCreateFolder，获取它的配置
              if (pNode.data.typeKey === 'multiCreateFolder' && pNode.data.volumeFolderConfigs) {
                const configs = pNode.data.volumeFolderConfigs as any[];
                totalVolumesFromConfig = configs.length;
                
                // 找到当前分卷对应的配置
                if (configs[currentVolIdx]) {
                  currentVolumeConfig = configs[currentVolIdx];
                  boundaryIndex = j;
                  break;
                }
              } else {
                // 普通文件夹节点，检查 folderName 是否匹配当前分卷
                const folderName = pNode.data.folderName || '';
                if (localNovel.volumes) {
                  const currentVol = localNovel.volumes[currentVolIdx];
                  if (currentVol && (currentVol.title === folderName || folderName.includes(currentVol.title))) {
                    boundaryIndex = j;
                    break;
                  }
                }
              }
            }
          }
          
          // 如果没找到匹配的文件夹，尝试使用最近的文件夹作为边界
          if (boundaryIndex === 0) {
            for (let j = currentIndex - 1; j >= 0; j--) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
              if (pNode.data.typeKey === 'createFolder' || 
                  pNode.data.typeKey === 'reuseDirectory' ||
                  pNode.data.typeKey === 'multiCreateFolder') {
                boundaryIndex = j;
                break;
              }
            }
          }
        }

        // 遍历当前节点之前的所有节点
        for (let j = 0; j < currentIndex; j++) {
          // 注意：必须从 nodesRef 获取最新状态，因为 sortedNodes 可能包含过时数据
          const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];

          if (pNode.data.typeKey === 'createFolder' || 
              pNode.data.typeKey === 'reuseDirectory' ||
              pNode.data.typeKey === 'multiCreateFolder') {
            dynamicFolder = pNode.data.folderName || dynamicFolder;
          } else if (pNode.data.typeKey === 'userInput') {
            dynamicContextMessages.push({
              role: 'user',
              content: `【用户全局输入】：\n${pNode.data.instruction}`,
            });
          } else if (pNode.data.typeKey === 'creationInfo') {
            const activeVolumeId = workflowManager.getActiveVolumeAnchor();
            const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
            const loopIndex = workflowManager.getContextVar('loop_index') || 1;
            
            // 优先使用分卷配置中的总数，否则使用已创建的分卷数
            const totalVolumes = totalVolumesFromConfig > 0 ? totalVolumesFromConfig : (localNovel.volumes?.length || 0);
            
            let volumeInfoContent = '';
            if (activeVolumeId && localNovel.volumes) {
              const activeVolume = localNovel.volumes.find(v => v.id === activeVolumeId);
              if (activeVolume) {
                volumeInfoContent += `当前分卷：${activeVolume.title}\n`;
              }
            }
            if (totalVolumes > 0) {
              volumeInfoContent += `分卷进度：第 ${currentVolumeIndex + 1} 卷 / 共 ${totalVolumes} 卷\n`;
            }
            volumeInfoContent += `当前循环轮次：第 ${loopIndex} 轮`;
            
            let fullContent = volumeInfoContent;
            if (pNode.data.instruction) {
              fullContent += `\n\n用户自定义指令：\n${pNode.data.instruction}`;
            }
            
            dynamicContextMessages.push({
              role: 'user',
              content: `【创作信息】：\n${fullContent}`,
            });
          }

          // 创作信息节点跳过 outputEntries 处理：其内容已通过上方动态生成（【创作信息】），
          // outputEntries 中存储的是首次执行时生成的内容，循环轮次等信息已过时，
          // 会导致重复发送【创作信息输出】且循环轮次错误
          if (pNode.data.typeKey === 'creationInfo') {
            continue;
          }

          // 修复：saveToVolume 节点优先使用 volumeContent（支持手动编辑）
          // 用户可能在 UI 中修改了分卷规划内容，volumeContent 始终是最新版本
          // outputEntries 可能在非AI模式下为空，或包含旧的AI生成内容
          if (pNode.data.typeKey === 'saveToVolume' && pNode.data.volumeContent) {
            const volumeMode = globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume';
            if (volumeMode && j < boundaryIndex) {
              // 本卷模式下跳过隔离边界之前的节点
            } else {
              dynamicContextMessages.push({
                role: 'system',
                content: `【小说分卷】：\n${pNode.data.volumeContent}`,
              });
            }
            continue;
          }

          // 修复：loopConfigurator 节点传递生成的循环配置内容
          // 循环配置器的生成结果对后续AI节点理解整体创作结构很有帮助
          if (pNode.data.typeKey === 'loopConfigurator' && pNode.data.generatedLoopConfig) {
            const volumeMode = globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume';
            if (volumeMode && j < boundaryIndex) {
              // 本卷模式下跳过隔离边界之前的节点
            } else {
              dynamicContextMessages.push({
                role: 'system',
                content: `【循环配置输出】：\n${pNode.data.generatedLoopConfig}`,
              });
            }
            continue;
          }

          if (pNode.data.outputEntries && pNode.data.outputEntries.length > 0) {
            // 本卷模式修复：如果开启了本卷模式，过滤掉隔离边界之前的节点输出
            if ((globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume') && j < boundaryIndex) {
              continue;
            }

            // 修复：不再只取最后一条，而是合并所有非空条目内容，确保角色/大纲等信息完整
            const typeKey = pNode.data.typeKey;
            const validEntries = pNode.data.outputEntries.filter(e => e.content && e.content.trim());

            if (validEntries.length > 0) {
              let title = '';
              switch (typeKey) {
                case 'worldview':
                  title = '小说世界观设定';
                  break;
                case 'characters':
                  title = '小说角色档案';
                  break;
                case 'plotOutline':
                  title = '小说粗纲';
                  break;
                case 'outline':
                  title = '小说大纲';
                  break;
                case 'inspiration':
                  title = '小说灵感集';
                  break;
                case 'aiChat':
                  title = '小说聊天节点内容';
                  break;
                case 'saveToVolume':
                  title = '小说分卷';
                  break;
                default:
                  title = (pNode.data.typeLabel || pNode.data.label || typeKey || '节点') + '输出';
              }

              // 合并内容，如果是角色或设定类，使用换行分隔
              const combinedContent = validEntries
                .map(e => {
                  if (typeKey === 'characters' || typeKey === 'worldview' || typeKey === 'outline') {
                    return `· ${e.title}: ${e.content}`;
                  }
                  return e.content;
                })
                .join('\n');

              dynamicContextMessages.push({
                role: 'system',
                content: `【${title}】：\n${combinedContent}`,
              });
            }
          }
        }
        return { dynamicContextMessages, dynamicFolder };
      };

      // 恢复状态：如果是从中间开始，需要先恢复 workflowManager 的一些状态（如 activeVolume）
      let currentWorkflowFolder = '';
      if (startIndex > 0) {
        for (let j = 0; j < startIndex; j++) {
          const prevNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
          if (prevNode.data.typeKey === 'createFolder' || 
              prevNode.data.typeKey === 'reuseDirectory' ||
              prevNode.data.typeKey === 'multiCreateFolder') {
            currentWorkflowFolder = prevNode.data.folderName || currentWorkflowFolder;
          } else if (prevNode.data.typeKey === 'saveToVolume') {
            if (prevNode.data.splitRules && (prevNode.data.splitRules as any[]).length > 0) {
              workflowManager.setPendingSplits(prevNode.data.splitRules as any[]);
            }
            // 只有当用户没有指定目标卷时，才使用节点的 targetVolumeId
            if (prevNode.data.targetVolumeId && !userSpecifiedTargetVolumeId) {
              workflowManager.setActiveVolumeAnchor(prevNode.data.targetVolumeId as string);
            }
          } else if (prevNode.data.typeKey === 'loopConfigurator') {
            // 恢复循环配置器的全局配置
            if (prevNode.data.globalLoopConfig) {
              workflowManager.setContextVar('global_loop_config', prevNode.data.globalLoopConfig);
            }
            if (prevNode.data.globalLoopInstructions) {
              workflowManager.setContextVar('global_loop_instructions', prevNode.data.globalLoopInstructions);
            }
          }
        }
        // 只有当用户没有指定目标卷时，才使用最后一章的 volumeId
        if (!workflowManager.getActiveVolumeAnchor() && !userSpecifiedTargetVolumeId && localNovel.chapters && localNovel.chapters.length > 0) {
          for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
            const chap = localNovel.chapters[k];
            if (chap.volumeId) {
              workflowManager.setActiveVolumeAnchor(chap.volumeId);
              break;
            }
          }
        }

        // 核心修复：从特定节点开始时，恢复 currentVolumeIndex 并用多策略校准 activeVolumeAnchor
        // 问题：当用户从最后一卷的节点开始时，上述逻辑可能把 anchor 设到错误的卷
        // 修复：按优先级检查 startNode.targetVolumeId > volumePlans > lastChapter
        if (startIndex > 0 && startIndex < sortedNodes.length) {
          const startNode = sortedNodes[startIndex];

          // 只有当用户没有指定目标卷时，才使用起始节点的 targetVolumeId 或 folderName
          if (!userSpecifiedTargetVolumeId) {
            // 策略1：起始章节节点的 targetVolumeId（最高优先级）
            if (startNode?.data?.targetVolumeId && startNode.data.typeKey === 'chapter') {
              workflowManager.setActiveVolumeAnchor(startNode.data.targetVolumeId as string);
              const volIdx = localNovel.volumes?.findIndex(v => v.id === startNode.data.targetVolumeId);
              if (volIdx !== undefined && volIdx >= 0) {
                workflowManager.setCurrentVolumeIndex(volIdx);
              }
              terminal.log(`[WORKFLOW_START] Restored from startNode.targetVolumeId: volIdx=${volIdx}, volId=${startNode.data.targetVolumeId}`);
            }
            // 策略2：起始节点的 folderName
            else if (startNode?.data?.folderName) {
              const matchingVol = localNovel.volumes?.find(v => v.title === startNode.data.folderName);
              if (matchingVol) {
                workflowManager.setActiveVolumeAnchor(matchingVol.id);
                const volIdx = localNovel.volumes?.findIndex(v => v.id === matchingVol.id);
                if (volIdx !== undefined && volIdx >= 0) {
                  workflowManager.setCurrentVolumeIndex(volIdx);
                }
                terminal.log(`[WORKFLOW_START] Restored from startNode.folderName: volIdx=${volIdx}, name="${startNode.data.folderName}"`);
              }
            }

            // 策略3：如果有 volumePlans，根据章节数校准
            const volumePlans = workflowManager.getVolumePlans();
            if (volumePlans.length > 0) {
              const storyChapterCount = (localNovel.chapters || []).filter(
                c => !c.subtype || c.subtype === 'story'
              ).length;
              if (storyChapterCount > 0) {
                for (let vIdx = 0; vIdx < volumePlans.length; vIdx++) {
                  const cfg = volumePlans[vIdx];
                  const sc = cfg.startChapter || 1;
                  const ec = cfg.endChapter || Infinity;
                  if (storyChapterCount >= sc && storyChapterCount <= ec) {
                    workflowManager.setCurrentVolumeIndex(vIdx);
                    const volName = cfg.volumeName || cfg.folderName;
                    const matchVol = localNovel.volumes?.find(v => v.title === volName);
                    if (matchVol && !workflowManager.getActiveVolumeAnchor()) {
                      workflowManager.setActiveVolumeAnchor(matchVol.id);
                    }
                    terminal.log(`[WORKFLOW_START] Calibrated from volumePlans: volIdx=${vIdx}, chapters=${storyChapterCount}, name="${volName}"`);
                    break;
                  }
                  if (storyChapterCount > ec && vIdx === volumePlans.length - 1) {
                    workflowManager.setCurrentVolumeIndex(vIdx);
                    const volName = cfg.volumeName || cfg.folderName;
                    const matchVol = localNovel.volumes?.find(v => v.title === volName);
                    if (matchVol && !workflowManager.getActiveVolumeAnchor()) {
                      workflowManager.setActiveVolumeAnchor(matchVol.id);
                    }
                    terminal.log(`[WORKFLOW_START] Calibrated (last volume): volIdx=${vIdx}, chapters=${storyChapterCount}`);
                  }
                }
              }
            }

            // 策略4：如果还是没有 anchor，使用最后一章的 volumeId 并找到正确的索引
            if (!workflowManager.getActiveVolumeAnchor()) {
              const lastStoryCh = [...(localNovel.chapters || [])].reverse().find(c => !c.subtype || c.subtype === 'story');
              if (lastStoryCh?.volumeId) {
                workflowManager.setActiveVolumeAnchor(lastStoryCh.volumeId);
                const volIdx = localNovel.volumes?.findIndex(v => v.id === lastStoryCh.volumeId);
                if (volIdx !== undefined && volIdx >= 0) {
                  workflowManager.setCurrentVolumeIndex(volIdx);
                }
                terminal.log(`[WORKFLOW_START] Fallback to last story chapter: volIdx=${volIdx}, volId=${lastStoryCh.volumeId}`);
              }
            }
          } else {
            // 核心修复：当用户指定了目标卷时，除了章节节点，还要统一更新后续所有按卷/文件夹归档的节点。
            // 否则正文会写到指定卷，但大纲/设定/灵感等内容仍可能沿用旧 folderName，最终落到错误文件夹。
            const targetVolume = localNovel.volumes?.find(v => v.id === userSpecifiedTargetVolumeId);
            if (targetVolume) {
              const folderScopedNodeTypes = new Set([
                'chapter',
                'worldview',
                'characters',
                'outline',
                'plotOutline',
                'inspiration',
                'creationInfo',
                'saveToVolume',
                'aiChat',
              ]);

              let updatedChapterCount = 0;
              let updatedFolderScopedCount = 0;

              nodesRef.current = nodesRef.current.map(n => {
                const nodeIndex = sortedNodes.findIndex(sn => sn.id === n.id);
                if (nodeIndex < startIndex || !folderScopedNodeTypes.has(n.data.typeKey)) {
                  return n;
                }

                const nextData: any = {
                  ...n.data,
                  folderName: targetVolume.title,
                };

                updatedFolderScopedCount++;

                if (n.data.typeKey === 'chapter') {
                  nextData.targetVolumeId = userSpecifiedTargetVolumeId;
                  nextData.targetVolumeName = targetVolume.title;
                  updatedChapterCount++;
                }

                if (n.data.typeKey === 'creationInfo' && Array.isArray(n.data.outputEntries) && n.data.outputEntries.length > 0) {
                  const loopIndex = workflowManager.getContextVar('loop_index') || 1;
                  const totalVolumes = localNovel.volumes?.length || 0;
                  const volumeProgress = totalVolumes > 0
                    ? `分卷进度：第 ${userSpecifiedTargetVolumeIndex + 1} 卷 / 共 ${totalVolumes} 卷`
                    : '';
                  let newContent = [`当前分卷：${targetVolume.title}`, volumeProgress, `当前循环轮次：第 ${loopIndex} 轮`]
                    .filter(Boolean)
                    .join('\n');
                  if (n.data.instruction) {
                    newContent += `\n\n用户指令：${n.data.instruction}`;
                  }

                  nextData.outputEntries = [
                    {
                      id: `creation_info_start_${Date.now()}`,
                      title: '创作信息',
                      content: newContent,
                    },
                  ];
                }

                return {
                  ...n,
                  data: nextData,
                };
              });

              setNodes([...nodesRef.current]);
              terminal.log(
                `[WORKFLOW_START] Updated ${updatedChapterCount} chapter nodes and ${updatedFolderScopedCount} folder-scoped nodes to targetVolumeId=${userSpecifiedTargetVolumeId}, folder="${targetVolume.title}"`,
              );
            }
          }

          // 同步 currentWorkflowFolder
          const anchorId = workflowManager.getActiveVolumeAnchor();
          if (anchorId) {
            const anchorVol = localNovel.volumes?.find(v => v.id === anchorId);
            if (anchorVol) {
              currentWorkflowFolder = anchorVol.title;
            }
          }

          terminal.log(`[WORKFLOW_START] Final state: volIdx=${workflowManager.getCurrentVolumeIndex()}, anchor=${workflowManager.getActiveVolumeAnchor()}, folder="${currentWorkflowFolder}"`);
        }
      }

      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (!checkActive()) {
          workflowManager.clearStartVolumeLock();
          workflowManager.pause(i);
          break;
        }

        const node = nodesRef.current.find(n => n.id === sortedNodes[i].id) || sortedNodes[i];
        workflowManager.updateProgress(i, node.id);
        logMemory();

        // --- Pause Node ---
        if (node.data.typeKey === 'pauseNode') {
          // Bug 2 修复：检查跳过状态，如果被跳过则直接跳过
          if (node.data.skipped) {
            terminal.log(`${logPrefix} Pause node skipped: ${node.id}`);
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            setEdgeAnimation(node.id, false);
            continue;
          }
          
          // 核心修复：如果是从暂停状态恢复（startIndex > 0），并且当前节点是暂停节点，
          // 说明该节点已经执行过暂停操作，应该直接跳过，继续执行下一个节点
          if (startIndex > 0) {
            terminal.log(`${logPrefix} Pause node already processed, skipping: ${node.id}`);
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            setEdgeAnimation(node.id, false);
            continue;
          }
          
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          await new Promise(resolve => setTimeout(resolve, 300));
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdgeAnimation(node.id, false);
          workflowManager.pause(i + 1);
          stopRequestedRef.current = true;
          return;
        }

        // 动态构建当前节点的上下文和宏上下文
        const macroCtx = buildMacroContext(i);
        const { dynamicContextMessages, dynamicFolder } = buildDynamicContext(i);
        // 如果当前节点没有指定文件夹，且上下文中有文件夹，更新 currentWorkflowFolder
        if (!currentWorkflowFolder && dynamicFolder) currentWorkflowFolder = dynamicFolder;
        // 如果动态扫描到了更新的文件夹，覆盖它
        if (dynamicFolder) currentWorkflowFolder = dynamicFolder;

        // --- Save To Volume Node ---
        if (node.data.typeKey === 'saveToVolume') {
          console.log('[SAVE_TO_VOLUME] ========== START ==========', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeIndex: i,
            hasOverrideAiConfig: !!node.data.overrideAiConfig,
            hasVolumes: !!(node.data.volumes && (node.data.volumes as any[]).length > 0),
            volumesCount: (node.data.volumes as any[])?.length || 0,
            hasSplitRules: !!(node.data.splitRules && (node.data.splitRules as any[]).length > 0),
            splitRulesCount: (node.data.splitRules as any[])?.length || 0,
          });
          
          console.log('[SAVE_TO_VOLUME] === START ===', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeIndex: i,
            hasOverrideAiConfig: !!node.data.overrideAiConfig,
            hasVolumes: !!(node.data.volumes && (node.data.volumes as any[]).length > 0),
            volumesCount: (node.data.volumes as any[])?.length || 0,
            hasSplitRules: !!(node.data.splitRules && (node.data.splitRules as any[]).length > 0),
            splitRulesCount: (node.data.splitRules as any[])?.length || 0,
          });
          
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);

          if (!node.data.overrideAiConfig) {
            let targetVolumeId = node.data.targetVolumeId as string;
            if (targetVolumeId === 'NEW_VOLUME' && node.data.targetVolumeName) {
              const newVolume = {
                id: `vol_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                title: node.data.targetVolumeName as string,
                collapsed: false,
              };
              const updatedNovel: Novel = { ...localNovel, volumes: [...(localNovel.volumes || []), newVolume] };
              await updateLocalAndGlobal(updatedNovel);
              targetVolumeId = newVolume.id;
              await syncNodeStatus(node.id, { targetVolumeId, targetVolumeName: '', status: 'completed' }, i);
            }
            if (targetVolumeId) workflowManager.setActiveVolumeAnchor(targetVolumeId);
            const rules = (node.data.splitRules as any[]) || [];
            const volumes = (node.data.volumes as any[]) || [];
            if (rules.length > 0) workflowManager.setPendingSplits(rules);
            // 修复：非AI模式下也需要保存完整的分卷规划信息到 workflowManager
            if (volumes.length > 0) {
              workflowManager.setVolumePlans(volumes);
            }
            
            // 修复：非AI模式下也需要设置 outputEntries，确保节点内容能传递给后续节点
            // 如果用户在 UI 中手动编辑了 volumeContent，使用它作为输出
            // 如果有 splitRules 或 volumes 配置，也将其作为上下文输出
            const nonAiOutputEntries: OutputEntry[] = [];
            if (node.data.volumeContent) {
              nonAiOutputEntries.push({
                id: `vol_nonai_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                title: '分卷规划内容',
                content: node.data.volumeContent,
              });
            }
            if (rules.length > 0) {
              const rulesSummary = rules.map((r: any, idx: number) => {
                let desc = `${idx + 1}. 新分卷: ${r.nextVolumeName || '未命名'}`;
                if (r.startChapter) desc += ` (第${r.startChapter}章起)`;
                if (r.endChapter) desc += ` (至第${r.endChapter}章)`;
                return desc;
              }).join('\n');
              nonAiOutputEntries.push({
                id: `vol_rules_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                title: '分卷触发规则',
                content: rulesSummary,
              });
            }
            
            await syncNodeStatus(node.id, { 
              status: 'completed', 
              outputEntries: nonAiOutputEntries.length > 0 ? nonAiOutputEntries : undefined,
            }, i);
            setEdgeAnimation(node.id, false);
            continue;
          }

          const volTypePresets = allPresets[node.data.presetType as string] || [];
          let volPreset = volTypePresets.find(p => p.id === node.data.presetId) || volTypePresets[0];
          const volNodeApiConfig = (volPreset as any)?.apiConfig || {};
          const volOpenai = new OpenAI({
            apiKey: node.data.apiKey ? node.data.apiKey : volNodeApiConfig.apiKey || globalConfig.apiKey,
            baseURL: node.data.baseUrl ? node.data.baseUrl : volNodeApiConfig.baseUrl || globalConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          const planningModel = node.data.model || volNodeApiConfig.model || globalConfig.model;
          let planningRefContext = '';
          const planningAttachments: any[] = [];

          const resolvePendingRefInternal = (list: string[], sets: any[] | undefined) => {
            return list.map(id => {
              if (id?.startsWith?.('pending:')) {
                const folderName = id.replace('pending:', '');
                return sets?.find(s => s.name === folderName)?.id || id;
              }
              return id;
            });
          };

          const pWorldview = resolvePendingRefInternal(
            [...(node.data.selectedWorldviewSets || [])],
            localNovel.worldviewSets,
          );
          const pCharacters = resolvePendingRefInternal(
            [...(node.data.selectedCharacterSets || [])],
            localNovel.characterSets,
          );
          const pOutlines = resolvePendingRefInternal(
            [...(node.data.selectedOutlineSets || [])],
            localNovel.outlineSets,
          );
          const pInspirations = resolvePendingRefInternal(
            [...(node.data.selectedInspirationSets || [])],
            localNovel.inspirationSets,
          );

          pWorldview.forEach(id => {
            const set = localNovel.worldviewSets?.find(s => s.id === id);
            if (set)
              planningRefContext += `【参考世界观 (${set.name})】：\n${set.entries
                .map(e => `· ${e.item}: ${e.setting}`)
                .join('\n')}\n`;
          });
          pCharacters.forEach(id => {
            const set = localNovel.characterSets?.find(s => s.id === id);
            if (set)
              planningRefContext += `【参考角色 (${set.name})】：\n${set.characters
                .map(c => `· ${c.name}: ${c.bio}`)
                .join('\n')}\n`;
          });
          pOutlines.forEach(id => {
            const set = localNovel.outlineSets?.find(s => s.id === id);
            if (set)
              planningRefContext += `【参考粗纲 (${set.name})】：\n${set.items
                .map(i => `· ${i.title}: ${i.summary}`)
                .join('\n')}\n`;
          });
          pInspirations.forEach(id => {
            const set = localNovel.inspirationSets?.find(s => s.id === id);
            if (set)
              planningRefContext += `【参考灵感 (${set.name})】：\n${set.items
                .map(i => `· ${i.title}: ${i.content}`)
                .join('\n')}\n`;
          });
          (node.data.selectedReferenceFolders || []).forEach(folderId => {
            const folder = localNovel.referenceFolders?.find(f => f.id === folderId);
            if (folder) {
              localNovel.referenceFiles
                ?.filter(f => f.parentId === folderId)
                .forEach(f => {
                  if (f.type.startsWith('text/') || f.name.endsWith('.md') || f.name.endsWith('.txt')) {
                    planningRefContext += `· 文件: ${f.name}\n内容: ${f.content}\n---\n`;
                  } else if (f.type.startsWith('image/')) {
                    planningAttachments.push({ type: 'image', url: f.content, name: f.name });
                  } else if (f.type === 'application/pdf') {
                    planningAttachments.push({ type: 'pdf', url: f.content, name: f.name });
                  }
                });
            }
          });

          // 格式化附件函数
          const formatAtts = (text: string) => {
            if (planningAttachments.length === 0) return text;
            const content: any[] = [{ type: 'text', text }];
            planningAttachments.forEach(att => {
              if (att.type === 'image') content.push({ type: 'image_url', image_url: { url: att.url } });
              else if (att.type === 'pdf')
                content.push({
                  type: 'file',
                  file_url: { url: att.url.startsWith('data:') ? att.url : `data:application/pdf;base64,${att.url}` },
                } as any);
            });
            return content;
          };

          const nodePromptItems = (node.data.promptItems as GeneratorPrompt[]) || [];
          let planningMessages: any[] = [];

          // 1. 构建 System 和自定义 Prompt
          if (nodePromptItems.length > 0) {
            // 过滤出自定义的 Prompts
            const customPrompts = nodePromptItems
              .filter(p => p.enabled !== false)
              .map(p => {
                // 如果有 {{context}} 占位符，这里简单替换为空，因为我们会单独注入 Context 消息
                // 或者我们可以保留它，但这比较复杂。现在的逻辑是将 Context 放在 System 之后。
                const content = workflowManager.interpolateWithMacros(p.content.replace('{{context}}', ''), macroCtx);
                return { role: p.role, content: p.role === 'user' ? formatAtts(content) : content };
              });
            planningMessages.push(...customPrompts);
          } else {
            planningMessages.push({ role: 'system', content: '你是一名拥有丰富经验特的长篇小说架构师。' });
          }

          // 2. 插入前序节点上下文 (System/User Messages)
          // 必须放在基础设定之后，具体指令之前
          planningMessages.push(...dynamicContextMessages);

          // 3. 插入参考资料 (Worldview, Files etc) - 仍作为文本参考
          if (planningRefContext.trim()) {
            planningMessages.push({
              role: 'system',
              content: `【小说知识库和参考】：\n${planningRefContext}`,
            });
          }

          // 4. 插入本节点指令
          if (node.data.instruction) {
            planningMessages.push({
              role: 'user',
              content: formatAtts(workflowManager.interpolateWithMacros(node.data.instruction, macroCtx)),
            });
          } else if (planningMessages.length === 0 || planningMessages[planningMessages.length - 1].role !== 'user') {
            // 确保最后有一条 User 消息
            planningMessages.push({
              role: 'user',
              content: formatAtts('请根据以上信息进行规划。'),
            });
          }

          let aiResponse = '';
          let volRetryCount = 0;
          const maxVolRetries = 2;
          let volSuccess = false;

          while (volRetryCount <= maxVolRetries && !volSuccess) {
            if (volRetryCount > 0) {
              await new Promise(res => setTimeout(res, 2000));
            }

            try {
              console.groupCollapsed(
                `[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${
                  volRetryCount > 0 ? ` (重试 ${volRetryCount})` : ''
                }`,
              );
              console.log('Messages:', planningMessages);
              console.log('Config:', {
                model: planningModel,
                temperature: node.data.temperature ?? 0.7,
              });
              console.groupEnd();

              terminal.log(`
>> AI REQUEST [工作流: 分卷规划]
>> -----------------------------------------------------------
>> Model:       ${planningModel}
>> Temperature: ${node.data.temperature ?? 0.7}
>> -----------------------------------------------------------
`);

              const volCompletion = await volOpenai.chat.completions.create(
                {
                  model: planningModel,
                  messages: planningMessages,
                  temperature: node.data.temperature ?? 0.7,
                } as any,
                { signal: abortControllerRef.current?.signal },
              );

              aiResponse = volCompletion.choices[0]?.message?.content || '';
              
              console.log('[SAVE_TO_VOLUME] AI Response received', {
                nodeId: node.id,
                responseLength: aiResponse.length,
                responsePreview: aiResponse.substring(0, 500),
              });
              
              console.log('[SAVE_TO_VOLUME] AI Response received', {
                nodeId: node.id,
                nodeLabel: node.data.label,
                responseLength: aiResponse.length,
                responsePreview: aiResponse.substring(0, 300),
              });
              
              if (aiResponse) volSuccess = true;
              else volRetryCount++;
            } catch (volErr: any) {
              if (volErr.name === 'AbortError' || /aborted/i.test(volErr.message)) throw volErr;
              if (volRetryCount < maxVolRetries) {
                volRetryCount++;
                terminal.error(`${logPrefix} SaveToVolume Retry API 报错: ${volErr.message}`);
                continue;
              }
              throw volErr;
            }
          }

          const parsedResult = workflowManager.parseVolumesFromAI(aiResponse);
          const { splitRules, volumes } = parsedResult;
          
          console.log('[SAVE_TO_VOLUME] Parsing result', {
            splitRulesCount: splitRules.length,
            volumesCount: volumes.length,
            splitRules: splitRules,
            volumes: volumes,
          });
          
          console.log('[SAVE_TO_VOLUME] Parsing result', {
            nodeId: node.id,
            splitRulesCount: splitRules.length,
            volumesCount: volumes.length,
            splitRules: splitRules.map((r: any) => ({
              chapterTitle: r.chapterTitle,
              nextVolumeName: r.nextVolumeName,
              startChapter: r.startChapter,
              endChapter: r.endChapter,
            })),
            volumes: volumes.map((v: any) => ({
              volumeName: v.volumeName,
              folderName: v.folderName,
              startChapter: v.startChapter,
              endChapter: v.endChapter,
            })),
          });
          
          if (splitRules.length > 0 || volumes.length > 0) {
            console.log('[SAVE_TO_VOLUME] Parsing SUCCESS', {
              nodeId: node.id,
              outputEntriesCount: 1,
              splitRulesCount: splitRules.length,
              volumesCount: volumes.length,
            });
            
            await syncNodeStatus(
              node.id,
              {
                splitRules: splitRules,
                volumes: volumes, // 保存完整的分卷列表
                volumeContent: aiResponse,
                outputEntries: [{ id: `vol_plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, title: '分卷规划结果', content: aiResponse }],
                status: 'completed',
              },
              i,
            );
            workflowManager.setPendingSplits(splitRules);
            // 保存完整的分卷规划信息，用于安全检查
            if (volumes.length > 0) {
              workflowManager.setVolumePlans(volumes);
            }
            // 使用第一个分卷的名称（而不是第一个切换规则的名称）
            const firstVolName = volumes.length > 0 ? volumes[0].volumeName : (splitRules[0]?.nextVolumeName);
            const firstFolderName = volumes.length > 0 ? (volumes[0].folderName || volumes[0].volumeName) : firstVolName;
            if (firstVolName) {
              const existingVol = localNovel.volumes?.find(v => v.title === firstVolName);
              if (existingVol) workflowManager.setActiveVolumeAnchor(existingVol.id);
            }
            // 更新后续节点的 folderName 为第一个分卷名称
            if (firstFolderName) {
              nodesRef.current = nodesRef.current.map(n => {
                const typeKey = n.data.typeKey;
                // 排除不需要更新 folderName 的节点类型
                if (typeKey !== 'createFolder' && typeKey !== 'multiCreateFolder' && 
                    typeKey !== 'reuseDirectory' && typeKey !== 'saveToVolume' && 
                    typeKey !== 'loopNode' && typeKey !== 'loopConfigurator' && 
                    typeKey !== 'pauseNode' && typeKey !== 'userInput') {
                  return { ...n, data: { ...n.data, folderName: firstFolderName } };
                }
                return n;
              });
              setNodes([...nodesRef.current]);
              currentWorkflowFolder = firstFolderName;
              console.log('[SAVE_TO_VOLUME] Updated folderName for subsequent nodes:', { firstFolderName });
            }
          } else {
            console.error('[SAVE_TO_VOLUME] Parsing FAILED - no data extracted', {
              nodeId: node.id,
              rawResponse: aiResponse.substring(0, 500),
            });
            
            await syncNodeStatus(
              node.id,
              {
                status: 'failed',
                volumeContent: aiResponse,
                outputEntries: [
                  { id: `vol_plan_fail_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, title: '分卷规划 (解析失败)', content: aiResponse },
                ],
              },
              i,
            );
            throw new Error('无法从 AI 返回的内容中解析出分卷规划。');
          }

          console.log('[SAVE_TO_VOLUME] === END ===', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            hasPendingSplits: splitRules?.length > 0,
            pendingSplitsCount: splitRules?.length || 0,
            hasVolumePlans: volumes?.length > 0,
            volumePlansCount: volumes?.length || 0,
          });
          
          // lastNodeOutput += ... (已移除，改用动态构建)
          setEdgeAnimation(node.id, false);
          continue;
        }

        // --- Loop Node ---
        if (node.data.typeKey === 'loopNode') {
          const loopConfig = node.data.loopConfig || { enabled: true, count: 1, currentIndex: 0 };
          const currentLoopIndex = (loopConfig.currentIndex || 0) + 1;

          console.log('[LOOP_NODE] === START ===', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeIndex: i,
            loopConfig,
            currentLoopIndex,
            currentVolumeIndex: workflowManager.getCurrentVolumeIndex(),
            loopIndex: workflowManager.getContextVar('loop_index') || 1,
          });
          
          volumeFolderDebugTracker.recordNodeExecution(
            node.id,
            'loopNode',
            node.data.label || '循环控制',
            'executing',
            { loopConfig, currentLoopIndex }
          );
          
          await syncNodeStatus(
            node.id,
            {
              status: 'executing',
              loopConfig: { ...loopConfig, currentIndex: currentLoopIndex - 1 },
            },
            i,
          );

          setEdgeAnimation(node.id, true);
          await new Promise(resolve => setTimeout(resolve, 600));

          if (currentLoopIndex < loopConfig.count) {
            console.log('[LOOP_NODE] LOOP CONTINUE:', { currentIteration: currentLoopIndex, totalIterations: loopConfig.count, targetLoopIndex: currentLoopIndex + 1 });
            
            // 核心修复：重写卷模式（单卷模式）下，不进行循环回跳
            // 当用户指定了目标卷且有 mode（重写/全量模式），说明是"重写单卷"，只处理一卷
            // 此时不应回跳到循环起点继续下一卷，而是在当前卷完成后直接完成循环
            if (userSpecifiedTargetVolumeId && mode) {
              console.log('[LOOP_NODE] 单卷重写模式：跳过循环回跳，直接完成循环', {
                userSpecifiedTargetVolumeId,
                mode,
                currentLoopIndex,
                totalIterations: loopConfig.count,
              });
              terminal.log(`[LOOP_NODE] 单卷重写模式：当前卷已完成，不再回跳到下一卷`);
              // 标记循环完成
              await syncNodeStatus(node.id, { status: 'completed', loopConfig: { ...loopConfig, currentIndex: 0 } }, i);
              setEdgeAnimation(node.id, false);
              continue;
            }
            
            const outEdges = (workflowsRef.current.find(w => w.id === activeWorkflowId)?.edges || []).filter(
              e => e.source === node.id,
            );
            if (outEdges.length > 0) {
              let targetEdge =
                outEdges.find(e => {
                  const idx = sortedNodes.findIndex(sn => sn.id === e.target);
                  return idx !== -1 && idx <= i;
                }) || outEdges[0];

              const targetIndex = sortedNodes.findIndex(sn => sn.id === targetEdge.target);
              if (targetIndex !== -1) {
                const nodesToReset = sortedNodes.slice(targetIndex, i + 1);
                const resetNodeIds = new Set(nodesToReset.map(sn => sn.id));

                console.log('[LOOP_NODE] Nodes to reset:', { resetNodeIds: Array.from(resetNodeIds), targetIndex, sliceStart: targetIndex, sliceEnd: i });

                // 核心修复：获取下一个分卷的索引
                // 当用户指定从特定卷开始时，nextVolumeIndex 应基于用户指定的起始卷索引
                // currentLoopIndex 是刚完成的迭代次数（从 1 开始）
                // 下一个循环将处理第 (currentLoopIndex + 1) 轮迭代
                const nextLoopIndex = currentLoopIndex + 1; // 下一次循环的索引
                // 如果用户指定了起始卷，nextVolumeIndex = 用户指定的起始卷索引 + currentLoopIndex
                // 例如：用户指定从第4卷开始（索引3），完成第1轮后进入第2轮，应使用索引4（第5卷）
                // 如果用户没有指定，则使用默认逻辑：nextVolumeIndex = currentLoopIndex
                const nextVolumeIndex = userSpecifiedTargetVolumeIndex >= 0 
                  ? userSpecifiedTargetVolumeIndex + currentLoopIndex 
                  : currentLoopIndex;

                // 查找下一个分卷的配置
                let nextVolumeConfig: any = null;
                let nextFolderName = '';
                let nextVolumeId = '';

                // 尝试从 volumePlans 获取
                const volumePlans = workflowManager.getVolumePlans();
                if (volumePlans[nextVolumeIndex]) {
                  nextVolumeConfig = volumePlans[nextVolumeIndex];
                  nextFolderName = nextVolumeConfig.folderName || nextVolumeConfig.volumeName || '';
                }

                // 如果没找到，尝试从 multiCreateFolder 配置获取
                if (!nextFolderName) {
                  for (const n of nodesRef.current) {
                    if (n.data.typeKey === 'multiCreateFolder' && n.data.volumeFolderConfigs) {
                      const configs = n.data.volumeFolderConfigs as any[];
                      if (configs[nextVolumeIndex]) {
                        nextFolderName = configs[nextVolumeIndex].folderName || configs[nextVolumeIndex].volumeName || '';
                        break;
                      }
                    }
                  }
                }

                // 如果还没找到，尝试从 localNovel.volumes 获取
                if (!nextFolderName && localNovel.volumes && localNovel.volumes[nextVolumeIndex]) {
                  nextFolderName = localNovel.volumes[nextVolumeIndex].title || '';
                  nextVolumeId = localNovel.volumes[nextVolumeIndex].id;
                }

                console.log('[LOOP_NODE] Volume resolution:', {
                  nextLoopIndex: nextLoopIndex + 1,
                  nextVolumeIndex,
                  volumePlansLength: volumePlans.length,
                  volumePlansItem: volumePlans[nextVolumeIndex],
                  nextFolderName,
                  nextVolumeId,
                  localVolumesCount: localNovel.volumes?.length,
                });

                // 查找下一个分卷的 volumeId
                if (nextFolderName && localNovel.volumes) {
                  const nextVol = localNovel.volumes.find(v => v.title === nextFolderName);
                  if (nextVol) {
                    nextVolumeId = nextVol.id;
                  }
                }

                // Bug 3 修复：添加兜底逻辑，当 nextFolderName 仍然为空时，使用分卷索引作为回退方案
                if (!nextFolderName) {
                  nextFolderName = `第${nextVolumeIndex + 1}卷`;
                  terminal.warn(`[LOOP_NODE] Using fallback folder name: ${nextFolderName}`);
                }

                console.log('[LOOP_NODE] Switching to next volume:', {
                  nextLoopIndex: nextLoopIndex + 1,
                  nextVolumeIndex,
                  nextFolderName,
                  nextVolumeId,
                });

                const nextNodes = nodesRef.current.map(n => {
                  if (resetNodeIds.has(n.id)) {
                    if (n.id === node.id) {
                      return {
                        ...n,
                        data: {
                          ...n.data,
                          status: 'pending' as const,
                          loopConfig: { ...loopConfig, currentIndex: currentLoopIndex },
                        },
                      };
                    }

                    const typeKey = n.data.typeKey;
                    const updates: any = {
                      status: 'pending' as const,
                      label: typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
                    };

                    // 清除创作类节点的输出，以便重新生成
                    // 修复：扩大清空范围，包含世界观、角色、粗纲、大纲和灵感节点
                    if (['worldview', 'characters', 'plotOutline', 'outline', 'inspiration'].includes(typeKey)) {
                      updates.outputEntries = [];
                    }

                    // 清除章节节点的分卷目标，设置为下一个分卷
                    if (typeKey === 'chapter' && nextVolumeId) {
                      updates.targetVolumeId = nextVolumeId;
                      updates.targetVolumeName = nextFolderName;
                    }

                    // 更新节点的 folderName 为下一个分卷名称（适用于所有需要关联目录的节点）
                    if (nextFolderName && typeKey !== 'createFolder' && typeKey !== 'multiCreateFolder' && typeKey !== 'loopNode' && typeKey !== 'loopConfigurator' && typeKey !== 'pauseNode') {
                      updates.folderName = nextFolderName;
                    }

                    // 重置创作信息节点并确保清空 outputEntries（Bug 1 修复）
                    if (typeKey === 'creationInfo') {
                      updates.status = 'pending';
                      updates.outputEntries = [];  // 清空旧的创作信息，让下一卷重新生成
                    }

                    return {
                      ...n,
                      data: { ...n.data, ...updates },
                    };
                  }
                  return n;
                });

                nodesRef.current = nextNodes;
                setNodes(nextNodes);
                i = targetIndex - 1;
                workflowManager.setContextVar('loop_index', currentLoopIndex + 1);

                // 更新分卷索引和活动分卷
                if (nextVolumeIndex >= 0) {
                  workflowManager.setCurrentVolumeIndex(nextVolumeIndex);
                  // 核心修复：同步更新用户指定的卷索引，确保后续循环使用正确的卷
                  // 这样当用户从第4卷开始时，第2轮循环会正确进入第5卷
                }
                if (nextVolumeId) {
                  workflowManager.setActiveVolumeAnchor(nextVolumeId);
                }

                console.log('[LOOP_NODE] Jump back to index:', { targetIndex, newLoopIndex: currentLoopIndex + 1, nextFolderName, nextVolumeIndex });

                // Bug 1 修复：回跳前关闭当前节点的动画，防止动画状态泄漏
                setEdgeAnimation(node.id, false);
                
                await syncNodeStatus(
                  node.id,
                  { status: 'pending', loopConfig: { ...loopConfig, currentIndex: currentLoopIndex } },
                  i,
                );
                continue;
              }
            }
          } else {
            console.log('[LOOP_NODE] LOOP COMPLETE:', { totalIterations: loopConfig.count });
            
            volumeFolderDebugTracker.recordNodeExecution(
              node.id,
              'loopNode',
              node.data.label || '循环控制',
              'completed',
              { loopConfig, iterations: loopConfig.count }
            );
            
            await syncNodeStatus(node.id, { status: 'completed', loopConfig: { ...loopConfig, currentIndex: 0 } }, i);
            const inEdges = (workflowsRef.current.find(w => w.id === activeWorkflowId)?.edges || []).filter(
              e => e.target === node.id,
            );
            let maxTailIndex = i;
            inEdges.forEach(e => {
              const tailIdx = sortedNodes.findIndex(sn => sn.id === e.source);
              if (tailIdx > maxTailIndex) maxTailIndex = tailIdx;
            });
            if (maxTailIndex > i) i = maxTailIndex;
          }
          setEdgeAnimation(node.id, false);
          continue;
        }

        if (node.data.skipped) {
          const skippedNodes = nodesRef.current.map(n =>
            n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' as const } } : n,
          );
          nodesRef.current = skippedNodes;
          setNodes(skippedNodes);
          setEdgeAnimation(node.id, false);
          continue;
        }

        await syncNodeStatus(node.id, { status: 'executing' }, i);
        setEdgeAnimation(node.id, true);
        await new Promise(resolve => setTimeout(resolve, 50));

        if (['userInput', 'createFolder', 'reuseDirectory'].includes(node.data.typeKey as string)) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        const currentLoopIdxVar = workflowManager.getContextVar('loop_index') || 1;
        const nodeLoopInstructions = (node.data.loopInstructions as LoopInstruction[]) || [];
        const specificInstruction = nodeLoopInstructions.find(inst => inst.index === currentLoopIdxVar)?.content || '';
        let nodeLoopContext = specificInstruction
          ? `\n【第 ${currentLoopIdxVar} 轮循环特定指令】：\n${specificInstruction}\n`
          : '';

        // --- Create Folder / Reuse Directory ---
        if (node.data.typeKey === 'createFolder' || node.data.typeKey === 'reuseDirectory') {
          if (node.data.folderName) currentWorkflowFolder = node.data.folderName;
          if (node.data.typeKey === 'reuseDirectory') {
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            continue;
          }

          if (currentWorkflowFolder) {
            const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
              const existing = sets?.find(s => (s.name || s.title) === name);
              if (existing) return { id: existing.id, isNew: false, set: existing };
              const newSet = creator();
              return { id: newSet.id, isNew: true, set: newSet };
            };

            const updatedNovel = { ...localNovel };
            let changed = false;
            let volumeAnchorId = '';

            const existingVol = updatedNovel.volumes?.find(v => v.title === currentWorkflowFolder);
            if (existingVol) {
              volumeAnchorId = existingVol.id;
              workflowManager.setActiveVolumeAnchor(volumeAnchorId);
            } else {
              // 创建新分卷
              volumeAnchorId =
                typeof crypto.randomUUID === 'function'
                  ? crypto.randomUUID()
                  : Date.now().toString(36) + Math.random().toString(36).substring(2);
              const newVolume: any = {
                id: volumeAnchorId,
                title: currentWorkflowFolder,
                collapsed: false,
              };
              updatedNovel.volumes = [...(updatedNovel.volumes || []), newVolume];
              changed = true;
              workflowManager.setActiveVolumeAnchor(volumeAnchorId);
            }

            const types = [
              'worldviewSets',
              'characterSets',
              'outlineSets',
              'inspirationSets',
              'plotOutlineSets',
            ] as const;
            const prefix = ['wv', 'char', 'out', 'insp', 'plot'] as const;

            types.forEach((type, idx) => {
              const res = createSetIfNotExist(updatedNovel[type], currentWorkflowFolder, () => ({
                id: `${prefix[idx]}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: currentWorkflowFolder,
                entries: [],
                characters: [],
                items: [], // generic enough
              }));
              if (res.isNew) {
                (updatedNovel as any)[type] = [...(updatedNovel[type] || []), res.set];
                changed = true;
              }
            });

            if (changed) await updateLocalAndGlobal(updatedNovel);

            const nextNodesAfterFolder = nodesRef.current.map(n => ({
              ...n,
              data: {
                ...n.data,
                // 仅自动将生成的章节关联到新创建的分卷，除非用户已手动指定
                targetVolumeId:
                  n.data.typeKey === 'chapter' && (!n.data.targetVolumeId || n.data.targetVolumeId === '')
                    ? volumeAnchorId
                    : n.data.targetVolumeId,
              },
            }));
            nodesRef.current = nextNodesAfterFolder;
            setNodes(nextNodesAfterFolder);
          }
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdgeAnimation(node.id, false);
          continue;
        }

        // --- Multi Create Folder Node (多分卷目录初始化) ---
        if (node.data.typeKey === 'multiCreateFolder') {
          console.log('[MULTI_CREATE_FOLDER] === START ===', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeIndex: i,
            totalNodes: sortedNodes.length,
          });
          
          volumeFolderDebugTracker.startTracking(
            workflowManager.getCurrentVolumeIndex(),
            'unknown',
            'multiCreateFolder',
            {
              currentNodeIndex: i,
              currentNodeType: 'multiCreateFolder',
              currentNodeId: node.id,
              loopIndex: workflowManager.getContextVar('loop_index') || 1,
              totalVolumes: workflowManager.getTotalVolumes(),
            }
          );
          
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          
          let volumeFolderConfigs = (node.data.volumeFolderConfigs || []) as any[];
          
          console.log('[MULTI_CREATE_FOLDER] Initial configs:', {
            length: volumeFolderConfigs.length,
            configs: volumeFolderConfigs,
          });
          
          // Bug修复：始终优先使用 saveToVolume 节点的 volumes 数据来确保分卷名称一致
          // 因为 multiCreateFolder 的 volumeFolderConfigs 可能包含不一致的名称
          let foundVolumes: any[] = [];
          for (let j = 0; j < i; j++) {
            const prevNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
            if (prevNode.data.typeKey === 'saveToVolume' && prevNode.data.volumes) {
              foundVolumes = Array.isArray(prevNode.data.volumes) ? prevNode.data.volumes : [];
              if (foundVolumes.length > 0) {
                terminal.log(`[MultiCreateFolder] Found ${foundVolumes.length} volumes from saveToVolume node "${prevNode.data.label}"`);
              }
              break;
            }
          }

          if (foundVolumes.length > 0) {
            // 使用从 saveToVolume 节点获取的完整分卷列表（强制覆盖，确保名称一致）
            volumeFolderConfigs = foundVolumes.map((vol: any, idx: number) => ({
              id: vol.id || `vol_${idx}`,
              volumeName: vol.volumeName || vol.folderName || `第${idx + 1}卷`,
              folderName: vol.folderName || vol.volumeName || `第${idx + 1}卷`,
              startChapter: vol.startChapter,
              endChapter: vol.endChapter,
              description: vol.description,
              processed: vol.processed || false,
            }));
            terminal.log(`[MultiCreateFolder] Overridden volumeFolderConfigs with saveToVolume data: ${volumeFolderConfigs.length} volumes`);
            for (let vcIdx = 0; vcIdx < volumeFolderConfigs.length; vcIdx++) {
              terminal.log(`  [${vcIdx}] ${volumeFolderConfigs[vcIdx].volumeName} (folder: ${volumeFolderConfigs[vcIdx].folderName}) chapters: ${volumeFolderConfigs[vcIdx].startChapter}-${volumeFolderConfigs[vcIdx].endChapter}`);
            }
          } else if (node.data.volumeFolderConfigs && node.data.volumeFolderConfigs.length > 0) {
            // 兜底：使用节点自带的配置，但发出警告
            terminal.warn(`[MultiCreateFolder] No saveToVolume found, using node's own volumeFolderConfigs (names may be inconsistent)`);
          }
          
          if (volumeFolderConfigs.length === 0) {
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            setEdgeAnimation(node.id, false);
            continue;
          }

          // 核心修复：根据当前进度确定应该处理哪个分卷
          // 最高优先级：用户指定的卷索引
          // 其次：workflowManager 中的索引
          // 最后：根据当前章节数进行校准
          let currentVolumeIndex = userSpecifiedTargetVolumeIndex >= 0 
            ? userSpecifiedTargetVolumeIndex 
            : workflowManager.getCurrentVolumeIndex();
          
          // 如果工作流是从中间恢复的，需要根据当前章节数校准分卷索引
          const currentChapterCount = (localNovel.chapters || []).filter(
            c => !c.subtype || c.subtype === 'story'
          ).length;
          
          if (currentChapterCount > 0) {
            // 根据当前章节数找到应该所在的分卷
            for (let vIdx = 0; vIdx < volumeFolderConfigs.length; vIdx++) {
              const cfg = volumeFolderConfigs[vIdx];
              const startChapter = cfg.startChapter || 1;
              const endChapter = cfg.endChapter || Infinity;
              
              if (currentChapterCount >= startChapter && currentChapterCount <= endChapter) {
                currentVolumeIndex = vIdx;
                break;
              }
              // 如果当前章节超过了这个分卷的结束章节，继续检查下一个分卷
              if (currentChapterCount > endChapter && vIdx === volumeFolderConfigs.length - 1) {
                currentVolumeIndex = vIdx;
              }
            }
          }
          
          // 确保 currentVolumeIndex 在有效范围内
          currentVolumeIndex = Math.min(currentVolumeIndex, volumeFolderConfigs.length - 1);
          currentVolumeIndex = Math.max(currentVolumeIndex, 0);
          
          console.log('[MULTI_CREATE_FOLDER] Volume index calculation:', {
            calculatedIndex: currentVolumeIndex,
            chapterCount: currentChapterCount,
            totalVolumes: volumeFolderConfigs.length,
            volumeConfigs: volumeFolderConfigs.map((c: any) => ({
              name: c.folderName || c.volumeName,
              startChapter: c.startChapter,
              endChapter: c.endChapter,
            })),
          });
          
          // 更新 workflowManager 和节点数据
          workflowManager.setCurrentVolumeIndex(currentVolumeIndex);
          workflowManager.setTotalVolumes(volumeFolderConfigs.length);
          
          console.log(`[MultiCreateFolder] Processing all volumes, currentVolumeIndex: ${currentVolumeIndex}, total volumes: ${volumeFolderConfigs.length}`);

          // 创建分卷和对应的集合
          const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
            const existing = sets?.find(s => (s.name || s.title) === name);
            if (existing) return { id: existing.id, isNew: false, set: existing };
            const newSet = creator();
            return { id: newSet.id, isNew: true, set: newSet };
          };

          const updatedNovel = { ...localNovel };
          let changed = false;
          let volumeAnchorId = '';
          
          // 遍历所有分卷配置，为缺失的卷创建文件夹
          const types = [
            'worldviewSets',
            'characterSets',
            'outlineSets',
            'inspirationSets',
            'plotOutlineSets',
          ] as const;
          const prefix = ['wv', 'char', 'out', 'insp', 'plot'] as const;
          
          let lastCreatedVolumeId = '';
          let lastCreatedVolumeName = '';
          
          for (let volIdx = 0; volIdx < volumeFolderConfigs.length; volIdx++) {
            const cfg = volumeFolderConfigs[volIdx];
            const folderName = cfg.folderName || cfg.volumeName;
            
            console.log(`[MULTI_CREATE_FOLDER] Processing volume ${volIdx}: ${folderName}`);
            
            const existingVol = updatedNovel.volumes?.find(v => v.title === folderName);
            
            if (existingVol) {
              console.log(`[MULTI_CREATE_FOLDER] Volume "${folderName}" already exists, skipping`);
              if (volIdx === currentVolumeIndex) {
                volumeAnchorId = existingVol.id;
                workflowManager.setActiveVolumeAnchor(volumeAnchorId);
              }
              continue;
            }
            
            // 创建新的分卷
            console.log(`[MULTI_CREATE_FOLDER] Creating NEW volume: ${folderName}`);
            const newVolId =
              typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : Date.now().toString(36) + Math.random().toString(36).substring(2);
            const newVolume: any = {
              id: newVolId,
              title: folderName,
              collapsed: false,
            };
            updatedNovel.volumes = [...(updatedNovel.volumes || []), newVolume];
            changed = true;
            
            console.log(`[MULTI_CREATE_FOLDER] New volume created: ${folderName} (${newVolId})`);
            
            // 创建对应的 Sets
            types.forEach((type, typeIdx) => {
              const res = createSetIfNotExist(updatedNovel[type], folderName, () => ({
                id: `${prefix[typeIdx]}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: folderName,
                entries: [],
                characters: [],
                items: [],
              }));
              if (res.isNew) {
                (updatedNovel as any)[type] = [...(updatedNovel[type] || []), res.set];
                console.log(`[MULTI_CREATE_FOLDER] Created new ${type} for ${folderName}`);
              }
            });
            
            lastCreatedVolumeId = newVolId;
            lastCreatedVolumeName = folderName;
            
            // 如果这是当前应该活动的卷，设置它
            if (volIdx === currentVolumeIndex) {
              volumeAnchorId = newVolId;
              workflowManager.setActiveVolumeAnchor(volumeAnchorId);
            }
          }
          
          // 如果没有找到当前卷但有刚创建的卷，使用刚创建的最后一个卷
          if (!volumeAnchorId && lastCreatedVolumeId) {
            volumeAnchorId = lastCreatedVolumeId;
            workflowManager.setActiveVolumeAnchor(volumeAnchorId);
            console.log(`[MULTI_CREATE_FOLDER] Set active volume to last created: ${lastCreatedVolumeName} (${lastCreatedVolumeId})`);
          }
          
          currentWorkflowFolder = volumeFolderConfigs[currentVolumeIndex]?.folderName || volumeFolderConfigs[currentVolumeIndex]?.volumeName || '';

          // Bug 2 修复：设置分卷终止章配置，使用 volumeEndChapters 机制
          const currentConfig = volumeFolderConfigs[currentVolumeIndex];
          if (currentConfig?.endChapter) {
            const endChapterConfigs = volumeFolderConfigs
              .filter((cfg: any) => cfg.endChapter)
              .map((cfg: any, cfgIdx: number) => ({
                volumeId: `vol_idx_${cfgIdx}`,
                volumeName: cfg.volumeName || cfg.folderName,
                endChapterTitle: `第${cfg.endChapter}章`,
                processed: false,
              }));
            
            if (endChapterConfigs.length > 0) {
              workflowManager.setVolumeEndChapters(endChapterConfigs);
              console.log(`[MULTI_CREATE_FOLDER] Set ${endChapterConfigs.length} volume end chapter configs`);
            }
            
            // 同时设置当前分卷的终止章触发规则
            const endChapterRule = {
              id: `end_chapter_${Date.now()}`,
              nextVolumeName: volumeFolderConfigs[currentVolumeIndex + 1]?.volumeName || '',
              endChapter: currentConfig.endChapter,
              processed: false,
            };
            workflowManager.setPendingSplits([endChapterRule]);
          }

          // 更新后续节点的目标分卷
          const nextNodesAfterFolder = nodesRef.current.map(n => ({
            ...n,
            data: {
              ...n.data,
              targetVolumeId:
                n.data.typeKey === 'chapter' && (!n.data.targetVolumeId || n.data.targetVolumeId === '')
                  ? volumeAnchorId
                  : n.data.targetVolumeId,
            },
          }));
          nodesRef.current = nextNodesAfterFolder;
          setNodes(nextNodesAfterFolder);

          // 如果有变化，保存更新
          if (changed) {
            console.log('[MULTI_CREATE_FOLDER] Calling updateLocalAndGlobal:', {
              updatedNovelVolumes: updatedNovel.volumes?.length,
            });
            await updateLocalAndGlobal(updatedNovel);
          }

          // 更新节点的 currentVolumeIndex 以便下次执行时使用
          await syncNodeStatus(node.id, { 
            status: 'completed', 
            currentVolumeIndex,
            volumeFolderConfigs 
          }, i);
          setEdgeAnimation(node.id, false);
          
          console.log('[MULTI_CREATE_FOLDER] === END ===', {
            nodeId: node.id,
            volumeIndex: currentVolumeIndex,
            currentWorkflowFolder,
            volumeAnchorId,
            totalVolumesCreated: updatedNovel.volumes?.length,
          });
          
          volumeFolderDebugTracker.finishTracking();
          
          continue;
        }

        // --- Loop Configurator Node (循环配置器) ---
        if (node.data.typeKey === 'loopConfigurator') {
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          
          let globalLoopConfig = node.data.globalLoopConfig;
          let globalLoopInstructions = node.data.globalLoopInstructions;

          // 如果启用AI生成，则调用AI生成循环配置
          if (node.data.useAiGeneration) {
            // 收集前置节点产出（结构化：全局输入在第一个，其他按顺序）
            let previousContext = '';
            
            // 1. 首先收集全局输入（userInput节点）
            for (let j = 0; j < i; j++) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
              if (pNode.data.typeKey === 'userInput') {
                previousContext += `\n## 📥 全局输入\n`;
                previousContext += `**节点**: ${pNode.data.label}\n`;
                if (pNode.data.instruction) {
                  previousContext += `**用户指令**:\n${pNode.data.instruction}\n`;
                }
                if (pNode.data.outputEntries && (pNode.data.outputEntries as any[]).length > 0) {
                  previousContext += `**输出内容**:\n`;
                  (pNode.data.outputEntries as any[]).forEach((entry: any) => {
                    previousContext += `- ${entry.title}: ${entry.content?.substring(0, 800)}\n`;
                  });
                }
                break;
              }
            }
            
            // 2. 然后按顺序收集其他节点（排除userInput）
            const otherNodes: string[] = [];
            for (let j = 0; j < i; j++) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
              if (pNode.data.typeKey === 'userInput') continue;
              if (pNode.data.typeKey === 'saveToVolume' || pNode.data.typeKey === 'multiCreateFolder') continue;
              
              if (pNode.data.outputEntries && (pNode.data.outputEntries as any[]).length > 0) {
                let nodeContent = `\n### 📦 节点 ${j + 1}: ${pNode.data.label} (${pNode.data.typeLabel})\n`;
                (pNode.data.outputEntries as any[]).forEach((entry: any) => {
                  nodeContent += `**${entry.title}**:\n${entry.content?.substring(0, 800)}\n`;
                });
                otherNodes.push(nodeContent);
              }
            }
            
            if (otherNodes.length > 0) {
              previousContext += `\n## 📚 前置节点产出（按执行顺序）\n`;
              previousContext += otherNodes.join('');
            }

            // 收集后续节点列表
            let subsequentNodes = '';
            for (let j = i + 1; j < sortedNodes.length; j++) {
              const sNode = sortedNodes[j];
              subsequentNodes += `- ${sNode.data.label} (${sNode.data.typeLabel})\n`;
            }

            // 收集分卷规划信息（核心修复：解决循环指令与分卷不对应的问题）
            let volumePlanningInfo = '';
            let volumeConfigs: { name: string; chapters: string }[] = [];
            
            // 调试：打印所有前置节点的类型
            terminal.log(`[循环配置器] 开始收集分卷信息，当前节点索引: ${i}, sortedNodes数量: ${sortedNodes.length}`);
            terminal.log(`[循环配置器] nodesRef.current数量: ${nodesRef.current.length}`);
            
            for (let j = 0; j < i; j++) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id);
              const sNode = sortedNodes[j];
              terminal.log(`[循环配置器] 节点${j}: ${sNode.data.label}, typeKey: ${sNode.data.typeKey}, nodesRef中有: ${!!pNode}`);
              if (pNode) {
                terminal.log(`[循环配置器]   nodesRef中数据 - volumes: ${(pNode.data.volumes as any[])?.length || 0}, splitRules: ${(pNode.data.splitRules as any[])?.length || 0}`);
              }
            }
            
            // 1. 从 saveToVolume 节点收集分卷规则
            for (let j = 0; j < i; j++) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
              if (pNode.data.typeKey === 'saveToVolume') {
                // 核心修复：优先使用完整的 volumes 数组（包含所有分卷信息）
                const volumes = (pNode.data.volumes as any[]) || [];
                const splitRules = (pNode.data.splitRules as any[]) || [];
                
                if (volumes.length > 0) {
                  // 使用完整的分卷列表（包含第一卷）
                  volumePlanningInfo += `\n### 分卷规划节点: ${pNode.data.label}\n`;
                  volumePlanningInfo += `共 ${volumes.length} 个分卷:\n`;
                  volumes.forEach((vol, idx) => {
                    const chapterRange = vol.startChapter 
                      ? (vol.endChapter ? `第${vol.startChapter}-${vol.endChapter}章` : `第${vol.startChapter}章起`)
                      : '未指定章节范围';
                    volumePlanningInfo += `${idx + 1}. ${vol.volumeName || vol.folderName || `第${idx + 1}卷`} (${chapterRange})\n`;
                    volumeConfigs.push({ 
                      name: vol.volumeName || vol.folderName || `第${idx + 1}卷`, 
                      chapters: chapterRange 
                    });
                  });
                  terminal.log(`[循环配置器] 从 volumes 获取到 ${volumes.length} 个分卷信息`);
                } else if (splitRules.length > 0) {
                  // 兜底：使用 splitRules（注意：这只包含从第2卷开始的规则）
                  volumePlanningInfo += `\n### 分卷规划节点: ${pNode.data.label}\n`;
                  volumePlanningInfo += `注意：以下仅包含分卷切换规则（缺少第一卷信息）:\n`;
                  splitRules.forEach((rule) => {
                    volumePlanningInfo += `- 触发章节: ${rule.chapterTitle} → 新分卷: ${rule.nextVolumeName}\n`;
                    volumeConfigs.push({ name: rule.nextVolumeName, chapters: rule.chapterTitle });
                  });
                  terminal.warn(`[循环配置器] splitRules 不包含第一卷信息，可能导致循环指令数量不匹配`);
                }
                // 也收集 AI 生成的分卷内容
                if (pNode.data.volumeContent) {
                  volumePlanningInfo += `\n分卷规划详情:\n${pNode.data.volumeContent.substring(0, 1500)}\n`;
                }
              }
            }
            
            // 2. 从 multiCreateFolder 节点收集多分卷配置
            for (let j = 0; j < i; j++) {
              const pNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
              if (pNode.data.typeKey === 'multiCreateFolder') {
                const volConfigs = (pNode.data.volumeFolderConfigs as any[]) || [];
                if (volConfigs.length > 0) {
                  volumePlanningInfo += `\n### 多分卷目录节点: ${pNode.data.label}\n`;
                  volumePlanningInfo += `共 ${volConfigs.length} 个分卷:\n`;
                  volConfigs.forEach((cfg, idx) => {
                    const chapterRange = cfg.startChapter 
                      ? (cfg.endChapter ? `第${cfg.startChapter}-${cfg.endChapter}章` : `第${cfg.startChapter}章起`)
                      : '未指定章节范围';
                    volumePlanningInfo += `${idx + 1}. ${cfg.volumeName || cfg.folderName} (${chapterRange})\n`;
                    volumeConfigs.push({ 
                      name: cfg.volumeName || cfg.folderName, 
                      chapters: chapterRange 
                    });
                  });
                }
              }
            }
            
            // 3. 从后续节点中检测循环执行器，推断循环结构
            let loopStructureInfo = '';
            let loopNodeCount = 0;
            for (let j = i + 1; j < sortedNodes.length; j++) {
              const sNode = sortedNodes[j];
              if (sNode.data.typeKey === 'loopNode') {
                loopNodeCount++;
                const loopCount = sNode.data.loopConfig?.count || 1;
                loopStructureInfo += `- 发现循环执行器: ${sNode.data.label} (计划循环 ${loopCount} 次)\n`;
              }
            }
            if (loopNodeCount > 0) {
              loopStructureInfo = `\n### 后续循环结构\n${loopStructureInfo}`;
            }

            // 获取AI配置
            const aiApiKey = node.data.overrideAiConfig && node.data.apiKey ? node.data.apiKey : globalConfig.apiKey;
            const aiBaseUrl = node.data.overrideAiConfig && node.data.baseUrl ? node.data.baseUrl : globalConfig.baseUrl;
            const aiModel = node.data.overrideAiConfig && node.data.model ? node.data.model : globalConfig.model;
            const aiTemp = node.data.overrideAiConfig && node.data.temperature !== undefined ? node.data.temperature : 0.7;

            const configuratorOpenai = new OpenAI({
              apiKey: aiApiKey,
              baseURL: aiBaseUrl,
              dangerouslyAllowBrowser: true,
            });

            // 构建 AI 请求消息
            const nodePromptItems = (node.data.promptItems as GeneratorPrompt[]) || [];
            let configuratorMessages: any[] = [];

            if (nodePromptItems.length > 0) {
              // 使用自定义提示词条目
              const customPrompts = nodePromptItems
                .filter(p => p.enabled !== false)
                .map(p => {
                  let content = p.content
                    .replace('{{previous_context}}', previousContext || '（无前置节点产出）')
                    .replace('{{subsequent_nodes}}', subsequentNodes || '（无后续节点）')
                    .replace('{{user_instruction}}', node.data.instruction || '请智能生成适合的循环配置')
                    .replace('{{volume_planning}}', volumePlanningInfo || '（无分卷规划）')
                    .replace('{{loop_structure}}', loopStructureInfo || '（无循环结构信息）');
                  content = workflowManager.interpolateWithMacros(content, macroCtx);
                  return { role: p.role, content };
                });
              configuratorMessages.push(...customPrompts);
            } else {
              // 默认消息
              configuratorMessages = [
                { role: 'system', content: LOOP_CONFIGURATOR_PROMPT },
                {
                  role: 'user',
                  content: `请根据以下信息生成循环配置：

## 前置节点产出
${previousContext || '（无前置节点产出）'}

## 分卷规划信息
${volumePlanningInfo || '（无分卷规划）'}

## 后续循环结构
${loopStructureInfo || '（无循环结构信息）'}

## 后续节点列表
${subsequentNodes || '（无后续节点）'}

## 用户指令
${node.data.instruction || '请智能生成适合的循环配置'}

**重要提示**：
- 如果存在分卷规划，请确保循环指令与分卷对应
- 每个分卷的循环指令应体现该卷的核心剧情推进
- 循环次数应与分卷数量或章节总数相匹配

请生成循环配置JSON。`,
                },
              ];
            }

            let aiResponse = '';
            let retryCount = 0;
            const maxRetries = 2;
            let success = false;
            
            // 计算分卷总数量（用于补足机制）
            const totalVolumeCount = volumeConfigs.length;
            let supplementAttempts = 0;
            const maxSupplementAttempts = 2;

            while (retryCount <= maxRetries && !success) {
              if (retryCount > 0) {
                await new Promise(res => setTimeout(res, 2000));
              }

              try {
                console.groupCollapsed(
                  `[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${retryCount > 0 ? ` (重试 ${retryCount})` : ''}`,
                );
                console.log('Messages:', configuratorMessages);
                console.log('Config:', { model: aiModel, temperature: aiTemp });
                console.groupEnd();

                terminal.log(`
>> AI REQUEST [循环配置器]
>> Model: ${aiModel}
>> Temperature: ${aiTemp}
>> -----------------------------------------------------------
`);

                const completion = await configuratorOpenai.chat.completions.create(
                  { model: aiModel, messages: configuratorMessages, temperature: aiTemp } as any,
                  { signal: abortControllerRef.current?.signal },
                );

                aiResponse = completion.choices[0]?.message?.content || '';
                
                if (aiResponse) {
                  // 解析AI返回的JSON
                  const cleanJson = aiResponse.replace(/```json\s*([\s\S]*?)```/gi, '$1').trim();
                  const parsedConfig = JSON.parse(cleanJson);

                  if (parsedConfig.loopConfig) {
                    globalLoopConfig = parsedConfig.loopConfig;
                  }
                  if (parsedConfig.loopInstructions) {
                    globalLoopInstructions = parsedConfig.loopInstructions;
                  }

                  // 核心修复：补足机制 - 检查循环指令数量是否与分卷数量匹配
                  const instructionCount = (globalLoopInstructions as any[])?.length || 0;
                  const loopCount = globalLoopConfig?.count || 1;
                  
                  if (totalVolumeCount > 0 && (instructionCount < totalVolumeCount || loopCount < totalVolumeCount)) {
                    terminal.log(`[循环配置器] 检测到指令不足: 分卷${totalVolumeCount}个, 指令${instructionCount}条, 循环次数${loopCount}`);
                    
                    if (supplementAttempts < maxSupplementAttempts) {
                      supplementAttempts++;
                      
                      // 构建补足请求
                      const existingInstructions = (globalLoopInstructions as any[]) || [];
                      const existingIndices = existingInstructions.map((inst: any) => inst.index);
                      const missingIndices = [];
                      for (let v = 1; v <= totalVolumeCount; v++) {
                        if (!existingIndices.includes(v)) {
                          missingIndices.push(v);
                        }
                      }
                      
                      const supplementMessage = {
                        role: 'user' as const,
                        content: `**重要：循环指令数量不足，需要补足**

当前分卷总数：${totalVolumeCount} 个分卷
已生成循环指令：${instructionCount} 条
缺失的循环索引：${missingIndices.join(', ')}

已生成的循环指令：
${JSON.stringify(existingInstructions, null, 2)}

分卷详情：
${volumeConfigs.map((v, idx) => `${idx + 1}. ${v.name} (${v.chapters})`).join('\n')}

请补足缺失的循环指令，确保：
1. 循环次数 (loopConfig.count) 必须设置为 ${totalVolumeCount}
2. 补足所有缺失索引的循环指令
3. 每条指令应对应一个分卷的剧情推进

请返回完整的JSON配置（包含已有的和新增的指令）。`,
                      };
                      
                      // 添加补足请求到消息列表
                      configuratorMessages.push(
                        { role: 'assistant' as const, content: aiResponse },
                        supplementMessage
                      );
                      
                      terminal.log(`[循环配置器] 发起补足请求，缺失索引: ${missingIndices.join(', ')}`);
                      continue; // 继续循环，让AI补足
                    } else {
                      terminal.warn(`[循环配置器] 补足尝试已达上限，使用当前配置`);
                      // 自动补足：如果AI补足失败，手动创建占位指令
                      const existingIndices = new Set((globalLoopInstructions as any[])?.map((inst: any) => inst.index) || []);
                      for (let v = 1; v <= totalVolumeCount; v++) {
                        if (!existingIndices.has(v)) {
                          const volumeName = volumeConfigs[v - 1]?.name || `第${v}卷`;
                          (globalLoopInstructions as any[]).push({
                            index: v,
                            content: `【${volumeName}】推进本卷核心剧情，完成角色成长和冲突发展。`,
                          });
                        }
                      }
                      // 更新循环次数
                      if (!globalLoopConfig || globalLoopConfig.count < totalVolumeCount) {
                        globalLoopConfig = { enabled: true, count: totalVolumeCount };
                      }
                      terminal.log(`[循环配置器] 自动补足完成: ${totalVolumeCount}条指令`);
                    }
                  }

                  success = true;

                  // 保存生成结果到节点
                  const updatedNode = nodesRef.current.find(n => n.id === node.id);
                  if (updatedNode) {
                    updatedNode.data.globalLoopConfig = globalLoopConfig;
                    updatedNode.data.globalLoopInstructions = globalLoopInstructions;
                    updatedNode.data.generatedLoopConfig = aiResponse;
                    setNodes([...nodesRef.current]);
                  }

                  terminal.log(`[循环配置器] AI生成完成: 循环${globalLoopConfig?.count || 1}次, ${(globalLoopInstructions as any[])?.length || 0}条指令`);
                } else {
                  retryCount++;
                }
              } catch (err: any) {
                if (err.name === 'AbortError' || /aborted/i.test(err.message)) throw err;
                if (retryCount < maxRetries) {
                  retryCount++;
                  terminal.error(`[循环配置器] 重试 ${retryCount}: ${err.message}`);
                  continue;
                }
                terminal.error(`[循环配置器] AI生成失败: ${err}`);
                // 使用默认配置
                break;
              }
            }
          }

          // 将全局循环配置应用到后续的循环执行器节点
          if (globalLoopConfig) {
            const nextNodes = nodesRef.current.map(n => {
              if (n.data.typeKey === 'loopNode') {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    loopConfig: { ...n.data.loopConfig, ...globalLoopConfig },
                  },
                };
              }
              return n;
            });
            nodesRef.current = nextNodes;
            setNodes(nextNodes);
          }

          // 将全局循环指令仅应用到粗纲节点和大纲节点
          if (globalLoopInstructions && (globalLoopInstructions as any[]).length > 0) {
            const nextNodes = nodesRef.current.map(n => {
              if (n.data.typeKey === 'plotOutline' || n.data.typeKey === 'outline') {
                const existingInstructions = (n.data.loopInstructions as any[]) || [];
                const mergedInstructions = [...existingInstructions];
                (globalLoopInstructions as any[]).forEach(gi => {
                  const existingIdx = mergedInstructions.findIndex(ei => ei.index === gi.index);
                  if (existingIdx === -1) {
                    mergedInstructions.push(gi);
                  }
                });
                return {
                  ...n,
                  data: {
                    ...n.data,
                    loopInstructions: mergedInstructions,
                  },
                };
              }
              return n;
            });
            nodesRef.current = nextNodes;
            setNodes(nextNodes);
          }

          // 修复：循环配置器完成时设置 outputEntries，确保生成的内容能传递给后续节点
          const loopConfigOutputEntries: OutputEntry[] = [];
          if (globalLoopConfig) {
            loopConfigOutputEntries.push({
              id: `loop_cfg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              title: '循环配置',
              content: `循环次数: ${globalLoopConfig.count || 1}`,
            });
          }
          if (globalLoopInstructions && (globalLoopInstructions as any[]).length > 0) {
            const instructionsContent = (globalLoopInstructions as any[])
              .map((inst: any) => `第${inst.index}轮: ${inst.content}`)
              .join('\n');
            loopConfigOutputEntries.push({
              id: `loop_inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              title: '循环指令',
              content: instructionsContent,
            });
          }
          if (node.data.generatedLoopConfig) {
            loopConfigOutputEntries.push({
              id: `loop_raw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              title: '循环配置原始输出',
              content: node.data.generatedLoopConfig,
            });
          }

          await syncNodeStatus(node.id, { 
            status: 'completed',
            outputEntries: loopConfigOutputEntries.length > 0 ? loopConfigOutputEntries : undefined,
          }, i);
          setEdgeAnimation(node.id, false);
          continue;
        }

        if (node.data.typeKey === 'creationInfo') {
          console.log('[CREATION_INFO] === START ===', {
            nodeId: node.id,
            nodeLabel: node.data.label,
            nodeIndex: i,
            hasInstruction: !!node.data.instruction,
          });
          
          volumeFolderDebugTracker.recordNodeExecution(
            node.id,
            'creationInfo',
            node.data.label || '创作信息',
            'executing',
            { instruction: node.data.instruction }
          );
          
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          
          const interpolatedInput = workflowManager.interpolateWithMacros(node.data.instruction, macroCtx);
          
          const activeVolumeId = workflowManager.getActiveVolumeAnchor();
          const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
          
          console.log('[CREATION_INFO] workflowManager state:', {
            activeVolumeId,
            currentVolumeIndex,
            loopIndex: workflowManager.getContextVar('loop_index') || 1,
            volumePlans: workflowManager.getVolumePlans().length,
            pendingSplits: workflowManager.getPendingSplits().length,
          });
          
          console.log('[CREATION_INFO] Current state:', {
            activeVolumeId,
            currentVolumeIndex,
            loopIndex: workflowManager.getContextVar('loop_index') || 1,
          });
          
          // 从 multiCreateFolder 节点获取分卷配置
          let totalVolumesFromMultiFolder = 0;
          let currentVolumeConfigFromMulti: any = null;
          for (let j = 0; j < i; j++) {
            const prevNode = nodesRef.current.find(n => n.id === sortedNodes[j].id) || sortedNodes[j];
            if (prevNode.data.typeKey === 'multiCreateFolder' && prevNode.data.volumeFolderConfigs) {
              const configs = prevNode.data.volumeFolderConfigs as any[];
              totalVolumesFromMultiFolder = configs.length;
              if (configs[currentVolumeIndex]) {
                currentVolumeConfigFromMulti = configs[currentVolumeIndex];
              }
              console.log('[CREATION_INFO] Found multiCreateFolder node:', {
                nodeId: prevNode.id,
                totalVolumes: totalVolumesFromMultiFolder,
                currentConfig: currentVolumeConfigFromMulti,
              });
              break;
            }
          }
          
          // 优先使用分卷配置中的总数
          const totalVolumes = totalVolumesFromMultiFolder > 0 ? totalVolumesFromMultiFolder : (localNovel.volumes?.length || 0);
          
          console.log('[CREATION_INFO] Volume info:', {
            totalVolumes,
            totalVolumesFromMultiFolder,
            localNovelVolumesCount: localNovel.volumes?.length || 0,
          });
          
          let volumeInfoMessage = '';
          if (activeVolumeId && localNovel.volumes) {
            const activeVolume = localNovel.volumes.find(v => v.id === activeVolumeId);
            if (activeVolume) {
              volumeInfoMessage = `\n当前分卷：${activeVolume.title}`;
              console.log('[CREATION_INFO] Active volume found:', {
                volumeId: activeVolumeId,
                volumeTitle: activeVolume.title,
              });
            }
          }
          
          if (totalVolumes > 0) {
            volumeInfoMessage += `\n分卷进度：第 ${currentVolumeIndex + 1} 卷 / 共 ${totalVolumes} 卷`;
          }
          
          const loopIndex = workflowManager.getContextVar('loop_index') || 1;
          volumeInfoMessage += `\n当前循环轮次：第 ${loopIndex} 轮`;
          
          if (node.data.variableBinding?.length)
            workflowManager.processVariableBindings(node.data.variableBinding, interpolatedInput);
          
          const outputEntry = {
            id: `creation_info_${Date.now()}`,
            title: '创作信息',
            content: `${volumeInfoMessage}${interpolatedInput ? '\n\n用户指令：' + interpolatedInput : ''}`
          };
          
          console.log('[CREATION_INFO] Creating output entry:', { outputEntry });
          
          await syncNodeStatus(node.id, { 
            status: 'completed',
            outputEntries: [outputEntry]
          }, i);
          
          volumeFolderDebugTracker.recordNodeExecution(
            node.id,
            'creationInfo',
            node.data.label || '创作信息',
            'completed',
            { outputEntry }
          );
          
          setEdgeAnimation(node.id, false);
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          
          const interpolatedInput = workflowManager.interpolateWithMacros(node.data.instruction, macroCtx);
          if (node.data.variableBinding?.length)
            workflowManager.processVariableBindings(node.data.variableBinding, interpolatedInput);
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdgeAnimation(node.id, false);
          continue;
        }

        // --- Workflow Generator ---
        if (node.data.typeKey === 'workflowGenerator') {
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);
          
          if (nodesRef.current.length > 1) throw new Error('架构师节点必须在空画布上运行。');
          const genPresets = (allPresets as any).generator || [];
          const genPreset = genPresets.find((p: any) => p.id === node.data.presetId) || genPresets[0];
          const genOpenai = new OpenAI({
            apiKey:
              node.data.overrideAiConfig && node.data.apiKey
                ? node.data.apiKey
                : genPreset?.apiConfig?.apiKey || globalConfig.apiKey,
            baseURL:
              node.data.overrideAiConfig && node.data.baseUrl
                ? node.data.baseUrl
                : genPreset?.apiConfig?.baseUrl || globalConfig.baseUrl,
            dangerouslyAllowBrowser: true,
          });

          let generatorMessages: any[] = [];
          if (node.data.overrideAiConfig && node.data.promptItems?.length) {
            generatorMessages = node.data.promptItems
              .filter((p: any) => p.enabled !== false)
              .map((p: any) => ({
                role: p.role,
                content: p.content.replace('{{context}}', WORKFLOW_DSL_PROMPT),
              }));
            if (node.data.instruction) generatorMessages.push({ role: 'user', content: node.data.instruction });
          } else if (genPreset?.prompts) {
            generatorMessages = genPreset.prompts
              .filter((p: any) => p.enabled)
              .map((p: any) => ({
                role: p.role,
                content: p.content.replace('{{context}}', WORKFLOW_DSL_PROMPT),
              }));
            if (node.data.instruction) generatorMessages.push({ role: 'user', content: node.data.instruction });
          } else {
            generatorMessages = [
              { role: 'system', content: WORKFLOW_DSL_PROMPT },
              { role: 'user', content: `用户需求：${node.data.instruction || '请生成一个标准的小说创作流程'}` },
            ];
          }

          let aiResponse = '';
          let genRetryCount = 0;
          while (genRetryCount <= 2 && !aiResponse) {
            if (genRetryCount > 0) {
              await new Promise(res => setTimeout(res, 2000));
            }
            try {
              const genModel =
                node.data.overrideAiConfig && node.data.model
                  ? node.data.model
                  : genPreset?.apiConfig?.model || globalConfig.model;
              const genTemp =
                node.data.overrideAiConfig && node.data.temperature !== undefined
                  ? node.data.temperature
                  : (genPreset?.temperature ?? 0.7);

              console.groupCollapsed(
                `[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${
                  genRetryCount > 0 ? ` (重试 ${genRetryCount})` : ''
                }`,
              );
              console.log('Messages:', generatorMessages);
              console.log('Config:', {
                model: genModel,
                temperature: genTemp,
              });
              console.groupEnd();

              terminal.log(`
>> AI REQUEST [工作流: 架构生成]
>> -----------------------------------------------------------
>> Model:       ${genModel}
>> Temperature: ${genTemp}
>> -----------------------------------------------------------
`);

              const genCompletion = await genOpenai.chat.completions.create({
                model: genModel,
                messages: generatorMessages,
                temperature: genTemp,
              });
              aiResponse = genCompletion.choices[0]?.message?.content || '';
            } catch (err) {
              if (genRetryCount === 2) throw err;
              genRetryCount++;
            }
          }

          try {
            const cleanJson = aiResponse.replace(/```json\s*([\s\S]*?)```/gi, '$1').trim();
            const dslData = JSON.parse(cleanJson);
            const newNodes = dslData.nodes.map((n: any, idx: number) => {
              const cfg = NODE_CONFIGS[n.typeKey as NodeTypeKey] || NODE_CONFIGS.aiChat;
              const { icon, ...serCfg } = cfg;
              return {
                id: n.id || `node_${Date.now()}_${idx}`,
                type: 'custom',
                data: {
                  ...serCfg,
                  typeKey: n.typeKey,
                  label: n.label || cfg.defaultLabel,
                  instruction: n.instruction || '',
                  folderName: n.folderName || '',
                  status: 'pending',
                },
                position: isMobile
                  ? { x: 50, y: idx * 120 + 100 }
                  : { x: (idx % 4) * 320 + 100, y: Math.floor(idx / 4) * 180 + 250 },
              };
            });
            const newEdges = (dslData.edges || []).map((e: any, idx: number) => ({
              id: e.id || `edge_${Date.now()}_${idx}`,
              source: e.source,
              target: e.target,
              type: 'custom',
              animated: false,
            }));
            nodesRef.current = newNodes;
            setNodes(newNodes);
            setEdges(newEdges);
            workflowManager.stop();
            keepAliveManager.disable();
            return;
          } catch (e: any) {
            throw new Error(`协议解析失败: ${e.message}`);
          }
        }

        // --- Outline and Chapter Node ---
        if (node.data.typeKey === 'outlineAndChapter') {
          await syncNodeStatus(node.id, { status: 'executing' }, i);
          setEdgeAnimation(node.id, true);

          // Bug1修复：辅助函数 - 获取并验证有效的 targetVolumeId
          const getValidVolumeId = () => {
            // 1. 首先尝试从节点数据获取
            let vid = node.data.targetVolumeId as string;
            
            // 2. 如果没有，从工作流管理器获取
            if (!vid) {
              vid = workflowManager.getActiveVolumeAnchor() || '';
            }
            
            // 3. 验证获取到的ID是否有效
            const isValidVolume = (id?: string) =>
              !!id && !!localNovel.volumes?.some(v => String(v.id) === String(id));
              
            if (vid && isValidVolume(vid)) {
              return vid;
            }
            
            // 4. 如果无效，尝试从当前工作流文件夹匹配
            if (currentWorkflowFolder && localNovel.volumes) {
              const volByFolder = localNovel.volumes.find(v => v.title === currentWorkflowFolder);
              if (volByFolder) {
                return volByFolder.id;
              }
            }
            
            // 5. 尝试从分卷规划中获取
            const volumePlans = workflowManager.getVolumePlans();
            const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
            if (volumePlans[currentVolumeIndex] && localNovel.volumes) {
              const volumePlan = volumePlans[currentVolumeIndex];
              const volByName = localNovel.volumes.find(v =>
                v.title === volumePlan.volumeName || v.title === volumePlan.folderName
              );
              if (volByName) {
                return volByName.id;
              }
            }
            
            // 6. 兜底：使用第一个有效卷
            if (localNovel.volumes && localNovel.volumes.length > 0) {
              return localNovel.volumes[0].id;
            }
            
            // 7. 最后手段：创建新卷
            const defaultVolumeName = currentWorkflowFolder || node.data.folderName || `第1卷`;
            const defaultVolume: NovelVolume = {
              id: `vol_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              title: defaultVolumeName,
              collapsed: false,
            };
            localNovel.volumes = [...(localNovel.volumes || []), defaultVolume];
            return defaultVolume.id;
          };

          // 获取有效的 targetVolumeId
          let targetVolumeId = getValidVolumeId();
          
          // 如果是新创建的卷，需要更新 UI
          if (!localNovel.volumes?.some(v => v.id === targetVolumeId)) {
            await updateLocalAndGlobal(localNovel);
            terminal.log(`[OutlineAndChapter] 自动创建默认分卷, id=${targetVolumeId}`);
          }

          if (targetVolumeId) {
            workflowManager.setActiveVolumeAnchor(targetVolumeId);
          }

          // 获取分卷规划信息，计算需要生成的章节数
          let chapterCount = 1;
          const volumePlans = workflowManager.getVolumePlans();
          const activeVolume = localNovel.volumes?.find(v => v.id === targetVolumeId);
          if (activeVolume) {
            const volumePlan = volumePlans.find((plan: any) => plan.volumeName === activeVolume.title || plan.folderName === activeVolume.title);
            if (volumePlan && volumePlan.startChapter !== undefined && volumePlan.endChapter !== undefined) {
              chapterCount = (volumePlan.endChapter - volumePlan.startChapter) + 1;
            }
          }

          // 获取大纲和正文的预设
          const outlinePresets = allPresets['outline'] || [];
          const chapterPresets = allPresets['completion'] || [];
          const outlinePreset = outlinePresets.find(p => p.id === node.data.outlinePresetId);
          const chapterPreset = chapterPresets.find(p => p.id === node.data.chapterPresetId);
          
          // 如果用户选择了预设但不存在，使用默认预设
          const finalOutlinePreset = outlinePreset || outlinePresets[0];
          const finalChapterPreset = chapterPreset || chapterPresets[0];

          if (!finalOutlinePreset || !finalChapterPreset) {
            await syncNodeStatus(node.id, { status: 'failed', outputEntries: [{ id: 'err_2', title: '错误', content: '缺少大纲或正文预设' }] }, i);
            setEdgeAnimation(node.id, false);
            continue;
          }

          // 构建上下文信息
          const { dynamicContextMessages, dynamicFolder } = buildDynamicContext(i);
          // 增强：优先使用activeVolume的标题，确保大纲保存到正确的卷文件夹
          let currentVolumeName = '';
          
          // 添加调试日志
          terminal.log(`[OutlineAndChapter] 调试信息: targetVolumeId=${targetVolumeId}, activeVolume=${JSON.stringify(activeVolume)}, node.data.folderName=${node.data.folderName}, currentWorkflowFolder=${currentWorkflowFolder}, dynamicFolder=${dynamicFolder}`);
          
          // 优先级1: activeVolume?.title
          if (activeVolume?.title) {
            currentVolumeName = activeVolume.title;
            terminal.log(`[OutlineAndChapter] 使用 activeVolume.title: ${currentVolumeName}`);
          } 
          // 优先级2: node.data.folderName
          else if (node.data.folderName) {
            currentVolumeName = node.data.folderName;
            terminal.log(`[OutlineAndChapter] 使用 node.data.folderName: ${currentVolumeName}`);
          } 
          // 优先级3: currentWorkflowFolder
          else if (currentWorkflowFolder) {
            currentVolumeName = currentWorkflowFolder;
            terminal.log(`[OutlineAndChapter] 使用 currentWorkflowFolder: ${currentVolumeName}`);
          } 
          // 优先级4: dynamicFolder
          else if (dynamicFolder) {
            currentVolumeName = dynamicFolder;
            terminal.log(`[OutlineAndChapter] 使用 dynamicFolder: ${currentVolumeName}`);
          } 
          // 优先级5: 从 targetVolumeId 对应的卷中获取
          else if (activeVolume) {
            // 如果 activeVolume 存在但 title 为空，尝试从 volumePlans 中获取
            const volumePlans = workflowManager.getVolumePlans();
            const volumePlan = volumePlans.find((plan: any) => 
              plan.volumeId === targetVolumeId || 
              (plan.volumeName && localNovel.volumes?.some(v => v.id === targetVolumeId && (v.title === plan.volumeName || v.title === plan.folderName)))
            );
            if (volumePlan) {
              currentVolumeName = volumePlan.volumeName || volumePlan.folderName || '';
              terminal.log(`[OutlineAndChapter] 使用 volumePlan 中的名称: ${currentVolumeName}`);
            }
          }

          // 生成大纲和正文
          const outputEntries: OutputEntry[] = [];
          let lastChapterContent = '';

          // 预获取或创建大纲集，确保整个循环使用同一个大纲集
          let outlineSet: any = null;
          
          // 最终兜底方案：如果仍然没有获取到卷名称，尝试从第一个卷获取或使用默认名称
          if (!currentVolumeName && localNovel.volumes && localNovel.volumes.length > 0) {
            // 尝试从第一个卷获取
            const firstVolume = localNovel.volumes.find(v => v.title) || localNovel.volumes[0];
            if (firstVolume) {
              currentVolumeName = firstVolume.title || `第${workflowManager.getCurrentVolumeIndex() + 1}卷`;
              terminal.log(`[OutlineAndChapter] 使用兜底方案获取卷名称: ${currentVolumeName}`);
            }
          }
          
          // 如果还是没有，使用默认名称
          if (!currentVolumeName) {
            currentVolumeName = `默认大纲集_${Date.now()}`;
            terminal.log(`[OutlineAndChapter] 使用默认大纲集名称: ${currentVolumeName}`);
          }
          
          // 确保 localNovel.outlineSets 存在
          if (!localNovel.outlineSets) {
            localNovel.outlineSets = [];
          }
          
          // 查找或创建大纲集
          outlineSet = localNovel.outlineSets.find(s => s.name === currentVolumeName);
          if (!outlineSet) {
            outlineSet = {
              id: `outline_set_${Date.now()}`,
              name: currentVolumeName,
              items: []
            };
            localNovel.outlineSets.push(outlineSet);
            terminal.log(`[OutlineAndChapter] 创建新大纲集: ${currentVolumeName}`);
          } else {
            terminal.log(`[OutlineAndChapter] 使用现有大纲集: ${currentVolumeName}`);
          }

          // 预创建章节占位符，确保章节立即显示在分卷下
          const chapterPlaceholders: Chapter[] = [];
          
          // Bug1修复：在创建占位符前再次验证并确保 targetVolumeId 有效
          const ensureValidVolumeId = () => {
            const isValid = (id?: string) =>
              !!id && !!localNovel.volumes?.some(v => String(v.id) === String(id));
            if (!isValid(targetVolumeId)) {
              terminal.warn(`[OutlineAndChapter] targetVolumeId 无效，重新获取: ${targetVolumeId}`);
              targetVolumeId = getValidVolumeId();
            }
            return targetVolumeId;
          };
          
          // 确保有有效的 volumeId
          let finalVolumeId = ensureValidVolumeId();
          
          // 如果创建了新卷，需要先更新 UI
          if (!localNovel.volumes?.some(v => v.id === finalVolumeId)) {
            await updateLocalAndGlobal(localNovel);
          }
          
          for (let pi = 0; pi < chapterCount; pi++) {
            chapterPlaceholders.push({
              id: Date.now() + pi,
              title: `第${pi + 1}章`,
              content: '',
              volumeId: finalVolumeId,
              subtype: 'story',
            });
          }
          localNovel.chapters = [...(localNovel.chapters || []), ...chapterPlaceholders];
          await updateLocalAndGlobal(localNovel);
          terminal.log(`[OutlineAndChapter] 已创建 ${chapterCount} 个章节占位符, volumeId=${finalVolumeId}`);

          for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex++) {
            if (!checkActive()) break;

            // 1. 生成大纲
            const outlineOpenai = new OpenAI({
              apiKey: finalOutlinePreset.apiConfig?.apiKey || globalConfig.apiKey,
              baseURL: finalOutlinePreset.apiConfig?.baseUrl || globalConfig.baseUrl,
              dangerouslyAllowBrowser: true,
            });

            // Build outline messages using preset prompts if available
            let outlineMessages: any[] = [];
            const outlineBasePrompts = (finalOutlinePreset as any)?.prompts?.filter((p: any) => p.enabled || p.active) || [];
            if (outlineBasePrompts.length > 0) {
              outlineBasePrompts.forEach((p: any) => {
                const c = workflowManager.interpolateWithMacros(p.content.replace('{{context}}', ''), macroCtx);
                outlineMessages.push({ role: p.role, content: c });
              });
            } else {
              outlineMessages = [
                { role: 'system', content: localNovel.systemPrompt || '你是一名专业的小说大纲作者。' },
                ...dynamicContextMessages,
              ];
            }

            if (lastChapterContent) {
              outlineMessages.push({
                role: 'system',
                content: `【前文回顾】：\n${lastChapterContent.substring(0, 1000)}...`
              });
            }

            // 处理大纲指令中的宏
            const outlineInstruction = node.data.outlineInstruction ? workflowManager.interpolateWithMacros(node.data.outlineInstruction, macroCtx) : '';
            
            outlineMessages.push({
              role: 'user',
              content: `请为《${localNovel.title || '小说'}》的${currentVolumeName || '当前卷'}生成第${chapterIndex + 1}章的大纲。请以JSON格式输出，包含title和summary字段。${outlineInstruction}`
            });

            let outlineResponse = '';
            try {
              console.groupCollapsed(
                `[Workflow AI Request] 大纲与正文生成 - 大纲 ${chapterIndex + 1}`
              );
              console.log('Messages:', outlineMessages);
              console.log('Config:', {
                model: finalOutlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model,
                temperature: finalOutlinePreset.temperature,
                top_p: finalOutlinePreset.topP,
              });
              console.groupEnd();

              terminal.log(`
>> AI REQUEST [工作流: 大纲生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Model:       ${finalOutlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model}
>> Temperature: ${finalOutlinePreset.temperature}
>> -----------------------------------------------------------
`);

              const outlineCompletionParams: any = {
                model: finalOutlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model,
                messages: outlineMessages,
                temperature: finalOutlinePreset.temperature,
                top_p: finalOutlinePreset.topP,
              };
              // Add optional parameters if they exist
              if ((finalOutlinePreset as any).maxTokens) outlineCompletionParams.max_tokens = (finalOutlinePreset as any).maxTokens;
              if ((finalOutlinePreset as any).frequencyPenalty) outlineCompletionParams.frequency_penalty = (finalOutlinePreset as any).frequencyPenalty;
              if ((finalOutlinePreset as any).presencePenalty) outlineCompletionParams.presence_penalty = (finalOutlinePreset as any).presencePenalty;

              const outlineCompletion = await outlineOpenai.chat.completions.create(outlineCompletionParams);
              outlineResponse = outlineCompletion.choices[0]?.message?.content || '';
              
              terminal.log(`
>> AI RESPONSE [工作流: 大纲生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Content length: ${outlineResponse.length} characters
>> -----------------------------------------------------------
`);
            } catch (err) {
              terminal.error(`[OutlineAndChapter] 大纲生成失败: ${err}`);
              continue;
            }

            // 使用与大纲节点一致的解析逻辑（含 JSON 修复重试）
            let outlineEntries: { title: string; content: string }[] = [];
            let parsedOutlineResponse = outlineResponse;
            let parseRetry = 0;
            let parseMessages = [...outlineMessages];

            while (parseRetry <= 2) {
              try {
                const parsed = await cleanAndParseJSON(parsedOutlineResponse);
                outlineEntries = await extractEntries(parsed);
                break;
              } catch (parseError: any) {
                terminal.warn(`[WORKFLOW] JSON 解析失败 (outlineAndChapter): ${parseError.message}`);
                console.warn(`[WORKFLOW] JSON 解析失败，完整原始响应:`, parsedOutlineResponse);

                if (parseRetry < 2) {
                  // Bug3修复：与大纲节点一致的错误提示
                  parseMessages = [
                    ...parseMessages,
                    { role: 'assistant', content: parsedOutlineResponse },
                    {
                      role: 'user',
                      content: `(系统提示：你生成的内容格式有误，无法解析为JSON。请修正错误，仅输出正确的JSON格式内容，不要添加任何其他说明文字。确保JSON格式严格正确，包括正确的引号、逗号和括号。)`,
                    },
                  ];

                  const repairCompletionParams: any = {
                    model: finalOutlinePreset.apiConfig?.model || globalConfig.outlineModel || globalConfig.model,
                    messages: parseMessages,
                    temperature: finalOutlinePreset.temperature,
                    top_p: finalOutlinePreset.topP,
                  };
                  if ((finalOutlinePreset as any).maxTokens)
                    repairCompletionParams.max_tokens = (finalOutlinePreset as any).maxTokens;
                  if ((finalOutlinePreset as any).frequencyPenalty)
                    repairCompletionParams.frequency_penalty = (finalOutlinePreset as any).frequencyPenalty;
                  if ((finalOutlinePreset as any).presencePenalty)
                    repairCompletionParams.presence_penalty = (finalOutlinePreset as any).presencePenalty;

                  const repairedCompletion = await outlineOpenai.chat.completions.create(repairCompletionParams);
                  parsedOutlineResponse = repairedCompletion.choices[0]?.message?.content || parsedOutlineResponse;
                  parseRetry++;
                } else {
                  // Bug3修复：与大纲节点一致的fallback逻辑
                  outlineEntries = [{ title: `生成结果 ${new Date().toLocaleTimeString()}`, content: parsedOutlineResponse || outlineResponse }];
                  break;
                }
              }
            }

            outlineResponse = parsedOutlineResponse;

            // 保存大纲到对应文件夹（与大纲节点的 upSets 逻辑一致）
            if (outlineSet) {
              outlineEntries.forEach(entry => {
                const existingIdx = outlineSet.items.findIndex((ni: any) => ni.title === entry.title);
                const ni = { title: entry.title, summary: entry.content };
                if (existingIdx !== -1) {
                  outlineSet.items[existingIdx] = { ...outlineSet.items[existingIdx], ...ni };
                } else {
                  outlineSet.items.push(ni);
                }
              });
              
              outlineSet.items.sort((a: any, b: any) => (parseAnyNumber(a.title) || 0) - (parseAnyNumber(b.title) || 0));
              
              localNovel.outlineSets = localNovel.outlineSets.map(s => 
                s.id === outlineSet.id ? outlineSet : s
              );
            }

            // 使用解析后的标题更新占位符章节标题
            const resolvedTitle = outlineEntries.length > 0 ? outlineEntries[0].title : `第${chapterIndex + 1}章`;
            const placeholderChapter = chapterPlaceholders[chapterIndex]
              ? localNovel.chapters.find(c => c.id === chapterPlaceholders[chapterIndex].id)
              : null;
            if (placeholderChapter) {
              // Bug1修复：在更新标题前验证并确保 volumeId 有效
              const isValidVolume = (id?: string) =>
                !!id && !!localNovel.volumes?.some(v => String(v.id) === String(id));
                
              if (!isValidVolume(placeholderChapter.volumeId)) {
                terminal.warn(`[OutlineAndChapter] 章节 volumeId 无效，重新分配: ${placeholderChapter.volumeId}`);
                // 使用当前有效的 targetVolumeId
                placeholderChapter.volumeId = finalVolumeId;
              }
              
              placeholderChapter.title = resolvedTitle;
              // Bug1修复：更新占位符标题后立即刷新UI，确保章节名称在分卷下立即更新
              await updateLocalAndGlobal(localNovel);
              terminal.log(`[OutlineAndChapter] 更新章节标题: id=${placeholderChapter.id}, title=${resolvedTitle}, volumeId=${placeholderChapter.volumeId}`);
            }

            // 添加大纲到输出条目
            outlineEntries.forEach((entry, eIdx) => {
              outputEntries.push({
                id: `outline_${chapterIndex}_${eIdx}_${Date.now()}`,
                title: entry.title,
                content: entry.content
              });
            });

            // 及时更新节点的 outputEntries，以便大纲能够及时显示在自动化创作中心的大纲文件夹中
            await syncNodeStatus(node.id, { outputEntries }, i);

            // 2. 生成正文
            const chapterOpenai = new OpenAI({
              apiKey: finalChapterPreset.apiConfig?.apiKey || globalConfig.apiKey,
              baseURL: finalChapterPreset.apiConfig?.baseUrl || globalConfig.baseUrl,
              dangerouslyAllowBrowser: true,
            });

            // Build chapter messages using preset prompts if available
            let chapterMessages: any[] = [];
            const chapterBasePrompts = (finalChapterPreset as any)?.prompts?.filter((p: any) => p.enabled || p.active) || [];
            if (chapterBasePrompts.length > 0) {
              chapterBasePrompts.forEach((p: any) => {
                const c = workflowManager.interpolateWithMacros(p.content.replace('{{context}}', ''), macroCtx);
                chapterMessages.push({ role: p.role, content: c });
              });
            } else {
              chapterMessages = [
                { role: 'system', content: localNovel.systemPrompt || '你是一名专业的小说作者。' },
                ...dynamicContextMessages,
              ];
            }

            const outlineContentForChapter = outlineEntries.length > 0
              ? outlineEntries.map(e => `${e.title}: ${e.content}`).join('\n')
              : outlineResponse;
            chapterMessages.push({
              role: 'system',
              content: `【本章大纲】：\n${outlineContentForChapter}`
            });

            if (lastChapterContent) {
              chapterMessages.push({
                role: 'system',
                content: `【前文回顾】：\n${lastChapterContent.substring(0, 1000)}...`
              });
            }

            // 处理正文指令中的宏
            const chapterInstruction = node.data.chapterInstruction ? workflowManager.interpolateWithMacros(node.data.chapterInstruction, macroCtx) : '';
            
            chapterMessages.push({
              role: 'user',
              content: `请根据大纲为《${localNovel.title || '小说'}》的${currentVolumeName || '当前卷'}生成${resolvedTitle}的正文。${chapterInstruction}`
            });

            let chapterResponse = '';
            try {
              console.groupCollapsed(
                `[Workflow AI Request] 大纲与正文生成 - 正文 ${chapterIndex + 1}`
              );
              console.log('Messages:', chapterMessages);
              console.log('Config:', {
                model: finalChapterPreset.apiConfig?.model || globalConfig.model,
                temperature: finalChapterPreset.temperature,
                top_p: finalChapterPreset.topP,
              });
              console.groupEnd();

              terminal.log(`
>> AI REQUEST [工作流: 正文生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Model:       ${finalChapterPreset.apiConfig?.model || globalConfig.model}
>> Temperature: ${finalChapterPreset.temperature}
>> -----------------------------------------------------------
`);

              const chapterCompletionParams: any = {
                model: finalChapterPreset.apiConfig?.model || globalConfig.model,
                messages: chapterMessages,
                temperature: finalChapterPreset.temperature,
                top_p: finalChapterPreset.topP,
              };
              // Add optional parameters if they exist
              if ((finalChapterPreset as any).maxTokens) chapterCompletionParams.max_tokens = (finalChapterPreset as any).maxTokens;
              if ((finalChapterPreset as any).frequencyPenalty) chapterCompletionParams.frequency_penalty = (finalChapterPreset as any).frequencyPenalty;
              if ((finalChapterPreset as any).presencePenalty) chapterCompletionParams.presence_penalty = (finalChapterPreset as any).presencePenalty;

              const chapterCompletion = await chapterOpenai.chat.completions.create(chapterCompletionParams);
              chapterResponse = chapterCompletion.choices[0]?.message?.content || '';
              
              terminal.log(`
>> AI RESPONSE [工作流: 正文生成] 第${chapterIndex + 1}章
>> -----------------------------------------------------------
>> Content length: ${chapterResponse.length} characters
>> -----------------------------------------------------------
`);
            } catch (err) {
              terminal.error(`[OutlineAndChapter] 正文生成失败: ${err}`);
              continue;
            }

            // 确保 targetVolumeId 不为空且有效（防止落到未分卷）
            const isValidVolume = (id?: string) =>
              !!id && !!localNovel.volumes?.some(v => String(v.id) === String(id));
              
            if (!isValidVolume(finalVolumeId)) {
              terminal.warn(`[OutlineAndChapter] 警告: finalVolumeId 无效，重新获取`);
              finalVolumeId = getValidVolumeId();
              if (!localNovel.volumes?.some(v => v.id === finalVolumeId)) {
                await updateLocalAndGlobal(localNovel);
              }
            }
            
            // 更新占位符章节的内容（而非创建新章节）
            const placeholderId = chapterPlaceholders[chapterIndex]?.id;
            const existingChapter = placeholderId 
              ? localNovel.chapters.find(c => c.id === placeholderId) 
              : null;
            
            if (existingChapter) {
              // Bug1修复：确保章节有有效的 volumeId
              if (!isValidVolume(existingChapter.volumeId)) {
                terminal.warn(`[OutlineAndChapter] 章节 volumeId 无效，重新分配: ${existingChapter.volumeId}`);
                existingChapter.volumeId = finalVolumeId;
              }
              existingChapter.content = chapterResponse;
              terminal.log(`[OutlineAndChapter] 更新占位符章节: id=${existingChapter.id}, volumeId=${existingChapter.volumeId}`);
            } else {
              const fallbackChapter: Chapter = {
                id: Date.now() + chapterIndex,
                title: `第${chapterIndex + 1}章`,
                content: chapterResponse,
                volumeId: finalVolumeId,
                subtype: 'story',
              };
              localNovel.chapters = [...(localNovel.chapters || []), fallbackChapter];
              terminal.log(`[OutlineAndChapter] 创建回退章节: id=${fallbackChapter.id}, volumeId=${finalVolumeId}`);
            }
            
            lastChapterContent = chapterResponse;

            await updateLocalAndGlobal(localNovel);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await syncNodeStatus(node.id, { status: 'completed', outputEntries }, i);
          setEdgeAnimation(node.id, false);
          continue;
        }

        // --- Standard AI Call ---
        let typePresets = allPresets[node.data.presetType as string] || [];
        if (node.data.typeKey === 'aiChat') typePresets = Object.values(allPresets).flat();
        let preset =
          typePresets.find(p => p.id === node.data.presetId) || (node.data.presetType ? typePresets[0] : null);
        if (!preset && node.data.presetType && node.data.typeKey !== 'aiChat') continue;

        let refContext = '';
        const attachments: any[] = [];
        const resolvePending = (l: string[], s: any[] | undefined) =>
          l.map(id =>
            id?.startsWith?.('pending:') ? s?.find(x => x.name === id.replace('pending:', ''))?.id || id : id,
          );

        const isLoopNode = workflowManager.getContextVar('loop_index');

        // 核心修复 (Bug 6): 动态集合注入
        // 在循环模式下，如果用户未显式选择集合，或者存在动态创建的集合（如"第一卷角色"），
        // 尝试自动注入当前 localNovel 中所有相关的集合，防止循环中信息丢失。
        // 特别是对于"大纲生成"类节点，需要过滤掉粗纲和大纲本身（避免递归引用），只保留设定类信息。
        const isOutlineGen = node.data.typeKey === 'outline' || node.data.typeKey === 'plotOutline';
        
        // 本卷模式修复：获取当前卷名称，用于过滤集合
        const isVolumeMode = globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume';
        const currentVolumeName = currentWorkflowFolder || node.data.folderName || '';
        terminal.log(`[CONTEXT] isVolumeMode=${isVolumeMode}, currentVolumeName="${currentVolumeName}"`);

        const autoInject = (selectedIds: string[], allSets: any[] | undefined) => {
          // 如果已手动选择，则仅解析手动选择的
          if (selectedIds && selectedIds.length > 0) {
            return resolvePending([...selectedIds], allSets);
          }
          // 本卷模式修复：只注入当前卷的集合
          if (isVolumeMode && allSets && currentVolumeName) {
            const volumeSets = allSets.filter(s => s.name === currentVolumeName);
            terminal.log(`[CONTEXT] autoInject volume sets: ${volumeSets.length} for "${currentVolumeName}"`);
            return volumeSets.map(s => s.id);
          }
          // 如果是循环模式且未手动选择，默认全选 (除了大纲生成时的大纲引用)
          if (isLoopNode && allSets) {
            return allSets.map(s => s.id);
          }
          return [];
        };

        const sW = autoInject(node.data.selectedWorldviewSets || [], localNovel.worldviewSets);
        const sC = autoInject(node.data.selectedCharacterSets || [], localNovel.characterSets);

        // 大纲和灵感也使用 autoInject，支持本卷模式过滤
        let sO = autoInject(node.data.selectedOutlineSets || [], localNovel.outlineSets);
        // 大纲生成时，如果没有手动选择大纲，则不注入大纲（避免自己引用自己）
        if (isOutlineGen && (!node.data.selectedOutlineSets || node.data.selectedOutlineSets.length === 0)) {
          sO = [];
        }

        const sI = autoInject(node.data.selectedInspirationSets || [], localNovel.inspirationSets);

        sW.forEach(id => {
          const s = localNovel.worldviewSets?.find(x => x.id === id);
          if (s)
            refContext += `【参考世界观 (${s.name})】：\n${s.entries
              .map(e => `· ${e.item}: ${e.setting}`)
              .join('\n')}\n`;
        });
        sC.forEach(id => {
          const s = localNovel.characterSets?.find(x => x.id === id);
          if (s)
            refContext += `【参考角色 (${s.name})】：\n${s.characters.map(c => `· ${c.name}: ${c.bio}`).join('\n')}\n`;
        });
        sO.forEach(id => {
          const s = localNovel.outlineSets?.find(x => x.id === id);
          if (s)
            refContext += `【参考粗纲 (${s.name})】：\n${s.items
              .map(ni => `· ${ni.title}: ${ni.summary}`)
              .join('\n')}\n`;
        });
        sI.forEach(id => {
          const s = localNovel.inspirationSets?.find(x => x.id === id);
          if (s)
            refContext += `【参考灵感 (${s.name})】：\n${s.items
              .map(ni => `· ${ni.title}: ${ni.content}`)
              .join('\n')}\n`;
        });

        (node.data.selectedReferenceFolders || []).forEach(fid => {
          const f = localNovel.referenceFolders?.find(x => x.id === fid);
          if (f)
            localNovel.referenceFiles
              ?.filter(x => x.parentId === fid)
              .forEach(x => {
                if (x.type.startsWith('text/') || x.name.endsWith('.md') || x.name.endsWith('.txt'))
                  refContext += `· 文件: ${x.name}\n内容: ${x.content}\n---\n`;
                else if (x.type.startsWith('image/')) attachments.push({ type: 'image', url: x.content, name: x.name });
                else if (x.type === 'application/pdf') attachments.push({ type: 'pdf', url: x.content, name: x.name });
              });
        });

        // 重构 Standard AI Call 的 Context 构建
        // 核心修复 (Bug 6): 增强 Context 构建，注入总结信息
        // 引入 getChapterContextMessages 获取“最新大总结 + 后续章节 + 小总结”

        let summaryContextMessages: any[] = [];
        // 只有当存在章节时才尝试获取总结上下文，且排除大纲生成节点（避免大纲生成时看到太多正文细节）
        if (localNovel.chapters && localNovel.chapters.length > 0 && !isOutlineGen) {
          // --- 核心增强：节点感知的卷上下文 ---
          // 如果是本卷模式，尝试寻找该节点关联的卷或最后一个章节所属的卷
          let effectiveVolumeId: string | undefined = undefined;

          if (globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume') {
            // 优先级：节点显式指定的卷 > 工作流当前定位的卷 > 最后一章的卷
            effectiveVolumeId = (node.data.targetVolumeId as string) || workflowManager.getActiveVolumeAnchor() || '';
            if (!effectiveVolumeId) {
              const lastWithVol = [...localNovel.chapters].reverse().find(c => c.volumeId);
              effectiveVolumeId = lastWithVol?.volumeId;
            }
            
            // 本卷模式修复：如果当前节点所在卷没有章节（新卷刚开始），不发送前文回顾
            const volumeChapters = (localNovel.chapters || []).filter(c => c.volumeId === effectiveVolumeId);
            if (volumeChapters.length === 0) {
              terminal.log(`[CONTEXT] Volume mode: no chapters in current volume "${currentVolumeName}", skipping summary context`);
              summaryContextMessages = [];
            } else {
              // 使用节点感知的卷 ID 过滤总结
              summaryContextMessages = getChapterContextMessages(
                localNovel,
                { ...volumeChapters[volumeChapters.length - 1], volumeId: effectiveVolumeId },
                {
                  longTextMode: true,
                  contextScope: 'volume',  // 本卷模式下只获取当前卷的总结
                  contextChapterCount: globalConfig.contextChapterCount || 1,
                },
              );
            }
          } else {
            // 整书模式：使用最后一章
            const lastChapter = localNovel.chapters[localNovel.chapters.length - 1];
            summaryContextMessages = getChapterContextMessages(
              localNovel,
              lastChapter,
              {
                longTextMode: true,
                contextScope: globalConfig.contextScope || 'all',
                contextChapterCount: globalConfig.contextChapterCount || 1,
              },
            );
          }
        }

        const formatMulti = (text: string) => {
          if (!attachments.length) return text;
          const content: any[] = [{ type: 'text', text }];
          attachments.forEach(a => {
            if (a.type === 'image') content.push({ type: 'image_url', image_url: { url: a.url } });
            else if (a.type === 'pdf')
              content.push({
                type: 'file',
                file_url: { url: a.url.startsWith('data:') ? a.url : `data:application/pdf;base64,${a.url}` },
              } as any);
          });
          return content;
        };

        // --- Chapter Node Special Path ---
        if (node.data.typeKey === 'chapter') {
          let outlineSetId = node.data.selectedOutlineSets?.length
            ? resolvePending([node.data.selectedOutlineSets[0]], localNovel.outlineSets)[0]
            : null;
          if (!outlineSetId)
            outlineSetId =
              localNovel.outlineSets?.find(s => s.name === (currentWorkflowFolder || node.data.folderName))?.id ||
              localNovel.outlineSets?.[0]?.id ||
              null;
          let currentSet = localNovel.outlineSets?.find(s => s.id === outlineSetId);
          if (!currentSet?.items?.length) throw new Error('未关联有效大纲集。');

          // Bug4 修复：优先使用用户指定的卷ID，确保章节生成到正确的卷
          // 增强逻辑：在循环场景下，确保获取到的是当前循环轮次对应的卷ID
          terminal.log(`[VOLUME_DEBUG] node.data.targetVolumeId=${node.data.targetVolumeId}, localNovel.volumes?.length=${localNovel.volumes?.length}, volumes=${JSON.stringify(localNovel.volumes?.map(v => ({id: v.id, title: v.title})))}`);
          const targetVolumeIdValid = node.data.targetVolumeId && localNovel.volumes?.some(v => v.id === node.data.targetVolumeId);
          terminal.log(`[VOLUME_DEBUG] targetVolumeIdValid=${targetVolumeIdValid}, userSpecifiedTargetVolumeId=${userSpecifiedTargetVolumeId}, activeVolumeAnchor=${workflowManager.getActiveVolumeAnchor()}`);
          
          let fVolId = userSpecifiedTargetVolumeId || (targetVolumeIdValid ? node.data.targetVolumeId : null) || workflowManager.getActiveVolumeAnchor() || '';
          
          // Bug4 修复：如果没有获取到卷ID，或卷ID无效，尝试从 volumePlans 获取当前循环对应的卷
          const loopIndex = workflowManager.getContextVar('loop_index') || 1;
          const volumePlans = workflowManager.getVolumePlans();
          terminal.log(`[VOLUME_DEBUG] loopIndex=${loopIndex}, volumePlans.length=${volumePlans.length}`);
          
          if ((!fVolId || !localNovel.volumes?.some(v => v.id === fVolId)) && volumePlans.length > 0) {
            const volumePlanIndex = loopIndex - 1;
            if (volumePlanIndex < volumePlans.length) {
              const volumePlan = volumePlans[volumePlanIndex];
              const volumeName = volumePlan.volumeName || volumePlan.folderName;
              terminal.log(`[VOLUME_DEBUG] Trying to find volume by name from volumePlans: "${volumeName}"`);
              const volumeFromPlan = localNovel.volumes?.find(v => v.title === volumeName);
              if (volumeFromPlan) {
                fVolId = volumeFromPlan.id;
                terminal.log(`[VOLUME_DEBUG] Found volume from volumePlans: ${fVolId} (${volumeName})`);
              }
            }
          }
          
          // Bug4 修复：兜底逻辑，确保至少有一个有效的卷ID
          if (!fVolId && localNovel.chapters?.length) {
            for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
              const chapVolId = localNovel.chapters[k].volumeId;
              if (chapVolId) {
                fVolId = chapVolId;
                terminal.log(`[VOLUME_DEBUG] Fallback: using last chapter's volumeId: ${fVolId}`);
                break;
              }
            }
          }
          if (!fVolId) {
            fVolId =
              localNovel.volumes?.find(v => v.title === currentWorkflowFolder)?.id || 
              (localNovel.volumes?.[0]?.id || '');
            terminal.log(`[VOLUME_DEBUG] Final fallback: fVolId=${fVolId}`);
          }
          
          if (fVolId) {
            workflowManager.setActiveVolumeAnchor(fVolId);
            terminal.log(`[VOLUME_DEBUG] Set activeVolumeAnchor to: ${fVolId}`);
          }

          const nApi = (preset as any)?.apiConfig || {};
          const engCfg = {
            apiKey: nApi.apiKey || globalConfig.apiKey,
            baseURL: nApi.baseUrl || globalConfig.baseUrl,
            model: node.data.overrideAiConfig && node.data.model ? node.data.model : nApi.model || globalConfig.model,
            temperature:
              node.data.overrideAiConfig && node.data.temperature !== undefined
                ? node.data.temperature
                : ((preset as any)?.temperature ?? globalConfig.temperature),
            systemPrompt:
              (node.data.overrideAiConfig
                ? node.data.promptItems
                    ?.filter((p: any) => p.enabled !== false && p.role === 'system')
                    .map((p: any) => p.content)
                    .join('\n\n') ||
                  node.data.systemPrompt ||
                  localNovel.systemPrompt
                : localNovel.systemPrompt) + nodeLoopContext,
            ...globalConfig,
          };

          const engine = new AutoWriteEngine(engCfg, localNovel);
          let wStart = 0;
          
          // Bug4 修复：loopIndex 已经在上面声明过了，这里直接使用
          const isFirstExecution = loopIndex <= 1;
          const startMode = node.data.startChapterMode || 'auto';
          const startIdx = node.data.startChapterIndex ?? 0;
          const enableAutoDetect = node.data.enableAutoDetect !== false; // 默认开启
          
          const autoDetectStart = () => {
            terminal.log(`[ChapterNode] autoDetectStart: fVolId=${fVolId}, currentSet.items.length=${currentSet.items.length}`);
            terminal.log(`[ChapterNode] autoDetectStart: localNovel.chapters.length=${localNovel.chapters?.length || 0}`);
            
            // Bug4 修复：重写自动检测逻辑
            // 增强逻辑：在循环场景下，确保正确匹配当前卷的章节
            let foundStart = false;
            for (let k = 0; k < currentSet.items.length; k++) {
              const item = currentSet.items[k];
              // Bug4 修复：增强卷ID匹配逻辑
              const ex = localNovel.chapters?.find(c => {
                // 标题匹配
                if (c.title !== item.title) return false;
                // 卷ID匹配逻辑增强：
                if (fVolId) {
                  // 有 fVolId 时，必须严格匹配同一卷的章节
                  return c.volumeId === fVolId;
                } else {
                  // 没有 fVolId 时，只匹配同样没有卷ID的章节
                  return !c.volumeId || c.volumeId === '';
                }
              });
              
              const hasContent = ex && ex.content && ex.content.trim().length > 0;
              
              // Bug4 修复：增加详细的日志，便于调试
              if (ex) {
                terminal.log(`[ChapterNode] autoDetect: k=${k}, title="${item.title}", exists=true, hasContent=${hasContent}, volMatch=${ex.volumeId === fVolId}, ex.volumeId=${ex.volumeId}`);
              } else {
                terminal.log(`[ChapterNode] autoDetect: k=${k}, title="${item.title}", exists=false, hasContent=false`);
              }
              
              // 找到第一个不存在或无内容的章节，这就是起始点
              if (!ex || !hasContent) {
                terminal.log(`[ChapterNode] autoDetect: found start point at k=${k} "${item.title}" (${!ex ? 'not exists' : 'no content'})`);
                wStart = k;
                foundStart = true;
                return; // 找到起始点后立即返回
              }
            }
            
            // Bug4 修复：如果所有章节都已存在且有内容，输出警告但仍然从第一个开始
            wStart = 0; // 强制从第一个开始，避免跳过执行
            terminal.warn(`[ChapterNode] autoDetectEnd: ALL outline items seem completed, but forcing start from k=0 to avoid skipping`);
            terminal.warn(`[ChapterNode] autoDetectEnd: This is a Bug4 fix to prevent workflow from stopping after first run`);
            terminal.log(`[ChapterNode] autoDetectEnd: wStart=${wStart}`);
          };
          
          // Bug修复：始终调用 autoDetectStart，确保正确的卷ID匹配
          // 原来的问题：continue 模式使用 UI 预计算的 startIdx，但 UI 可能使用了错误的卷ID
          // 修复：无论什么模式，都重新检测当前卷中哪些章节已存在
          if (enableAutoDetect) {
            autoDetectStart();
          } else if (startMode === 'continue') {
            // 如果禁用了自动检测，使用 UI 指定的起始章节
            wStart = startIdx >= 0 && startIdx < currentSet.items.length ? startIdx : 0;
          } else if (startMode === 'restart') {
            wStart = startIdx >= 0 && startIdx < currentSet.items.length ? startIdx : 0;
          }

          // Bug修复：记录引擎执行前的关键状态，用于诊断最后一章不生成问题
          terminal.log(`[ChapterNode] BEFORE engine.run: wStart=${wStart}, items.length=${currentSet.items.length}`);
          terminal.log(`[ChapterNode] currentSet items: ${currentSet.items.map((item: any, idx: number) => `[${idx}] ${item.title}`).join(', ')}`);
          terminal.log(`[ChapterNode] fVolId=${fVolId}, loopIndex=${loopIndex}, startMode=${startMode}`);
          
          // Bug4 修复：即使检测到所有大纲项都已完成，也不跳过执行
          // 而是始终从第一个大纲项开始，让 AutoWriteEngine 自己决定哪些需要重新生成
          if (wStart >= currentSet.items.length) {
            terminal.warn(`[ChapterNode] DETECTED: wStart(${wStart}) >= items.length(${currentSet.items.length})`);
            terminal.warn(`[ChapterNode] This means ALL outline items are detected as already completed`);
            // Bug4 修复：不跳过执行，而是强制从第一个开始
            wStart = 0;
            terminal.warn(`[ChapterNode] Bug4 fix: Forcing start from wStart=0 instead of skipping`);
            terminal.warn(`[ChapterNode] Letting AutoWriteEngine decide what to regenerate`);
          }
          
          // 输出每个大纲项对应的章节是否存在，用于调试
          currentSet.items.forEach((item: any, k: number) => {
            const ex = localNovel.chapters?.find(c =>
              c.title === item.title && (fVolId ? c.volumeId === fVolId : !c.volumeId),
            );
            const existsWithContent = ex && ex.content && ex.content.trim().length > 0;
            terminal.log(`[ChapterNode] Item [${k}] "${item.title}": exists=${!!ex}, hasContent=${existsWithContent}, volMatch=${ex?.volumeId === fVolId}`);
          });
          
          let chapterResult: any = null;
          if (wStart < currentSet.items.length) {
            chapterResult = await engine.run(
              currentSet.items,
              wStart,
              globalConfig.prompts.filter((p: any) => p.active),
              () => [...(globalConfig.getActiveScripts() || []), ...((preset as any)?.regexScripts || [])],
              s => {
                // 只有当标签真正变化且超过节流时间时才更新
                const shouldUpdate = !s.match(/完成|失败|跳过|错误/) ? throttleLabelUpdate(node.id, s) : true;
                if (shouldUpdate) {
                  setNodes(nds =>
                    nds.map(n =>
                      n.id === node.id
                        ? { ...n, data: { ...n.data, label: s.match(/完成|失败|跳过|错误/) ? s : `创作中: ${s}` } }
                        : n,
                    ),
                  );
                }
              },
              up => {
                if (!checkActive()) return;
                // 核心修复：支持增量更新合并，防止 localNovel 被 deltaChapters 覆盖而丢失历史章节
                const map = new Map((localNovel.chapters || []).map(c => [c.id, c]));
                (up.chapters || []).forEach(dc => {
                  const existing = map.get(dc.id);
                  if (existing) {
                    map.set(dc.id, { ...existing, ...dc });
                  } else {
                    map.set(dc.id, dc);
                  }
                });
                // 核心修复：同时合并章节和分卷列表，防止新创建的分卷被旧快照覆盖丢失
                localNovel = {
                  ...localNovel,
                  chapters: Array.from(map.values()),
                  volumes:
                    up.volumes && up.volumes.length > (localNovel.volumes?.length || 0)
                      ? up.volumes
                      : localNovel.volumes,
                };
                updateLocalAndGlobal(localNovel);
              },
                async (cid, cont, up, force) => {
                if (!checkActive()) return;
                if (up) localNovel = up;
                if (globalConfig.onChapterComplete) {
                  const res = await (globalConfig.onChapterComplete as any)(cid, cont, localNovel, force, startRunId);
                  if (res?.chapters) {
                    // 核心修复 (Bug 4): 防止分卷切换后章节 volumeId 错误
                    // 问题：res.chapters 可能来自闭包中的旧状态，其 volumeId 可能仍为切换前的值
                    // 修复：使用 localNovel.chapters 作为基础，仅合并已完成的章节
                    //       只修正刚刚完成的章节 (cid) 的 volumeId，不影响其他章节
                    const activeVolId = workflowManager.getActiveVolumeAnchor() || '';
                    const incomingChaptersMap = new Map((res.chapters as any[]).map(c => [c.id, c]));
                    
                    localNovel = {
                      ...res,
                      chapters: localNovel.chapters?.map(c => {
                        const incoming = incomingChaptersMap.get(c.id);
                        if (incoming) {
                          // 只修正刚刚完成的章节的 volumeId
                          // 其他章节保持原有 volumeId 不变
                          if (c.id === cid && activeVolId) {
                            return {
                              ...incoming,
                              volumeId: activeVolId,
                            };
                          }
                          return incoming;
                        }
                        // 保留原有章节
                        return c;
                      }) || res.chapters,
                      volumes: res.volumes && res.volumes.length > 0 ? res.volumes : localNovel.volumes,
                    };
                    
                    if (activeVolId) {
                      terminal.log(`[VOLUME_FIX] onChapterComplete: ensuring chapter ${cid} has volumeId=${activeVolId}`);
                    }
                  }
                }

                const currentChapter = localNovel.chapters?.find(c => c.id === cid);
                const currentTitle = currentChapter?.title || '';

                // 计算全局已完成章节数（用于整书模式）
                const storyChapters = (localNovel.chapters || []).filter(c => !c.subtype || c.subtype === 'story');
                const completedChaptersCount = storyChapters.length;

                // 从章节标题解析卷内章节编号（用于本卷模式）
                // 因为每卷的章节标题都从"第一章"重新开始，所以需要解析标题中的编号
                const chapterNumMatch = currentTitle.match(/[零一二三四五六七八九十百千]+|\d+/);
                let currentChapterNum = 0;
                if (chapterNumMatch) {
                  const token = chapterNumMatch[0];
                  // 中文数字转阿拉伯数字
                  const chineseNums: Record<string, number> = {
                    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
                    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
                    '百': 100, '千': 1000
                  };
                  if (/^\d+$/.test(token)) {
                    currentChapterNum = parseInt(token);
                  } else if (token === '十') {
                    currentChapterNum = 10;
                  } else if (token.startsWith('十')) {
                    currentChapterNum = 10 + (chineseNums[token[1]] || 0);
                  } else if (token.endsWith('十')) {
                    currentChapterNum = (chineseNums[token[0]] || 0) * 10;
                  } else if (token.includes('十')) {
                    const parts = token.split('十');
                    currentChapterNum = (chineseNums[parts[0]] || 0) * 10 + (chineseNums[parts[1]] || 0);
                  } else {
                    currentChapterNum = chineseNums[token] || 0;
                  }
                }

                const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
                const volumePlans = workflowManager.getVolumePlans();
                const pendingSplits = workflowManager.getPendingSplits();

                // 判断当前模式：整书模式 vs 本卷模式
                const isVolumeMode = globalConfig.contextScope === 'volume' || globalConfig.contextScope === 'currentVolume';
                terminal.log(`[WORKFLOW] Chapter "${currentTitle}" completed, chapterNum=${currentChapterNum}, globalCount=${completedChaptersCount}, mode=${isVolumeMode ? '本卷' : '整书'}, checking volume switch at volume index ${currentVolumeIndex}`);

                // 调试：打印分卷切换相关状态
                console.log('[VOLUME_SWITCH_CHECK] Starting check:', {
                  currentTitle,
                  currentChapterNum,
                  completedChaptersCount,
                  contextScope: globalConfig.contextScope,
                  isVolumeMode,
                  currentVolumeIndex,
                  pendingSplitsCount: pendingSplits.length,
                  pendingSplits: pendingSplits.map(s => ({
                    chapterTitle: s.chapterTitle,
                    nextVolumeName: s.nextVolumeName,
                    endChapter: s.endChapter,
                    processed: s.processed,
                  })),
                  volumePlansCount: volumePlans.length,
                  volumePlans: volumePlans.map(p => ({
                    volumeName: p.volumeName,
                    folderName: p.folderName,
                    startChapter: p.startChapter,
                    endChapter: p.endChapter,
                  })),
                });

                // 使用 endChapter 判断是否应该切换分卷
                // 根据模式选择不同的比较逻辑：
                // - 整书模式：endChapter 表示全局章节号（如第1卷 endChapter=3 表示第1-3章）
                // - 本卷模式：endChapter 表示卷内章节号（如每卷 endChapter=3 表示每卷有3章）
                let shouldSwitch = false;
                let nextVolumeName = '';

                // 优先使用当前分卷的 endChapter
                const currentVolumeConfig = volumePlans[currentVolumeIndex] || pendingSplits[0];
                if (currentVolumeConfig?.endChapter) {
                  const endChapter = currentVolumeConfig.endChapter;
                  // 获取下一卷名称：pendingSplits 有 nextVolumeName，volumePlans 使用 volumeName/folderName
                  const fallbackNextVolName = volumePlans[currentVolumeIndex + 1]?.volumeName || volumePlans[currentVolumeIndex + 1]?.folderName || '';
                  
                  if (isVolumeMode) {
                    // 本卷模式：使用卷内章节编号比较
                    // endChapter=3 表示该卷包含第1-3章，第3章完成后（currentChapterNum >= 3）切换到下一卷
                    console.log(`[VOLUME_SWITCH_CHECK] 本卷模式: currentChapterNum=${currentChapterNum} >= endChapter=${endChapter}?`);
                    if (currentChapterNum >= endChapter) {
                      shouldSwitch = true;
                      nextVolumeName = (currentVolumeConfig as any).nextVolumeName || fallbackNextVolName;
                      terminal.log(`[WORKFLOW] Volume ${currentVolumeIndex} end chapter matched (本卷模式): chapterNum=${currentChapterNum} >= endChapter=${endChapter}, switching to "${nextVolumeName}"`);
                    }
                  } else {
                    // 整书模式：使用全局章节索引比较
                    // endChapter=3 表示第1-3章属于当前卷，第3章完成后（completedChaptersCount >= 3）切换到下一卷
                    console.log(`[VOLUME_SWITCH_CHECK] 整书模式: completedChaptersCount=${completedChaptersCount} >= endChapter=${endChapter}?`);
                    if (completedChaptersCount >= endChapter) {
                      shouldSwitch = true;
                      nextVolumeName = (currentVolumeConfig as any).nextVolumeName || fallbackNextVolName;
                      terminal.log(`[WORKFLOW] Volume ${currentVolumeIndex} end chapter matched (整书模式): globalCount=${completedChaptersCount} >= endChapter=${endChapter}, switching to "${nextVolumeName}"`);
                    }
                  }
                }

                // 核心修复：重写卷模式下，禁止切换到下一卷
                // 重写卷模式的目的是专注重写当前卷，不应自动进入下一卷
                if (userSpecifiedTargetVolumeId && mode) {
                  shouldSwitch = false;
                  nextVolumeName = '';
                  terminal.log(`[WORKFLOW] 单卷重写模式：禁止切换到下一卷，shouldSwitch 强制为 false`);
                }

                // 核心修复：兜底卷切换检测
                // 当 endChapter 未设置或无法匹配时，使用大纲项数量作为卷的章节数
                // 如果当前大纲已全部生成完毕，也应该触发卷切换
                // 注意：单卷重写模式下不执行此检测，因为该模式不应切换到下一卷
                if (!shouldSwitch && !(userSpecifiedTargetVolumeId && mode)) {
                  // Bug修复：使用 currentSet（通过 outlineSetId 找到的真正关联大纲集）
                  // 而不是通过卷名称匹配，因为大纲集名称可能与卷标题不一致
                  const effectiveOutlineSet = currentSet || localNovel.outlineSets?.find(s => {
                    const volTitle = localNovel.volumes?.find(v => v.id === (workflowManager.getActiveVolumeAnchor() || ''))?.title;
                    return s.name === volTitle;
                  });
                  const outlineItemCount = effectiveOutlineSet?.items?.length || 0;
                  const currentVolumeChapters = (localNovel.chapters || []).filter(c => {
                    return c.volumeId === (workflowManager.getActiveVolumeAnchor() || '') && 
                           (!c.subtype || c.subtype === 'story') && 
                           c.content && c.content.trim().length > 0;
                  }).length;
                  
                  // 如果当前卷的所有大纲项都已生成为章节，且还有下一卷
                  if (outlineItemCount > 0 && currentVolumeChapters >= outlineItemCount) {
                    const nextVolFromPlans = volumePlans[currentVolumeIndex + 1];
                    const nextVolFromNovel = localNovel.volumes?.[currentVolumeIndex + 1];
                    const nextVolName = nextVolFromPlans?.volumeName || nextVolFromPlans?.folderName || nextVolFromNovel?.title || '';
                    
                    if (nextVolName) {
                      shouldSwitch = true;
                      nextVolumeName = nextVolName;
                      terminal.log(`[WORKFLOW] Volume ${currentVolumeIndex} fallback switch: all ${currentVolumeChapters}/${outlineItemCount} outline items generated, switching to "${nextVolName}"`);
                    }
                  }
                }

                console.log(`[VOLUME_SWITCH_CHECK] Final result: shouldSwitch=${shouldSwitch}, nextVolumeName="${nextVolumeName}"`);
                
                // 核心修复：重写卷模式下的工作流停止检测
                // 只有在"重写卷模式"（通过"从指定位置启动工作流"功能启用）下才主动停止工作流
                // 正常模式下，即使当前卷的所有章节已生成，工作流仍应继续执行后续节点
                let shouldStopForVolumeComplete = false;
                if (!shouldSwitch && userSpecifiedTargetVolumeId && mode && mode !== 'full') {
                  // 仅在重写卷模式下检查：当前卷的所有大纲项是否都已生成完成
                  // 使用 currentSet（通过 outlineSetId 找到的真正关联大纲集），而不是通过卷名称匹配
                  const effectiveOutlineSet = currentSet || localNovel.outlineSets?.find(s => {
                    const volTitle = localNovel.volumes?.find(v => v.id === (workflowManager.getActiveVolumeAnchor() || ''))?.title;
                    return s.name === volTitle;
                  });
                  const outlineItemCount = effectiveOutlineSet?.items?.length || 0;
                  const currentVolumeChapters = (localNovel.chapters || []).filter(c => {
                    return c.volumeId === (workflowManager.getActiveVolumeAnchor() || '') && 
                           (!c.subtype || c.subtype === 'story') && 
                           c.content && c.content.trim().length > 0;
                  }).length;
                  
                  // 重写卷模式下，当前卷的所有大纲项都已生成完成，主动停止工作流
                  if (outlineItemCount > 0 && currentVolumeChapters >= outlineItemCount) {
                    shouldStopForVolumeComplete = true;
                    terminal.log(`[WORKFLOW] 重写卷模式: Volume ${currentVolumeIndex} complete: all ${currentVolumeChapters}/${outlineItemCount} outline items generated, stopping workflow`);
                  }
                }
                
                if (shouldSwitch && nextVolumeName) {
                  terminal.log(`[WORKFLOW] Creating next volume: ${nextVolumeName}`);
                  
                  console.log('[VOLUME_SWITCH] === TRIGGERED ===', {
                    currentChapter: currentTitle,
                    currentChapterNum,
                    currentVolumeIndex,
                    nextVolumeName,
                    pendingSplits: pendingSplits.map((s: any) => ({
                      chapterTitle: s.chapterTitle,
                      nextVolumeName: s.nextVolumeName,
                      processed: s.processed,
                    })),
                  });
                  
                  // 记录清除前的状态
                  const beforeClearNodesState: Record<string, any[]> = {};
                  const beforeClearNovelSets: Record<string, any[]> = {};
                  nodesRef.current.forEach(n => {
                    if (['worldview', 'characters', 'plotOutline', 'outline', 'creationInfo'].includes(n.data.typeKey)) {
                      beforeClearNodesState[n.id] = n.data.outputEntries || [];
                    }
                  });
                  ['worldviewSets', 'characterSets', 'outlineSets', 'inspirationSets', 'plotOutlineSets'].forEach(type => {
                    beforeClearNovelSets[type] = (localNovel as any)[type] || [];
                  });
                  
                  const existingNextVol = localNovel.volumes?.find(v => v.title === nextVolumeName);
                  if (!existingNextVol) {
                    const newVolId = `vol_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    const newVolume = {
                      id: newVolId,
                      title: nextVolumeName,
                      collapsed: false,
                    };
                    localNovel = {
                      ...localNovel,
                      volumes: [...(localNovel.volumes || []), newVolume]
                    };
                    
                    const types = ['worldviewSets', 'characterSets', 'outlineSets', 'inspirationSets', 'plotOutlineSets'] as const;
                    const prefix = ['wv', 'char', 'out', 'insp', 'plot'] as const;
                    
                    types.forEach((type, idx) => {
                      const newSet = {
                        id: `${prefix[idx]}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        name: nextVolumeName,
                        entries: [],
                        characters: [],
                        items: [],
                      };
                      (localNovel as any)[type] = [...((localNovel as any)[type] || []), newSet];
                    });
                    
                    terminal.log(`[WORKFLOW] Immediately created next volume: ${nextVolumeName}`);
                  }
                  
                  // 更新分卷索引
                  // 优先从 volumePlans 查找匹配项，如果找不到则使用 currentVolumeIndex + 1
                  let nextVolIdx = volumePlans.findIndex(v => v.volumeName === nextVolumeName || v.folderName === nextVolumeName);
                  terminal.log(`[VOLUME_SWITCH] nextVolIdx calculation: findIndex result = ${nextVolIdx}, nextVolumeName = "${nextVolumeName}"`);
                  terminal.log(`[VOLUME_SWITCH] volumePlans for comparison:`, volumePlans.map(v => ({ volumeName: v.volumeName, folderName: v.folderName })));
                  if (nextVolIdx < 0) {
                    // 如果 volumePlans 中找不到匹配，尝试从 pendingSplits 中推断
                    const splitIdx = pendingSplits.findIndex(s => s.nextVolumeName === nextVolumeName);
                    terminal.log(`[VOLUME_SWITCH] splitIdx from pendingSplits = ${splitIdx}`);
                    if (splitIdx >= 0) {
                      nextVolIdx = currentVolumeIndex + 1;
                    }
                  }
                  // 优先使用计算出的索引（即使超出 volumePlans 范围也应该使用）
                  if (nextVolIdx >= 0) {
                    workflowManager.setCurrentVolumeIndex(nextVolIdx);
                    terminal.log(`[WORKFLOW] Updated volume index to ${nextVolIdx} for "${nextVolumeName}"`);
                  } else {
                    // 兜底：直接使用 currentVolumeIndex + 1
                    nextVolIdx = currentVolumeIndex + 1;
                    workflowManager.setCurrentVolumeIndex(nextVolIdx);
                    terminal.log(`[WORKFLOW] Fallback: Updated volume index to ${nextVolIdx}`);
                  }
                  // 验证更新后的索引
                  terminal.log(`[VOLUME_SWITCH] After setCurrentVolumeIndex, getCurrentVolumeIndex = ${workflowManager.getCurrentVolumeIndex()}`);
                  workflowManager.setActiveVolumeAnchor(existingNextVol?.id || localNovel.volumes?.find(v => v.title === nextVolumeName)?.id || '');
                  
                  // 标记 pendingSplit 为已处理，同时清理所有过期规则
                  workflowManager.markSplitProcessed(currentTitle, nextVolumeName, completedChaptersCount);

                  // 清除创作类节点的输出，以便下一卷重新生成
                  // 核心修复：卷模式下，大纲、世界观、角色等节点必须重新执行，生成新卷的内容
                  // 原来的问题：只清空 outputEntries 但不重置 status，导致节点被跳过，新卷没有大纲
                  nodesRef.current = nodesRef.current.map(n => {
                    const typeKey = n.data.typeKey;
                    if (['worldview', 'characters', 'plotOutline', 'outline'].includes(typeKey)) {
                      // 核心修复：必须重置 status 为 pending，确保节点在新卷中重新执行
                      // 更新 folderName 为新的分卷名称，确保 Sets 写入正确的卷
                      const updatedData = { 
                        ...n.data, 
                        status: 'pending' as const,  // 重置状态，确保重新执行
                        outputEntries: []  // 清空输出，准备生成新卷内容
                      };
                      if (nextVolumeName) {
                        updatedData.folderName = nextVolumeName;
                      }
                      terminal.log(`[VOLUME_SWITCH] Reset node ${n.data.label} (typeKey=${typeKey}) to pending for new volume "${nextVolumeName}"`);
                      return { ...n, data: updatedData };
                    }
                    if (typeKey === 'chapter' && nextVolumeName) {
                      // 核心修复 (Bug 5): 分卷切换时，必须设置正确的 targetVolumeId
                      // 原来的问题：targetVolumeId 被设置为空字符串 ''，导致后续 fVolId 为空
                      // autoDetectStart 会错误地匹配其他卷的同名章节（如"第一章"）
                      // 修复：使用新分卷的实际 ID 作为 targetVolumeId
                      const newVolumeId = existingNextVol?.id || localNovel.volumes?.find(v => v.title === nextVolumeName)?.id || '';
                      return { ...n, data: { ...n.data, targetVolumeId: newVolumeId, targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
                    }
                    if (typeKey === 'creationInfo') {
                      // 生成新的创作信息内容，包含新分卷的名称
                      const newVolumeInfoContent = nextVolumeName ? `当前分卷：${nextVolumeName}` : '';
                      const totalVolumes = localNovel.volumes?.length || 0;
                      const volumeProgress = totalVolumes > 0 ? `分卷进度：第 ${nextVolIdx + 1} 卷 / 共 ${totalVolumes} 卷` : '';
                      const loopIndex = workflowManager.getContextVar('loop_index') || 1;
                      const loopInfo = `当前循环轮次：第 ${loopIndex} 轮`;
                      
                      let newContent = [newVolumeInfoContent, volumeProgress, loopInfo].filter(Boolean).join('\n');
                      if (n.data.instruction) {
                        newContent += `\n\n用户指令：${n.data.instruction}`;
                      }
                      
                      return { 
                        ...n, 
                        data: { 
                          ...n.data, 
                          status: 'pending', 
                          folderName: nextVolumeName,
                          outputEntries: [{ 
                            id: `creation_info_auto_${Date.now()}`, 
                            title: '创作信息', 
                            content: newContent 
                          }]
                        } 
                      };
                    }
                    // 更新其他需要关联目录的节点的 folderName
                    if (nextVolumeName && typeKey !== 'createFolder' && typeKey !== 'multiCreateFolder' && typeKey !== 'loopNode' && typeKey !== 'loopConfigurator' && typeKey !== 'pauseNode') {
                      return { ...n, data: { ...n.data, folderName: nextVolumeName } };
                    }
                    return n;
                  });
                  setNodes([...nodesRef.current]);

                  // 更新 currentWorkflowFolder（局部变量），确保后续节点使用正确的分卷
                  currentWorkflowFolder = nextVolumeName;
                  terminal.log(`[VOLUME_SWITCH] Updated currentWorkflowFolder to "${nextVolumeName}"`);
                  
                  // 记录清除后的状态
                  const afterClearNodesState: Record<string, any[]> = {};
                  const clearedNodes: Array<{ nodeId: string; nodeType: string; nodeLabel: string; previousOutputCount: number; clearedOutputCount: number }> = [];
                  nodesRef.current.forEach(n => {
                    if (['worldview', 'characters', 'plotOutline', 'outline', 'creationInfo'].includes(n.data.typeKey)) {
                      afterClearNodesState[n.id] = n.data.outputEntries || [];
                      const beforeCount = beforeClearNodesState[n.id]?.length || 0;
                      const afterCount = afterClearNodesState[n.id]?.length || 0;
                      if (beforeCount !== afterCount || n.data.typeKey === 'creationInfo') {
                        clearedNodes.push({
                          nodeId: n.id,
                          nodeType: n.data.typeKey,
                          nodeLabel: n.data.label || n.data.typeKey,
                          previousOutputCount: beforeCount,
                          clearedOutputCount: afterCount,
                        });
                      }
                    }
                  });
                  
                  console.log('[VOLUME_SWITCH] Info cleared:', {
                    clearedNodes,
                    nextVolumeName,
                    currentVolumeIndex,
                  });
                  
                  infoClearDebugTracker.recordClearComplete(
                    'volume_switch',
                    {
                      volumeIndex: currentVolumeIndex,
                      volumeName: localNovel.volumes?.find(v => v.id === workflowManager.getActiveVolumeAnchor())?.title || '',
                      nextVolumeName,
                      chapterTitle: currentTitle,
                      loopIndex: workflowManager.getContextVar('loop_index') || 1,
                    },
                    clearedNodes,
                    {
                      clearedWorldviewSets: [],
                      clearedCharacterSets: [],
                      clearedOutlineSets: [],
                      clearedInspirationSets: [],
                      clearedPlotOutlineSets: [],
                    },
                    { nodesOutput: beforeClearNodesState, novelSets: beforeClearNovelSets },
                    { nodesOutput: afterClearNodesState, novelSets: {} }
                  );
                  
                  // Bug 2 修复：在分卷切换时，强制对当前卷的最后一个实际章节触发总结检查
                  // 这样即使章节数不足总结步长，也能在卷完成时触发总结
                  // 注意：必须使用 currentVolumeIndex（更新前）来获取当前完成卷的ID
                  // 因为 workflowManager.getActiveVolumeAnchor() 已经被设置为下一卷的ID了
                  const completedVolId = localNovel.volumes?.[currentVolumeIndex]?.id || '';
                  const completedVolTitle = localNovel.volumes?.[currentVolumeIndex]?.title || '';
                  terminal.log(`[VOLUME_SWITCH] Summary check - completedVolId=${completedVolId}, completedVolTitle="${completedVolTitle}", currentVolumeIndex=${currentVolumeIndex}`);
                  terminal.log(`[VOLUME_SWITCH] Summary check - totalVolumes=${localNovel.volumes?.length || 0}, totalChapters=${localNovel.chapters?.length || 0}`);
                  
                  // 列出当前卷的所有章节
                  const volumeChapters = (localNovel.chapters || [])
                    .filter(c => {
                      const cVolId = c.volumeId || '';
                      return cVolId === completedVolId && (!c.subtype || c.subtype === 'story');
                    });
                  terminal.log(`[VOLUME_SWITCH] Summary check - volumeChapters count=${volumeChapters.length}, chapters=${volumeChapters.map(c => c.title).join(', ')}`);
                  
                  const lastStoryChapter = volumeChapters.pop();

                  if (!completedVolId) {
                    terminal.warn(`[VOLUME_SWITCH] No completedVolId found, skipping summary check`);
                  }
                  
                  if (!lastStoryChapter) {
                    terminal.warn(`[VOLUME_SWITCH] No lastStoryChapter found for completedVolId=${completedVolId}`);
                  }
                  
                  if (!globalConfig.onChapterComplete) {
                    terminal.warn(`[VOLUME_SWITCH] globalConfig.onChapterComplete is not defined`);
                  }

                  if (lastStoryChapter && globalConfig.onChapterComplete) {
                    terminal.log(`[VOLUME_SWITCH] Triggering summary check for last chapter of completed volume: ${lastStoryChapter.title}`);
                    terminal.log(`[VOLUME_SWITCH] Chapter content length: ${lastStoryChapter.content?.length || 0}`);
                    try {
                      const summaryResult = await (globalConfig.onChapterComplete as any)(
                        lastStoryChapter.id,
                        lastStoryChapter.content,
                        localNovel,
                        true,  // forceFinal = true 强制触发总结检查
                      );
                      terminal.log(`[VOLUME_SWITCH] Summary result: ${summaryResult ? 'received' : 'null'}`);
                      if (summaryResult?.chapters) {
                        terminal.log(`[VOLUME_SWITCH] Summary generated, chapters count: ${summaryResult.chapters.length}`);
                        localNovel = summaryResult;
                        await updateLocalAndGlobal(localNovel);
                      } else {
                        terminal.warn(`[VOLUME_SWITCH] Summary result has no chapters`);
                      }
                    } catch (summaryErr) {
                      terminal.error(`[VOLUME_SWITCH] Summary generation failed: ${summaryErr}`);
                    }
                  }
                  
                  await updateLocalAndGlobal(localNovel);
                  
                  return {
                    updatedNovel: localNovel,
                    shouldPauseForVolumeSwitch: true,
                    nextVolumeIndex: nextVolIdx >= 0 ? nextVolIdx : currentVolumeIndex + 1,
                  };
                }
                
                // 如果卷已完成（重写模式或无下一卷），返回停止信号
                if (shouldStopForVolumeComplete) {
                  return {
                    updatedNovel: localNovel,
                    shouldStopForVolumeComplete: true,
                  };
                }
                
                return localNovel;
              },
              async title => {
                // 核心修复：单卷重写模式下，禁止在 onBeforeChapter 中进行分卷切换
                // 单卷重写模式的目的是专注重写当前卷，不应自动进入下一卷
                if (userSpecifiedTargetVolumeId && mode) {
                  terminal.log(`[WORKFLOW] 单卷重写模式：onBeforeChapter 禁止分卷切换`);
                  return;
                }
                
                // 计算即将创建的下一个章节的全局索引
                const storyChaptersCount = (localNovel.chapters || []).filter(
                  c => !c.subtype || c.subtype === 'story'
                ).length;
                const nextGlobalIndex = storyChaptersCount + 1;
                
                const trg = workflowManager.checkTriggerSplit(title, nextGlobalIndex);
                if (trg) {
                  const name = trg.nextVolumeName || '新分卷';
                  const ex = localNovel.volumes?.find(v => v.title === name);
                  let tid = ex?.id || '';
                  if (!ex) {
                    const nv = {
                      id: `vol_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                      title: name,
                      collapsed: false,
                    };
                    tid = nv.id;
                    localNovel = { ...localNovel, volumes: [...(localNovel.volumes || []), nv] };
                  }
                  await updateLocalAndGlobal(localNovel);
                  workflowManager.setActiveVolumeAnchor(tid);
                  workflowManager.markSplitProcessed(trg.chapterTitle, name);
                  return { updatedNovel: localNovel, newVolumeId: tid };
                }
                
                // Bug修复：移除 onBeforeChapter 中的 checkVolumeEndChapter 检查
                // 原来的问题：当 endChapter=2 时，onBeforeChapter("第二章") 会触发 2 >= 2 = true
                // 导致引擎在生成第二章之前就暂停了，第二章永远无法生成
                // 修复：只在 onChapterComplete 中处理分卷切换（章节生成完成后）
              },
              fVolId,
              true,
              outlineSetId,
              abortControllerRef.current?.signal,
              startRunId,
              // 核心修复：传递结构化的工作流上下文消息数组
              // 移除冗余的“小说大纲”条目，因为 AutoWriteEngine 内部会自带更智能的“待创作章节大纲参考”
              dynamicContextMessages.filter(m => !m.content.startsWith('【小说大纲】：')),
            );
          }
          // 核心修复：检查 AutoWriteEngine 的返回值，如果因为卷切换而暂停，则根据模式决定是否停止工作流
          if (chapterResult && typeof chapterResult === 'object' && 'shouldPauseForVolumeSwitch' in chapterResult && chapterResult.shouldPauseForVolumeSwitch) {
            // 正常模式下，卷切换后继续执行工作流
            // 只有在重写模式下才停止工作流
            // 完全重写模式下，应该继续执行工作流以处理后续卷
            if (userSpecifiedTargetVolumeId && mode && mode !== 'full') {
              terminal.log(`[WORKFLOW] AutoWriteEngine paused for volume switch, stopping workflow at node ${node.id}`);
              await syncNodeStatus(node.id, { label: NODE_CONFIGS.chapter.defaultLabel, status: 'completed' }, i);
              setEdgeAnimation(node.id, false);
              // 卷切换暂停：工作流到此停止，用户需要手动重新启动来继续下一卷
              workflowManager.stop();
              clearAllEdgeAnimations();
              keepAliveManager.disable();
              return;
            } else {
              // 正常模式和完全重写模式下，继续执行工作流
              terminal.log(`[WORKFLOW] AutoWriteEngine paused for volume switch, continuing workflow at node ${node.id}`);
              await syncNodeStatus(node.id, { label: NODE_CONFIGS.chapter.defaultLabel, status: 'completed' }, i);
              setEdgeAnimation(node.id, false);
              // 继续执行下一个节点
            }
          }
          // 核心修复：重写卷模式下，卷正文创作完成后（无下一卷）主动停止工作流
          if (chapterResult && typeof chapterResult === 'object' && 'shouldStopForVolumeComplete' in chapterResult && (chapterResult as any).shouldStopForVolumeComplete && mode !== 'full') {
            terminal.log(`[WORKFLOW] Volume complete (no next volume), stopping workflow at node ${node.id}`);
            await syncNodeStatus(node.id, { label: NODE_CONFIGS.chapter.defaultLabel, status: 'completed' }, i);
            setEdgeAnimation(node.id, false);
            workflowManager.stop();
            clearAllEdgeAnimations();
            keepAliveManager.disable();
            return;
          }
          if (checkActive())
            await syncNodeStatus(node.id, { label: NODE_CONFIGS.chapter.defaultLabel, status: 'completed' }, i);
          setEdgeAnimation(node.id, false);
          continue;
        }

        // --- Standard AI Messages ---
        let messages: any[] = [];

        // 1. 获取预设或自定义 Prompts
        let basePrompts: any[] = [];
        if (node.data.overrideAiConfig && node.data.promptItems?.length) {
          basePrompts = node.data.promptItems.filter((p: any) => p.enabled !== false);
        } else {
          basePrompts = (preset as any)?.prompts?.filter((p: any) => p.enabled || p.active) || [];
        }

        // 2. 处理 Prompts (替换 {{context}} 为空，因为我们有独立消息)
        basePrompts.forEach((p: any) => {
          const c = workflowManager.interpolateWithMacros(p.content.replace('{{context}}', ''), macroCtx); // Context 单独注入
          messages.push({ role: p.role, content: p.role === 'user' ? formatMulti(c) : c });
        });

        // 3. 注入参考资料 (Worldview, Files etc) - 这里的 refContext 仍是字符串
        if (refContext.trim()) {
          // 找个合适的位置插入，通常在 System 之后
          messages.splice(1, 0, { role: 'system', content: `【小说知识库和参考】：\n${refContext}` });
        }

        // 4. 注入前序节点上下文 (Messages)
        // 插入到消息列表中部，紧跟 System/Reference 之后，User Instruction 之前
        // 简单的做法是：如果有 system 消息，插在最后一个 system 后面。如果没有，插在最前面。
        let lastSystemIdx = -1;
        for (let k = messages.length - 1; k >= 0; k--) {
          if (messages[k].role === 'system') {
            lastSystemIdx = k;
            break;
          }
        }
        // 核心修复：同时插入 dynamicContextMessages (节点输出) 和 summaryContextMessages (剧情总结)
        messages.splice(lastSystemIdx + 1, 0, ...summaryContextMessages, ...dynamicContextMessages);

        // 5. 注入本节点 User Instruction
        if (node.data.instruction) {
          messages.push({
            role: 'user',
            content: formatMulti(workflowManager.interpolateWithMacros(node.data.instruction, macroCtx)),
          });
        } else if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
          messages.push({ role: 'user', content: '请生成内容' });
        }
        if (specificInstruction)
          messages.push({
            role: 'user',
            content: formatMulti(`【第 ${currentLoopIdxVar} 轮循环特定指令】：\n${specificInstruction}`),
          });

        const nApi = (preset as any)?.apiConfig || {};
        let featModel = globalConfig.model;
        if (node.data.typeKey === 'outline') featModel = globalConfig.outlineModel;
        else if (node.data.typeKey === 'characters') featModel = globalConfig.characterModel;
        else if (node.data.typeKey === 'worldview') featModel = globalConfig.worldviewModel;
        else if (node.data.typeKey === 'inspiration') featModel = globalConfig.inspirationModel;
        else if (node.data.typeKey === 'plotOutline') featModel = globalConfig.plotOutlineModel;

        const fModel =
          node.data.overrideAiConfig && node.data.model
            ? node.data.model
            : nApi.model || featModel || globalConfig.model;
        const fTemp =
          node.data.overrideAiConfig && node.data.temperature !== undefined
            ? node.data.temperature
            : (preset?.temperature ?? globalConfig.temperature);
        const fTopP =
          node.data.overrideAiConfig && node.data.topP !== undefined
            ? node.data.topP
            : (preset?.topP ?? globalConfig.topP);
        const fTopK =
          node.data.overrideAiConfig && node.data.topK !== undefined
            ? node.data.topK
            : ((preset as any)?.topK ?? globalConfig.topK);
        const fMaxT =
          node.data.overrideAiConfig && node.data.maxTokens
            ? node.data.maxTokens
            : (preset as any)?.maxReplyLength || globalConfig.maxReplyLength;

        const openai = new OpenAI({
          apiKey:
            node.data.overrideAiConfig && node.data.apiKey ? node.data.apiKey : nApi.apiKey || globalConfig.apiKey,
          baseURL:
            node.data.overrideAiConfig && node.data.baseUrl ? node.data.baseUrl : nApi.baseUrl || globalConfig.baseUrl,
          dangerouslyAllowBrowser: true,
        });

        let aiRes = '',
          entriesToStore: any[] = [],
          retry = 0,
          nodeDone = false,
          iter = 0,
          currMsgs = [...messages],
          accEntries: OutputEntry[] = [];
        const tEnd =
          extractTargetEndChapter(node.data.instruction || '') ||
          (specificInstruction ? extractTargetEndChapter(specificInstruction) : null);

        while (retry <= 2 && !nodeDone) {
          if (retry > 0) {
            await new Promise(res => setTimeout(res, 1500 * Math.pow(2, retry - 1)));
          }
          try {
            console.groupCollapsed(
              `[Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${retry > 0 ? ` (重试 ${retry})` : ''}${
                iter > 0 ? ` (续写 ${iter})` : ''
              }`,
            );
            console.log('Messages:', currMsgs);
            console.log('Config:', {
              model: fModel,
              temperature: fTemp,
              topP: fTopP,
              topK: fTopK,
              maxTokens: fMaxT,
            });
            console.groupEnd();

            terminal.log(`
>> AI REQUEST [工作流: ${node.data.typeLabel}]
>> -----------------------------------------------------------
>> Model:       ${fModel}
>> Temperature: ${fTemp}
>> Top P:       ${fTopP}
>> Top K:       ${fTopK}
>> -----------------------------------------------------------
`);

            let requestParams: any = {
              model: fModel,
              messages: currMsgs,
              temperature: fTemp,
              top_p: fTopP,
              max_tokens: fMaxT,
            };
            let fallbackMode = 0;
            if (fTopK && fTopK > 0 && fallbackMode < 1) {
              requestParams.top_k = fTopK;
            }
            
            let completion;
            try {
              completion = await openai.chat.completions.create(
                requestParams,
                { signal: abortControllerRef.current?.signal },
              );
            } catch (apiError: any) {
              if (apiError.status === 400) {
                const errorBody = apiError.error?.message || apiError.message || 'Unknown error';
                terminal.warn(`API 400 错误: ${errorBody}`);
                
                if (requestParams.top_k && fallbackMode < 1) {
                  terminal.warn('尝试移除 top_k 参数重试');
                  delete requestParams.top_k;
                  fallbackMode = 1;
                  completion = await openai.chat.completions.create(
                    requestParams,
                    { signal: abortControllerRef.current?.signal },
                  );
                } else if (fallbackMode < 2) {
                  terminal.warn('尝试简化参数重试 (移除 top_p)');
                  delete requestParams.top_p;
                  requestParams.temperature = 1.0;
                  fallbackMode = 2;
                  completion = await openai.chat.completions.create(
                    requestParams,
                    { signal: abortControllerRef.current?.signal },
                  );
                } else if (retry < 2) {
                  retry++;
                  continue;
                } else {
                  throw apiError;
                }
              } else {
                throw apiError;
              }
            }
            
            aiRes = completion.choices[0]?.message?.content || '';
            // 核心修复：添加 AI 响应日志
            terminal.log(`[WORKFLOW] ${node.data.typeLabel} - ${node.data.label} AI 响应已接收, 长度: ${aiRes.length}`);
            if (!aiRes?.trim()) {
              terminal.warn(`[WORKFLOW] ${node.data.typeLabel} - ${node.data.label} AI 返回内容为空`);
              if (retry < 2) {
                retry++;
                continue;
              }
              throw new Error('AI 返回内容为空。');
            }

            try {
              const parsed = await cleanAndParseJSON(aiRes);
              entriesToStore = await extractEntries(parsed);
            } catch (parseError: any) {
              // 核心修复：添加 JSON 解析错误日志
              terminal.warn(`[WORKFLOW] JSON 解析失败 (${node.data.typeLabel}): ${parseError.message}`);
              console.warn(`[WORKFLOW] JSON 解析失败，完整原始响应:`, aiRes);
              if (
                ['outline', 'plotOutline', 'characters', 'worldview'].includes(node.data.typeKey as string) &&
                retry < 2
              ) {
                // 向AI发送错误信息，让其修正格式
                currMsgs = [
                  ...currMsgs,
                  { role: 'assistant', content: aiRes },
                  {
                    role: 'user',
                    content: `(系统提示：你生成的内容格式有误，无法解析为JSON。请修正错误，仅输出正确的JSON格式内容，不要添加任何其他说明文字。确保JSON格式严格正确，包括正确的引号、逗号和括号。)`,
                  },
                ];
                retry++;
                continue;
              }
              entriesToStore = [{ title: `生成结果 ${new Date().toLocaleTimeString()}`, content: aiRes }];
            }

            const isOut = node.data.typeKey === 'outline' || node.data.typeKey === 'plotOutline';
            const currIterEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({
              id: `${Date.now()}-${iter}-${idx}`,
              title: e.title,
              content: e.content,
            }));

            if (isOut) {
              // Check if we need to use volume planner chapter count instead of tEnd
              let requiredChapterCount = null;
              let startChapter = 1;
              let endChapter = tEnd;
              
              // Get current volume plan from workflowManager
              const volumePlans = workflowManager.getVolumePlans();
              const currentVolumeIndex = workflowManager.getCurrentVolumeIndex();
              
              if (volumePlans.length > 0 && currentVolumeIndex >= 0 && currentVolumeIndex < volumePlans.length) {
                const currentVolumePlan = volumePlans[currentVolumeIndex];
                if (currentVolumePlan.startChapter !== undefined && currentVolumePlan.endChapter !== undefined) {
                  startChapter = currentVolumePlan.startChapter;
                  endChapter = currentVolumePlan.endChapter;
                  requiredChapterCount = (endChapter - startChapter) + 1;
                  terminal.log(`[OUTLINE] Volume planner detected: chapters ${startChapter}-${endChapter}, required: ${requiredChapterCount}`);
                }
              }
              
              // Use either volume planner count or tEnd
              const targetEnd = requiredChapterCount ? endChapter : tEnd;
              
              if (targetEnd) {
                const lastNum = parseAnyNumber(entriesToStore[entriesToStore.length - 1]?.title || '');
                const currentEntryCount = entriesToStore.length;
                const neededCount = requiredChapterCount || (targetEnd - startChapter + 1);
                
                terminal.log(`[OUTLINE] Current entries: ${currentEntryCount}, needed: ${neededCount}, last chapter: ${lastNum}`);
                
                if ((lastNum && lastNum < targetEnd) || (requiredChapterCount && currentEntryCount < requiredChapterCount) && iter < 5) {
                  accEntries = [...accEntries, ...currIterEntries];
                  await syncNodeStatus(
                    node.id,
                    {
                      outputEntries: [
                        ...(nodesRef.current.find(n => n.id === node.id)?.data.outputEntries || []),
                        ...currIterEntries,
                      ],
                    },
                    i,
                  );
                  iter++;
                  
                  let followUpMessage = '';
                  if (requiredChapterCount) {
                    followUpMessage = `(系统提示：当前生成了 ${currentEntryCount} 个大纲条目，但分卷规划需要 ${requiredChapterCount} 个条目（第 ${startChapter} 章到第 ${endChapter} 章）。请继续生成剩余的大纲条目，不要重复已有的内容。严格遵守 JSON 格式。)`;
                  } else if (lastNum) {
                    followUpMessage = `(系统接龙：刚才只到第 ${lastNum} 章。请不要重复，直接从第 ${lastNum + 1} 章开始继续到第 ${targetEnd} 章。严格遵守 JSON。)`;
                  }
                  
                  currMsgs = [
                    ...currMsgs,
                    { role: 'assistant', content: aiRes },
                    {
                      role: 'user',
                      content: followUpMessage,
                    },
                  ];
                  continue;
                }
              }
            }
            accEntries = [...accEntries, ...currIterEntries];
            nodeDone = true;
          } catch (e: any) {
            // 核心修复：添加错误日志，避免错误被静默吞掉
            terminal.error(`[WORKFLOW ERROR] ${node.data.typeLabel} - ${node.data.label} 执行失败: ${e.message || e}`);
            console.error(`[WORKFLOW ERROR] ${node.data.typeLabel} - ${node.data.label}:`, e);
            if (e.name === 'AbortError' || retry === 2) throw e;
            retry++;
            terminal.log(`[WORKFLOW] 重试 ${retry}/2...`);
          }
        }

        if (node.data.variableBinding?.length)
          workflowManager.processVariableBindings(node.data.variableBinding, aiRes);
        const finalHistory = nodesRef.current.find(n => n.id === node.id)?.data.outputEntries || [];
        const savedIds = new Set(finalHistory.map(e => e.id));
        const unsaved = accEntries.filter(e => !savedIds.has(e.id));
        // 核心修复：添加节点完成日志
        terminal.log(`[WORKFLOW] ${node.data.typeLabel} - ${node.data.label} 执行完成, 条目数: ${accEntries.length}`);
        await syncNodeStatus(node.id, { status: 'completed', outputEntries: [...finalHistory, ...unsaved] }, i);

        // Update Novel Sets
        let upNovel = { ...localNovel };
        let changed = false;
        const folder = node.data.folderName || currentWorkflowFolder;
        
        const upSets = (sets: any[] | undefined, type: string) => {
          if (!sets) sets = [];

          // 核心修复：归档集合必须优先写入“当前目标文件夹/卷”。
          // 旧逻辑在找不到同名集合时会退回 sets[0]，导致指定卷启动后内容被错误塞进第一个文件夹。
          const normalizedFolder = (folder || '').trim();
          let target = normalizedFolder ? sets.find(s => s.name === normalizedFolder) : undefined;

          if (!target) {
            target = {
              id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: normalizedFolder || '默认集合',
              entries: [],
              characters: [],
              items: [],
            };
            sets = [...sets, target];
            terminal.log(
              `[WORKFLOW_FOLDER_FIX] Created new ${type} set for folder="${normalizedFolder || '默认集合'}" instead of falling back to first set`,
            );
          }

          const news = [
            ...(type === 'worldview' ? target.entries : type === 'character' ? target.characters : target.items),
          ];
          accEntries.forEach(e => {
            const tk = type === 'worldview' ? 'item' : type === 'character' ? 'name' : 'title';
            const ck =
              type === 'worldview'
                ? 'setting'
                : type === 'character'
                  ? 'bio'
                  : type === 'plotOutline'
                    ? 'description'
                    : type === 'inspiration'
                      ? 'content'
                      : 'summary';
            const idx = news.findIndex((ni: any) => ni[tk] === e.title);
            const ni = { [tk]: e.title, [ck]: e.content };
            if (type === 'plotOutline' && idx === -1) (ni as any).id = `plot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            if (idx !== -1) news[idx] = { ...news[idx], ...ni };
            else news.push(ni);
          });
          if (type === 'outline')
            news.sort((a: any, b: any) => (parseAnyNumber(a.title) || 0) - (parseAnyNumber(b.title) || 0));
          changed = true;
          return sets.map(s =>
            s.id === target.id
              ? { ...s, [type === 'worldview' ? 'entries' : type === 'character' ? 'characters' : 'items']: news }
              : s,
          );
        };

        if (node.data.typeKey === 'worldview')
          upNovel.worldviewSets = upSets(upNovel.worldviewSets, 'worldview');
        else if (node.data.typeKey === 'characters')
          upNovel.characterSets = upSets(upNovel.characterSets, 'character');
        else if (node.data.typeKey === 'outline') 
          upNovel.outlineSets = upSets(upNovel.outlineSets, 'outline');
        else if (node.data.typeKey === 'inspiration')
          upNovel.inspirationSets = upSets(upNovel.inspirationSets, 'inspiration');
        else if (node.data.typeKey === 'plotOutline')
          upNovel.plotOutlineSets = upSets(upNovel.plotOutlineSets, 'plotOutline');

        if (changed) await updateLocalAndGlobal(upNovel);

        // lastNodeOutput += ... (已移除，改用动态构建)
        setEdgeAnimation(node.id, false);

        // Auto Loop Back Check
        const outEdges = (workflowsRef.current.find(w => w.id === activeWorkflowId)?.edges || []).filter(
          e => e.source === node.id,
        );
        const loopBack = outEdges.find(e => nodesRef.current.find(n => n.id === e.target)?.data.typeKey === 'loopNode');
        if (loopBack) {
          const tIdx = sortedNodes.findIndex(sn => sn.id === loopBack.target);
          if (tIdx !== -1 && tIdx <= i) {
            // 第四次修复：回跳前关闭当前节点的动画，防止动画状态泄漏
            setEdgeAnimation(node.id, false);
            workflowManager.setContextVar('loop_index', (workflowManager.getContextVar('loop_index') || 1) + 1);
            i = tIdx - 1;
            continue;
          }
        }
      }

      // 只有当前实例仍是活跃 RunID 时，才执行自动完成逻辑 (防止被 pause/abort 的实例错误触发 stop)
      if (!stopRequestedRef.current && workflowManager.isRunActive(startRunId)) {
        workflowManager.stop();
        clearAllEdgeAnimations();
        keepAliveManager.disable();
      }
    } catch (e: any) {
      keepAliveManager.disable();
      const isAbort = e.name === 'AbortError' || /aborted/i.test(e.message);
      if (isAbort) {
        workflowManager.pause(workflowManager.getState().currentNodeIndex);
      } else {
        workflowManager.setError(e.message);
        setError(`执行失败: ${e.message}`);
        const realIdx = workflowManager.getState().currentNodeIndex;
        const failedNode = getOrderedNodes()[realIdx];
        if (failedNode)
          setNodes(nds =>
            nds.map(n => (n.id === failedNode.id ? { ...n, data: { ...n.data, status: 'failed' as const } } : n)),
          );
      }
      clearAllEdgeAnimations();
    }
  };

  const stopWorkflow = () => {
    const realIdx = workflowManager.getState().currentNodeIndex;
    const updatedWorkflows = workflowsRef.current.map(w => {
      if (w.id === activeWorkflowId) {
        return {
          ...w,
          nodes: nodesRef.current,
          currentNodeIndex: realIdx,
          lastModified: Date.now(),
          contextSnapshot: workflowManager.getSnapshot(),
        };
      }
      return w;
    });
    storage.saveWorkflows(updatedWorkflows).catch(e => terminal.error(`[ENGINE] 停止保存失败: ${e}`));

    stopRequestedRef.current = true;
    abortControllerRef.current?.abort();
    workflowManager.pause(realIdx);
    setNodes(nds =>
      nds.map(n => ({
        ...n,
        data: { ...n.data, status: n.data.status === 'executing' ? 'pending' : (n.data.status as any) },
      })),
    );
    clearAllEdgeAnimations();
    keepAliveManager.disable();
  };

  const resumeWorkflow = () => {
    const savedNodeId = workflowManager.getCurrentNodeId();
    const orderedNodes = getOrderedNodes();
    
    let actualStartIndex = currentNodeIndex;
    
    // 如果保存了节点ID，优先使用节点ID查找正确的索引
    if (savedNodeId) {
      const nodeIndex = orderedNodes.findIndex(node => node.id === savedNodeId);
      if (nodeIndex !== -1) {
        actualStartIndex = nodeIndex;
        terminal.log(`[Workflow Engine] Resuming from saved node ID ${savedNodeId} at index ${actualStartIndex}`);
      } else {
        terminal.warn(`[Workflow Engine] Saved node ID ${savedNodeId} not found, falling back to index ${currentNodeIndex}`);
      }
    }
    
    if (actualStartIndex !== -1) {
      runWorkflow({ startIndex: actualStartIndex });
    }
  };

  const resetWorkflowStatus = async () => {
    if (
      confirm(
        '确定要重置当前工作流吗？\n\n1. 所有节点进度将归零\n2. 已生成的章节正文将保留\n3. 正在运行的任务将被强制中止',
      )
    ) {
      stopRequestedRef.current = true;
      abortControllerRef.current?.abort();

      clearAutoSaveTimeout?.();
      
      // ===== 详细调试日志：重置前状态 =====
      terminal.log(`[DEBUG-RESET] ===== 开始重置工作流 =====`);
      terminal.log(`[DEBUG-RESET] activeWorkflowId: ${activeWorkflowId}`);
      terminal.log(`[DEBUG-RESET] nodesRef.current.length: ${nodesRef.current.length}`);
      terminal.log(`[DEBUG-RESET] workflowsRef.current.length: ${workflowsRef.current.length}`);
      
      // 打印 nodesRef 中每个节点的详细信息
      nodesRef.current.forEach((n, i) => {
        const dataKeys = Object.keys(n.data || {}).filter(k => n.data[k] !== undefined && n.data[k] !== null && n.data[k] !== '');
        terminal.log(`[DEBUG-RESET]   node[${i}] typeKey=${n.data.typeKey}, label=${n.data.label}, dataKeys=${dataKeys.length}`);
        if (n.data.instruction) {
          terminal.log(`[DEBUG-RESET]     instruction: ${n.data.instruction.substring(0, 50)}...`);
        }
        if (n.data.splitRules && (n.data.splitRules as any[]).length > 0) {
          terminal.log(`[DEBUG-RESET]     splitRules: ${(n.data.splitRules as any[]).length} items`);
        }
        if (n.data.volumeContent) {
          terminal.log(`[DEBUG-RESET]     volumeContent: ${n.data.volumeContent.substring(0, 50)}...`);
        }
      });
      
      // 打印 workflowsRef 中每个工作流的 id 和 nodes 数量
      workflowsRef.current.forEach((w, i) => {
        terminal.log(`[DEBUG-RESET]   workflow[${i}] id=${w.id}, nodes=${w.nodes?.length || 0}`);
      });
      
      const updatedNodes = nodesRef.current.map(n => {
        const updates: any = {
          status: 'pending' as const,
          outputEntries: [],
          loopInstructions: [],
        };

        if (n.data.typeKey === 'chapter') {
          updates.label = NODE_CONFIGS.chapter.defaultLabel;
          updates.targetVolumeName = '';
        }

        if (n.data.typeKey === 'saveToVolume') {
          updates.splitRules = [];
          updates.volumeContent = '';
        }

        if (n.data.typeKey === 'loopConfigurator') {
          updates.globalLoopInstructions = [];
          updates.generatedLoopConfig = '';
        }

        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = { ...n.data.loopConfig, currentIndex: 0 };
        }

        return { ...n, data: { ...n.data, ...updates } };
      });

      terminal.log(`[DEBUG-RESET] updatedNodes.length: ${updatedNodes.length}`);

      // 先更新 UI
      nodesRef.current = updatedNodes;
      setNodes(updatedNodes);
      setCurrentNodeIndex(-1);
      setIsPaused(false);
      setError(null);
      clearAllEdgeAnimations();

      workflowManager.stop();

      // 直接从存储读取最新工作流列表
      try {
        const latestWorkflows = await storage.getWorkflows();
        terminal.log(`[DEBUG-RESET] Read ${latestWorkflows.length} workflows from storage`);
        
        latestWorkflows.forEach((w, i) => {
          terminal.log(`[DEBUG-RESET]   latestWorkflow[${i}] id=${w.id}, nodes=${w.nodes?.length || 0}, edges=${w.edges?.length || 0}`);
        });
        
        const targetWorkflow = latestWorkflows.find(w => w.id === activeWorkflowId);
        if (!targetWorkflow) {
          terminal.error(`[DEBUG-RESET] ERROR: 找不到目标工作流 id=${activeWorkflowId}`);
          terminal.error(`[DEBUG-RESET] 可用的工作流 IDs: ${latestWorkflows.map(w => w.id).join(', ')}`);
          return;
        }
        
        terminal.log(`[DEBUG-RESET] 找到目标工作流: ${targetWorkflow.name || 'unnamed'}`);
        terminal.log(`[DEBUG-RESET] 目标工作流 nodes 数量: ${targetWorkflow.nodes?.length || 0}`);
        terminal.log(`[DEBUG-RESET] 目标工作流 edges 数量: ${targetWorkflow.edges?.length || 0}`);
        
        const updatedWorkflows = latestWorkflows.map(w => {
          if (w.id === activeWorkflowId) {
            terminal.log(`[DEBUG-RESET] 更新工作流: ${w.id}`);
            terminal.log(`[DEBUG-RESET]   新 nodes 数量: ${updatedNodes.length}`);
            terminal.log(`[DEBUG-RESET]   保留 edges 数量: ${w.edges?.length || 0}`);
            return {
              ...w,
              nodes: updatedNodes,
              edges: w.edges || [],
              currentNodeIndex: -1,
              lastModified: Date.now(),
              contextSnapshot: undefined,
            };
          }
          return w;
        });
        
        // 打印即将保存的数据摘要
        const savedWorkflow = updatedWorkflows.find(w => w.id === activeWorkflowId);
        if (savedWorkflow) {
          terminal.log(`[DEBUG-RESET] 即将保存的工作流: id=${savedWorkflow.id}`);
          terminal.log(`[DEBUG-RESET]   nodes 数量: ${savedWorkflow.nodes?.length || 0}`);
          terminal.log(`[DEBUG-RESET]   edges 数量: ${savedWorkflow.edges?.length || 0}`);
          terminal.log(`[DEBUG-RESET]   第一个节点 typeKey: ${savedWorkflow.nodes?.[0]?.data?.typeKey || 'N/A'}`);
        }
        
        // 保存到存储
        terminal.log(`[DEBUG-RESET] 调用 storage.saveWorkflows...`);
        await storage.saveWorkflows(updatedWorkflows);
        terminal.log(`[DEBUG-RESET] storage.saveWorkflows 完成`);
        
        // 验证保存后的数据
        const verifyWorkflows = await storage.getWorkflows();
        const verifyWorkflow = verifyWorkflows.find(w => w.id === activeWorkflowId);
        if (verifyWorkflow) {
          terminal.log(`[DEBUG-RESET] 验证: 保存后读取的工作流 nodes 数量: ${verifyWorkflow.nodes?.length || 0}`);
          terminal.log(`[DEBUG-RESET] 验证: 保存后读取的工作流 edges 数量: ${verifyWorkflow.edges?.length || 0}`);
          terminal.log(`[DEBUG-RESET] 验证: 第一个节点 typeKey: ${verifyWorkflow.nodes?.[0]?.data?.typeKey || 'N/A'}`);
        } else {
          terminal.error(`[DEBUG-RESET] 验证失败: 保存后找不到目标工作流`);
        }
        
        // 同步更新 React state 和 ref
        setWorkflows?.(updatedWorkflows);
        workflowsRef.current = updatedWorkflows;
        
        terminal.log(`[DEBUG-RESET] ===== 重置完成 =====`);
      } catch (e) {
        terminal.error(`[DEBUG-RESET] 重置保存失败: ${e}`);
        terminal.error(`[DEBUG-RESET] 错误堆栈:`, e instanceof Error ? e.stack : 'N/A');
      }
    }
  };

  // 辅助功能：获取整合后的模型列表 (两端共用)
  const getConsolidatedModelList = useCallback(() => {
    const list = [...(globalConfig?.modelList || [])];
    if (globalConfig?.model) list.push(globalConfig.model);
    if (globalConfig?.outlineModel) list.push(globalConfig.outlineModel);
    if (globalConfig?.characterModel) list.push(globalConfig.characterModel);
    if (globalConfig?.worldviewModel) list.push(globalConfig.worldviewModel);
    if (globalConfig?.inspirationModel) list.push(globalConfig.inspirationModel);
    if (globalConfig?.plotOutlineModel) list.push(globalConfig.plotOutlineModel);
    if (globalConfig?.optimizeModel) list.push(globalConfig.optimizeModel);
    if (globalConfig?.analysisModel) list.push(globalConfig.analysisModel);

    const presetTypes = [
      'outline',
      'character',
      'worldview',
      'inspiration',
      'plotOutline',
      'completion',
      'optimize',
      'analysis',
      'chat',
      'generator',
    ];
    presetTypes.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        if (saved) {
          const presets = JSON.parse(saved) as GeneratorPreset[];
          presets.forEach(p => {
            if (p.apiConfig?.model) list.push(p.apiConfig.model);
          });
        }
      } catch (e) {}
    });

    Object.values(allPresets)
      .flat()
      .forEach(p => {
        if (p.apiConfig?.model) list.push(p.apiConfig.model);
      });

    return Array.from(new Set(list.filter(Boolean)));
  }, [globalConfig, allPresets]);

  return {
    isRunning,
    isPaused,
    currentNodeIndex,
    error,
    setError,
    runWorkflow,
    stopWorkflow,
    resumeWorkflow,
    resetWorkflowStatus,
    syncNodeStatus,
    getConsolidatedModelList,
  };
};

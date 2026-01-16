import { Edge } from '@xyflow/react';
import OpenAI from 'openai';
import { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { GeneratorPreset, GeneratorPrompt, LoopInstruction, Novel } from '../../../types';
import { AutoWriteEngine } from '../../../utils/auto-write';
import { keepAliveManager } from '../../../utils/KeepAliveManager';
import { storage } from '../../../utils/storage';
import { workflowManager } from '../../../utils/WorkflowManager';
import { NODE_CONFIGS, WORKFLOW_DSL_PROMPT } from '../constants';
import { NodeTypeKey, OutputEntry, WorkflowData, WorkflowNode, WorkflowNodeData } from '../types';
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
  } = options;

  const [isRunning, setIsRunning] = useState(workflowManager.getState().isRunning);
  const [isPaused, setIsPaused] = useState(workflowManager.getState().isPaused);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(workflowManager.getState().currentNodeIndex);
  const [error, setError] = useState<string | null>(null);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeNovelRef = useRef(activeNovel);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);

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
      if (abortControllerRef.current?.signal.aborted) return;

      const latestNodes = nodesRef.current.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
      nodesRef.current = latestNodes;
      setNodes(latestNodes);

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

  // 执行引擎核心逻辑
  const runWorkflow = async (startIndex: number = 0) => {
    const logPrefix = isMobile ? '[Mobile Workflow]' : '[WORKFLOW]';
    terminal.log(`${logPrefix} 准备执行工作流, 起始索引: ${startIndex}`);

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

      const checkActive = () => {
        if (stopRequestedRef.current) return false;
        if (!workflowManager.isRunActive(startRunId)) {
          terminal.warn(`${logPrefix} 侦测到过时执行实例 (RunID: ${startRunId})，拦截更新。`);
          return false;
        }
        return true;
      };

      const resetNodeData = (n: WorkflowNode): WorkflowNode => {
        const updates: any = { status: 'pending', outputEntries: [] };
        if (n.data.typeKey === 'chapter') {
          updates.label = NODE_CONFIGS.chapter.defaultLabel;
        }
        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = { ...n.data.loopConfig, currentIndex: 0 };
        }
        return { ...n, data: { ...n.data, ...updates } };
      };

      const initialResetNodes = nodesRef.current.map(n => {
        const nodeInSorted = sortedNodes.findIndex(sn => sn.id === n.id);
        return nodeInSorted >= startIndex ? resetNodeData(n) : n;
      });
      nodesRef.current = initialResetNodes;
      setNodes(initialResetNodes);

      setEdges(eds =>
        eds.map(e => {
          const targetInSorted = sortedNodes.findIndex(sn => sn.id === e.target);
          return targetInSorted >= startIndex ? { ...e, animated: false } : e;
        }),
      );

      sortedNodes = sortedNodes.map((sn, idx) => (idx >= startIndex ? resetNodeData(sn) : sn));

      let accumContext = '';
      let lastNodeOutput = '';
      let currentWorkflowFolder = '';

      if (startIndex > 0) {
        for (let j = 0; j < startIndex; j++) {
          const prevNode = sortedNodes[j];
          if (prevNode.data.typeKey === 'createFolder' || prevNode.data.typeKey === 'reuseDirectory') {
            currentWorkflowFolder = prevNode.data.folderName || currentWorkflowFolder;
          } else if (prevNode.data.typeKey === 'userInput') {
            accumContext += `【全局输入】：\n${prevNode.data.instruction}\n\n`;
          } else if (prevNode.data.typeKey === 'saveToVolume') {
            if (prevNode.data.splitRules && (prevNode.data.splitRules as any[]).length > 0) {
              workflowManager.setPendingSplits(prevNode.data.splitRules as any[]);
            }
            if (prevNode.data.targetVolumeId) {
              workflowManager.setActiveVolumeAnchor(prevNode.data.targetVolumeId as string);
            }
          }

          if (!workflowManager.getActiveVolumeAnchor() && localNovel.chapters && localNovel.chapters.length > 0) {
            for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
              const chap = localNovel.chapters[k];
              if (chap.volumeId) {
                workflowManager.setActiveVolumeAnchor(chap.volumeId);
                break;
              }
            }
          }

          if (prevNode.data.outputEntries && prevNode.data.outputEntries.length > 0) {
            const allHistory = [...prevNode.data.outputEntries]
              .reverse()
              .map(e => e.content)
              .join('\n\n---\n\n');
            lastNodeOutput += `【${prevNode.data.typeLabel}输出历史】：\n${allHistory}\n\n`;
          }
        }
      }

      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (!checkActive()) {
          workflowManager.pause(i);
          break;
        }

        const node = nodesRef.current.find(n => n.id === sortedNodes[i].id) || sortedNodes[i];
        workflowManager.updateProgress(i);
        logMemory();

        // --- Pause Node ---
        if (node.data.typeKey === 'pauseNode') {
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          workflowManager.pause(i + 1);
          stopRequestedRef.current = true;
          return;
        }

        // --- Save To Volume Node ---
        if (node.data.typeKey === 'saveToVolume') {
          await syncNodeStatus(node.id, { status: 'executing' }, i);

          if (!node.data.overrideAiConfig) {
            let targetVolumeId = node.data.targetVolumeId as string;
            if (targetVolumeId === 'NEW_VOLUME' && node.data.targetVolumeName) {
              const newVolume = {
                id: `vol_${Date.now()}`,
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
            if (rules.length > 0) workflowManager.setPendingSplits(rules);
            await syncNodeStatus(node.id, { status: 'completed' }, i);
            setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
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

          const planningFinalContextStr = `${planningRefContext}${accumContext}${
            lastNodeOutput ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''
          }`;

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
          if (nodePromptItems.length > 0) {
            let hasContextPlaceholder = false;
            planningMessages = nodePromptItems
              .filter(p => p.enabled !== false)
              .map(p => {
                if (p.content.includes('{{context}}')) hasContextPlaceholder = true;
                const content = workflowManager.interpolate(p.content.replace('{{context}}', planningFinalContextStr));
                return { role: p.role, content: p.role === 'user' ? formatAtts(content) : content };
              });
            if (!hasContextPlaceholder && planningFinalContextStr.trim()) {
              planningMessages.unshift({
                role: 'user',
                content: formatAtts(`【参考背景与全局输入】：\n${planningFinalContextStr}`),
              });
            }
          } else {
            planningMessages = [
              { role: 'system', content: '你是一名拥有丰富经验特的长篇小说架构师。' },
              {
                role: 'user',
                content: formatAtts(`请根据以下参考资料和全局要求规划分卷大纲：\n\n${planningFinalContextStr}`),
              },
            ];
          }
          if (node.data.instruction)
            planningMessages.push({ role: 'user', content: workflowManager.interpolate(node.data.instruction) });

          let aiResponse = '';
          let volRetryCount = 0;
          const maxVolRetries = 2;
          let volSuccess = false;

          while (volRetryCount <= maxVolRetries && !volSuccess) {
            if (volRetryCount > 0) {
              setNodes(nds =>
                nds.map(n =>
                  n.id === node.id
                    ? { ...n, data: { ...n.data, label: `重试规划(${volRetryCount}/${maxVolRetries})...` } }
                    : n,
                ),
              );
              await new Promise(res => setTimeout(res, 2000));
            }

            try {
              if (isMobile) {
                console.groupCollapsed(
                  `[Mobile Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${
                    volRetryCount > 0 ? ` (重试 ${volRetryCount})` : ''
                  }`,
                );
                console.log('Messages:', planningMessages);
                console.log('Config:', {
                  model: planningModel,
                  temperature: node.data.temperature ?? 0.7,
                });
                console.groupEnd();
              }

              const volCompletion = await volOpenai.chat.completions.create(
                {
                  model: planningModel,
                  messages: planningMessages,
                  temperature: node.data.temperature ?? 0.7,
                } as any,
                { signal: abortControllerRef.current?.signal },
              );

              aiResponse = volCompletion.choices[0]?.message?.content || '';
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

          const parsedRules = workflowManager.parseVolumesFromAI(aiResponse);
          if (parsedRules.length > 0) {
            await syncNodeStatus(
              node.id,
              {
                splitRules: parsedRules,
                volumeContent: aiResponse,
                outputEntries: [{ id: `vol_plan_${Date.now()}`, title: '分卷规划结果', content: aiResponse }],
                status: 'completed',
              },
              i,
            );
            workflowManager.setPendingSplits(parsedRules);
            const firstVolName = parsedRules[0].nextVolumeName;
            if (firstVolName) {
              const existingVol = localNovel.volumes?.find(v => v.title === firstVolName);
              if (existingVol) workflowManager.setActiveVolumeAnchor(existingVol.id);
            }
          } else {
            await syncNodeStatus(
              node.id,
              {
                status: 'failed',
                volumeContent: aiResponse,
                outputEntries: [
                  { id: `vol_plan_fail_${Date.now()}`, title: '分卷规划 (解析失败)', content: aiResponse },
                ],
              },
              i,
            );
            throw new Error('无法从 AI 返回的内容中解析出分卷规划。');
          }

          lastNodeOutput += `【分卷规划内容】：\n${node.data.volumeContent || aiResponse}\n\n`;
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        // --- Loop Node ---
        if (node.data.typeKey === 'loopNode') {
          const loopConfig = node.data.loopConfig || { enabled: true, count: 1, currentIndex: 0 };
          const currentLoopIndex = (loopConfig.currentIndex || 0) + 1;

          await syncNodeStatus(
            node.id,
            {
              status: 'executing',
              loopConfig: { ...loopConfig, currentIndex: currentLoopIndex - 1 },
            },
            i,
          );

          setEdges(eds => eds.map(e => ({ ...e, animated: e.target === node.id })));
          await new Promise(resolve => setTimeout(resolve, 600));

          if (currentLoopIndex < loopConfig.count) {
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

                const nextNodes = nodesRef.current.map(n => {
                  if (resetNodeIds.has(n.id)) {
                    if (n.id === node.id)
                      return {
                        ...n,
                        data: {
                          ...n.data,
                          status: 'pending' as const,
                          loopConfig: { ...loopConfig, currentIndex: currentLoopIndex },
                        },
                      };
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'pending' as const,
                        label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
                      },
                    };
                  }
                  return n;
                });

                nodesRef.current = nextNodes;
                setNodes(nextNodes);
                i = targetIndex - 1;
                workflowManager.setContextVar('loop_index', currentLoopIndex + 1);
                await syncNodeStatus(
                  node.id,
                  { status: 'pending', loopConfig: { ...loopConfig, currentIndex: currentLoopIndex } },
                  i,
                );
                continue;
              }
            }
          } else {
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
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        if (node.data.skipped) {
          const skippedNodes = nodesRef.current.map(n =>
            n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' as const } } : n,
          );
          nodesRef.current = skippedNodes;
          setNodes(skippedNodes);
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        await syncNodeStatus(node.id, { status: 'executing' }, i);
        setEdges(eds => eds.map(e => ({ ...e, animated: e.target === node.id })));
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
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          const interpolatedInput = workflowManager.interpolate(node.data.instruction);
          accumContext += `【全局输入】：\n${interpolatedInput}\n\n`;
          if (node.data.variableBinding?.length)
            workflowManager.processVariableBindings(node.data.variableBinding, interpolatedInput);
          await syncNodeStatus(node.id, { status: 'completed' }, i);
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        // --- Workflow Generator ---
        if (node.data.typeKey === 'workflowGenerator') {
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
              setNodes(nds =>
                nds.map(n =>
                  n.id === node.id ? { ...n, data: { ...n.data, label: `重试架构(${genRetryCount}/2)...` } } : n,
                ),
              );
              await new Promise(res => setTimeout(res, 2000));
            }
            try {
              const genCompletion = await genOpenai.chat.completions.create({
                model:
                  node.data.overrideAiConfig && node.data.model
                    ? node.data.model
                    : genPreset?.apiConfig?.model || globalConfig.model,
                messages: generatorMessages,
                temperature:
                  node.data.overrideAiConfig && node.data.temperature !== undefined
                    ? node.data.temperature
                    : genPreset?.temperature ?? 0.7,
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

        const sW = resolvePending([...(node.data.selectedWorldviewSets || [])], localNovel.worldviewSets);
        const sC = resolvePending([...(node.data.selectedCharacterSets || [])], localNovel.characterSets);
        const sO = resolvePending([...(node.data.selectedOutlineSets || [])], localNovel.outlineSets);
        const sI = resolvePending([...(node.data.selectedInspirationSets || [])], localNovel.inspirationSets);

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

        const isDup = lastNodeOutput && refContext.includes(lastNodeOutput.substring(0, 100));
        const finalContext = `${refContext}${accumContext}${
          !isDup && lastNodeOutput ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''
        }`;

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

          let fVolId = workflowManager.getActiveVolumeAnchor() || '';
          if (!fVolId && localNovel.chapters?.length) {
            for (let k = localNovel.chapters.length - 1; k >= 0; k--) {
              const chapVolId = localNovel.chapters[k].volumeId;
              if (chapVolId) {
                fVolId = chapVolId;
                break;
              }
            }
          }
          if (!fVolId)
            fVolId =
              localNovel.volumes?.find(v => v.title === currentWorkflowFolder)?.id || localNovel.volumes?.[0]?.id || '';
          if (fVolId) workflowManager.setActiveVolumeAnchor(fVolId);

          const nApi = (preset as any)?.apiConfig || {};
          const engCfg = {
            apiKey: nApi.apiKey || globalConfig.apiKey,
            baseURL: nApi.baseUrl || globalConfig.baseUrl,
            model: node.data.overrideAiConfig && node.data.model ? node.data.model : nApi.model || globalConfig.model,
            temperature:
              node.data.overrideAiConfig && node.data.temperature !== undefined
                ? node.data.temperature
                : (preset as any)?.temperature ?? globalConfig.temperature,
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
          currentSet.items.forEach((item, k) => {
            const isStd = /^第?\s*[0-9零一二两三四五六七八九十百千]+\s*[章节]/.test(item.title);
            const ex = localNovel.chapters?.find(c =>
              isStd ? c.title === item.title : c.title === item.title && (fVolId ? c.volumeId === fVolId : !c.volumeId),
            );
            if (wStart === k && (!ex || !ex.content?.trim())) wStart = k;
            else if (wStart === k) wStart = k + 1;
          });

          if (wStart < currentSet.items.length) {
            await engine.run(
              currentSet.items,
              wStart,
              globalConfig.prompts.filter((p: any) => p.active),
              () => [...(globalConfig.getActiveScripts() || []), ...((preset as any)?.regexScripts || [])],
              s =>
                setNodes(nds =>
                  nds.map(n =>
                    n.id === node.id
                      ? { ...n, data: { ...n.data, label: s.match(/完成|失败|跳过|错误/) ? s : `创作中: ${s}` } }
                      : n,
                  ),
                ),
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
                localNovel = { ...localNovel, chapters: Array.from(map.values()) };
                updateLocalAndGlobal(localNovel);
              },
              async (cid, cont, up) => {
                if (!checkActive()) return;
                if (up) localNovel = up;
                if (globalConfig.onChapterComplete) {
                  const res = await (globalConfig.onChapterComplete as any)(cid, cont, localNovel, false, startRunId);
                  if (res?.chapters) localNovel = res;
                }
                return localNovel;
              },
              async title => {
                const trg = workflowManager.checkTriggerSplit(title);
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
                  workflowManager.markSplitProcessed(trg.chapterTitle);
                  return { updatedNovel: localNovel, newVolumeId: tid };
                }
              },
              fVolId,
              true,
              outlineSetId,
              abortControllerRef.current?.signal,
              startRunId,
            );
          }
          if (checkActive())
            await syncNodeStatus(node.id, { label: NODE_CONFIGS.chapter.defaultLabel, status: 'completed' }, i);
          setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));
          continue;
        }

        // --- Standard AI Messages ---
        let messages: any[] = [];
        if (node.data.overrideAiConfig && node.data.promptItems?.length) {
          let hasCtx = false;
          messages = node.data.promptItems
            .filter((p: any) => p.enabled !== false)
            .map((p: any) => {
              if (p.content.includes('{{context}}')) hasCtx = true;
              const c = workflowManager.interpolate(p.content.replace('{{context}}', finalContext));
              return { role: p.role, content: p.role === 'user' ? formatMulti(c) : c };
            });
          if (!hasCtx && finalContext.trim())
            messages.unshift({ role: 'user', content: formatMulti(`【参考背景与全局输入】：\n${finalContext}`) });
          if (node.data.instruction)
            messages.push({ role: 'user', content: formatMulti(workflowManager.interpolate(node.data.instruction)) });
        } else {
          const prompts = (preset as any)?.prompts || [];
          messages = prompts
            .filter((p: any) => p.enabled || p.active)
            .map((p: any) => {
              const c = workflowManager.interpolate(p.content.replace('{{context}}', finalContext));
              return { role: p.role, content: p.role === 'user' ? formatMulti(c) : c };
            });
          if (node.data.instruction)
            messages.push({ role: 'user', content: formatMulti(workflowManager.interpolate(node.data.instruction)) });
          else if (!messages.length) messages.push({ role: 'user', content: '请生成内容' });
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
            : preset?.temperature ?? globalConfig.temperature;
        const fTopP =
          node.data.overrideAiConfig && node.data.topP !== undefined
            ? node.data.topP
            : preset?.topP ?? globalConfig.topP;
        const fTopK =
          node.data.overrideAiConfig && node.data.topK !== undefined
            ? node.data.topK
            : (preset as any)?.topK ?? globalConfig.topK;
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
            setNodes(nds =>
              nds.map(n => (n.id === node.id ? { ...n, data: { ...n.data, label: `重试中(${retry}/2)...` } } : n)),
            );
            await new Promise(res => setTimeout(res, 1500 * Math.pow(2, retry - 1)));
          }
          try {
            if (isMobile) {
              console.groupCollapsed(
                `[Mobile Workflow AI Request] ${node.data.typeLabel} - ${node.data.label}${
                  retry > 0 ? ` (重试 ${retry})` : ''
                }${iter > 0 ? ` (续写 ${iter})` : ''}`,
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
            }

            const completion = await openai.chat.completions.create(
              {
                model: fModel,
                messages: currMsgs,
                temperature: fTemp,
                top_p: fTopP,
                top_k: fTopK > 0 ? fTopK : undefined,
                max_tokens: fMaxT,
              } as any,
              { signal: abortControllerRef.current?.signal },
            );
            aiRes = completion.choices[0]?.message?.content || '';
            if (!aiRes?.trim()) {
              if (retry < 2) {
                retry++;
                continue;
              }
              throw new Error('AI 返回内容为空。');
            }

            try {
              const parsed = await cleanAndParseJSON(aiRes);
              entriesToStore = await extractEntries(parsed);
            } catch {
              if (
                ['outline', 'plotOutline', 'characters', 'worldview'].includes(node.data.typeKey as string) &&
                retry < 2
              ) {
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

            if (isOut && tEnd) {
              const lastNum = parseAnyNumber(entriesToStore[entriesToStore.length - 1]?.title || '');
              if (lastNum && lastNum < tEnd && iter < 5) {
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
                currMsgs = [
                  ...currMsgs,
                  { role: 'assistant', content: aiRes },
                  {
                    role: 'user',
                    content: `(系统接龙：刚才只到第 ${lastNum} 章。请不要重复，直接从第 ${
                      lastNum + 1
                    } 章开始继续到第 ${tEnd} 章。严格遵守 JSON。)`,
                  },
                ];
                continue;
              }
            }
            accEntries = [...accEntries, ...currIterEntries];
            nodeDone = true;
          } catch (e: any) {
            if (e.name === 'AbortError' || retry === 2) throw e;
            retry++;
          }
        }

        if (node.data.variableBinding?.length)
          workflowManager.processVariableBindings(node.data.variableBinding, aiRes);
        const finalHistory = nodesRef.current.find(n => n.id === node.id)?.data.outputEntries || [];
        const savedIds = new Set(finalHistory.map(e => e.id));
        const unsaved = accEntries.filter(e => !savedIds.has(e.id));
        await syncNodeStatus(node.id, { status: 'completed', outputEntries: [...finalHistory, ...unsaved] }, i);

        // Update Novel Sets
        if (currentWorkflowFolder || node.data.folderName) {
          const folder = node.data.folderName || currentWorkflowFolder;
          let upNovel = { ...localNovel };
          let changed = false;
          const upSets = (sets: any[], type: string) => {
            const target = sets?.find(s => s.name === folder);
            if (!target) return sets;
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
              if (type === 'plotOutline' && idx === -1) (ni as any).id = `plot_${Date.now()}`;
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
            upNovel.worldviewSets = upSets(upNovel.worldviewSets || [], 'worldview');
          else if (node.data.typeKey === 'characters')
            upNovel.characterSets = upSets(upNovel.characterSets || [], 'characters');
          else if (node.data.typeKey === 'outline') upNovel.outlineSets = upSets(upNovel.outlineSets || [], 'outline');
          else if (node.data.typeKey === 'inspiration')
            upNovel.inspirationSets = upSets(upNovel.inspirationSets || [], 'inspiration');
          else if (node.data.typeKey === 'plotOutline')
            upNovel.plotOutlineSets = upSets(upNovel.plotOutlineSets || [], 'plotOutline');

          if (changed) await updateLocalAndGlobal(upNovel);
        }

        lastNodeOutput += `【${node.data.typeLabel}输出】：\n${aiRes}\n\n`;
        setEdges(eds => eds.map(e => (e.target === node.id ? { ...e, animated: false } : e)));

        // Auto Loop Back Check
        const outEdges = (workflowsRef.current.find(w => w.id === activeWorkflowId)?.edges || []).filter(
          e => e.source === node.id,
        );
        const loopBack = outEdges.find(e => nodesRef.current.find(n => n.id === e.target)?.data.typeKey === 'loopNode');
        if (loopBack) {
          const tIdx = sortedNodes.findIndex(sn => sn.id === loopBack.target);
          if (tIdx !== -1 && tIdx <= i) {
            workflowManager.setContextVar('loop_index', (workflowManager.getContextVar('loop_index') || 1) + 1);
            i = tIdx - 1;
            continue;
          }
        }
      }

      if (!stopRequestedRef.current) {
        workflowManager.stop();
        setEdges(eds => eds.map(e => ({ ...e, animated: false })));
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
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));
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
    setEdges(eds => eds.map(e => ({ ...e, animated: false })));
    keepAliveManager.disable();
  };

  const resumeWorkflow = () => {
    if (currentNodeIndex !== -1) runWorkflow(currentNodeIndex);
  };

  const resetWorkflowStatus = async () => {
    if (
      confirm(
        '确定要重置当前工作流吗？\n\n1. 所有节点进度将归零\n2. 已生成的章节正文将保留\n3. 正在运行的任务将被强制中止',
      )
    ) {
      stopRequestedRef.current = true;
      abortControllerRef.current?.abort();

      const updatedNodes = nodesRef.current.map(n => {
        const updates: any = {
          status: 'pending' as const,
          outputEntries: [],
          label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
        };

        if (n.data.typeKey === 'chapter') {
          updates.targetVolumeName = '';
        } else if (n.data.typeKey === 'saveToVolume') {
          updates.splitRules = [];
          updates.splitChapterTitle = '';
          updates.nextVolumeName = '';
          updates.volumeContent = '';
        }

        if (n.data.typeKey === 'loopNode' && n.data.loopConfig) {
          updates.loopConfig = { ...n.data.loopConfig, currentIndex: 0 };
        }

        return { ...n, data: { ...n.data, ...updates } };
      });

      nodesRef.current = updatedNodes;
      setNodes(updatedNodes);
      setCurrentNodeIndex(-1);
      setIsPaused(false);
      setError(null);
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));

      workflowManager.stop();

      const updatedWorkflows = workflowsRef.current.map(w => {
        if (w.id === activeWorkflowId) {
          return {
            ...w,
            nodes: updatedNodes,
            currentNodeIndex: -1,
            lastModified: Date.now(),
            contextSnapshot: undefined,
          };
        }
        return w;
      });
      try {
        await storage.saveWorkflows(updatedWorkflows);
      } catch (e) {
        terminal.error(`[ENGINE] 重置保存失败: ${e}`);
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

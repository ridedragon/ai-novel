import { Edge } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import terminal from 'virtual:terminal';
import { Novel } from '../../../types';
import { storage } from '../../../utils/storage';
import { workflowManager } from '../../../utils/WorkflowManager';
import { NODE_CONFIGS } from '../constants';
import { WorkflowData, WorkflowNode } from '../types';

export const useWorkflowStorage = (
  isOpen: boolean,
  activeWorkflowId: string,
  setActiveWorkflowId: (id: string) => void,
  activeNovel: Novel | undefined,
) => {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isInitialLoadRef = useRef(true);
  const activeNovelRef = useRef(activeNovel);

  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workflowsRef = useRef<WorkflowData[]>([]);

  // 同步 Ref 以便在异步闭包中使用
  workflowsRef.current = workflows;

  // 数据自愈与转换逻辑 (从组件迁移而来)
  const healWorkflowData = useCallback((workflow: WorkflowData, globalIsRunning: boolean, novel?: Novel) => {
    // 兼容性修复：处理节点列表为空的情况
    if (!workflow.nodes) workflow.nodes = [];
    if (!workflow.edges) workflow.edges = [];

    const workflowFolderName = workflow.nodes.find(node => node.data.typeKey === 'createFolder')?.data.folderName;

    const filterLegacyRefs = (
      list: string[] | undefined,
      type: 'worldview' | 'character' | 'outline' | 'inspiration',
    ) => {
      if (!list) return [];
      return list.filter(setId => {
        if (!setId || typeof setId !== 'string') return false;
        if (setId.startsWith('pending:')) return false;

        if (novel && workflowFolderName) {
          let sets: any[] = [];
          if (type === 'worldview') sets = novel.worldviewSets || [];
          else if (type === 'character') sets = novel.characterSets || [];
          else if (type === 'outline') sets = novel.outlineSets || [];
          else if (type === 'inspiration') sets = novel.inspirationSets || [];

          const targetSet = sets.find(s => s.id === setId);
          if (targetSet && targetSet.name === workflowFolderName) return false;
        }
        return true;
      });
    };

    const restoredNodes = (workflow.nodes || []).map((n: WorkflowNode) => ({
      ...n,
      data: {
        ...n.data,
        status: !globalIsRunning && n.data.status === 'executing' ? 'completed' : n.data.status,
        label:
          !globalIsRunning && n.data.status === 'executing' && n.data.typeKey === 'chapter'
            ? NODE_CONFIGS.chapter.defaultLabel
            : n.data.label,
        selectedWorldviewSets: filterLegacyRefs(n.data.selectedWorldviewSets, 'worldview'),
        selectedCharacterSets: filterLegacyRefs(n.data.selectedCharacterSets, 'character'),
        selectedOutlineSets: filterLegacyRefs(n.data.selectedOutlineSets, 'outline'),
        selectedInspirationSets: filterLegacyRefs(n.data.selectedInspirationSets, 'inspiration'),
        selectedReferenceFolders: n.data.selectedReferenceFolders || [],
        outputEntries: n.data.outputEntries || [],
      },
    }));

    const restoredEdges = (workflow.edges || []).map(edge => ({
      ...edge,
      type: 'custom',
      animated: edge.animated || false,
    }));

    return {
      ...workflow,
      nodes: restoredNodes,
      edges: restoredEdges,
      isPaused: workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1,
    };
  }, []);

  // 加载工作流列表
  const refreshWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedWorkflows = await storage.getWorkflows();
      setWorkflows(loadedWorkflows);

      const targetId = await storage.getActiveWorkflowId();
      const finalId =
        targetId && loadedWorkflows.find(w => w.id === targetId) ? targetId : loadedWorkflows[0]?.id || 'default';

      if (finalId !== activeWorkflowId) {
        setActiveWorkflowId(finalId);
      }
      return { loadedWorkflows, finalId };
    } catch (e) {
      terminal.error(`[WORKFLOW] 加载失败: ${e}`);
      return { loadedWorkflows: [], finalId: 'default' };
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
    }
  }, [activeWorkflowId, setActiveWorkflowId]);

  // 自动保存逻辑
  const autoSave = useCallback(
    (nodes: WorkflowNode[], edges: Edge[], currentNodeIndex: number) => {
      // 核心修复：如果是正在加载中，禁止触发保存
      if (isLoading || isInitialLoadRef.current) return;

      // 核心修复：UI 触发的保存应尊重 isOpen，且不应覆盖正在运行的后台任务
      // 如果 UI 已经关闭，则禁止由 React 组件实例触发自动保存
      if (!isOpen || workflowsRef.current.length === 0) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const startTime = Date.now();
        const currentWorkflows = workflowsRef.current.map(w => {
          if (w.id === activeWorkflowId) {
            return {
              ...w,
              nodes,
              edges,
              currentNodeIndex,
              lastModified: Date.now(),
              contextSnapshot: workflowManager.getSnapshot(),
            };
          }
          return w;
        });

        try {
          await storage.saveWorkflows(currentWorkflows);
          await storage.setActiveWorkflowId(activeWorkflowId);
          setWorkflows(currentWorkflows);
          terminal.log(`[PERF] AutoSave to IDB: ${Date.now() - startTime}ms`);
        } catch (e) {
          terminal.error(`[WORKFLOW] 自动保存失败: ${e}`);
        }
      }, 5000);
    },
    [isOpen, activeWorkflowId, isLoading],
  );

  // 创建新工作流
  const createWorkflow = useCallback(async () => {
    const newId = `wf_${Date.now()}`;
    const newWf: WorkflowData = {
      id: newId,
      name: `新工作流 ${workflows.length + 1}`,
      nodes: [],
      edges: [],
      lastModified: Date.now(),
    };
    const updated = [...workflows, newWf];
    setWorkflows(updated);
    await storage.saveWorkflows(updated);
    setActiveWorkflowId(newId);
    return newId;
  }, [workflows, setActiveWorkflowId]);

  // 删除工作流
  const deleteWorkflow = useCallback(
    async (id: string) => {
      if (workflows.length <= 1) throw new Error('无法删除最后一个工作流');

      const updated = workflows.filter(w => w.id !== id);
      setWorkflows(updated);
      await storage.saveWorkflows(updated);

      if (activeWorkflowId === id) {
        setActiveWorkflowId(updated[0].id);
      }
    },
    [workflows, activeWorkflowId, setActiveWorkflowId],
  );

  // 重命名工作流
  const renameWorkflow = useCallback(
    async (id: string, newName: string) => {
      if (!newName.trim()) return;
      const updated = workflows.map(w => (w.id === id ? { ...w, name: newName } : w));
      setWorkflows(updated);
      await storage.saveWorkflows(updated);
    },
    [workflows],
  );

  // 导出工作流
  const exportWorkflow = useCallback(
    (id: string) => {
      const workflow = workflows.find(w => w.id === id);
      if (!workflow) return;

      const exportData = {
        ...workflow,
        nodes: workflow.nodes.map(n => ({
          ...n,
          data: {
            ...n.data,
            status: 'pending',
            outputEntries: [],
          },
        })),
        currentNodeIndex: -1,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workflow.name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [workflows],
  );

  // 导入工作流
  const importWorkflowData = useCallback(
    async (imported: WorkflowData) => {
      const newId = `wf_imported_${Date.now()}`;
      const newWf: WorkflowData = {
        ...imported,
        id: newId,
        name: `${imported.name} (导入)`,
        lastModified: Date.now(),
      };

      const updated = [...workflows, newWf];
      setWorkflows(updated);
      await storage.saveWorkflows(updated);
      setActiveWorkflowId(newId);
      return newId;
    },
    [workflows, setActiveWorkflowId],
  );

  return {
    workflows,
    isLoading,
    refreshWorkflows,
    autoSave,
    createWorkflow,
    deleteWorkflow,
    renameWorkflow,
    exportWorkflow,
    importWorkflowData,
    setWorkflows,
    healWorkflowData,
    isInitialLoad: isInitialLoadRef.current,
  };
};

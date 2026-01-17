import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  Cpu,
  Download,
  Edit2,
  FileText,
  Folder,
  FolderPlus,
  LayoutList,
  MessageSquare,
  PauseCircle,
  Play,
  Plus,
  Repeat,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  Wand2,
  Workflow,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneratorPreset, GeneratorPrompt, LoopInstruction, Novel } from '../types';
import { storage } from '../utils/storage';
import { workflowManager } from '../utils/WorkflowManager';
import { DesktopPanel } from './Workflow/components/NodeProperties/DesktopPanel';
import { ModelConfigPanel } from './Workflow/components/NodeProperties/Shared/ModelConfigPanel';
import { ReferenceSelector } from './Workflow/components/NodeProperties/Shared/ReferenceSelector';
import { WorkflowEdge } from './Workflow/components/WorkflowEdge';
import { WorkflowNode as CustomWorkflowNode } from './Workflow/components/WorkflowNode';
import { NODE_CONFIGS, WORKFLOW_DSL_PROMPT } from './Workflow/constants';
import { useWorkflowEngine } from './Workflow/hooks/useWorkflowEngine';
import { useWorkflowLayout } from './Workflow/hooks/useWorkflowLayout';
import { useWorkflowStorage } from './Workflow/hooks/useWorkflowStorage';
import {
  NodeTypeKey,
  OutputEntry,
  WorkflowData,
  WorkflowEditorProps,
  WorkflowNode,
  WorkflowNodeData
} from './Workflow/types';


// 常量和 Props 接口已移动至 ./Workflow/types 和 constants

const WorkflowEditorContent = (props: WorkflowEditorProps) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const nodesRef = useRef<WorkflowNode[]>([]);
  const workflowsRef = useRef<WorkflowData[]>([]);

  // 性能优化：将 allPresets 移到 Engine 之前，防止初始化引用错误
  const [allPresets, setAllPresets] = useState<Record<string, GeneratorPreset[]>>({
    outline: [],
    character: [],
    worldview: [],
    inspiration: [],
    plotOutline: [],
    completion: [],
    optimize: [],
    analysis: [],
    generator: [],
  });

  // 1. 存储与加载逻辑
  const {
    workflows,
    isLoading: isLoadingWorkflows,
    refreshWorkflows,
    autoSave,
    createWorkflow,
    deleteWorkflow: storageDeleteWorkflow,
    renameWorkflow: storageRenameWorkflow,
    exportWorkflow,
    importWorkflowData,
    setWorkflows,
    healWorkflowData
  } = useWorkflowStorage(isOpen, activeWorkflowId, setActiveWorkflowId, activeNovel);

  // 2. 布局逻辑
  const { orderedNodes, getDesktopLayout } = useWorkflowLayout(nodes, edges);

  // 3. 执行引擎逻辑
  const {
    isRunning,
    isPaused,
    currentNodeIndex,
    error,
    setError,
    runWorkflow,
    stopWorkflow,
    resumeWorkflow,
    resetWorkflowStatus,
    getConsolidatedModelList
  } = useWorkflowEngine({
    activeNovel,
    globalConfig,
    allPresets,
    activeWorkflowId,
    nodesRef,
    workflowsRef,
    setNodes,
    setEdges,
    onUpdateNovel,
    getOrderedNodes: () => orderedNodes,
    isMobile: false
  });

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => {
      const nextNodes = applyNodeChanges(changes, nds) as WorkflowNode[];
      const mergedNodes = nextNodes.map(n => {
        const refNode = nodesRef.current.find(r => r.id === n.id);
        return refNode ? { ...n, data: { ...n.data, ...refNode.data } } : n;
      });
      nodesRef.current = mergedNodes;
      return mergedNodes;
    });
  }, []);

  // 性能优化：显式使用 useMemo 锁定 nodeTypes 和 edgeTypes，消除 React Flow 的重绘警告
  const nodeTypes = useMemo(() => ({
    custom: CustomWorkflowNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    custom: WorkflowEdge,
  }), []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  const consolidatedModelList = useMemo(() => getConsolidatedModelList(), [getConsolidatedModelList]);

  // 获取工作流中所有“初始化目录”节点定义的文件夹名（即便尚未运行创建）
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

  // 加载预设
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat', 'generator'];
    const loaded: Record<string, GeneratorPreset[]> = {};
    types.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        loaded[t] = saved ? JSON.parse(saved) : [];
      } catch (e) {
        loaded[t] = [];
      }
    });
    setAllPresets(loaded);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      refreshWorkflows().then(({ loadedWorkflows, finalId }) => {
        const wf = loadedWorkflows.find(w => w.id === finalId);
        if (wf) {
          const globalIsRunning = workflowManager.getState().isRunning;
          if (!globalIsRunning || nodesRef.current.length === 0) {
            const healed = healWorkflowData(wf, globalIsRunning, activeNovel);
            setNodes(healed.nodes);
            setEdges(healed.edges);
          }
        }
      });
    }
  }, [isOpen]);

  useEffect(() => {
    autoSave(nodes, edges, currentNodeIndex);
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning]);

  const switchWorkflow = useCallback((id: string) => {
    if (isRunning) {
      alert('请先停止当前工作流再切换');
      return;
    }
    setActiveWorkflowId(id);
    const wf = workflows.find(w => w.id === id);
    if (wf) {
      const healed = healWorkflowData(wf, isRunning, activeNovel);
      setNodes(healed.nodes);
      setEdges(healed.edges);
    }
    setShowWorkflowMenu(false);
  }, [isRunning, workflows, healWorkflowData, activeNovel, setNodes, setEdges]);

  const handleImportWorkflow = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isRunning) {
      alert('请先停止当前工作流');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        const newId = await importWorkflowData(imported);
        switchWorkflow(newId);
      } catch (err: any) {
        setError(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [isRunning, importWorkflowData, switchWorkflow, setError]);

  // 只有在组件真正卸载（如切换页面）时才中止执行
  // 关闭弹窗（isOpen 变为 false）不应停止执行，实现后台运行

  const onConnect = useCallback(
    (params: Connection) => {
      // 允许任意节点之间的连接，包括回环（Loop）
      // ReactFlow 默认可能会限制一些连接，我们显式放开
      // 特别是 Loop Node，用户意图是将其输出连回前面的某个节点（Back-edge）
      const newEdge = {
        ...params,
        type: 'custom',
        animated: false,
        // 增加交互区域，使连接线更容易被选中和删除
        interactionWidth: 20,
        // 关键：对于回环连接，使用 step 类型的路径可能更好看，或者保持贝塞尔曲线
        // 这里保持 custom 类型（CoolEdge），它使用 getBezierPath
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const addNewNode = useCallback((typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
    
    // 互斥检查
    if (typeKey === 'workflowGenerator' && nodes.length > 0) {
      alert('“智能生成工作流”节点只能在空画布上创建。请先清空当前画布。');
      return;
    }
    if (nodes.some(n => n.data.typeKey === 'workflowGenerator')) {
      alert('画布中已存在生成节点。请先运行该节点或将其删除后再添加其他模块。');
      return;
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });

    const { icon, ...serializableConfig } = config;

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      data: {
        ...serializableConfig,
        typeKey,
        label: config.defaultLabel,
        presetId: '',
        presetName: '',
        instruction: '',
        folderName: '',
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        selectedReferenceFolders: [],
        outputEntries: [],
        targetVolumeId: typeKey === 'chapter' ? '' : (activeNovel?.volumes[0]?.id || ''),
        targetVolumeName: '',
        // 为生成节点初始化示例提示词
        ...(typeKey === 'workflowGenerator' ? (() => {
          try {
            const savedConfig = localStorage.getItem('workflow_generator_default_config');
            if (savedConfig) {
              const parsed = JSON.parse(savedConfig);
              return {
                overrideAiConfig: parsed.overrideAiConfig ?? true,
                autoFillContent: parsed.autoFillContent ?? true,
                instruction: parsed.instruction ?? '',
                promptItems: parsed.promptItems ?? [],
                model: parsed.model,
                temperature: parsed.temperature,
                topP: parsed.topP,
                topK: parsed.topK,
                maxTokens: parsed.maxTokens,
                apiKey: parsed.apiKey,
                baseUrl: parsed.baseUrl,
              };
            }
          } catch (e) {}
          
          return {
            overrideAiConfig: true,
            autoFillContent: true,
            promptItems: [
              {
                id: 'sys-1',
                role: 'system',
                content: WORKFLOW_DSL_PROMPT,
                enabled: true
              },
              {
                id: 'user-1',
                role: 'user',
                content: '请以此为基础，为我生成一套完整的工作流。如果我开启了自动填写，请在每个节点的 instruction 字段中为我写好专业的引导提示词。',
                enabled: true
              }
            ]
          };
        })() : {})
      },
      position: {
        x: position.x - 140, // 减去节点宽度的一半 (280/2)
        y: position.y - 40   // 减去大概高度的一半
      },
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      nodesRef.current = nextNodes; // 同步 Ref
      return nextNodes;
    });
    setShowAddMenu(false);
  }, [setNodes, nodes, activeNovel, screenToFlowPosition]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setEditingNodeId(node.id);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEdgeToDelete(edge);
  }, []);

  const confirmDeleteEdge = useCallback(() => {
    if (edgeToDelete) {
      setEdges((eds) => eds.filter((e) => e.id !== edgeToDelete.id));
      setEdgeToDelete(null);
    }
  }, [edgeToDelete, setEdges]);

  const updateNodeData = useCallback((nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes((nds) => {
      const targetNode = nds.find(n => n.id === nodeId);
      const isRenameFolder = (targetNode?.data.typeKey === 'createFolder' || targetNode?.data.typeKey === 'reuseDirectory') && updates.folderName !== undefined && updates.folderName !== targetNode?.data.folderName;

      const nextNodes = nds.map((node) => {
        const refNode = nodesRef.current.find(n => n.id === node.id);
        let baseData = node.data;
        if (refNode) {
            if (refNode.data.status !== node.data.status) baseData = { ...baseData, status: refNode.data.status };
            if ((refNode.data.outputEntries?.length || 0) > (node.data.outputEntries?.length || 0)) baseData = { ...baseData, outputEntries: refNode.data.outputEntries };
            if (refNode.data.loopConfig) baseData = { ...baseData, loopConfig: refNode.data.loopConfig };
            if (refNode.data.label && refNode.data.label !== node.data.label) baseData = { ...baseData, label: refNode.data.label };
        }

        if (node.id === nodeId) return { ...node, data: { ...baseData, ...updates } };
        if (isRenameFolder) return { ...node, data: { ...baseData, outputEntries: [] } };
        return { ...node, data: baseData };
      });

      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, [setNodes]);

  const toggleSetReference = useCallback((type: 'worldview' | 'character' | 'outline' | 'inspiration' | 'folder', setId: string) => {
    if (!editingNodeId) return;
    
    // 核心修复：改用 updateNodeData 以享受其内置的 Smart Merge 保护
    // 必须先获取当前的列表（注意：这里仍可能读取到 stale state，但 updateNodeData 会保护其他字段）
    // 对于当前字段，由于用户交互时该节点通常不在运行，风险较低
    const targetNode = nodesRef.current.find(n => n.id === editingNodeId);
    if (!targetNode) return;

    const key = type === 'worldview' ? 'selectedWorldviewSets' :
                type === 'character' ? 'selectedCharacterSets' :
                type === 'outline' ? 'selectedOutlineSets' :
                type === 'inspiration' ? 'selectedInspirationSets' : 'selectedReferenceFolders';
    
    const currentList = [...(targetNode.data[key] as string[])];
    const newList = currentList.includes(setId)
      ? currentList.filter(id => id !== setId)
      : [...currentList, setId];
      
    updateNodeData(editingNodeId, { [key]: newList });
  }, [editingNodeId, updateNodeData]);

  const updateEntryContent = (entryId: string, content: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.map(e => e.id === entryId ? { ...e, content } : e);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const updateEntryTitle = (entryId: string, title: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.map(e => e.id === entryId ? { ...e, title } : e);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const removeEntry = (entryId: string) => {
    if (!editingNodeId || !editingNode) return;
    const newEntries = editingNode.data.outputEntries.filter(e => e.id !== entryId);
    updateNodeData(editingNodeId, { outputEntries: newEntries });
  };

  const addEntry = () => {
    if (!editingNodeId || !editingNode) return;
    const newEntry: OutputEntry = {
      id: Date.now().toString(),
      title: '新条目',
      content: ''
    };
    updateNodeData(editingNodeId, { outputEntries: [...editingNode.data.outputEntries, newEntry] });
  };

  const handleSaveWorkflow = () => {
    autoSave(nodes, edges, currentNodeIndex);
  };

  const autoLayoutNodes = useCallback(() => {
    const nextNodes = getDesktopLayout(nodes);
    setNodes(nextNodes);
    nodesRef.current = nextNodes;
  }, [nodes, getDesktopLayout, setNodes]);

  if (!isOpen) return null;

  // 恢复旧版体验：移除全屏 Loading 遮罩，改为静默加载或局部状态
  // if (isLoadingWorkflows) { ... }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden relative">
        {/* 执行中状态提示 */}
        {isRunning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] bg-indigo-600/90 border border-indigo-400 pl-4 pr-2 py-2 rounded-full flex items-center gap-3 shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span className="text-xs font-bold text-white tracking-wide">
                正在执行: {currentNodeIndex === -1 ? '准备中...' : (orderedNodes[currentNodeIndex]?.data.typeLabel || '...')}
              </span>
            </div>
            <div className="h-4 w-px bg-indigo-400/50 mx-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('是否强制停止当前任务？\n如果任务长时间卡在“准备中”，请点击确定。')) {
                  stopWorkflow();
                }
              }}
              className="p-1 hover:bg-white/20 rounded-full text-indigo-100 hover:text-white transition-colors"
              title="强制停止"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* 顶部报错 UI */}
        {error && (
          <div className="absolute top-0 left-0 right-0 z-[130] bg-red-900/90 border-b border-red-500 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300 backdrop-blur-md">
            <div className="flex items-center gap-3 text-red-100">
              <div className="p-1.5 bg-red-500 rounded-full shrink-0">
                <X className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">执行错误</span>
                <p className="text-sm font-medium">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-red-200 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gray-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 border-r border-gray-700 pr-4">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
                {isLoadingWorkflows ? (
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                   <Workflow className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-100 leading-tight">工作流编辑器</h3>
                <p className="text-xs text-gray-500">
                  {isLoadingWorkflows ? '正在同步数据...' : '串联多步骤自动化任务'}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2">
                {isEditingWorkflowName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newWorkflowName}
                      onChange={(e) => setNewWorkflowName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') storageRenameWorkflow(activeWorkflowId, newWorkflowName);
                        if (e.key === 'Escape') setIsEditingWorkflowName(false);
                      }}
                      onBlur={() => storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
                      className="bg-gray-700 border border-indigo-500 rounded px-2 py-1 text-sm text-white outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowWorkflowMenu(!showWorkflowMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-all border border-gray-600/50"
                  >
                    <span className="font-bold text-indigo-400">
                      {workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showWorkflowMenu ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {!isEditingWorkflowName && (
                  <button
                    onClick={() => {
                      setNewWorkflowName(workflows.find(w => w.id === activeWorkflowId)?.name || '');
                      setIsEditingWorkflowName(true);
                    }}
                    className="p-1.5 text-gray-500 hover:text-indigo-400 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showWorkflowMenu && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-[150] animate-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-1 mb-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    切换工作流
                  </div>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {workflows.map(wf => (
                      <div
                        key={wf.id}
                        onClick={() => switchWorkflow(wf.id)}
                        className={`group px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${wf.id === activeWorkflowId ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{wf.name}</span>
                          <span className="text-[10px] opacity-50">{new Date(wf.lastModified).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`确定要重置工作流 "${wf.name}" 的进度吗？`)) return;

                              // 如果重置的是当前正在运行的工作流，必须先物理中断
                              if (wf.id === activeWorkflowId && isRunning) {
                                stopWorkflow();
                              }

                              const targetIndex = -1;
                              const updatedNodes = wf.nodes.map(n => ({
                                ...n,
                                data: {
                                  ...n.data,
                                  status: 'pending' as const,
                                  // 重置正文生成节点的动态关联，保留用户配置
                                  targetVolumeName: n.data.typeKey === 'chapter' ? '' : n.data.targetVolumeName,
                                  label: n.data.typeKey === 'chapter' ? NODE_CONFIGS.chapter.defaultLabel : n.data.label,
                                  // 核心修复：重置非当前工作流进度时也清理分卷规则
                                  splitRules: n.data.typeKey === 'saveToVolume' ? [] : n.data.splitRules,
                                  splitChapterTitle: n.data.typeKey === 'saveToVolume' ? '' : n.data.splitChapterTitle,
                                  nextVolumeName: n.data.typeKey === 'saveToVolume' ? '' : n.data.nextVolumeName,
                                }
                              }));

                              setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, nodes: updatedNodes, currentNodeIndex: targetIndex, lastModified: Date.now() } : w));
                              
                              if (wf.id === activeWorkflowId) {
                                setNodes(updatedNodes);
                                nodesRef.current = updatedNodes;
                                workflowManager.stop();
                              }
                              
                              // 显式保存至存储
                              storage.getWorkflows().then(allWfs => {
                                const nextWfs = allWfs.map((w: any) => w.id === wf.id ? { ...w, nodes: updatedNodes, currentNodeIndex: -1, lastModified: Date.now() } : w);
                                storage.saveWorkflows(nextWfs);
                              });
                            }}
                            className="p-1 hover:text-indigo-400 transition-colors"
                            title="重置进度"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => storageDeleteWorkflow(wf.id)}
                            className="p-1 hover:text-red-400 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-700 px-2 space-y-1">
                    <button
                      onClick={createWorkflow}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-colors font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      创建新工作流
                    </button>
                    <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-colors font-bold cursor-pointer">
                      <Upload className="w-4 h-4" />
                      导入工作流
                      <input type="file" accept=".json" onChange={handleImportWorkflow} className="hidden" />
                    </label>
                    <button
                      onClick={() => exportWorkflow(activeWorkflowId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-amber-600/10 rounded-lg transition-colors font-bold"
                    >
                      <Download className="w-4 h-4" />
                      导出当前工作流
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetWorkflowStatus}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all border border-gray-600 active:scale-95 mr-1"
              title="重置执行进度和节点状态"
            >
              <Repeat className="w-4 h-4" />
              重置工作流
            </button>

            {isRunning ? (
              <button
                onClick={stopWorkflow}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 shadow-red-900/20"
              >
                <Square className="w-4 h-4 fill-current" />
                终止执行
              </button>
            ) : isPaused && currentNodeIndex !== -1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={resumeWorkflow}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 shadow-blue-900/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  从停止处继续
                </button>
                <select
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>跳转至节点...</option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none"
                  value=""
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>从指定节点开始...</option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>{idx + 1}. {n.data.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => runWorkflow(0)}
                  disabled={isRunning || nodes.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-green-900/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  全量运行
                </button>
              </div>
            )}
            <button
              onClick={handleSaveWorkflow}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600 active:scale-95"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors ml-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 relative bg-[#1a1a1a]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            isValidConnection={() => true}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            colorMode="dark"
          >
            <Background color="#333" gap={20} variant={BackgroundVariant.Dots} />
            <Controls />
            <Panel position="top-left" className="flex flex-col gap-2">
              <div className="relative">
                <button 
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white rounded-lg shadow-xl transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  添加模块
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
                </button>

                {showAddMenu && (
                  <div className="absolute top-full left-0 mt-2 w-52 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-2 z-[110] animate-in slide-in-from-top-2 duration-200">
                    {(Object.keys(NODE_CONFIGS) as Array<NodeTypeKey>).map((type) => {
                      const config = NODE_CONFIGS[type];
                      const isGenerator = type === 'workflowGenerator';
                      const isDisabled = (isGenerator && nodes.length > 0) || (!isGenerator && nodes.some(n => n.data.typeKey === 'workflowGenerator'));

                      return (
                        <button
                          key={type}
                          disabled={isDisabled}
                          onClick={() => addNewNode(type)}
                          className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors group ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                        >
                          <div className={`p-1.5 rounded bg-gray-900 group-hover:bg-gray-800 ${isGenerator ? 'ring-1 ring-red-500/30 shadow-[0_0_8px_rgba(248,113,113,0.2)]' : ''}`}>
                              <config.icon className="w-4 h-4" style={{ color: config.color }} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{config.typeLabel}</span>
                            {isGenerator && <span className="text-[9px] text-gray-500 leading-none mt-0.5">运行后替换整个画布</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={autoLayoutNodes}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-sm font-medium text-emerald-400 rounded-lg border border-emerald-500/30 transition-colors"
              >
                <LayoutList className="w-4 h-4" />
                整理布局
              </button>

              <button
                onClick={() => {
                  setNodes([]);
                  nodesRef.current = []; // 同步 Ref
                  setEdges([]);
                  setEditingNodeId(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-sm font-medium text-red-400 rounded-lg border border-red-900/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清空画布
              </button>
            </Panel>
          </ReactFlow>

        </div>

        {/* --- 节点属性弹窗 --- */}
        {editingNode && (
          <DesktopPanel
            node={editingNode}
            onClose={() => setEditingNodeId(null)}
            updateNodeData={(id, updates) => {
              if ((updates as any)._deleted) {
                setNodes((nds) => nds.filter(n => n.id !== id));
              } else {
                updateNodeData(id, updates);
              }
            }}
            toggleSetReference={toggleSetReference}
            activeNovel={activeNovel}
            allPresets={allPresets}
            pendingFolders={pendingFolders}
            globalConfig={globalConfig}
            consolidatedModelList={consolidatedModelList}
          />
        )}

        {/* --- 章节正文预览弹窗 --- */}
        {previewEntry && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div
              className="absolute inset-0"
              onClick={() => setPreviewEntry(null)}
            />
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-100">{previewEntry.title}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const chapterId = parseInt(previewEntry.id.replace('chapter-', ''), 10);
                      if (!isNaN(chapterId) && onSelectChapter) {
                        setEditingNodeId(null);
                        setPreviewEntry(null);
                        onSelectChapter(chapterId);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all active:scale-95"
                  >
                    跳转到编辑器
                  </button>
                  <button
                    onClick={() => setPreviewEntry(null)}
                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-900">
                <div className="max-w-2xl mx-auto">
                  <div className="prose prose-invert prose-indigo max-w-none">
                    {previewEntry.content.split('\n').map((para, i) => (
                      <p key={i} className="mb-4 text-gray-300 leading-relaxed text-lg text-justify">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-800 bg-gray-800/30 text-[10px] text-gray-500 flex justify-between">
                <span>预览模式 - 内容仅供参考</span>
                <span>共 {previewEntry.content.length} 字</span>
              </div>
            </div>
          </div>
        )}

        {/* --- 连线删除确认弹窗 --- */}
        {edgeToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-100">删除连线？</h4>
                  <p className="text-sm text-gray-400">确定要断开这两个模块之间的连接吗？</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEdgeToDelete(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteEdge}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-900/20 transition-all active:scale-95"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-2 border-t border-gray-700 bg-gray-800 flex justify-between items-center text-[10px] text-gray-500 shrink-0">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><Workflow className="w-3 h-3" /> 节点: {nodes.length}</span>
            <span className="flex items-center gap-1"><Plus className="w-3 h-3 rotate-45" /> 连接: {edges.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            工作流编辑器已就绪
          </div>
        </div>
      </div>
    </div>
  );
};

export const WorkflowEditor = (props: WorkflowEditorProps) => {
  return (
    <ReactFlowProvider>
      <WorkflowEditorContent {...props} />
    </ReactFlowProvider>
  );
};
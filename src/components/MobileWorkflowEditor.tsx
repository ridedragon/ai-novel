import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronDown,
  Copy,
  Download,
  Edit2,
  FileText,
  LayoutList,
  Play,
  Plus,
  Repeat,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeneratorPreset } from '../types';
import { workflowManager } from '../utils/WorkflowManager';
import { MobilePanel } from './Workflow/components/NodeProperties/MobilePanel';
import { WorkflowEdge } from './Workflow/components/WorkflowEdge';
import { MobileWorkflowNode } from './Workflow/components/WorkflowNode';
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
  WorkflowNodeData,
} from './Workflow/types';

const MobileWorkflowEditorContent: React.FC<WorkflowEditorProps> = props => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, globalConfig } = props;
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const nodesRef = useRef(nodes);
  const workflowsRef = useRef<WorkflowData[]>([]);

  const [allPresets, setAllPresets] = useState<Record<string, GeneratorPreset[]>>({
    outline: [],
    character: [],
    worldview: [],
    inspiration: [],
    plotOutline: [],
    completion: [],
    optimize: [],
    analysis: [],
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
    healWorkflowData,
  } = useWorkflowStorage(isOpen, activeWorkflowId, setActiveWorkflowId, activeNovel);

  // 2. 布局逻辑 (Mobile)
  const { orderedNodes, getMobileLayout } = useWorkflowLayout(nodes, edges);

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
    isMobile: true,
  });

  // 获取工作流中所有“初始化目录”节点定义的文件夹名
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

  // 性能优化：显式使用 useMemo 锁定 nodeTypes 和 edgeTypes，消除 React Flow 的重绘警告
  const nodeTypes = useMemo(
    () => ({
      custom: MobileWorkflowNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      custom: WorkflowEdge,
    }),
    [],
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  const editingNode = nodes?.find(n => n.id === editingNodeId) || null;

  // 加载配置
  useEffect(() => {
    if (!isOpen) return;
    const types = [
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

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, type: 'custom', animated: false }, eds)),
    [setEdges],
  );

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEdgeToDelete(edge);
  }, []);

  const confirmDeleteEdge = useCallback(() => {
    if (edgeToDelete) {
      setEdges(eds => eds.filter(e => e.id !== edgeToDelete.id));
      setEdgeToDelete(null);
    }
  }, [edgeToDelete, setEdges]);

  const addNewNode = (typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];

    // 互斥检查
    if (typeKey === 'workflowGenerator' && nodes.length > 0) {
      alert('“智能生成工作流”节点只能在空画布上创建。');
      return;
    }
    if (nodes.some(n => n.data.typeKey === 'workflowGenerator')) {
      alert('画布中已存在生成节点。');
      return;
    }

    // 计算视口中心位置
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
        targetVolumeId: typeKey === 'chapter' ? '' : activeNovel?.volumes[0]?.id || '',
        targetVolumeName: '',
        // 为生成节点初始化示例提示词
        ...(typeKey === 'workflowGenerator'
          ? (() => {
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
                    enabled: true,
                  },
                  {
                    id: 'user-1',
                    role: 'user',
                    content: '请以此为基础，为我生成一套完整的工作流。',
                    enabled: true,
                  },
                ],
              };
            })()
          : {}),
      },
      position: {
        x: position.x - 90, // 移动端节点宽度是 180px，减去一半
        y: position.y - 40,
      },
    };
    setNodes([...nodes, newNode]);
    setShowAddMenu(false);
  };

  const cloneNode = (node: WorkflowNode) => {
    const newNode: WorkflowNode = {
      ...node,
      id: `node-${Date.now()}`,
      position: { x: node.position.x + 20, y: node.position.y + 20 },
      data: {
        ...node.data,
        label: `${node.data.label} (复用)`,
        status: 'pending',
        outputEntries: [],
      },
    };
    setNodes([...nodes, newNode]);
  };

  const updateNodeData = (nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes(nds => {
      const targetNode = nds?.find(n => n.id === nodeId);
      const isRenameFolder =
        (targetNode?.data.typeKey === 'createFolder' || targetNode?.data.typeKey === 'reuseDirectory') &&
        updates.folderName !== undefined &&
        updates.folderName !== targetNode?.data.folderName;

      return nds.map(node => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
        }

        // 如果是目录节点重命名，清空其他节点的产物
        if (isRenameFolder) {
          return {
            ...node,
            data: {
              ...node.data,
              outputEntries: [],
            },
          };
        }
        return node;
      });
    });
  };

  const deleteOutputEntry = (nodeId: string, entryId: string) => {
    setNodes(nds =>
      nds.map(n => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              outputEntries: (n.data.outputEntries || []).filter(e => e.id !== entryId),
            },
          };
        }
        return n;
      }),
    );
  };

  const handleSaveWorkflow = () => {
    autoSave(nodes, edges, currentNodeIndex);
    setError('工作流已手动保存');
    setTimeout(() => setError(null), 2000);
  };

  const switchWorkflow = (id: string) => {
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
  };

  // 自动整理布局逻辑 (移动端垂直单列)
  const autoLayoutNodes = useCallback(() => {
    const nextNodes = getMobileLayout(nodes);
    setNodes(nextNodes);
  }, [nodes, getMobileLayout, setNodes]);

  const handleImportWorkflow = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (isRunning) {
        alert('请先停止当前工作流');
        return;
      }
      const reader = new FileReader();
      reader.onload = async event => {
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
    },
    [isRunning, importWorkflowData, switchWorkflow, setError],
  );

  if (!isOpen) return null;

  if (isLoadingWorkflows) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <div className="text-indigo-400 font-bold animate-pulse text-sm">加载工作流中...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col animate-in fade-in duration-200 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 max-w-[40%]">
          <Workflow className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="relative min-w-0 flex-1 flex flex-col justify-center">
            {isEditingWorkflowName ? (
              <input
                autoFocus
                type="text"
                value={newWorkflowName}
                onChange={e => setNewWorkflowName(e.target.value)}
                onBlur={() => storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
                onKeyDown={e => e.key === 'Enter' && storageRenameWorkflow(activeWorkflowId, newWorkflowName)}
                className="bg-gray-700 border border-indigo-500 rounded px-1.5 py-0.5 text-[10px] text-white outline-none w-full h-6"
              />
            ) : (
              <>
                <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider leading-none mb-0.5 block">
                  当前工作流
                </span>
                <div className="flex items-center min-w-0 h-4">
                  <button
                    onClick={() => setShowWorkflowMenu(!showWorkflowMenu)}
                    className="flex items-center gap-0.5 min-w-0 flex-1 text-left mr-1"
                  >
                    <span className="font-bold text-[10px] text-gray-100 truncate leading-none pt-0.5">
                      {workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 text-gray-400 shrink-0 mt-0.5" />
                  </button>
                  <button
                    onClick={() => {
                      setNewWorkflowName(workflows.find(w => w.id === activeWorkflowId)?.name || '');
                      setIsEditingWorkflowName(true);
                    }}
                    className="flex items-center justify-center p-0.5 text-gray-500 hover:text-indigo-400 shrink-0"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </>
            )}
            {showWorkflowMenu && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-in slide-in-from-top-2 duration-200">
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {workflows.map(wf => (
                    <div key={wf.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-700">
                      <button
                        onClick={() => switchWorkflow(wf.id)}
                        className={`flex-1 text-left text-sm truncate ${activeWorkflowId === wf.id ? 'text-indigo-400' : 'text-gray-300'}`}
                      >
                        {wf.name}
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          storageDeleteWorkflow(wf.id);
                        }}
                        className="p-1 text-gray-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-700 mt-2 pt-2 px-2 space-y-1">
                  <button
                    onClick={createWorkflow}
                    className="w-full text-left px-3 py-2 text-xs text-indigo-400 font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> 创建新工作流
                  </button>
                  <label className="w-full text-left px-3 py-2 text-xs text-emerald-400 font-bold flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" /> 导入工作流
                    <input type="file" accept=".json" onChange={handleImportWorkflow} className="hidden" />
                  </label>
                  <button
                    onClick={() => exportWorkflow(activeWorkflowId)}
                    className="w-full text-left px-3 py-2 text-xs text-amber-400 font-bold flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> 导出当前工作流
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isRunning && (
            <button
              onClick={handleSaveWorkflow}
              className="flex flex-col items-center justify-center p-1 bg-gray-700/50 text-indigo-400 rounded-lg border border-gray-600/50 active:scale-95 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold mt-0.5">保存</span>
            </button>
          )}

          {isRunning ? (
            <button
              onClick={() => {
                if (confirm('是否强制停止当前任务？\n如果任务长时间卡在“准备中”，请点击确定。')) {
                  stopWorkflow();
                  // 强制兜底重置状态，防止 stopWorkflow 因异常未完全执行
                  setTimeout(() => {
                    workflowManager.stop();
                  }, 200);
                }
              }}
              className="flex flex-col items-center justify-center bg-red-600/20 text-red-500 p-1.5 rounded-lg border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[8px] font-bold mt-0.5">停止</span>
            </button>
          ) : (
            <button
              onClick={autoLayoutNodes}
              className="flex flex-col items-center justify-center p-1 bg-emerald-600/10 text-emerald-400 rounded-lg border border-emerald-500/20 active:scale-95 transition-all"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold mt-0.5">整理</span>
            </button>
          )}

          <button
            onClick={resetWorkflowStatus}
            className="flex flex-col items-center justify-center p-1 bg-gray-700/50 text-gray-400 rounded-lg border border-gray-600/50 active:scale-95"
            title="重置执行进度和节点状态"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="text-[8px] font-bold mt-0.5">重置</span>
          </button>

          {isRunning ? null : isPaused && currentNodeIndex !== -1 ? (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-1 py-1 text-[9px] text-gray-300 outline-none max-w-[70px]"
                  value=""
                  onChange={e => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>
                    选择节点...
                  </option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>
                      {idx + 1}. {n.data.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={resumeWorkflow}
                className="flex flex-col items-center justify-center bg-blue-600/20 text-blue-500 p-1.5 rounded-lg border border-blue-500/20 shadow-lg"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="text-[8px] font-bold mt-0.5">继续</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <select
                  className="bg-gray-800 border border-gray-700 rounded-lg px-1 py-1 text-[9px] text-gray-300 outline-none max-w-[70px]"
                  value=""
                  onChange={e => {
                    const idx = parseInt(e.target.value);
                    if (!isNaN(idx)) runWorkflow(idx);
                  }}
                >
                  <option value="" disabled>
                    从头开始
                  </option>
                  {orderedNodes.map((n, idx) => (
                    <option key={n.id} value={idx}>
                      {idx + 1}. {n.data.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => runWorkflow(0)}
                disabled={nodes.length === 0}
                className="flex flex-col items-center justify-center bg-green-600/20 text-green-500 p-1.5 rounded-lg border border-green-500/20 shadow-lg disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="text-[8px] font-bold mt-0.5">运行</span>
              </button>
            </div>
          )}
          <div className="w-px h-6 bg-gray-700 mx-0.5" />
          <button onClick={onClose} className="p-1 text-gray-400 flex flex-col items-center">
            <X className="w-5 h-5" />
            <span className="text-[8px] font-bold">关闭</span>
          </button>
        </div>
      </div>

      {/* 错误提示栏 */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2 shrink-0">
          <span className="text-[10px] text-red-400 font-bold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {error}
          </span>
          <button
            onClick={() => setError(null)}
            className="p-1 text-red-400/50 hover:text-red-400 active:scale-90 transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 画布 */}
      <div className={`flex-1 relative bg-[#1a1a1a] ${editingNodeId ? 'invisible h-0' : 'visible'}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setEditingNodeId(node.id)}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          colorMode="dark"
          defaultEdgeOptions={{ type: 'custom', animated: false }}
        >
          <Background color="#333" gap={25} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} position="bottom-right" className="m-4 scale-125" />
          <Panel position="top-left" className="m-3">
            <button
              onClick={() => setShowAddMenu(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-xs font-bold text-white rounded-full shadow-2xl active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" /> 添加模块
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {/* 底部浮动操作栏 */}
      {editingNode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-gray-800/90 backdrop-blur-xl border border-gray-600 rounded-2xl shadow-2xl p-2 flex items-center gap-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={() => setEditingNodeId(editingNode.id)}
            className="flex flex-col items-center gap-1 px-4 py-2 text-indigo-400 hover:bg-gray-700 rounded-xl transition-colors"
          >
            <Settings2 className="w-5 h-5" />
            <span className="text-[10px] font-bold">配置</span>
          </button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button
            onClick={() => cloneNode(editingNode)}
            className="flex flex-col items-center gap-1 px-4 py-2 text-emerald-400 hover:bg-gray-700 rounded-xl transition-colors"
          >
            <Copy className="w-5 h-5" />
            <span className="text-[10px] font-bold">克隆</span>
          </button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button
            onClick={() => {
              setNodes(nds => nds.filter(n => n.id !== editingNode.id));
              setEditingNodeId(null);
            }}
            className="flex flex-col items-center gap-1 px-4 py-2 text-red-400 hover:bg-gray-700 rounded-xl transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px] font-bold">删除</span>
          </button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button
            onClick={() => setEditingNodeId(null)}
            className="flex flex-col items-center gap-1 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
            <span className="text-[10px] font-bold">关闭</span>
          </button>
        </div>
      )}

      {/* 模块添加菜单 */}
      {showAddMenu && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end justify-center p-0"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="bg-gray-800 w-full rounded-t-[2.5rem] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-8" />
            <div className="grid grid-cols-3 gap-6">
              {(Object.keys(NODE_CONFIGS) as Array<NodeTypeKey>).map(type => (
                <button
                  key={type}
                  onClick={() => addNewNode(type)}
                  className="flex flex-col items-center gap-3 active:scale-90 transition-transform"
                >
                  <div
                    className="p-4 rounded-3xl shadow-xl"
                    style={{ backgroundColor: `${NODE_CONFIGS[type].color}20`, color: NODE_CONFIGS[type].color }}
                  >
                    {(() => {
                      const Icon = NODE_CONFIGS[type].icon;
                      return <Icon className="w-7 h-7" />;
                    })()}
                  </div>
                  <span className="text-xs font-bold text-gray-300">{NODE_CONFIGS[type].typeLabel}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddMenu(false)}
              className="w-full mt-10 py-4 bg-gray-700 text-gray-300 rounded-2xl font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 配置面板 */}
      {editingNodeId && editingNode && (
        <MobilePanel
          editingNode={editingNode}
          activeNovel={activeNovel}
          allPresets={allPresets}
          pendingFolders={pendingFolders}
          globalConfig={globalConfig}
          onUpdateNodeData={updateNodeData}
          onDeleteNode={id => {
            setNodes(nds => nds.filter(n => n.id !== id));
            setEditingNodeId(null);
          }}
          onDeleteOutputEntry={deleteOutputEntry}
          onClose={() => setEditingNodeId(null)}
          onPreviewEntry={setPreviewEntry}
        />
      )}

      {/* 预览预览 */}
      {previewEntry && (
        <div className="fixed inset-0 bg-gray-900 z-[200] flex flex-col animate-in fade-in duration-200">
          <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
              <h3 className="font-bold text-gray-100 truncate pr-4">{previewEntry.title}</h3>
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
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold"
              >
                跳转
              </button>
              <button onClick={() => setPreviewEntry(null)} className="p-2 bg-gray-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">
            {previewEntry.content}
          </div>
          <div className="p-6 bg-gray-800 border-t border-gray-700 flex gap-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(previewEntry.content);
              }}
              className="flex-1 py-4 bg-gray-700 text-gray-200 rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <Copy className="w-5 h-5" /> 复制内容
            </button>
            <button
              onClick={() => setPreviewEntry(null)}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold"
            >
              关闭预览
            </button>
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
    </div>
  );
};

export const MobileWorkflowEditor: React.FC<WorkflowEditorProps> = props => {
  return (
    <ReactFlowProvider>
      <MobileWorkflowEditorContent {...props} />
    </ReactFlowProvider>
  );
};

import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
  Node,
  NodeProps,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  Cpu,
  FileText,
  FolderPlus,
  Globe,
  LayoutList,
  Library,
  Lightbulb,
  MessageSquare,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  User,
  Users,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GeneratorPreset, Novel } from '../types';

// --- 类型定义 ---

interface ReferenceItem {
  type: 'worldview' | 'character' | 'outline' | 'inspiration';
  setId: string;
  index: number;
}

// 结构化的生成内容条目
interface OutputEntry {
  id: string;
  title: string;
  content: string;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  typeLabel: string;
  icon: any;
  color: string;
  presetType: string | null;
  presetId: string;
  presetName: string;
  instruction: string;
  typeKey: string;
  folderName: string;
  selectedWorldviewSets: string[];
  selectedCharacterSets: string[];
  selectedOutlineSets: string[];
  selectedInspirationSets: string[];
  outputEntries: OutputEntry[]; // 改为结构化条目
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  targetVolumeId?: string;
  targetVolumeName?: string;
  autoOptimize?: boolean;
  twoStepOptimization?: boolean;
}

export type WorkflowNode = Node<WorkflowNodeData>;

// --- 自定义节点组件 ---

const CustomNode = ({ data, selected }: NodeProps<WorkflowNode>) => {
  const Icon = data.icon;
  const color = data.color;

  const refCount = (data.selectedWorldviewSets?.length || 0) +
                   (data.selectedCharacterSets?.length || 0) +
                   (data.selectedOutlineSets?.length || 0) +
                   (data.selectedInspirationSets?.length || 0);

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return 'border-green-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
      case 'failed': return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      default: return selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700';
    }
  };

  return (
    <div className={`px-4 py-3 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '280px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1 flex items-center justify-between">
            {data.typeLabel}
            {data.status === 'executing' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
            {data.status === 'completed' && <CheckSquare className="w-3 h-3 text-green-500" />}
          </div>
          <div className="text-sm font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-1.5">
        {data.folderName && (
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded">
            <FolderPlus className="w-3 h-3" />
            <span className="truncate">目录: {data.folderName}</span>
          </div>
        )}
        {refCount > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <Library className="w-3 h-3" />
            <span>引用了 {refCount} 个资料集</span>
          </div>
        )}
      </div>


      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// --- 配置定义 ---

type NodeTypeKey = 'createFolder' | 'userInput' | 'aiChat' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline' | 'chapter';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
  createFolder: {
    typeLabel: '创建项目目录',
    icon: FolderPlus,
    color: '#818cf8',
    defaultLabel: '初始化目录',
    presetType: null,
  },
  userInput: {
    typeLabel: '用户输入',
    icon: User,
    color: '#3b82f6',
    defaultLabel: '全局输入',
    presetType: null,
  },
  aiChat: {
    typeLabel: 'AI 聊天',
    icon: MessageSquare,
    color: '#a855f7',
    defaultLabel: '自由对话',
    presetType: 'chat',
  },
  inspiration: {
    typeLabel: '灵感集',
    icon: Lightbulb,
    color: '#eab308',
    defaultLabel: '生成灵感',
    presetType: 'inspiration',
  },
  worldview: {
    typeLabel: '世界观',
    icon: Globe,
    color: '#10b981',
    defaultLabel: '构建设定',
    presetType: 'worldview',
  },
  characters: {
    typeLabel: '角色集',
    icon: Users,
    color: '#f97316',
    defaultLabel: '塑造人物',
    presetType: 'character',
  },
  plotOutline: {
    typeLabel: '粗纲',
    icon: LayoutList,
    color: '#ec4899',
    defaultLabel: '规划结构',
    presetType: 'plotOutline',
  },
  outline: {
    typeLabel: '大纲',
    icon: BookOpen,
    color: '#6366f1',
    defaultLabel: '细化章节',
    presetType: 'outline',
  },
  chapter: {
    typeLabel: '正文生成',
    icon: FileText,
    color: '#8b5cf6',
    defaultLabel: '生成章节正文',
    presetType: 'completion',
  },
};

export interface WorkflowEditorProps {
  isOpen: boolean;
  onClose: () => void;
  activeNovel: Novel | undefined;
  onUpdateNovel?: (novel: Novel) => void;
  onStartAutoWrite?: () => void;
  globalConfig?: {
    apiKey: string;
    baseUrl: string;
    model: string;
    outlineModel: string;
    characterModel: string;
    worldviewModel: string;
    inspirationModel: string;
    plotOutlineModel: string;
    optimizeModel: string;
    analysisModel: string;
  };
}

export const WorkflowEditor = (props: WorkflowEditorProps) => {
  const { isOpen, onClose, activeNovel, onUpdateNovel, onStartAutoWrite, globalConfig } = props;
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(-1);
  const [stopRequested, setStopRequested] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState<Edge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  // 获取工作流中所有“初始化目录”节点定义的文件夹名（即便尚未运行创建）
  const pendingFolders = nodes
    .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
    .map(n => n.data.folderName);

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

  // 加载预设
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat'];
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

  // 加载保存的工作流
  useEffect(() => {
    if (!isOpen) return;
    const savedWorkflow = localStorage.getItem('novel_workflow');
    if (savedWorkflow) {
      try {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedWorkflow);
        const restoredNodes = (savedNodes || []).map((n: WorkflowNode) => ({
          ...n,
          data: {
            ...n.data,
            icon: NODE_CONFIGS[n.data.typeKey as NodeTypeKey]?.icon,
            selectedWorldviewSets: n.data.selectedWorldviewSets || [],
            selectedCharacterSets: n.data.selectedCharacterSets || [],
            selectedOutlineSets: n.data.selectedOutlineSets || [],
            selectedInspirationSets: n.data.selectedInspirationSets || [],
            outputEntries: n.data.outputEntries || (n.data.outputContent ? [{ id: '1', title: '生成内容', content: n.data.outputContent as string }] : []),
          }
        }));
        setNodes(restoredNodes);
        setEdges(savedEdges);
      } catch (e) {
        console.error('Failed to load workflow', e);
      }
    }
  }, [isOpen, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNewNode = useCallback((typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
    
    // 自动发现当前工作流中定义的计划文件夹
    const currentPendingFolders = nodes
      .filter(n => n.data.typeKey === 'createFolder' && n.data.folderName)
      .map(n => `pending:${n.data.folderName}`);

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      data: {
        ...config,
        typeKey,
        label: config.defaultLabel,
        presetId: '',
        presetName: '',
        instruction: '',
        folderName: '',
        // 新增节点时，默认勾选计划中的文件夹
        selectedWorldviewSets: [...currentPendingFolders],
        selectedCharacterSets: [...currentPendingFolders],
        selectedOutlineSets: [...currentPendingFolders],
        selectedInspirationSets: [...currentPendingFolders],
        outputEntries: [],
        targetVolumeId: activeNovel?.volumes[0]?.id || '',
        targetVolumeName: '',
        autoOptimize: false,
        twoStepOptimization: false,
      },
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };
    setNodes((nds) => [...nds, newNode]);
    setShowAddMenu(false);
  }, [setNodes, nodes, activeNovel]);

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
      const isRenameFolder = targetNode?.data.typeKey === 'createFolder' && updates.folderName !== undefined && updates.folderName !== targetNode?.data.folderName;
      const oldFolderName = targetNode?.data.folderName;
      const newFolderName = updates.folderName;

      return nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
        }
        
        // 如果是文件夹重命名，自动更新其他节点对该“计划中”文件夹的引用，并清空历史产物
        if (isRenameFolder && oldFolderName && newFolderName) {
          const oldPendingId = `pending:${oldFolderName}`;
          const newPendingId = `pending:${newFolderName}`;
          
          const updateRefs = (refs: string[] | undefined) => {
            if (!refs) return [newPendingId]; // 如果没定义，默认选上新的
            if (refs.includes(oldPendingId)) {
              return refs.map(r => r === oldPendingId ? newPendingId : r);
            }
            if (!refs.includes(newPendingId)) {
              return [...refs, newPendingId];
            }
            return refs;
          };

          return {
            ...node,
            data: {
              ...node.data,
              selectedWorldviewSets: updateRefs(node.data.selectedWorldviewSets),
              selectedCharacterSets: updateRefs(node.data.selectedCharacterSets),
              selectedOutlineSets: updateRefs(node.data.selectedOutlineSets),
              selectedInspirationSets: updateRefs(node.data.selectedInspirationSets),
              outputEntries: [], // 只有当初始化目录改名时，才清空其他节点的产物
            }
          };
        }
        return node;
      });
    });
  }, [setNodes]);

  const toggleSetReference = useCallback((type: 'worldview' | 'character' | 'outline' | 'inspiration', setId: string) => {
    if (!editingNodeId) return;
    
    setNodes((nds) => nds.map(node => {
      if (node.id === editingNodeId) {
        const key = type === 'worldview' ? 'selectedWorldviewSets' :
                    type === 'character' ? 'selectedCharacterSets' :
                    type === 'outline' ? 'selectedOutlineSets' : 'selectedInspirationSets';
        
        const currentList = [...(node.data[key] as string[])];
        // 这里的 setId 可能是真实的 ID，也可能是 'pending:FolderName'
        const newList = currentList.includes(setId)
          ? currentList.filter(id => id !== setId)
          : [...currentList, setId];
          
        return {
          ...node,
          data: {
            ...node.data,
            [key]: newList
          }
        };
      }
      return node;
    }));
  }, [editingNodeId, setNodes]);

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
    const workflow = { nodes, edges };
    localStorage.setItem('novel_workflow', JSON.stringify(workflow));
  };

  // --- 自动化执行引擎 (AI 调用) ---
  const runWorkflow = async (startIndex: number = 0) => {
    if (!globalConfig?.apiKey) {
      setError('请先在主设置中配置 API Key');
      return;
    }
    
    setIsRunning(true);
    setIsPaused(false);
    setStopRequested(false);
    setError(null);
    stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();
    
    try {
      if (!activeNovel) return;

      // 使用 localNovel 跟踪执行过程中的最新状态，避免闭包捕获 stale props
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = (newNovel: Novel) => {
        localNovel = newNovel;
        onUpdateNovel?.(newNovel);
      };

      // 简单排序执行：按 Y 轴位置顺序执行
      const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);
      
      // 重置后续节点的执行状态
      if (startIndex === 0) {
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'pending' } })));
      }

      let accumContext = ''; // 累积全局和常驻上下文
      let lastNodeOutput = ''; // 上一个节点的直接输出
      let currentWorkflowFolder = ''; // 当前工作流确定的文件夹名

      // 如果是从中间开始，需要重建上下文
      if (startIndex > 0) {
        for (let j = 0; j < startIndex; j++) {
          const prevNode = sortedNodes[j];
          if (prevNode.data.typeKey === 'createFolder') {
            currentWorkflowFolder = prevNode.data.folderName;
          } else if (prevNode.data.typeKey === 'userInput') {
            accumContext += `【全局输入】：\n${prevNode.data.instruction}\n\n`;
          }
          // 获取上一个执行完的节点的产出作为 lastNodeOutput
          if (j === startIndex - 1 && prevNode.data.outputEntries && prevNode.data.outputEntries.length > 0) {
            lastNodeOutput = `【${prevNode.data.typeLabel}输出】：\n${prevNode.data.outputEntries[0].content}`;
          }
        }
      }
      
      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (stopRequestedRef.current) {
          setIsPaused(true);
          setCurrentNodeIndex(i);
          break;
        }

        const node = sortedNodes[i];
        setCurrentNodeIndex(i);
        
        // 更新节点状态为正在执行
        setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'executing' } } : n));
        // 处理创建文件夹节点
        if (node.data.typeKey === 'createFolder') {
          currentWorkflowFolder = node.data.folderName;
          if (currentWorkflowFolder) {
            const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
              const existing = sets?.find(s => s.name === name);
              if (existing) return { id: existing.id, isNew: false };
              const newSet = creator();
              return { id: newSet.id, isNew: true, set: newSet };
            };

            const updatedNovel = { ...localNovel };
            let changed = false;

            const worldviewResult = createSetIfNotExist(updatedNovel.worldviewSets, currentWorkflowFolder, () => ({
              id: `wv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              entries: [],
            }));
            if (worldviewResult.isNew) {
              updatedNovel.worldviewSets = [...(updatedNovel.worldviewSets || []), worldviewResult.set];
              changed = true;
            }

            const characterResult = createSetIfNotExist(updatedNovel.characterSets, currentWorkflowFolder, () => ({
              id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              characters: [],
            }));
            if (characterResult.isNew) {
              updatedNovel.characterSets = [...(updatedNovel.characterSets || []), characterResult.set];
              changed = true;
            }

            const outlineResult = createSetIfNotExist(updatedNovel.outlineSets, currentWorkflowFolder, () => ({
              id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (outlineResult.isNew) {
              updatedNovel.outlineSets = [...(updatedNovel.outlineSets || []), outlineResult.set];
              changed = true;
            }

            const inspirationResult = createSetIfNotExist(updatedNovel.inspirationSets, currentWorkflowFolder, () => ({
              id: `insp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (inspirationResult.isNew) {
              updatedNovel.inspirationSets = [...(updatedNovel.inspirationSets || []), inspirationResult.set];
              changed = true;
            }

            const plotOutlineResult = createSetIfNotExist(updatedNovel.plotOutlineSets, currentWorkflowFolder, () => ({
              id: `plot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: currentWorkflowFolder,
              items: [],
            }));
            if (plotOutlineResult.isNew) {
              updatedNovel.plotOutlineSets = [...(updatedNovel.plotOutlineSets || []), plotOutlineResult.set];
              changed = true;
            }

            if (changed) {
              updateLocalAndGlobal(updatedNovel);
            }
          }
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
          continue;
        }

        // 1. 获取对应类型的预设
        let typePresets = allPresets[node.data.presetType as string] || [];
        
        if (node.data.typeKey === 'aiChat') {
          const allAvailablePresets = Object.values(allPresets).flat();
          typePresets = allAvailablePresets;
        }

        let preset = typePresets.find(p => p.id === node.data.presetId);
        if (!preset && node.data.typeKey !== 'aiChat') {
          preset = typePresets[0];
          if (!preset) continue;
        }

        // 2. 构建参考资料上下文 (Context)
        let refContext = '';
        
        // 优先使用节点选中的资料集，如果没有选中且存在当前工作流文件夹，则尝试自动匹配
        let selectedWorldview = [...(node.data.selectedWorldviewSets || [])];
        let selectedCharacters = [...(node.data.selectedCharacterSets || [])];
        let selectedOutlines = [...(node.data.selectedOutlineSets || [])];
        let selectedInspirations = [...(node.data.selectedInspirationSets || [])];

        // 核心逻辑：解析 pending: 引用
        const resolvePendingRef = (list: string[], sets: any[] | undefined) => {
          return list.map(id => {
            if (id.startsWith('pending:')) {
              const folderName = id.replace('pending:', '');
              const matched = sets?.find(s => s.name === folderName);
              return matched ? matched.id : id; // 如果还没建立，保留原样（会跳过渲染）
            }
            return id;
          });
        };

        selectedWorldview = resolvePendingRef(selectedWorldview, localNovel.worldviewSets);
        selectedCharacters = resolvePendingRef(selectedCharacters, localNovel.characterSets);
        selectedOutlines = resolvePendingRef(selectedOutlines, localNovel.outlineSets);
        selectedInspirations = resolvePendingRef(selectedInspirations, localNovel.inspirationSets);

        // 如果存在当前工作流确定的文件夹名，确保该文件夹被关联（即使用户没手动选，也要作为默认输出目标/上下文）
        if (currentWorkflowFolder) {
          const wvId = localNovel.worldviewSets?.find(s => s.name === currentWorkflowFolder)?.id;
          if (wvId && !selectedWorldview.includes(wvId)) selectedWorldview.push(wvId);
          
          const charId = localNovel.characterSets?.find(s => s.name === currentWorkflowFolder)?.id;
          if (charId && !selectedCharacters.includes(charId)) selectedCharacters.push(charId);
          
          const outId = localNovel.outlineSets?.find(s => s.name === currentWorkflowFolder)?.id;
          if (outId && !selectedOutlines.includes(outId)) selectedOutlines.push(outId);
          
          const inspId = localNovel.inspirationSets?.find(s => s.name === currentWorkflowFolder)?.id;
          if (inspId && !selectedInspirations.includes(inspId)) selectedInspirations.push(inspId);
        }

        selectedWorldview.forEach(id => {
            const set = localNovel.worldviewSets?.find(s => s.id === id);
            if (set) refContext += `【参考世界观 (${set.name})】：\n${set.entries.map(e => `· ${e.item}: ${e.setting}`).join('\n')}\n`;
        });
        selectedCharacters.forEach(id => {
            const set = localNovel.characterSets?.find(s => s.id === id);
            if (set) refContext += `【参考角色 (${set.name})】：\n${set.characters.map(c => `· ${c.name}: ${c.bio}`).join('\n')}\n`;
        });
        selectedOutlines.forEach(id => {
            const set = localNovel.outlineSets?.find(s => s.id === id);
            if (set) refContext += `【参考粗纲 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.summary}`).join('\n')}\n`;
        });
        selectedInspirations.forEach(id => {
            const set = localNovel.inspirationSets?.find(s => s.id === id);
            if (set) refContext += `【参考灵感 (${set.name})】：\n${set.items.map(i => `· ${i.title}: ${i.content}`).join('\n')}\n`;
        });

        // 3. 构建消息
        // 去重逻辑：如果上个节点的输出已经包含在参考资料中，则不再重复追加 lastNodeOutput
        const isDuplicate = lastNodeOutput && refContext.includes(lastNodeOutput.substring(0, 100)); // 取前100字符判断
        const finalContext = `${refContext}${accumContext}${(!isDuplicate && lastNodeOutput) ? `【前序节点产出】：\n${lastNodeOutput}\n\n` : ''}`;
        let messages: any[] = [];
        
        if (node.data.typeKey === 'aiChat' && !preset) {
            // AI 聊天且未选预设的情况，使用最简单的 User 消息
            messages = [{ role: 'user', content: `${finalContext}要求：${node.data.instruction || '请继续生成'}` }];
        } else if (preset) {
          if (node.data.typeKey === 'chapter') {
            // 对话补全源 (CompletionPreset) 的处理
            const completionPreset = preset as any; // 转换类型
            const prompts = completionPreset.prompts || [];
            messages = prompts
              .filter((p: any) => p.active)
              .map((p: any) => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction)
              }));
          } else {
            // 普通生成预设 (GeneratorPreset) 的处理
            messages = (preset.prompts || [])
              .filter(p => p.enabled)
              .map(p => ({
                role: p.role,
                content: p.content
                  .replace('{{context}}', finalContext)
                  .replace('{{input}}', node.data.instruction)
              }));
          }
        }

        if (messages.length === 0) messages.push({ role: 'user', content: node.data.instruction || '请生成内容' });

        // 4. 调用 AI
        const nodeApiConfig = preset?.apiConfig || {};
        const openai = new OpenAI({
          apiKey: nodeApiConfig.apiKey || globalConfig.apiKey,
          baseURL: nodeApiConfig.baseUrl || globalConfig.baseUrl,
          dangerouslyAllowBrowser: true
        });

        const completion = await openai.chat.completions.create({
          model: nodeApiConfig.model || globalConfig.model,
          messages,
          temperature: preset?.temperature ?? 1.0,
          top_p: preset?.topP ?? 1.0,
        }, { signal: abortControllerRef.current?.signal });

        let result = completion.choices[0]?.message?.content || '';
        
        // 4.1 处理自动优化和两阶段优化 (仅针对正文生成节点)
        if (node.data.typeKey === 'chapter' && (node.data.autoOptimize || node.data.twoStepOptimization)) {
          let analysisResult = '';
          
          // Phase 1: Analysis (if two-step optimization enabled)
          if (node.data.twoStepOptimization) {
            const analysisPresets = allPresets.analysis || [];
            const analysisPreset = analysisPresets[0]; // 默认使用第一个分析预设
            if (analysisPreset) {
              const analysisMessages = analysisPreset.prompts
                .filter(p => p.enabled)
                .map(p => ({
                  role: p.role,
                  content: p.content
                    .replace('{{content}}', result)
                    .replace('{{input}}', node.data.instruction)
                }));
              
              const analysisCompletion = await openai.chat.completions.create({
                model: analysisPreset.apiConfig?.model || globalConfig.analysisModel || globalConfig.model,
                messages: analysisMessages,
                temperature: analysisPreset.temperature ?? 1.0,
              }, { signal: abortControllerRef.current?.signal });
              analysisResult = analysisCompletion.choices[0]?.message?.content || '';
            }
          }

          // Phase 2: Optimization
          if (node.data.autoOptimize || node.data.twoStepOptimization) {
            const optimizePresets = allPresets.optimize || [];
            const optimizePreset = optimizePresets[0]; // 默认使用第一个优化预设
            if (optimizePreset) {
              const optimizeMessages = optimizePreset.prompts
                .filter(p => p.enabled)
                .map(p => {
                  let content = p.content
                    .replace('{{content}}', result)
                    .replace('{{input}}', node.data.instruction);
                  if (analysisResult) {
                    content = content.replace('{{analysis}}', analysisResult);
                    if (!content.includes(analysisResult) && !p.content.includes('{{analysis}}')) {
                      content += `\n\n【AI 修改建议】：\n${analysisResult}`;
                    }
                  }
                  return { role: p.role, content };
                });

              const optimizeCompletion = await openai.chat.completions.create({
                model: optimizePreset.apiConfig?.model || globalConfig.optimizeModel || globalConfig.model,
                messages: optimizeMessages,
                temperature: optimizePreset.temperature ?? 1.0,
              }, { signal: abortControllerRef.current?.signal });
              result = optimizeCompletion.choices[0]?.message?.content || result;
            }
          }
        }

        // 5. 结构化解析 AI 输出并更新节点产物
        let entriesToStore: { title: string; content: string }[] = [];
        
        try {
          // 增强型 JSON 提取逻辑：深度处理包含前置说明文字的情况
          let potentialJson = result.trim();
          
          // 1. 定位 JSON 结构边界
          const firstBracket = potentialJson.indexOf('[');
          const firstBrace = potentialJson.indexOf('{');
          let start = -1;
          let end = -1;

          if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            start = firstBracket;
            end = potentialJson.lastIndexOf(']');
          } else if (firstBrace !== -1) {
            start = firstBrace;
            end = potentialJson.lastIndexOf('}');
          }

          if (start !== -1 && end !== -1 && end > start) {
            potentialJson = potentialJson.substring(start, end + 1);
          }

          // 清理可能的 Markdown 标识
          potentialJson = potentialJson.replace(/```json\s*|```\s*/g, '').trim();

          const parsed = JSON.parse(potentialJson);
          
          // 深度标准化条目提取：精准匹配各设定集的字段名
          const extractEntries = (data: any): {title: string, content: string}[] => {
            // 如果是数组，根据内容结构智能提取
            if (Array.isArray(data)) {
              return data.map(item => {
                if (typeof item === 'string') return { title: `项 ${new Date().toLocaleTimeString()}`, content: item };
                
                // 智能优先级匹配
                const title = String(item.item || item.name || item.title || item.label || item.key || Object.keys(item)[0] || '未命名');
                const content = String(item.setting || item.bio || item.summary || item.content || item.description || item.value || (typeof item === 'object' ? JSON.stringify(item) : item));
                
                return { title, content };
              });
            }
            
            // 如果是对象，递归寻找数组，或者将对象本身视为单条记录/键值对
            if (typeof data === 'object' && data !== null) {
              const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
              if (arrayKey) return extractEntries(data[arrayKey]);
              
              return Object.entries(data).map(([k, v]) => ({
                title: k,
                content: typeof v === 'string' ? v : JSON.stringify(v)
              }));
            }
            return [];
          };

          entriesToStore = extractEntries(parsed);
        } catch (e) {
          // 解析失败，说明不是结构化 JSON，按单条内容处理
          entriesToStore = [{
            title: `生成结果 ${new Date().toLocaleTimeString()}`,
            content: result
          }];
        }

        const newEntries: OutputEntry[] = entriesToStore.map((e, idx) => ({
          id: `${Date.now()}-${idx}`,
          title: e.title,
          content: e.content
        }));

        updateNodeData(node.id, { outputEntries: [...newEntries, ...(node.data.outputEntries || [])] });

        // 5.1 处理生成内容持久化存储
        let updatedNovelState = { ...localNovel };
        let novelChanged = false;

        if (node.data.typeKey === 'chapter') {
          // 逻辑变更：不再在工作流中生成单章，而是直接触发主界面的“开始自动化创作”逻辑
          if (onStartAutoWrite) {
            setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
            setIsRunning(false);
            onClose(); // 关闭工作流编辑器，回到主界面查看自动化创作
            // 稍作延迟确保 UI 关闭平滑
            setTimeout(() => {
              onStartAutoWrite();
            }, 100);
            return; // 终止工作流后续节点，由自动化创作接管
          } else {
            setError('无法触发自动化创作：回调函数未定义。');
            setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'failed' } } : n));
            setIsRunning(false);
            return;
          }
        } else if (node.data.folderName || currentWorkflowFolder) {
          // 其他类型：优先使用节点绑定的目录名，其次使用工作流全局确定的目录名
          const folderName = node.data.folderName || currentWorkflowFolder;
          
          if (node.data.typeKey === 'worldview') {
            updatedNovelState = {
              ...updatedNovelState,
              worldviewSets: updatedNovelState.worldviewSets?.map(s => {
                if (s.name === folderName) {
                  // 去重式更新：如果 title 相同，则覆盖内容，否则追加
                  const newEntries = [...s.entries];
                  entriesToStore.forEach(e => {
                    const idx = newEntries.findIndex(ne => ne.item === e.title);
                    if (idx !== -1) newEntries[idx] = { item: e.title, setting: e.content };
                    else newEntries.push({ item: e.title, setting: e.content });
                  });
                  return { ...s, entries: newEntries };
                }
                return s;
              })
            };
            novelChanged = true;
          } else if (node.data.typeKey === 'characters') {
            updatedNovelState = {
              ...updatedNovelState,
              characterSets: updatedNovelState.characterSets?.map(s => {
                if (s.name === folderName) {
                  const newChars = [...s.characters];
                  entriesToStore.forEach(e => {
                    const idx = newChars.findIndex(nc => nc.name === e.title);
                    if (idx !== -1) newChars[idx] = { name: e.title, bio: e.content };
                    else newChars.push({ name: e.title, bio: e.content });
                  });
                  return { ...s, characters: newChars };
                }
                return s;
              })
            };
            novelChanged = true;
          } else if (node.data.typeKey === 'outline') {
            updatedNovelState = {
              ...updatedNovelState,
              outlineSets: updatedNovelState.outlineSets?.map(s => {
                if (s.name === folderName) {
                  const newItems = [...s.items];
                  entriesToStore.forEach(e => {
                    const idx = newItems.findIndex(ni => ni.title === e.title);
                    if (idx !== -1) newItems[idx] = { title: e.title, summary: e.content };
                    else newItems.push({ title: e.title, summary: e.content });
                  });
                  return { ...s, items: newItems };
                }
                return s;
              })
            };
            novelChanged = true;
          } else if (node.data.typeKey === 'inspiration') {
            updatedNovelState = {
              ...updatedNovelState,
              inspirationSets: updatedNovelState.inspirationSets?.map(s => {
                if (s.name === folderName) {
                  const newItems = [...s.items];
                  entriesToStore.forEach(e => {
                    const idx = newItems.findIndex(ni => ni.title === e.title);
                    if (idx !== -1) newItems[idx] = { title: e.title, content: e.content };
                    else newItems.push({ title: e.title, content: e.content });
                  });
                  return { ...s, items: newItems };
                }
                return s;
              })
            };
            novelChanged = true;
          } else if (node.data.typeKey === 'plotOutline') {
            updatedNovelState = {
              ...updatedNovelState,
              plotOutlineSets: updatedNovelState.plotOutlineSets?.map(s => {
                if (s.name === folderName) {
                  const newItems = [...s.items];
                  entriesToStore.forEach((e, idx) => {
                    const existIdx = newItems.findIndex(ni => ni.title === e.title);
                    if (existIdx !== -1) newItems[existIdx] = { ...newItems[existIdx], description: e.content };
                    else newItems.push({ id: `plot_${Date.now()}_${idx}`, title: e.title, description: e.content, type: 'scene' });
                  });
                  return { ...s, items: newItems };
                }
                return s;
              })
            };
            novelChanged = true;
          }
        }

        if (novelChanged) {
          updateLocalAndGlobal(updatedNovelState);
        }
        
        // 6. 更新传递给下一个节点的上下文
        lastNodeOutput = `【${node.data.typeLabel}输出】：\n${result}`;
        // 注意：不累加到 accumContext，这样下下个节点就拿不到这个输出了

        // 更新节点状态为已完成
        setNodes(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'completed' } } : n));
      }
      
      if (!stopRequestedRef.current) {
        setCurrentNodeIndex(-1);
        setIsRunning(false);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('Workflow execution aborted by user');
        return; // 用户主动中止，不显示错误弹窗
      }
      console.error(e);
      // 更新当前节点状态为失败
      const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);
      const failedNode = sortedNodes[currentNodeIndex];
      if (failedNode) {
        setNodes(nds => nds.map(n => n.id === failedNode.id ? { ...n, data: { ...n.data, status: 'failed' } } : n));
      }
      // 将报错信息显示在 UI 上，而不是使用 alert
      setError(`执行失败: ${e.message}`);
      setIsRunning(false);
      setIsPaused(true);
    }
  };

  const stopWorkflow = () => {
    setStopRequested(true);
    stopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  };

  const resumeWorkflow = () => {
    if (currentNodeIndex !== -1) {
      runWorkflow(currentNodeIndex);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden relative">
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
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
              <Workflow className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-100 leading-tight">工作流编辑器</h3>
              <p className="text-xs text-gray-500">串联多步骤自动化任务</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                <button
                  onClick={() => runWorkflow(0)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all"
                >
                  重新开始
                </button>
              </div>
            ) : (
              <button
                onClick={() => runWorkflow(0)}
                disabled={isRunning || nodes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-green-900/20"
              >
                <Play className="w-4 h-4 fill-current" />
                运行工作流
              </button>
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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
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
                      return (
                        <button
                          key={type}
                          onClick={() => addNewNode(type)}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-3 transition-colors group"
                        >
                          <div className="p-1.5 rounded bg-gray-900 group-hover:bg-gray-800">
                              <config.icon className="w-4 h-4" style={{ color: config.color }} />
                          </div>
                          {config.typeLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button 
                onClick={() => {
                  setNodes([]);
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div
              className="absolute inset-0"
              onClick={() => setEditingNodeId(null)}
            />
            
            <div className="relative w-full max-w-[650px] bg-[#1e2230] rounded-xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-5 border-b border-gray-700/50 flex items-center justify-between bg-[#1a1d29]">
                <div className="flex items-center gap-2.5 text-indigo-400">
                  <editingNode.data.icon className="w-5 h-5" />
                  <span className="font-bold text-gray-100 text-lg">配置: {editingNode.data.label}</span>
                </div>
                <button
                  onClick={() => setEditingNodeId(null)}
                  className="p-1.5 hover:bg-gray-700/50 rounded-md text-gray-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-8 custom-scrollbar max-h-[80vh] overflow-y-auto bg-[#1e2230]">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">模块显示名称</label>
                    <input
                      type="text"
                      value={editingNode.data.label}
                      onChange={(e) => updateNodeData(editingNode.id, { label: e.target.value })}
                      className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                    />
                  </div>
                  <div className={`space-y-2.5 ${editingNode.data.typeKey === 'createFolder' ? 'col-span-2' : ''}`}>
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FolderPlus className="w-3 h-3" /> {editingNode.data.typeKey === 'createFolder' ? '创建并关联目录名' : '独立目录关联 (可选)'}
                    </label>
                    <input
                      type="text"
                      value={editingNode.data.folderName}
                      onChange={(e) => updateNodeData(editingNode.id, { folderName: e.target.value })}
                      className="w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-4 py-2.5 text-sm text-indigo-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                      placeholder={editingNode.data.typeKey === 'createFolder' ? "输入要创建的项目文件夹名称..." : "该步骤特定的目录名..."}
                    />
                  </div>
                </div>

                {editingNode.data.presetType && (
                  <div className="space-y-3 pt-6 border-t border-gray-700/30">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5" /> 调用系统预设
                    </label>
                    <div className="relative">
                      <select
                        value={editingNode.data.presetId}
                        onChange={(e) => {
                          const presets = allPresets[editingNode.data.presetType as string] || [];
                          const preset = presets.find(p => p.id === e.target.value);
                          updateNodeData(editingNode.id, {
                            presetId: e.target.value,
                            presetName: preset?.name || ''
                          });
                        }}
                        className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                      >
                        <option value="">-- {editingNode.data.typeKey === 'aiChat' ? '使用主设置模型' : '请选择生成预设'} --</option>
                        {editingNode.data.typeKey === 'aiChat'
                          ? Object.values(allPresets).flat().map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.apiConfig?.model || '默认模型'})</option>
                            ))
                          : (allPresets[editingNode.data.presetType as string] || []).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))
                        }
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                {editingNode.data.typeKey === 'chapter' && activeNovel && (
                  <div className="space-y-6 pt-6 border-t border-gray-700/30">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Library className="w-3 h-3" /> 保存至分卷
                        </label>
                        <div className="space-y-2">
                          <select
                            value={editingNode.data.targetVolumeId as string}
                            onChange={(e) => updateNodeData(editingNode.id, { targetVolumeId: e.target.value, targetVolumeName: '' })}
                            className="w-full bg-[#161922] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                          >
                            <option value="">-- 未分卷 --</option>
                            <option value="NEW_VOLUME">+ 新建分卷...</option>
                            {activeNovel.volumes.map(v => (
                              <option key={v.id} value={v.id}>{v.title}</option>
                            ))}
                          </select>
                          {editingNode.data.targetVolumeId === 'NEW_VOLUME' && (
                            <input
                              type="text"
                              value={editingNode.data.targetVolumeName as string}
                              onChange={(e) => updateNodeData(editingNode.id, { targetVolumeName: e.target.value })}
                              placeholder="输入新分卷名称..."
                              className="w-full bg-[#161922] border border-indigo-900/40 rounded-lg px-4 py-2 text-xs text-indigo-100 focus:border-indigo-500 outline-none transition-all"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-end gap-4 pb-1">
                        <button
                          onClick={() => updateNodeData(editingNode.id, { autoOptimize: !editingNode.data.autoOptimize })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${editingNode.data.autoOptimize ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                        >
                          <div className={`w-3 h-3 rounded-full ${editingNode.data.autoOptimize ? 'bg-purple-500 animate-pulse' : 'bg-gray-600'}`} />
                          自动优化
                        </button>
                        <button
                          onClick={() => updateNodeData(editingNode.id, { twoStepOptimization: !editingNode.data.twoStepOptimization })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${editingNode.data.twoStepOptimization ? 'bg-pink-500/20 text-pink-300 border-pink-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                        >
                          <div className={`w-3 h-3 rounded-full ${editingNode.data.twoStepOptimization ? 'bg-pink-500 animate-pulse' : 'bg-gray-600'}`} />
                          两阶段优化
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {editingNode.data.typeKey !== 'userInput' && activeNovel && (
                  <div className="space-y-4 pt-6 border-t border-gray-700/30">
                    <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                      <CheckSquare className="w-3.5 h-3.5" /> 关联参考资料集 (Context)
                    </label>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                        <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                          <Globe className="w-3 h-3 text-emerald-500"/> 世界观设定
                        </div>
                        <div className="space-y-1 pt-1">
                          {activeNovel.worldviewSets?.map(set => (
                            <button
                              key={set.id}
                              onClick={() => toggleSetReference('worldview', set.id)}
                              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedWorldviewSets.includes(set.id) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                            >
                              {editingNode.data.selectedWorldviewSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {set.name}
                            </button>
                          ))}
                          {/* 显示尚未创建但计划中的文件夹，使用 pending: 前缀标识 */}
                          {pendingFolders.filter(name => !activeNovel.worldviewSets?.some(s => s.name === name)).map(name => {
                            const pendingId = `pending:${name}`;
                            const isSelected = (editingNode.data.selectedWorldviewSets as string[]).includes(pendingId);
                            return (
                              <button
                                key={pendingId}
                                onClick={() => toggleSetReference('worldview', pendingId)}
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/50 shadow-sm shadow-emerald-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-emerald-500/20'}`}
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5" />}
                                {name} (计划中)
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                        <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                          <Users className="w-3 h-3 text-orange-500"/> 角色档案集
                        </div>
                        <div className="space-y-1 pt-1">
                          {activeNovel.characterSets?.map(set => (
                            <button
                              key={set.id}
                              onClick={() => toggleSetReference('character', set.id)}
                              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedCharacterSets.includes(set.id) ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                            >
                              {editingNode.data.selectedCharacterSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {set.name}
                            </button>
                          ))}
                          {/* 显示尚未创建但计划中的文件夹 */}
                          {pendingFolders.filter(name => !activeNovel.characterSets?.some(s => s.name === name)).map(name => {
                            const pendingId = `pending:${name}`;
                            const isSelected = (editingNode.data.selectedCharacterSets as string[]).includes(pendingId);
                            return (
                              <button
                                key={pendingId}
                                onClick={() => toggleSetReference('character', pendingId)}
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-orange-600/30 text-orange-200 border border-orange-500/50 shadow-sm shadow-orange-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-orange-500/20'}`}
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-orange-400" /> : <Square className="w-3.5 h-3.5" />}
                                {name} (计划中)
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                        <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                          <LayoutList className="w-3 h-3 text-pink-500"/> 剧情粗纲
                        </div>
                        <div className="space-y-1 pt-1">
                          {activeNovel.outlineSets?.map(set => (
                            <button
                              key={set.id}
                              onClick={() => toggleSetReference('outline', set.id)}
                              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedOutlineSets.includes(set.id) ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                            >
                              {editingNode.data.selectedOutlineSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {set.name}
                            </button>
                          ))}
                          {/* 显示尚未创建但计划中的文件夹 */}
                          {pendingFolders.filter(name => !activeNovel.outlineSets?.some(s => s.name === name)).map(name => {
                            const pendingId = `pending:${name}`;
                            const isSelected = (editingNode.data.selectedOutlineSets as string[]).includes(pendingId);
                            return (
                              <button
                                key={pendingId}
                                onClick={() => toggleSetReference('outline', pendingId)}
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-pink-600/30 text-pink-200 border border-pink-500/50 shadow-sm shadow-pink-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-pink-500/20'}`}
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-pink-400" /> : <Square className="w-3.5 h-3.5" />}
                                {name} (计划中)
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-[#161922] p-3 rounded-lg border border-gray-700/50 space-y-2">
                        <div className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5 pb-1 border-b border-gray-700/30">
                          <Lightbulb className="w-3 h-3 text-yellow-500"/> 灵感脑洞集
                        </div>
                        <div className="space-y-1 pt-1">
                          {activeNovel.inspirationSets?.map(set => (
                            <button
                              key={set.id}
                              onClick={() => toggleSetReference('inspiration', set.id)}
                              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedInspirationSets.includes(set.id) ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-medium' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                            >
                              {editingNode.data.selectedInspirationSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {set.name}
                            </button>
                          ))}
                          {/* 显示尚未创建但计划中的文件夹 */}
                          {pendingFolders.filter(name => !activeNovel.inspirationSets?.some(s => s.name === name)).map(name => {
                            const pendingId = `pending:${name}`;
                            const isSelected = (editingNode.data.selectedInspirationSets as string[]).includes(pendingId);
                            return (
                              <button
                                key={pendingId}
                                onClick={() => toggleSetReference('inspiration', pendingId)}
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${isSelected ? 'bg-yellow-600/30 text-yellow-200 border border-yellow-500/50 shadow-sm shadow-yellow-900/20 font-bold' : 'bg-gray-800/40 hover:bg-gray-700/60 text-gray-500 border border-dashed border-yellow-500/20'}`}
                              >
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-yellow-400" /> : <Square className="w-3.5 h-3.5" />}
                                {name} (计划中)
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-6 border-t border-gray-700/30">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">额外指令 (USER PROMPT)</label>
                  <textarea
                    value={editingNode.data.instruction}
                    onChange={(e) => updateNodeData(editingNode.id, { instruction: e.target.value })}
                    placeholder="输入该步骤的特定要求或引导词..."
                    className="w-full h-32 bg-[#161922] border border-gray-700/80 rounded-lg p-4 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none font-mono leading-relaxed transition-all"
                  />
                </div>

                {/* 结构化生成内容编辑器 (条目模式) */}
                <div className="space-y-4 pt-6 border-t border-gray-700/30">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Workflow className="w-3.5 h-3.5" /> 生成内容列表 (Output Entries)
                    </label>
                    <button
                      onClick={addEntry}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Plus className="w-3 h-3" /> 新增条目
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {(editingNode.data.outputEntries || []).map((entry) => (
                      <div key={entry.id} className="bg-[#161922] border border-gray-700/50 rounded-xl overflow-hidden shadow-lg group/entry">
                        <div className="bg-[#1a1d29] px-4 py-2 border-b border-gray-700/50 flex items-center justify-between">
                          <input
                            value={entry.title}
                            onChange={(e) => updateEntryTitle(entry.id, e.target.value)}
                            className="bg-transparent border-none outline-none text-xs font-bold text-indigo-300 focus:text-white transition-colors flex-1"
                            placeholder="条目标题..."
                          />
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover/entry:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={entry.content}
                          onChange={(e) => updateEntryContent(entry.id, e.target.value)}
                          placeholder="输入内容..."
                          className="w-full h-32 bg-transparent p-4 text-sm text-gray-300 focus:text-emerald-50 outline-none resize-none font-mono leading-relaxed"
                        />
                      </div>
                    ))}
                    {editingNode.data.outputEntries.length === 0 && (
                      <div className="text-center py-12 bg-[#161922] rounded-xl border border-dashed border-gray-700">
                        <div className="inline-block p-3 bg-gray-800 rounded-full mb-3">
                          <Workflow className="w-6 h-6 text-gray-600" />
                        </div>
                        <p className="text-sm text-gray-500">暂无生成产物，执行工作流或手动添加</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-gray-700/50 bg-[#1a1d29]">
                <button
                  onClick={() => {
                    setNodes((nds) => nds.filter(n => n.id !== editingNodeId));
                    setEditingNodeId(null);
                  }}
                  className="w-full py-3 bg-red-900/10 hover:bg-red-900/20 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 text-sm font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Trash2 className="w-4 h-4" /> 删除模块
                </button>
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
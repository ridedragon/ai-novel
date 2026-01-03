import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
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
  Copy,
  Cpu,
  FileText,
  FolderPlus,
  Globe,
  LayoutList,
  Lightbulb,
  MessageSquare,
  Play,
  Plus,
  Settings2,
  Square,
  Trash2,
  User,
  Users,
  Workflow,
  X
} from 'lucide-react';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GeneratorPreset, Novel } from '../types';
import { AutoWriteEngine } from '../utils/auto-write';
import { WorkflowData, WorkflowEditorProps, WorkflowNode, WorkflowNodeData } from './WorkflowEditor';

// --- 类型定义 ---
interface OutputEntry {
  id: string;
  title: string;
  content: string;
}

// --- 移动端优化节点组件 ---
const CustomNode = ({ data, selected }: NodeProps<WorkflowNode>) => {
  const Icon = data.icon;
  const color = data.color;

  const getStatusColor = () => {
    switch (data.status) {
      case 'executing': return 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return 'border-green-500 shadow-[0_0_5px_rgba(16,185,129,0.3)]';
      case 'failed': return 'border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.3)]';
      default: return selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700';
    }
  };

  return (
    <div className={`px-3 py-2 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${getStatusColor()}`} style={{ width: '160px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500 border-2 border-gray-800" />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-0.5 flex items-center justify-between">
            {data.typeLabel}
            {data.status === 'completed' && <CheckSquare className="w-2.5 h-2.5 text-green-500" />}
          </div>
          <div className="text-[11px] font-semibold text-gray-100 truncate">{data.label}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500 border-2 border-gray-800" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// --- 配置定义 ---
type NodeTypeKey = 'createFolder' | 'userInput' | 'aiChat' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline' | 'chapter';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
  createFolder: { typeLabel: '目录', icon: FolderPlus, color: '#818cf8', defaultLabel: '初始化目录', presetType: null },
  userInput: { typeLabel: '输入', icon: User, color: '#3b82f6', defaultLabel: '全局输入', presetType: null },
  aiChat: { typeLabel: '聊天', icon: MessageSquare, color: '#a855f7', defaultLabel: '自由对话', presetType: 'chat' },
  inspiration: { typeLabel: '灵感', icon: Lightbulb, color: '#eab308', defaultLabel: '生成灵感', presetType: 'inspiration' },
  worldview: { typeLabel: '世界观', icon: Globe, color: '#10b981', defaultLabel: '构建设定', presetType: 'worldview' },
  characters: { typeLabel: '角色', icon: Users, color: '#f97316', defaultLabel: '塑造人物', presetType: 'character' },
  plotOutline: { typeLabel: '粗纲', icon: LayoutList, color: '#ec4899', defaultLabel: '规划结构', presetType: 'plotOutline' },
  outline: { typeLabel: '大纲', icon: BookOpen, color: '#6366f1', defaultLabel: '细化章节', presetType: 'outline' },
  chapter: { typeLabel: '正文', icon: FileText, color: '#8b5cf6', defaultLabel: '生成章节正文', presetType: 'completion' },
};

export const MobileWorkflowEditor: React.FC<WorkflowEditorProps> = (props) => {
  const { isOpen, onClose, activeNovel, onSelectChapter, onUpdateNovel, globalConfig } = props;
  
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('default');
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentNodeIndex, setCurrentNodeIndex] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<OutputEntry | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const stopRequestedRef = useRef(false);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  const [allPresets, setAllPresets] = useState<Record<string, GeneratorPreset[]>>({});

  // 加载配置和数据
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline', 'completion', 'optimize', 'analysis', 'chat'];
    const loaded: Record<string, GeneratorPreset[]> = {};
    types.forEach(t => {
      try {
        const saved = localStorage.getItem(`${t}Presets`);
        loaded[t] = saved ? JSON.parse(saved) : [];
      } catch (e) { loaded[t] = []; }
    });
    setAllPresets(loaded);

    const savedWorkflows = localStorage.getItem('novel_workflows');
    const lastActiveId = localStorage.getItem('active_workflow_id');
    let loadedWorkflows: WorkflowData[] = savedWorkflows ? JSON.parse(savedWorkflows) : [];
    if (loadedWorkflows.length === 0) {
      loadedWorkflows = [{ id: 'default', name: '默认工作流', nodes: [], edges: [], lastModified: Date.now() }];
    }
    setWorkflows(loadedWorkflows);
    const targetId = lastActiveId && loadedWorkflows.find(w => w.id === lastActiveId) ? lastActiveId : loadedWorkflows[0].id;
    setActiveWorkflowId(targetId);
    
    const workflow = loadedWorkflows.find(w => w.id === targetId);
    if (workflow) {
      setNodes((workflow.nodes || []).map(n => ({
        ...n,
        data: { ...n.data, icon: NODE_CONFIGS[n.data.typeKey as NodeTypeKey]?.icon }
      })));
      setEdges(workflow.edges || []);
      setCurrentNodeIndex(workflow.currentNodeIndex ?? -1);
      setIsPaused(workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1);
    }
    isInitialLoadRef.current = false;
  }, [isOpen]);

  // 自动保存
  useEffect(() => {
    if (!isOpen || workflows.length === 0 || isInitialLoadRef.current) return;
    const updatedWorkflows = workflows.map(w => w.id === activeWorkflowId ? { ...w, nodes, edges, currentNodeIndex, lastModified: Date.now() } : w);
    localStorage.setItem('novel_workflows', JSON.stringify(updatedWorkflows));
    localStorage.setItem('active_workflow_id', activeWorkflowId);
  }, [nodes, edges, currentNodeIndex, activeWorkflowId, isOpen]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const addNewNode = (typeKey: NodeTypeKey) => {
    const config = NODE_CONFIGS[typeKey];
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
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        outputEntries: [],
        targetVolumeId: activeNovel?.volumes[0]?.id || '',
        status: 'pending'
      },
      position: { x: 50, y: 100 + nodes.length * 100 },
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
        outputEntries: []
      }
    };
    setNodes([...nodes, newNode]);
  };

  const updateNodeData = (nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
  };

  const switchWorkflow = (id: string) => {
    setActiveWorkflowId(id);
    const workflow = workflows.find(w => w.id === id);
    if (workflow) {
      setNodes((workflow.nodes || []).map(n => ({
        ...n,
        data: { ...n.data, icon: NODE_CONFIGS[n.data.typeKey as NodeTypeKey]?.icon }
      })));
      setEdges(workflow.edges || []);
      setCurrentNodeIndex(workflow.currentNodeIndex ?? -1);
      setIsPaused(workflow.currentNodeIndex !== undefined && workflow.currentNodeIndex !== -1);
    }
    setShowWorkflowMenu(false);
  };

  // --- 拓扑排序 ---
  const getOrderedNodes = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    nodes.forEach(node => { adjacencyList.set(node.id, []); inDegree.set(node.id, 0); });
    edges.forEach(edge => {
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });
    const queue: string[] = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
    const result: string[] = [];
    const currentInDegree = new Map(inDegree);
    while (queue.length > 0) {
      const uId = queue.shift()!;
      result.push(uId);
      (adjacencyList.get(uId) || []).forEach(v => {
        const newDegree = (currentInDegree.get(v) || 0) - 1;
        currentInDegree.set(v, newDegree);
        if (newDegree === 0) queue.push(v);
      });
    }
    const ordered = result.map(id => nodes.find(n => n.id === id)!).filter(Boolean);
    const remaining = nodes.filter(n => !result.includes(n.id));
    return [...ordered, ...remaining];
  }, [nodes, edges]);

  // --- 执行引擎 ---
  const runWorkflow = async (startIndex: number = 0) => {
    if (!globalConfig?.apiKey) { setError('请先配置 API Key'); return; }
    setIsRunning(true); setIsPaused(false); setError(null); stopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();
    
    try {
      if (!activeNovel) return;
      let localNovel = { ...activeNovel };
      const updateLocalAndGlobal = async (newNovel: Novel) => {
        localNovel = newNovel;
        if (onUpdateNovel) onUpdateNovel(newNovel);
      };

      const sortedNodes = getOrderedNodes();
      if (startIndex === 0) {
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'pending', outputEntries: [] } })));
      }

      let accumContext = '';
      let lastNodeOutput = ''; // 累积的前序节点产出
      let currentWorkflowFolder = '';

      if (startIndex > 0) {
        for (let j = 0; j < startIndex; j++) {
          const prevNode = sortedNodes[j];
          if (prevNode.data.typeKey === 'createFolder') currentWorkflowFolder = prevNode.data.folderName;
          else if (prevNode.data.typeKey === 'userInput') accumContext += `【全局输入】：\n${prevNode.data.instruction}\n\n`;
          
          if (prevNode.data.outputEntries?.length > 0) {
            lastNodeOutput += `【${prevNode.data.typeLabel}输出】：\n${prevNode.data.outputEntries[0].content}\n\n`;
          }
        }
      }

      for (let i = startIndex; i < sortedNodes.length; i++) {
        if (stopRequestedRef.current) { setIsPaused(true); setCurrentNodeIndex(i); break; }
        const node = sortedNodes[i];
        setCurrentNodeIndex(i);
        updateNodeData(node.id, { status: 'executing' });

        if (node.data.typeKey === 'createFolder') {
          currentWorkflowFolder = node.data.folderName;
          if (currentWorkflowFolder) {
            const createSetIfNotExist = (sets: any[] | undefined, name: string, creator: () => any) => {
              const existing = sets?.find(s => s.name === name);
              if (existing) return { id: existing.id, isNew: false, set: existing };
              const newSet = creator();
              return { id: newSet.id, isNew: true, set: newSet };
            };
            const updatedNovel = { ...localNovel };
            let changed = false;
            const volumeResult = createSetIfNotExist(updatedNovel.volumes, currentWorkflowFolder, () => ({ id: `vol_${Date.now()}`, title: currentWorkflowFolder, collapsed: false }));
            if (volumeResult.isNew) { updatedNovel.volumes = [...(updatedNovel.volumes || []), volumeResult.set]; changed = true; }
            const worldviewResult = createSetIfNotExist(updatedNovel.worldviewSets, currentWorkflowFolder, () => ({ id: `wv_${Date.now()}`, name: currentWorkflowFolder, entries: [] }));
            if (worldviewResult.isNew) { updatedNovel.worldviewSets = [...(updatedNovel.worldviewSets || []), worldviewResult.set]; changed = true; }
            const characterResult = createSetIfNotExist(updatedNovel.characterSets, currentWorkflowFolder, () => ({ id: `char_${Date.now()}`, name: currentWorkflowFolder, characters: [] }));
            if (characterResult.isNew) { updatedNovel.characterSets = [...(updatedNovel.characterSets || []), characterResult.set]; changed = true; }
            const outlineResult = createSetIfNotExist(updatedNovel.outlineSets, currentWorkflowFolder, () => ({ id: `out_${Date.now()}`, name: currentWorkflowFolder, items: [] }));
            if (outlineResult.isNew) { updatedNovel.outlineSets = [...(updatedNovel.outlineSets || []), outlineResult.set]; changed = true; }
            if (changed) await updateLocalAndGlobal(updatedNovel);
          }
          updateNodeData(node.id, { status: 'completed' });
          continue;
        }

        if (node.data.typeKey === 'userInput') {
          accumContext += `【全局输入】：\n${node.data.instruction}\n\n`;
          updateNodeData(node.id, { status: 'completed' });
          continue;
        }

        const preset = allPresets[node.data.presetType as string]?.find(p => p.id === node.data.presetId) || allPresets[node.data.presetType as string]?.[0];
        
        if (node.data.typeKey === 'chapter') {
          if (!globalConfig) throw new Error('缺失配置');
          const outlineSet = localNovel.outlineSets?.find(s => s.name === currentWorkflowFolder) || localNovel.outlineSets?.[0];
          if (!outlineSet?.items?.length) throw new Error('大纲集为空');
          
          const engine = new AutoWriteEngine({
            apiKey: globalConfig.apiKey, baseUrl: globalConfig.baseUrl, model: globalConfig.model,
            contextLength: globalConfig.contextLength, maxReplyLength: globalConfig.maxReplyLength,
            temperature: globalConfig.temperature, stream: globalConfig.stream, maxRetries: globalConfig.maxRetries,
            systemPrompt: localNovel.systemPrompt || '你是一个专业的小说家。',
            globalCreationPrompt: globalConfig.globalCreationPrompt, longTextMode: globalConfig.longTextMode,
            autoOptimize: node.data.autoOptimize || globalConfig.autoOptimize, consecutiveChapterCount: globalConfig.consecutiveChapterCount || 1,
            smallSummaryInterval: globalConfig.smallSummaryInterval, bigSummaryInterval: globalConfig.bigSummaryInterval,
            smallSummaryPrompt: globalConfig.smallSummaryPrompt, bigSummaryPrompt: globalConfig.bigSummaryPrompt,
            outlineModel: globalConfig.outlineModel,
          }, localNovel);

          await engine.run(outlineSet.items, 0, globalConfig.prompts.filter(p => p.active), globalConfig.getActiveScripts, 
            (s) => updateNodeData(node.id, { label: `创作中: ${s}` }),
            (n) => updateLocalAndGlobal(n),
            async (id, content) => { if (globalConfig.onChapterComplete) await globalConfig.onChapterComplete(id, content); },
            localNovel.volumes?.find(v => v.title === currentWorkflowFolder)?.id
          );
          updateNodeData(node.id, { status: 'completed', label: NODE_CONFIGS.chapter.defaultLabel });
          continue;
        }

        const openai = new OpenAI({ apiKey: globalConfig.apiKey, baseURL: globalConfig.baseUrl, dangerouslyAllowBrowser: true });
        
        // 增加去重逻辑 (参考 PC 端)
        const isDuplicate = lastNodeOutput && node.data.instruction && node.data.instruction.includes(lastNodeOutput.substring(0, 100));
        const finalContext = `${accumContext}${(!isDuplicate && lastNodeOutput) ? `【前序节点累积产出】：\n${lastNodeOutput}\n\n` : ''}`;
        
        const messages = [{ role: 'user' as const, content: `${finalContext}要求：${node.data.instruction || preset?.name || '生成内容'}` }];
        
        const completion = await openai.chat.completions.create({
          model: globalConfig.model, messages, temperature: preset?.temperature ?? 1.0,
        }, { signal: abortControllerRef.current?.signal });

        const result = completion.choices[0]?.message?.content || '';
        const entry: OutputEntry = { id: Date.now().toString(), title: '生成结果', content: result };
        updateNodeData(node.id, { status: 'completed', outputEntries: [entry, ...(node.data.outputEntries || [])] });
        lastNodeOutput += `【${node.data.typeLabel}输出】：\n${result}\n\n`;
      }
      if (!stopRequestedRef.current) { setCurrentNodeIndex(-1); setIsRunning(false); }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(`执行失败: ${e.message}`);
      setIsRunning(false);
    }
  };

  const stopWorkflow = () => { stopRequestedRef.current = true; abortControllerRef.current?.abort(); setIsRunning(false); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col animate-in fade-in duration-200 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-indigo-400" />
          <div className="relative">
            <button onClick={() => setShowWorkflowMenu(!showWorkflowMenu)} className="font-bold text-sm text-gray-100 flex items-center gap-1">
              {workflows.find(w => w.id === activeWorkflowId)?.name || '选择工作流'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showWorkflowMenu && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-2 z-50 animate-in slide-in-from-top-2 duration-200">
                {workflows.map(wf => (
                  <button key={wf.id} onClick={() => switchWorkflow(wf.id)} className={`w-full text-left px-4 py-3 text-sm ${activeWorkflowId === wf.id ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300'}`}>{wf.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRunning ? (
            <button onClick={stopWorkflow} className="text-red-500 p-1"><Square className="w-5 h-5 fill-current" /></button>
          ) : (
            <button onClick={() => runWorkflow(currentNodeIndex === -1 ? 0 : currentNodeIndex)} className="text-green-500 p-1"><Play className="w-5 h-5 fill-current" /></button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-6 h-6" /></button>
        </div>
      </div>

      {/* 画布 */}
      <div className="flex-1 relative bg-[#1a1a1a]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setEditingNodeId(node.id)}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          defaultEdgeOptions={{ style: { strokeWidth: 4, stroke: '#6366f1' }, animated: true }}
        >
          <Background color="#333" gap={25} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} position="bottom-right" className="m-4 scale-125" />
          <Panel position="top-left" className="m-3">
            <button onClick={() => setShowAddMenu(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-xs font-bold text-white rounded-full shadow-2xl active:scale-95 transition-all"><Plus className="w-4 h-4" /> 添加模块</button>
          </Panel>
        </ReactFlow>
      </div>

      {/* 底部浮动操作栏 */}
      {editingNode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-gray-800/90 backdrop-blur-xl border border-gray-600 rounded-2xl shadow-2xl p-2 flex items-center gap-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => setEditingNodeId(editingNode.id)} className="flex flex-col items-center gap-1 px-4 py-2 text-indigo-400 hover:bg-gray-700 rounded-xl transition-colors"><Settings2 className="w-5 h-5" /><span className="text-[10px] font-bold">配置</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => cloneNode(editingNode)} className="flex flex-col items-center gap-1 px-4 py-2 text-emerald-400 hover:bg-gray-700 rounded-xl transition-colors"><Copy className="w-5 h-5" /><span className="text-[10px] font-bold">克隆</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => { setNodes(nds => nds.filter(n => n.id !== editingNode.id)); setEditingNodeId(null); }} className="flex flex-col items-center gap-1 px-4 py-2 text-red-400 hover:bg-gray-700 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /><span className="text-[10px] font-bold">删除</span></button>
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button onClick={() => setEditingNodeId(null)} className="p-2 text-gray-400 hover:bg-gray-700 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
      )}

      {/* 模块添加菜单 */}
      {showAddMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end justify-center p-0" onClick={() => setShowAddMenu(false)}>
          <div className="bg-gray-800 w-full rounded-t-[2.5rem] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-8" />
            <div className="grid grid-cols-3 gap-6">
              {(Object.keys(NODE_CONFIGS) as Array<NodeTypeKey>).map(type => (
                <button key={type} onClick={() => addNewNode(type)} className="flex flex-col items-center gap-3 active:scale-90 transition-transform">
                  <div className="p-4 rounded-3xl shadow-xl" style={{ backgroundColor: `${NODE_CONFIGS[type].color}20`, color: NODE_CONFIGS[type].color }}>
                    {(() => { const Icon = NODE_CONFIGS[type].icon; return <Icon className="w-7 h-7" /> })()}
                  </div>
                  <span className="text-xs font-bold text-gray-300">{NODE_CONFIGS[type].typeLabel}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddMenu(false)} className="w-full mt-10 py-4 bg-gray-700 text-gray-300 rounded-2xl font-bold">取消</button>
          </div>
        </div>
      )}

      {/* 配置面板 */}
      {editingNodeId && editingNode && (
        <div className="fixed inset-0 bg-gray-900 z-[130] flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${editingNode.data.color}20`, color: editingNode.data.color }}>{(() => { const Icon = editingNode.data.icon; return <Icon className="w-5 h-5" /> })()}</div>
              <h3 className="font-bold text-gray-100 truncate max-w-[200px]">{editingNode.data.label}</h3>
            </div>
            <button onClick={() => setEditingNodeId(null)} className="p-2 bg-gray-700 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24 custom-scrollbar">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">模块名称</label>
              <input type="text" value={editingNode.data.label} onChange={(e) => updateNodeData(editingNode.id, { label: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none focus:border-indigo-500 shadow-inner" />
            </div>
            {editingNode.data.presetType && (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> AI 预设</label>
                <div className="relative">
                  <select value={editingNode.data.presetId} onChange={(e) => updateNodeData(editingNode.id, { presetId: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-white text-sm outline-none appearance-none">
                    <option value="">-- 请选择预设 --</option>
                    {(allPresets[editingNode.data.presetType as string] || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>
            )}
            {editingNode.data.typeKey === 'chapter' && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    const newVal = !editingNode.data.autoOptimize;
                    updateNodeData(editingNode.id, { autoOptimize: newVal });
                    if (globalConfig?.updateAutoOptimize) {
                      globalConfig.updateAutoOptimize(newVal);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${editingNode.data.autoOptimize ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${editingNode.data.autoOptimize ? 'bg-purple-500 animate-pulse' : 'bg-gray-600'}`} />
                  自动优化
                </button>
                <button
                  onClick={() => {
                    const newVal = !editingNode.data.twoStepOptimization;
                    updateNodeData(editingNode.id, { twoStepOptimization: newVal });
                    if (globalConfig?.updateTwoStepOptimization) {
                      globalConfig.updateTwoStepOptimization(newVal);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${editingNode.data.twoStepOptimization ? 'bg-pink-500/20 text-pink-300 border-pink-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${editingNode.data.twoStepOptimization ? 'bg-pink-500 animate-pulse' : 'bg-gray-600'}`} />
                  两阶段优化
                </button>
              </div>
            )}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">创作指令 (User Prompt)</label>
              <textarea value={editingNode.data.instruction} onChange={(e) => updateNodeData(editingNode.id, { instruction: e.target.value })} className="w-full h-56 bg-gray-800 border border-gray-700 rounded-2xl p-5 text-white text-sm outline-none resize-none font-mono leading-relaxed" placeholder="在此输入具体要求..." />
            </div>
            {editingNode.data.outputEntries?.length > 0 && (
              <div className="space-y-4 pt-6 border-t border-gray-800">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">产出 ({editingNode.data.outputEntries.length})</label>
                <div className="space-y-3">
                  {editingNode.data.outputEntries.map(entry => (
                    <div key={entry.id} className="p-4 bg-gray-800 border border-gray-700 rounded-2xl flex items-center justify-between active:bg-gray-700" onClick={() => setPreviewEntry(entry)}>
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-indigo-400" /></div>
                        <div className="min-w-0"><div className="text-sm font-bold text-gray-200 truncate">{entry.title}</div><div className="text-[10px] text-gray-500 truncate">{entry.content.substring(0, 40)}...</div></div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-600 -rotate-90" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-6 bg-gray-800 border-t border-gray-700 sticky bottom-0 z-10 flex gap-4">
            <button onClick={() => { setNodes(nds => nds.filter(n => n.id !== editingNodeId)); setEditingNodeId(null); }} className="p-4 bg-red-900/20 text-red-400 rounded-2xl"><Trash2 className="w-6 h-6" /></button>
            <button onClick={() => setEditingNodeId(null)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">保存并返回</button>
          </div>
        </div>
      )}

      {/* 预览预览 */}
      {previewEntry && (
        <div className="fixed inset-0 bg-gray-900 z-[200] flex flex-col animate-in fade-in duration-200">
          <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3 overflow-hidden"><FileText className="w-5 h-5 text-indigo-400 shrink-0" /><h3 className="font-bold text-gray-100 truncate pr-4">{previewEntry.title}</h3></div>
            <button onClick={() => setPreviewEntry(null)} className="p-2 bg-gray-700 rounded-full"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm">{previewEntry.content}</div>
          <div className="p-6 bg-gray-800 border-t border-gray-700 flex gap-4">
            <button onClick={() => { navigator.clipboard.writeText(previewEntry.content); }} className="flex-1 py-4 bg-gray-700 text-gray-200 rounded-2xl font-bold flex items-center justify-center gap-2"><Copy className="w-5 h-5" /> 复制内容</button>
            <button onClick={() => setPreviewEntry(null)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">关闭预览</button>
          </div>
        </div>
      )}
    </div>
  );
};
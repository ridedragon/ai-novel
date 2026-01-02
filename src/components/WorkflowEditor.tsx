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
  FolderPlus,
  Globe,
  LayoutList,
  Library,
  Lightbulb,
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
import { useCallback, useEffect, useState } from 'react';
import { GeneratorPreset, Novel } from '../types';

// --- 类型定义 ---

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
  outputContent?: string;
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

  return (
    <div className={`px-4 py-3 shadow-xl rounded-lg border-2 bg-gray-800 transition-all ${selected ? 'border-[var(--theme-color)] ring-2 ring-[var(--theme-color)]/20 shadow-[var(--theme-color)]/10' : 'border-gray-700'}`} style={{ minWidth: '220px' }}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">{data.typeLabel}</div>
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
        {data.presetName && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="truncate">预设: {data.presetName}</span>
          </div>
        )}
        {refCount > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <Library className="w-3 h-3" />
            <span>引用了 {refCount} 个资料集</span>
          </div>
        )}
      </div>

      {data.outputContent && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Workflow className="w-2.5 h-2.5" /> 生成结果预览
          </div>
          <div className="bg-gray-900/80 rounded p-2 text-[11px] text-emerald-100 leading-relaxed line-clamp-4 font-mono whitespace-pre-wrap italic border border-emerald-900/20">
            {data.outputContent}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-gray-600 border-2 border-gray-800" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// --- 配置定义 ---

type NodeTypeKey = 'userInput' | 'inspiration' | 'worldview' | 'characters' | 'plotOutline' | 'outline';

const NODE_CONFIGS: Record<NodeTypeKey, any> = {
  userInput: {
    typeLabel: '用户输入',
    icon: User,
    color: '#3b82f6',
    defaultLabel: '全局输入',
    presetType: null,
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
};

export interface WorkflowEditorProps {
  isOpen: boolean;
  onClose: () => void;
  activeNovel: Novel | undefined;
}

export const WorkflowEditor = ({ isOpen, onClose, activeNovel }: WorkflowEditorProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  const [allPresets, setAllPresets] = useState<Record<string, GeneratorPreset[]>>({
    outline: [],
    character: [],
    worldview: [],
    inspiration: [],
    plotOutline: [],
  });

  // 加载预设
  useEffect(() => {
    if (!isOpen) return;
    const types = ['outline', 'character', 'worldview', 'inspiration', 'plotOutline'];
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
        const restoredNodes = savedNodes.map((n: WorkflowNode) => ({
          ...n,
          data: {
            ...n.data,
            icon: NODE_CONFIGS[n.data.typeKey as NodeTypeKey]?.icon,
            selectedWorldviewSets: n.data.selectedWorldviewSets || [],
            selectedCharacterSets: n.data.selectedCharacterSets || [],
            selectedOutlineSets: n.data.selectedOutlineSets || [],
            selectedInspirationSets: n.data.selectedInspirationSets || [],
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
        folderName: nodes[0]?.data?.folderName || '',
        selectedWorldviewSets: [],
        selectedCharacterSets: [],
        selectedOutlineSets: [],
        selectedInspirationSets: [],
        outputContent: '',
      },
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };
    setNodes((nds) => [...nds, newNode]);
    setShowAddMenu(false);
  }, [setNodes, nodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setEditingNodeId(node.id);
  }, []);

  const updateNodeData = useCallback((nodeId: string, updates: Partial<WorkflowNodeData>) => {
    setNodes((nds) => {
      if (updates.folderName !== undefined) {
        const newFolderName = updates.folderName;
        return nds.map(node => ({
          ...node,
          data: {
            ...node.data,
            ...(node.id === nodeId ? updates : {}),
            folderName: newFolderName
          }
        }));
      }

      return nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
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

  const handleSaveWorkflow = () => {
    const workflow = { nodes, edges };
    localStorage.setItem('novel_workflow', JSON.stringify(workflow));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 w-full h-full md:w-[98%] md:h-[95vh] md:rounded-xl shadow-2xl border-none md:border border-gray-700 flex flex-col overflow-hidden">
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
            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-green-900/20 active:scale-95">
              <Play className="w-4 h-4 fill-current" />
              运行工作流
            </button>
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

          {/* --- 节点属性弹窗 --- */}
          {editingNode && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
              <div 
                className="absolute inset-0" 
                onClick={() => setEditingNodeId(null)}
              />
              
              <div className="relative w-full max-w-[600px] bg-[#1e2230] rounded-xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
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
                    <div className="space-y-2.5">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                        <FolderPlus className="w-3 h-3" /> 项目目录命名同步
                      </label>
                      <input 
                        type="text" 
                        value={editingNode.data.folderName}
                        onChange={(e) => updateNodeData(editingNode.id, { folderName: e.target.value })}
                        className="w-full bg-[#161922] border border-indigo-900/30 rounded-lg px-4 py-2.5 text-sm text-indigo-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                        placeholder="所有步骤共享此目录名..."
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
                          <option value="">-- 请选择生成预设 --</option>
                          {(allPresets[editingNode.data.presetType as string] || []).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
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
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedWorldviewSets.includes(set.id) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                              >
                                {editingNode.data.selectedWorldviewSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                {set.name}
                              </button>
                            ))}
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
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedCharacterSets.includes(set.id) ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                              >
                                {editingNode.data.selectedCharacterSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                {set.name}
                              </button>
                            ))}
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
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedOutlineSets.includes(set.id) ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                              >
                                {editingNode.data.selectedOutlineSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                {set.name}
                              </button>
                            ))}
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
                                className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-all flex items-center gap-2.5 ${editingNode.data.selectedInspirationSets.includes(set.id) ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 border border-transparent'}`}
                              >
                                {editingNode.data.selectedInspirationSets.includes(set.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                {set.name}
                              </button>
                            ))}
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

                  <div className="space-y-3 pt-6 border-t border-gray-700/30">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">生成内容预览 (OUTPUT)</label>
                      <span className="text-[9px] text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">可手动编辑结果</span>
                    </div>
                    <textarea 
                      value={editingNode.data.outputContent || ''}
                      onChange={(e) => updateNodeData(editingNode.id, { outputContent: e.target.value })}
                      placeholder="执行后将在此处显示生成结果..."
                      className="w-full h-64 bg-[#161922] border border-gray-700/80 rounded-lg p-4 text-sm text-emerald-50 font-mono leading-relaxed focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none resize-none transition-all shadow-inner"
                    />
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
        </div>

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
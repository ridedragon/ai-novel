import {
  ArrowLeft,
  BookOpen,
  Box,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  FileText,
  GripVertical,
  HelpCircle,
  History,
  Info,
  LayoutGrid,
  List,
  MapPin,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Settings,
  Settings2,
  Shield,
  ToggleRight,
  Trash2,
  Upload,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import OpenAI from 'openai';
import React, { useEffect, useMemo, useState } from 'react';
import { GeneratorPreset, PresetApiConfig, SettingNode } from '../types';
// @ts-ignore
import terminal from 'virtual:terminal';

// --- Tree UI Components ---
// Defined before the main component to avoid "cannot find name" errors (hoisting support)
const TreeItemComponent: React.FC<{
  node: SettingNode;
  depth: number;
  expandedNodes: Set<string>;
  toggleNode: (id: string) => void;
  activeNodeId: string | null;
  setActiveNodeId: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
}> = ({ node, depth, expandedNodes, toggleNode, activeNodeId, setActiveNodeId, onDeleteNode }) => {
  const isExpanded = expandedNodes.has(node.id);
  const isActive = activeNodeId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  const getTypeStyle = (type: string) => {
    switch (type) {
      case '主题': return 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50 rounded-none';
      case '魔法体系': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 rounded-none';
      case '地点': return 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 rounded-none';
      case '物品': return 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/50 rounded-none';
      case '事件': return 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 rounded-none';
      case '角色': return 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50 rounded-none';
      case '文化': return 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 rounded-none';
      default: return 'bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 rounded-none';
    }
  };

  const getIcon = (type: string) => {
    if (!hasChildren) return <FileText className="w-3.5 h-3.5" />;
    switch (type) {
      case '主题': return <Wand2 className="w-3.5 h-3.5" />;
      case '地点': return <MapPin className="w-3.5 h-3.5" />;
      case '物品': return <Box className="w-3.5 h-3.5" />;
      case '事件': return <RefreshCw className="w-3.5 h-3.5" />;
      case '魔法体系': return <Zap className="w-3.5 h-3.5" />;
      case '科技设定': return <Shield className="w-3.5 h-3.5" />;
      default: return <BookOpen className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-1">
      <div
        onClick={() => setActiveNodeId(node.id)}
        className={`group flex items-center gap-3 p-2.5 rounded-none border transition-all cursor-pointer relative ${
          isActive
            ? 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-500 shadow-sm'
            : 'bg-white dark:bg-slate-900/20 border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30'
        }`}
        style={{ marginLeft: `${depth * 24}px` }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
            className={`p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors ${hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          
          <div className={`p-1.5 rounded ${isActive ? 'text-indigo-500' : 'text-slate-400'}`}>
             {getIcon(node.type)}
          </div>
          
          <div className="flex-1 min-w-0">
             <div className="flex items-center gap-3">
                <span className={`text-[13px] font-medium truncate ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}>
                   {node.title}
                </span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
           <span className={`px-1.5 py-0.5 rounded-none text-[10px] font-bold border whitespace-nowrap leading-none ${getTypeStyle(node.type)}`}>
              {node.type}
           </span>
           <div className="flex items-center gap-1">
              <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Plus className="w-3.5 h-3.5" /></button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-none text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
           </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {node.children!.map(child => (
            <TreeItemComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              activeNodeId={activeNodeId}
              setActiveNodeId={setActiveNodeId}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface HistoryItem {
  id: string;
  title: string;
  time: string;
  treeData?: SettingNode[];
}

interface StorySettingsGeneratorProps {
  onBack: () => void;
  apiKey: string;
  baseUrl: string;
  model: string;
  modelList: string[];
}

const StorySettingsGenerator: React.FC<StorySettingsGeneratorProps> = ({
  onBack,
  apiKey: globalApiKey,
  baseUrl: globalBaseUrl,
  model: globalModel,
  modelList: globalModelList
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState('default');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [kbMode, setKbMode] = useState<'none' | 'reuse' | 'imitation' | 'hybrid'>('none');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [userPrompt, setUserPrompt] = useState('发生在现代的故事。主角变成了一个东方龙花灯');

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Local Presets State
  const [presets, setPresets] = useState<GeneratorPreset[]>(() => {
    const saved = localStorage.getItem('story_generator_presets');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'default',
        name: '世界观构建',
        temperature: 1.32,
        topP: 1.00,
        topK: 218,
        prompts: [
          { id: '1', role: 'system', name: '任务重置', content: '任务已经重置。', enabled: true },
          { id: '2', role: 'system', name: '身份定义', content: '你是一个专业的小说世界观架构师。', enabled: true },
          { id: '3', role: 'assistant', name: '角色', content: '好的，我会为您构建世界观。', enabled: true }
        ],
        apiConfig: {
          model: 'gemini',
          modelList: ['gemini-pro', 'gemini-1.5-flash']
        }
      },
      {
        id: 'chat',
        name: '世界观聊天助手',
        prompts: []
      },
      {
        id: 'zhihu_strategy',
        name: '知乎短文创作',
        temperature: 1,
        topP: 1,
        topK: 200,
        prompts: [
          { id: '1', role: 'system', content: '你是一位资深的知乎万赞答主和内容策略师，擅长将复杂的概念转化为引人入胜的故事和高价值的干货。你的回答总能精准地抓住读者的好奇心，通过严谨的逻辑和生动的故事案例，最终引导读者产生深度共鸣和强烈认同。\n\n你的任务是：根据用户输入的核心主题，运用“知乎短文创作”策略，生成一套完整的文章设定树。这不仅仅是内容的罗列，而是一个精心设计的、能够引导读者思路、激发互动的结构化蓝图。\n\n核心要求：\n1.  **用户视角**：始终从读者的阅读体验出发，思考如何设置悬念、如何引发共鸣、如何提供价值。\n2.  **结构化思维**：严格遵循“引人开头 -> 核心观点 -> 逻辑结构 -> 案例故事 -> 干货内容 -> 情感共鸣 -> 互动设计 -> 收尾总结”的经典知乎体结构。\n3.  **价值密度**：确保每个节点都言之有物，特别是“核心观点”和“干货内容”部分，必须提供具体、可操作、有深度的信息。\n4.  **故事化包装**：“案例故事”是知乎回答的灵魂，必须构思出能够完美印证核心观点的具体、生动、有细节的故事。\n5.  **互动导向**：在“互动设计”节点中，要提出能够真正激发读者评论和讨论的开放性问题。', enabled: true },
          { id: '2', role: 'user', content: '## 核心主题\n{{input}}\n\n## 创作策略：知乎短文创作\n请根据这个核心主题，运用你的知乎高赞答主经验，为我生成一篇能够获得大量赞同和讨论的知乎回答的完整内容设定。\n\n请遵循以下步骤和要求：\n1.  **解构主题**：深入分析我提供的主题，提炼出最核心、最吸引人的观点。\n2.  **构建框架**：使用 `create_setting_nodes` 工具，一次性创建出符合“知乎短文创作”策略的全部根节点（如：引人开头, 核心观点, 逻辑结构等）。\n3.  **填充内容**：\n    - **引人开头**：设计一个能瞬间抓住眼球的开头。\n    - **核心观点**：明确、精炼地阐述你的核心论点。\n    - **逻辑结构**：规划清晰的论证路径。\n    - **案例故事**：构思1-2个强有力的故事来支撑观点。\n    - **干货内容**：提供具体的方法论或知识点。\n    - **情感共鸣**：找到能触动读者的情感切入点。\n    - **互动设计**：提出能引发热烈讨论的问题。\n    - **收尾总结**：给出一个有力、引人深思的结尾。\n4.  **生成节点**：分批次调用 `create_setting_nodes` 工具，为每个根节点创建详细的子节点。例如，为“案例故事”根节点创建多个具体的故事情节子节点。\n5.  **确保完整性**：完成所有节点的创建后。\n\n**质量要求**：\n- 所有节点的描述都必须具体、详实、充满洞察力。\n- 根节点的描述要概括该部分的核心任务。\n- 叶子节点的描述要包含可以直接写作的素材和细节。\n\n现在，请开始你的创作，首先从构建文章的整体框架开始。', enabled: true }
        ],
        generationConfig: {
          strategyName: '知乎短文创作',
          expectedRootNodes: 11,
          maxDepth: 4,
          nodeTemplates: [],
          rules: {
            minDescriptionLength: 50,
            maxDescriptionLength: 1000,
            requireInterConnections: false
          }
        }
      }
    ];
  });

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('story_generator_history');
    if (saved) return JSON.parse(saved);
    const mockTree: SettingNode[] = [
      {
        id: 'n1',
        title: '情感内核：遗忘与纪念',
        description: '故事的深层主题。不仅仅是变身文，更是关于在快速变化的时代中，如何安放那些古老、笨重但充满温情的事物。探讨“被遗忘”是否等于“死亡”。',
        type: '主题',
        status: '已生成',
        children: [
          {
            id: 'n1-1',
            title: '物哀：感知同类的死亡',
            description: '对即将消失事物的敏感。',
            type: '魔法体系',
            status: '已生成',
            children: [
              { id: 'n1-1-1', title: '隔壁废品站的深夜哀鸣', description: '地点描述', type: '地点', status: '已生成' }
            ]
          },
          {
            id: 'n1-2',
            title: '最后的灰烬',
            description: '某种力量的残留。',
            type: '物品',
            status: '已生成',
            children: [
              { id: 'n1-2-1', title: '孩子手中的半截龙角', description: '神秘物品', type: '物品', status: '已生成' }
            ]
          }
        ]
      },
      {
        id: 'n2',
        title: '高潮事件：元宵灯会',
        description: '元宵节当晚的冲突。',
        type: '事件',
        status: '已生成',
        children: [
          {
            id: 'n2-1',
            title: '现代防御系统的介入',
            description: '科技与幻想的碰撞。',
            type: '事件',
            status: '已生成',
            children: [
              { id: 'n2-1-1', title: '警用无人机的蜂群围堵', description: '科技设定', type: '科技设定', status: '已生成' },
              { id: 'n2-1-2', title: '高压水枪的致命威胁', description: '普通武器', type: '其他', status: '已生成' }
            ]
          }
        ]
      }
    ];
    return [
      { id: '1', title: '发生在现代的故事。主角变成了一个东方龙...', time: '1小时前', treeData: mockTree }
    ];
  });

  useEffect(() => {
    localStorage.setItem('story_generator_presets', JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem('story_generator_history', JSON.stringify(history));
  }, [history]);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  // Logic to build consolidated model list
  const getAvailableModels = () => {
    const models = new Set<string>();
    if (globalModel) models.add(globalModel);
    globalModelList.forEach(m => models.add(m));
    if (activePreset.apiConfig?.model) models.add(activePreset.apiConfig.model);
    activePreset.apiConfig?.modelList?.forEach(m => models.add(m));
    return Array.from(models);
  };

  const availableModels = getAvailableModels();
  const currentModel = activePreset.apiConfig?.model || globalModel;

  const [activeHistoryId, setActiveHistoryId] = useState('1');
  const activeHistoryItem = useMemo(() => history.find(h => h.id === activeHistoryId), [history, activeHistoryId]);
  const treeData = useMemo(() => activeHistoryItem?.treeData || [], [activeHistoryItem]);

  const toggleNode = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedNodes(newExpanded);
  };

  const findNode = (nodes: SettingNode[], id: string): SettingNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const activeNode = useMemo(() => activeNodeId ? findNode(treeData, activeNodeId) : null, [activeNodeId, treeData]);

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    terminal.log(`[StorySettingsGenerator] Attempting to delete history item: ${id}`);
    setConfirmState({
      isOpen: true,
      title: '删除历史记录',
      message: '确定要删除这条历史记录吗？',
      onConfirm: () => {
        terminal.log(`[StorySettingsGenerator] Confirmed deletion of item: ${id}`);
        setHistory(history.filter(h => h.id !== id));
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteNodeFromTree = (nodes: SettingNode[], id: string): SettingNode[] => {
    return nodes
      .filter(node => node.id !== id)
      .map(node => ({
        ...node,
        children: node.children ? deleteNodeFromTree(node.children, id) : undefined
      }));
  };

  const handleDeleteNode = (nodeId: string) => {
    setConfirmState({
      isOpen: true,
      title: '删除设定节点',
      message: '确定要删除这个设定节点及其所有子节点吗？',
      onConfirm: () => {
        setHistory(prevHistory => prevHistory.map(item => {
          if (item.id === activeHistoryId && item.treeData) {
            return {
              ...item,
              treeData: deleteNodeFromTree(item.treeData, nodeId)
            };
          }
          return item;
        }));
        if (activeNodeId === nodeId) setActiveNodeId(null);
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        terminal.log(`[StorySettingsGenerator] Deleted node: ${nodeId}`);
      }
    });
  };

  const updatePresetApi = (updates: Partial<PresetApiConfig>) => {
    const newPresets = presets.map(p => {
      if (p.id === activePresetId) {
        return { ...p, apiConfig: { ...(p.apiConfig || {}), ...updates } };
      }
      return p;
    });
    setPresets(newPresets);
  };

  const handleExportPreset = (preset: GeneratorPreset) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(preset, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${preset.name}_preset.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    terminal.log(`[StorySettingsGenerator] Exported preset: ${preset.name}`);
  };

  const handleDeletePreset = (id: string) => {
    if (presets.length <= 1) {
      setError("至少需要保留一个预设");
      return;
    }
    setConfirmState({
      isOpen: true,
      title: '删除预设',
      message: '确定要删除这个生成策略预设吗？',
      onConfirm: () => {
        setPresets(presets.filter(p => p.id !== id));
        if (activePresetId === id) setActivePresetId(presets.find(p => p.id !== id)?.id || '');
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleAddPrompt = () => {
    const newPrompt = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: '',
      enabled: true
    };
    setPresets(presets.map(p =>
      p.id === activePresetId ? { ...p, prompts: [...p.prompts, newPrompt] } : p
    ));
  };

  const handleDeletePrompt = (promptId: string) => {
    setPresets(presets.map(p =>
      p.id === activePresetId ? { ...p, prompts: p.prompts.filter(pr => pr.id !== promptId) } : p
    ));
  };

  const handleUpdatePrompt = (promptId: string, updates: any) => {
    setPresets(presets.map(p =>
      p.id === activePresetId ? {
        ...p,
        prompts: p.prompts.map(pr => pr.id === promptId ? { ...pr, ...updates } : pr)
      } : p
    ));
  };

  const resolvePlaceholders = (template: string) => {
    let result = template;
    const config = activePreset.generationConfig || {
      strategyName: activePreset.name,
      expectedRootNodes: 8,
      maxDepth: 3,
      nodeTemplates: [
        { name: '人物设定', description: '需包含姓名、性格标签、核心动机。' },
        { name: '地理设定', description: '需包含地理位置、气候特征、特殊地标。' }
      ],
      rules: {
        minDescriptionLength: 100,
        maxDescriptionLength: 200,
        requireInterConnections: true
      }
    };

    const nodeTemplatesInfo = config.nodeTemplates
      .map(t => `**${t.name}**: ${t.description}`)
      .join('\n');

    const generationRulesInfo = [
      `- 描述字数限制: ${config.rules.minDescriptionLength}-${config.rules.maxDescriptionLength}字。`,
      config.rules.requireInterConnections ? '- 关联性要求: 必须在描述中提及至少一个相关节点。' : ''
    ].filter(Boolean).join('\n');

    const mappings: Record<string, string> = {
      '{{input}}': userPrompt,
      '{{strategyName}}': config.strategyName,
      '{{nodeTemplatesInfo}}': nodeTemplatesInfo,
      '{{generationRulesInfo}}': generationRulesInfo,
      '{{kbMode}}': kbMode,
      '{{novelTitle}}': '未命名小说', // 占位，实际应从上下文获取
      '{{authorName}}': '马良助手',
      '{{context}}': '当前暂无更多上下文'
    };

    Object.entries(mappings).forEach(([key, value]) => {
      // 使用 split/join 替代 replaceAll 以兼容较低版本的编译环境
      result = result.split(key).join(value);
    });

    return result;
  };

  const handleRegenerate = async () => {
    terminal.log("[StorySettingsGenerator] handleRegenerate clicked (Enhanced with Tool Calling)");
    
    const apiConfig = activePreset.apiConfig || {};
    const finalApiKey = apiConfig.apiKey || globalApiKey;
    const finalBaseUrl = apiConfig.baseUrl || globalBaseUrl;
    const finalModel = apiConfig.model || globalModel;

    if (!finalApiKey) {
      setError('请先在全局设置或预设中配置 API Key');
      return;
    }

    setIsGenerating(true);
    setError('');
    
    try {
      const openai = new OpenAI({
        apiKey: finalApiKey,
        baseURL: finalBaseUrl,
        dangerouslyAllowBrowser: true
      });

      const messages: any[] = activePreset.prompts
        .filter(p => p.enabled)
        .map(p => ({
          role: p.role,
          content: resolvePlaceholders(p.content)
        }));

      if (!messages.some(m => m.role === 'user')) {
        messages.push({ role: 'user', content: userPrompt });
      }

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "create_setting_nodes",
            description: "构建设定树节点",
            parameters: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tempId: { type: "string", description: "AI生成的临时ID (如 R1, C1)" },
                      parentId: { type: "string", description: "父节点ID，指向之前的 tempId 或 null" },
                      name: { type: "string" },
                      type: { type: "string", enum: ["主题", "魔法体系", "地点", "物品", "事件", "科技设定", "文化", "人物设定", "地理设定"] },
                      description: { type: "string" }
                    },
                    required: ["tempId", "parentId", "name", "type", "description"]
                  }
                }
              },
              required: ["nodes"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "mark_generation_complete",
            description: "告知系统生成已完成",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string" }
              }
            }
          }
        }
      ];

      const systemPromptAddon = `你是一个结构化设定助手。你必须使用 create_setting_nodes 工具来构建设定树。
1. 首先创建根节点（parentId=null），并为其分配 tempId（如 R1）。
2. 接着创建子节点，其 parentId 必须指向父节点的 tempId。
3. 每个节点描述必须符合用户要求的节点模板和生成规则。`;

      messages.unshift({ role: 'system', content: systemPromptAddon });

      const completion = await openai.chat.completions.create({
        model: finalModel,
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        temperature: activePreset.temperature ?? 0.7,
      });

      const responseMessage = completion.choices[0]?.message;
      terminal.log("[StorySettingsGenerator] AI Response Message:", responseMessage);

      if (responseMessage?.tool_calls) {
        let generatedNodes: any[] = [];
        
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === "create_setting_nodes") {
            const args = JSON.parse(toolCall.function.arguments);
            generatedNodes = [...generatedNodes, ...args.nodes];
          }
        }

        // TempID 到 UUID 的映射逻辑
        const idMap = new Map<string, string>();
        
        const buildTree = (rawNodes: any[]) => {
          const nodes: SettingNode[] = [];
          
          // 第一步：生成所有真实 ID 并存入映射
          rawNodes.forEach(rn => {
            const uuid = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            idMap.set(rn.tempId, uuid);
          });

          // 第二步：构建树结构
          const nodePool = rawNodes.map(rn => ({
            id: idMap.get(rn.tempId)!,
            parentId: rn.parentId ? idMap.get(rn.parentId) : null,
            title: rn.name,
            description: rn.description,
            type: rn.type,
            status: '已生成' as const,
            children: [] as SettingNode[]
          }));

          const rootNodes: SettingNode[] = [];
          const lookup: Record<string, SettingNode> = {};

          nodePool.forEach(n => {
            lookup[n.id] = n;
          });

          nodePool.forEach(n => {
            if (n.parentId && lookup[n.parentId]) {
              lookup[n.parentId].children!.push(n);
            } else {
              rootNodes.push(n);
            }
          });

          return rootNodes;
        };

        const finalTreeData = buildTree(generatedNodes);

        if (finalTreeData.length > 0) {
          const newHistoryItem: HistoryItem = {
            id: Date.now().toString(),
            title: userPrompt.slice(0, 30) + (userPrompt.length > 30 ? '...' : ''),
            time: new Date().toLocaleTimeString(),
            treeData: finalTreeData
          };

          setHistory(prev => [newHistoryItem, ...prev]);
          setActiveHistoryId(newHistoryItem.id);
        } else {
          throw new Error("AI 未能通过工具调用生成任何有效节点。");
        }
      } else {
        throw new Error("AI 未能触发工具调用，请检查提示词或模型能力。");
      }
    } catch (err: any) {
      terminal.error("[StorySettingsGenerator] API Error:", err);
      setError(err.message || "请求 AI 出错");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    terminal.log("[StorySettingsGenerator] handleSave clicked");
    // Simulate save
    alert('设定已保存至快照');
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[60] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <Settings2 className="w-5 h-5 text-purple-500 shrink-0" />
            <span className="font-bold text-base md:text-lg truncate">小说设定生成器</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-3">
          <button
            onClick={handleSave}
            className="hidden sm:flex px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存设定
          </button>
          <button onClick={() => setShowPresetModal(true)} className="px-3 md:px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap">
            <Settings className="w-4 h-4" />
            <span className="hidden xs:inline">生成策略预设</span>
            <span className="xs:hidden">预设</span>
          </button>
          <button className="px-3 md:px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-md text-sm flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <Play className="w-4 h-4" />
            <span className="hidden xs:inline">开始写作</span>
            <span className="xs:hidden">开始</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Toggle Button */}
        <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden absolute left-4 bottom-4 z-40 p-3 bg-purple-500 text-white rounded-full shadow-lg">
          <History className="w-6 h-6" />
        </button>

        {/* Left Sidebar - History */}
        <div className={`absolute md:static inset-y-0 left-0 z-50 w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900 transition-transform duration-300 md:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-sm tracking-widest uppercase text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4" /> 历史记录
            </h3>
            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-400"><LayoutGrid className="w-4 h-4" /></button>
              <button
                onClick={() => {
                  const newId = Date.now().toString();
                  const newItem: HistoryItem = {
                    id: newId,
                    title: '新设计集',
                    time: new Date().toLocaleTimeString(),
                    treeData: []
                  };
                  setHistory(prev => [newItem, ...prev]);
                  setActiveHistoryId(newId);
                  terminal.log("[StorySettingsGenerator] Added new history item");
                }}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-400"
                title="新建设计集"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
              <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden p-1.5"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveHistoryId(item.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden ${
                  activeHistoryId === item.id
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500/50 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-purple-500/30'
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 ${activeHistoryId === item.id ? 'opacity-100' : 'opacity-0'}`}></div>
                <div className="flex justify-between items-start gap-2 relative">
                  <p className="text-sm font-medium leading-relaxed line-clamp-2">{item.title}</p>
                  <button onClick={(e) => handleDeleteHistory(item.id, e)} className="p-1 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 uppercase font-mono tracking-tighter">
                   <span>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle Panel - Control Panel */}
        <div className="w-full md:w-[320px] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 bg-white dark:bg-slate-900/50">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
            <h3 className="font-bold flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-purple-500" /> 创作控制台
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">原始创意</label>
              <textarea
                className="w-full h-44 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none transition-all leading-relaxed"
                placeholder="描述你的创作想法..."
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">生成策略</label>
                <div className="relative group">
                  <select value={activePresetId} onChange={(e) => setActivePresetId(e.target.value)} className="w-full p-3 pl-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm appearance-none outline-none focus:border-purple-500 transition-colors cursor-pointer">
                    {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-slate-300 pointer-events-none transition-colors" />
                </div>
                <p className="mt-2 text-[11px] text-slate-400 px-1">系统默认的设定树生成提示词模板</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    知识库模式 <HelpCircle className="w-3 h-3 text-slate-500" />
                  </label>
                </div>
                <div className="relative group">
                  <select
                    value={kbMode}
                    onChange={(e) => setKbMode(e.target.value as any)}
                    className="w-full p-3 pl-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm appearance-none outline-none focus:border-purple-500 transition-colors cursor-pointer"
                  >
                    <option value="none">无</option>
                    <option value="reuse">Reuse (物理拷贝节点)</option>
                    <option value="imitation">Imitation (参考风格)</option>
                    <option value="hybrid">Hybrid (混合模式)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-slate-300 pointer-events-none transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AI模型</label>
                <div className="relative group">
                  <div className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm flex items-center justify-between cursor-pointer focus-within:border-purple-500 transition-all relative overflow-hidden">
                    <div className="flex items-center gap-3 flex-1 overflow-hidden ml-1">
                      <Zap className="w-4 h-4 text-purple-500 shrink-0" />
                      <select
                        value={currentModel}
                        onChange={(e) => updatePresetApi({ model: e.target.value })}
                        className="bg-transparent outline-none flex-1 appearance-none cursor-pointer truncate font-medium"
                      >
                        {availableModels.map(m => (
                          <option key={m} value={m} className="bg-white dark:bg-slate-800">{m}</option>
                        ))}
                      </select>
                      {activePreset.apiConfig?.apiKey && (
                        <span className="text-[9px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">私有</span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-300 pointer-events-none transition-colors mr-1" />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-200 dark:border-red-800 animate-in fade-in">
                {error}
              </div>
            )}

            <button
              onClick={handleRegenerate}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/10 ${
                isGenerating
                ? 'bg-slate-400 cursor-not-allowed text-slate-200'
                : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 active:scale-[0.98]'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? '正在生成...' : '重新生成'}
            </button>
          </div>
        </div>

        {/* Main Area - Tree View */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950/20 overflow-hidden">
          <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-slate-900/50 shrink-0">
             <div className="flex items-center gap-6">
                <h3 className="font-bold text-base flex items-center gap-2">
                   设定总览
                </h3>
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                   <button className="px-3 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-700 shadow-sm">设定</button>
                   <button className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">结果预览</button>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"><List className="w-4 h-4" /></button>
                <button className="p-2 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 transition-colors"><LayoutGrid className="w-4 h-4" /></button>
             </div>
          </div>
          
          <div className="flex-1 flex overflow-hidden">
             {/* Left: Scrollable Tree Area */}
             <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-4">
                   {treeData.map(node => (
                      <TreeItemComponent
                        key={node.id}
                        node={node}
                        depth={0}
                        expandedNodes={expandedNodes}
                        toggleNode={toggleNode}
                        activeNodeId={activeNodeId}
                        setActiveNodeId={setActiveNodeId}
                        onDeleteNode={handleDeleteNode}
                      />
                   ))}
                </div>
             </div>

             {/* Right: Node Detail Panel */}
             <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/30">
                   <Edit2 className="w-4 h-4 text-purple-500" />
                   <span className="font-bold text-sm">节点编辑</span>
                </div>
                
                {activeNode ? (
                   <div className="flex-1 overflow-y-auto p-4 space-y-6">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80">
                         <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-100 flex items-center justify-center shrink-0">
                            <Box className="w-5 h-5 text-white dark:text-slate-900" />
                         </div>
                         <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold truncate">{activeNode.title}</h4>
                            <span className="text-[10px] uppercase tracking-widest text-orange-500 font-bold">{activeNode.status}</span>
                         </div>
                      </div>

                      <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">节点描述</label>
                         <textarea
                           className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm leading-relaxed outline-none focus:border-purple-500 transition-all resize-none"
                           value={activeNode.description}
                           readOnly
                         />
                      </div>

                      <button className="w-full py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all">
                         <Save className="w-4 h-4" /> 保存节点设定
                      </button>

                      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                         <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">修改提示</label>
                         <textarea
                           className="w-full h-24 p-3 bg-transparent border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-purple-500 transition-all resize-none"
                           placeholder="描述您希望对此节点做出的修改..."
                         />
                      </div>
                   </div>
                ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                         <Info className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-medium">请点击左侧节点<br/>进行微调编辑</p>
                   </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* Generator Settings Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1e222b] w-full h-full md:w-[900px] md:h-[700px] md:rounded-lg shadow-2xl border-none md:border border-slate-700 flex flex-col overflow-hidden text-slate-200">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-[#1a1d24]">
              <h3 className="text-xl font-bold">生成策略预设界面</h3>
              <button onClick={() => setShowPresetModal(false)} className="text-slate-400 hover:text-white p-1"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="w-full md:w-56 border-b md:border-r border-slate-700 bg-[#1a1d24] flex flex-col shrink-0 h-48 md:h-auto overflow-y-auto">
                <div className="p-3 space-y-2">
                  <button className="w-full py-2 flex items-center justify-center gap-2 bg-[#2d333d] rounded text-sm"><Upload className="w-4 h-4" /> 导入预设</button>
                  <button
                    onClick={() => {
                      const newId = Date.now().toString();
                      const newPreset: GeneratorPreset = {
                        id: newId,
                        name: '新生成预设',
                        prompts: [{ id: '1', role: 'user', content: '{{input}}', enabled: true }]
                      };
                      setPresets([...presets, newPreset]);
                      setActivePresetId(newId);
                    }}
                    className="w-full py-2 flex items-center justify-center gap-2 bg-[#3b82f6] text-white rounded text-sm"
                  >
                    <Plus className="w-4 h-4" /> 新建预设
                  </button>
                </div>
                <div className="flex-1 p-2 space-y-1">
                  {presets.map(p => (
                    <div key={p.id} className="group relative">
                      <div
                        onClick={() => setActivePresetId(p.id)}
                        className={`p-3 pr-16 rounded text-sm cursor-pointer truncate ${activePresetId === p.id ? 'bg-[#2d333d] text-white' : 'text-slate-400 hover:bg-[#252a33]'}`}
                      >
                        {p.name}
                      </div>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleExportPreset(p)} className="p-1 text-slate-500 hover:text-blue-400"><Download className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeletePreset(p.id)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-[#1e222b] overflow-y-auto p-6 space-y-8 custom-scrollbar">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-400 uppercase tracking-wider">预设名称</label>
                  <input type="text" value={activePreset.name} onChange={(e) => setPresets(presets.map(p => p.id === activePresetId ? { ...p, name: e.target.value } : p))} className="w-full bg-[#1a1d24] border border-slate-700 rounded px-4 py-2.5 outline-none focus:border-blue-500" />
                </div>

                <div className="bg-[#1a1d24] rounded-lg border border-slate-700 overflow-hidden">
                  <button onClick={() => setShowApiConfig(!showApiConfig)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-300 hover:bg-slate-800/50">
                    <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-blue-500" /><span>独立 API 配置 (可选)</span></div>
                    {showApiConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {showApiConfig && (
                    <div className="p-4 border-t border-slate-700 space-y-4 bg-gray-800/50 animate-in slide-in-from-top-2">
                      <div className="space-y-1.5"><label className="text-xs text-gray-400">API Key</label><input type="password" value={activePreset.apiConfig?.apiKey || ''} onChange={(e) => updatePresetApi({ apiKey: e.target.value })} placeholder={globalApiKey ? '使用全局设置' : '未设置'} className="w-full bg-[#1a1d24] border border-slate-700 rounded px-3 py-2 text-xs" /></div>
                      <div className="space-y-1.5"><label className="text-xs text-gray-400">Base URL</label><input type="text" value={activePreset.apiConfig?.baseUrl || ''} onChange={(e) => updatePresetApi({ baseUrl: e.target.value })} placeholder={globalBaseUrl || 'https://api.openai.com/v1'} className="w-full bg-[#1a1d24] border border-slate-700 rounded px-3 py-2 text-xs" /></div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-400">Model</label>
                        <input type="text" value={activePreset.apiConfig?.model || ''} onChange={(e) => updatePresetApi({ model: e.target.value })} placeholder={globalModel || '未设置'} className="w-full bg-[#1a1d24] border border-slate-700 rounded px-3 py-2 text-xs mb-2" />
                        <label className="text-[10px] text-gray-500 block mb-1">专用模型列表 (逗号分隔)</label>
                        <input type="text" value={activePreset.apiConfig?.modelList?.join(',') || ''} onChange={(e) => updatePresetApi({ modelList: e.target.value.split(',').map(s => s.trim()).filter(s => s) })} placeholder="模型1,模型2..." className="w-full bg-[#1a1d24] border border-slate-700 rounded px-3 py-2 text-xs" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {[
                    { label: '温度 (Temperature)', key: 'temperature' as const, value: activePreset.temperature || 1.0, min: 0, max: 2, step: 0.01 },
                    { label: 'Top P', key: 'topP' as const, value: activePreset.topP || 1.0, min: 0, max: 1, step: 0.01 },
                    { label: 'Top K', key: 'topK' as const, value: activePreset.topK || 200, min: 0, max: 500, step: 1 },
                  ].map((param) => (
                    <div key={param.label} className="space-y-2">
                      <div className="flex justify-between items-center text-sm"><span className="text-slate-400">{param.label}</span><span className="bg-[#1a1d24] px-3 py-1 rounded border border-slate-700 font-mono text-blue-400 text-xs">{param.value.toFixed(2)}</span></div>
                      <input type="range" min={param.min} max={param.max} step={param.step} value={param.value} onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPresets(presets.map(p => p.id === activePresetId ? { ...p, [param.key]: param.key === 'topK' ? Math.round(val) : val } : p));
                      }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>
                  ))}
                </div>

                {/* 策略驱动生成配置 (复现技术报告需求) */}
                <div className="bg-[#1a1d24] rounded-lg border border-slate-700 overflow-hidden">
                  <div className="p-4 border-b border-slate-700 bg-slate-800/30 flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-bold text-slate-300">策略驱动生成配置 (复现规范)</span>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 uppercase font-bold">预期根节点数量</label>
                        <input
                          type="number"
                          value={activePreset.generationConfig?.expectedRootNodes || 8}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setPresets(presets.map(p => p.id === activePresetId ? {
                              ...p,
                              generationConfig: { ...(p.generationConfig || { strategyName: p.name, maxDepth: 3, nodeTemplates: [], rules: { minDescriptionLength: 100, maxDescriptionLength: 200, requireInterConnections: true } }), expectedRootNodes: val }
                            } : p));
                          }}
                          className="w-full bg-[#1e222b] border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 uppercase font-bold">最大递归深度</label>
                        <input
                          type="number"
                          value={activePreset.generationConfig?.maxDepth || 3}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setPresets(presets.map(p => p.id === activePresetId ? {
                              ...p,
                              generationConfig: { ...(p.generationConfig || { strategyName: p.name, expectedRootNodes: 8, nodeTemplates: [], rules: { minDescriptionLength: 100, maxDescriptionLength: 200, requireInterConnections: true } }), maxDepth: val }
                            } : p));
                          }}
                          className="w-full bg-[#1e222b] border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs text-slate-400 uppercase font-bold flex items-center justify-between">
                        描述约束规则
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">最小字数</span>
                          <input
                            type="number"
                            value={activePreset.generationConfig?.rules?.minDescriptionLength || 100}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const currentConfig = activePreset.generationConfig || { strategyName: activePreset.name, expectedRootNodes: 8, maxDepth: 3, nodeTemplates: [], rules: { minDescriptionLength: 100, maxDescriptionLength: 200, requireInterConnections: true } };
                              setPresets(presets.map(p => p.id === activePresetId ? {
                                ...p,
                                generationConfig: {
                                  ...currentConfig,
                                  rules: { ...currentConfig.rules, minDescriptionLength: val }
                                }
                              } : p));
                            }}
                            className="w-full bg-[#1e222b] border border-slate-700 rounded px-3 py-1.5 text-xs outline-none focus:border-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">最大字数</span>
                          <input
                            type="number"
                            value={activePreset.generationConfig?.rules?.maxDescriptionLength || 200}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const currentConfig = activePreset.generationConfig || { strategyName: activePreset.name, expectedRootNodes: 8, maxDepth: 3, nodeTemplates: [], rules: { minDescriptionLength: 100, maxDescriptionLength: 200, requireInterConnections: true } };
                              setPresets(presets.map(p => p.id === activePresetId ? {
                                ...p,
                                generationConfig: {
                                  ...currentConfig,
                                  rules: { ...currentConfig.rules, maxDescriptionLength: val }
                                }
                              } : p));
                            }}
                            className="w-full bg-[#1e222b] border border-slate-700 rounded px-3 py-1.5 text-xs outline-none focus:border-purple-500"
                          />
                        </div>
                        <div className="flex items-end pb-1.5">
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={activePreset.generationConfig?.rules?.requireInterConnections ?? true}
                                onChange={(e) => {
                                  const val = e.target.checked;
                                  const currentConfig = activePreset.generationConfig || { strategyName: activePreset.name, expectedRootNodes: 8, maxDepth: 3, nodeTemplates: [], rules: { minDescriptionLength: 100, maxDescriptionLength: 200, requireInterConnections: true } };
                                  setPresets(presets.map(p => p.id === activePresetId ? {
                                    ...p,
                                    generationConfig: {
                                      ...currentConfig,
                                      rules: { ...currentConfig.rules, requireInterConnections: val }
                                    }
                                  } : p));
                                }}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900"
                              />
                              <span className="text-xs text-slate-300">强制节点互联</span>
                           </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pb-8">
                  <div className="flex items-center justify-between"><label className="text-sm font-medium text-slate-400 uppercase tracking-wider">提示词列表 (Prompt Chain)</label><button onClick={handleAddPrompt} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-4 h-4" /> 添加消息</button></div>
                  <div className="border border-slate-700 rounded-lg overflow-hidden bg-[#1a1d24]">
                    <div className="overflow-x-auto"><table className="w-full text-left text-sm border-collapse min-w-[600px]"><thead><tr className="border-b border-slate-700 bg-slate-800/50"><th className="px-4 py-3 font-semibold text-slate-400 w-16 text-center">排序</th><th className="px-4 py-3 font-semibold text-slate-400 w-32">角色</th><th className="px-4 py-3 font-semibold text-slate-400">内容</th><th className="px-4 py-3 font-semibold text-slate-400 w-20 text-center">启用</th><th className="px-4 py-3 font-semibold text-slate-400 w-24 text-center">操作</th></tr></thead><tbody className="divide-y divide-slate-700">
                      {activePreset.prompts.map((prompt, idx) => (
                        <tr key={prompt.id} className="hover:bg-slate-800/30 group align-top">
                          <td className="px-4 py-3 text-center"><div className="flex items-center justify-center gap-2 mt-1"><GripVertical className="w-4 h-4 text-slate-600" /><span className="text-slate-500 font-mono text-xs">{idx + 1}</span></div></td>
                          <td className="px-4 py-3">
                            <select
                              value={prompt.role}
                              onChange={(e) => handleUpdatePrompt(prompt.id, { role: e.target.value })}
                              className="bg-[#1e222b] border border-slate-700 rounded px-2 py-1 text-[10px] font-bold text-slate-300 outline-none focus:border-blue-500"
                            >
                              <option value="system">SYSTEM</option>
                              <option value="user">USER</option>
                              <option value="assistant">ASSISTANT</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <textarea
                              value={prompt.content}
                              onChange={(e) => handleUpdatePrompt(prompt.id, { content: e.target.value })}
                              className="w-full bg-transparent border-none text-slate-300 text-xs resize-none outline-none focus:ring-1 focus:ring-blue-500/30 rounded p-1 custom-scrollbar min-h-[60px]"
                              placeholder="输入消息内容..."
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleUpdatePrompt(prompt.id, { enabled: !prompt.enabled })}
                              className={`p-1 rounded transition-colors ${prompt.enabled ? 'text-blue-500' : 'text-slate-600'}`}
                            >
                              <ToggleRight className="w-6 h-6" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleDeletePrompt(prompt.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody></table></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl border border-slate-700 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-700">
              <h3 className="font-bold text-lg text-slate-100">{confirmState.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-800 rounded-b-xl">
              <button
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={confirmState.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-lg transition-all text-sm"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorySettingsGenerator;
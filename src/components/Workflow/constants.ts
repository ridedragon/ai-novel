import {
  BookOpen,
  FileText,
  Folder,
  FolderPlus,
  Folders,
  Globe,
  Info,
  LayoutList,
  Library,
  Lightbulb,
  MessageSquare,
  PauseCircle,
  Repeat,
  Settings2,
  User,
  Users,
  Wand2,
} from 'lucide-react';
import { NodeTypeKey } from './types';

export const LOOP_CONFIGURATOR_PROMPT = `你是一个专业的工作流循环配置专家。
你的职责是根据工作流的上下文信息，智能生成循环配置和循环特定指令。

### 输出格式要求
你必须严格按以下 JSON 格式返回，不要添加任何 Markdown 标记：

{
  "loopConfig": {
    "enabled": true,
    "count": <循环次数>
  },
  "loopInstructions": [
    { "index": 1, "content": "<第1次循环指令>" },
    { "index": 2, "content": "<第2次循环指令>" }
  ],
  "reasoning": "<配置理由>"
}

### 配置原则
1. 循环次数：根据大纲章节数或创作需求确定
2. 循环指令：每次循环应有递进性，避免重复
3. 上下文感知：根据前置节点的世界观、角色、大纲等生成针对性指令

### 分卷对应原则（重要）
如果存在分卷规划信息，你必须：
1. **循环次数匹配**：循环次数必须等于分卷数量
2. **指令分卷对应**：每条循环指令必须明确对应到具体分卷，指令数量必须等于分卷数量
3. **剧情递进设计**：
   - 第一卷循环指令：铺垫世界观、引入主角、建立核心冲突
   - 中间卷循环指令：推进剧情、角色成长、冲突升级
   - 最后一卷循环指令：高潮对决、收尾伏笔、结局呈现
4. **格式建议**：在指令中标注"[第X卷]"前缀，如：
   - "【第一卷】完成主角背景介绍，建立世界观基础..."
   - "【第二卷】推进主线剧情，引入新角色..."

### 指令内容规范
每条循环指令应包含：
- 本轮创作目标（明确章节范围）
- 剧情推进要点（核心冲突、角色发展）
- 风格/节奏要求（快节奏/慢热/高潮等）
- 注意事项（避免的雷区、需要呼应的伏笔）

### 补足场景处理
如果用户要求补足缺失的循环指令：
1. 必须返回完整的JSON配置（包含已有的和新增的指令）
2. 确保所有缺失的索引都有对应的指令
3. 新增指令应与已有指令风格一致、剧情连贯
`;

export const DEFAULT_LOOP_CONFIGURATOR_PROMPTS = [
  {
    id: 'system_base',
    role: 'system' as const,
    content: LOOP_CONFIGURATOR_PROMPT,
    enabled: true,
  },
  {
    id: 'user_context',
    role: 'user' as const,
    content: `请根据以下信息生成循环配置：

## 前置节点产出
{{previous_context}}

## 分卷规划信息
{{volume_planning}}

## 后续循环结构
{{loop_structure}}

## 后续节点列表
{{subsequent_nodes}}

## 用户指令
{{user_instruction}}

**重要提示**：
- 如果存在分卷规划，请确保循环指令与分卷对应
- 每个分卷的循环指令应体现该卷的核心剧情推进
- 循环次数应与分卷数量或章节总数相匹配

请生成循环配置JSON。`,
    enabled: true,
  },
];

export const NODE_CONFIGS: Record<NodeTypeKey, any> = {
  pauseNode: {
    typeLabel: '暂停节点',
    icon: PauseCircle,
    color: '#64748b', // Slate 500
    defaultLabel: '暂停等待',
    presetType: null,
  },
  loopNode: {
    typeLabel: '循环执行器',
    icon: Repeat,
    color: '#0ea5e9', // Sky blue
    defaultLabel: '循环控制',
    presetType: null,
  },
  loopConfigurator: {
    typeLabel: '循环配置器',
    icon: Settings2,
    color: '#06b6d4', // Cyan 500
    defaultLabel: '循环指令配置',
    presetType: null,
    globalLoopConfig: { enabled: true, count: 1 },
    globalLoopInstructions: [],
    useAiGeneration: true, // 默认使用AI生成
    instruction: '', // AI生成时的指令
    overrideAiConfig: false, // 是否覆盖AI配置
    promptItems: DEFAULT_LOOP_CONFIGURATOR_PROMPTS, // 预设提示词条目
  },
  saveToVolume: {
    typeLabel: '分卷规划',
    icon: Library,
    color: '#14b8a6', // Teal 500
    defaultLabel: '分卷规划器',
    presetType: 'completion',
    splitRules: [], // 初始化空规则列表
  },
  workflowGenerator: {
    typeLabel: '智能生成工作流',
    icon: Wand2,
    color: '#f87171',
    defaultLabel: '工作流架构师',
    presetType: 'generator',
  },
  createFolder: {
    typeLabel: '创建项目目录',
    icon: FolderPlus,
    color: '#818cf8',
    defaultLabel: '初始化目录',
    presetType: null,
  },
  multiCreateFolder: {
    typeLabel: '多分卷目录初始化',
    icon: Folders,
    color: '#a78bfa', // Violet 400
    defaultLabel: '多卷目录初始化',
    presetType: null,
    volumeFolderConfigs: [],
    currentVolumeIndex: 0,
  },
  reuseDirectory: {
    typeLabel: '复用已有目录',
    icon: Folder,
    color: '#fbbf24',
    defaultLabel: '切换目录节点',
    presetType: null,
  },
  userInput: {
    typeLabel: '用户输入',
    icon: User,
    color: '#3b82f6',
    defaultLabel: '全局输入',
    presetType: null,
  },
  creationInfo: {
    typeLabel: '创作信息',
    icon: Info,
    color: '#22c55e',
    defaultLabel: '分卷创作信息',
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
  outlineAndChapter: {
    typeLabel: '大纲与正文',
    icon: BookOpen,
    color: '#ec4899',
    defaultLabel: '大纲与正文生成',
    presetType: null,
    outlinePresetId: '',
    outlinePresetName: '',
    chapterPresetId: '',
    chapterPresetName: '',
    outlineInstruction: '',
    chapterInstruction: '',
  },
};

export const WORKFLOW_DSL_PROMPT = `你是一个顶级的 AI 小说工作流架构师。
你的职责是将用户的创作需求拆解为一套标准化的自动化流程。你必须以 JSON 格式输出。

### 1. 节点类型百科 (typeKey 指南)
你必须根据创作逻辑合理安排以下节点的先后顺序：

- **createFolder**: 【必需起点】初始化项目。参数: folderName (小说书名)。
- **multiCreateFolder**: 【多卷模式】多分卷目录初始化。用于独立分卷故事，每卷内容不相关。参数: volumeFolderConfigs (分卷配置数组)。
- **worldview**: 构建世界观。参数: instruction (地理、力量体系设定要求)。
- **characters**: 塑造角色。参数: instruction (主角及配角的人设要求)。
- **inspiration**: 灵感生成。参数: instruction (核心冲突、金手指、反转点要求)。
- **plotOutline**: 剧情粗纲。参数: instruction (全书起承转合的高级逻辑规划)。
- **outline**: 章节大纲。参数: instruction (详细到每一章的剧情细化要求)。
- **chapter**: 【正文生成】根据 outline 自动写书。通常接在 outline 节点之后。
- **userInput**: 用户干预。参数: instruction (明确告诉用户此处需要输入什么信息)。
- **creationInfo**: 创作信息节点。用于告知AI当前正在创作的分卷信息。参数: instruction (用户自定义创作指令)，系统会自动注入当前分卷名称和章节范围等上下文信息。
- **aiChat**: AI 顾问。参数: instruction (如"请以毒舌编辑身份对上述设定进行逻辑审核")。
- **reuseDirectory**: 关联目录。参数: folderName (要复用的目录名)。
- **saveToVolume**: 分卷规划。参数: splitRules (分卷触发规则)。
- **loopNode**: 循环执行器。参数: loopConfig (循环次数配置)。
- **loopConfigurator**: 循环配置器。用于配置后续节点的循环特定指令和循环次数。参数: globalLoopConfig, globalLoopInstructions。
- **pauseNode**: 暂停节点。工作流执行到此节点时暂停，等待用户确认后继续。

### 2. 顶级指令编写规范 (Instruction)
当用户开启"自动填写"时，你为 nodes 生成的 instruction 必须达到出版级水准：
- **篇幅要求**: 每个节点的指令必须在 300-600 字之间。
- **结构规范**: 包含【身份背景】、【任务目标】、【创作禁忌】、【风格参考】和【输出格式】。
- **示例**: "你是一个拥有20年经验的网文主编。现在请为本作设计一个'低魔高武'的世界观。严禁出现西式幻想元素，必须扎根于中式神话，引入独特的'气血交换'体系..."

### 3. JSON 协议格式
你必须返回纯净的 JSON，严禁 Markdown 代码块标记：
{
  "nodes": [
    { "id": "node_0", "typeKey": "createFolder", "label": "书名初始化", "folderName": "用户需求书名" },
    { "id": "node_1", "typeKey": "outline", "label": "长篇大纲规划", "instruction": "极其详细的300字以上提示词..." }
  ],
  "edges": [
    { "id": "edge_0_1", "source": "node_0", "target": "node_1" }
  ]
}
`;



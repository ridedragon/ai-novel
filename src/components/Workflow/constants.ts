import {
  BookOpen,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  LayoutList,
  Library,
  Lightbulb,
  MessageSquare,
  PauseCircle,
  Repeat,
  User,
  Users,
  Wand2,
} from 'lucide-react';
import { NodeTypeKey } from './types';

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

export const WORKFLOW_DSL_PROMPT = `你是一个顶级的 AI 小说工作流架构师。
你的职责是将用户的创作需求拆解为一套标准化的自动化流程。你必须以 JSON 格式输出。

### 1. 节点类型百科 (typeKey 指南)
你必须根据创作逻辑合理安排以下节点的先后顺序：

- **createFolder**: 【必需起点】初始化项目。参数: folderName (小说书名)。
- **worldview**: 构建世界观。参数: instruction (地理、力量体系设定要求)。
- **characters**: 塑造角色。参数: instruction (主角及配角的人设要求)。
- **inspiration**: 灵感生成。参数: instruction (核心冲突、金手指、反转点要求)。
- **plotOutline**: 剧情粗纲。参数: instruction (全书起承转合的高级逻辑规划)。
- **outline**: 章节大纲。参数: instruction (详细到每一章的剧情细化要求)。
- **chapter**: 【正文生成】根据 outline 自动写书。通常接在 outline 节点之后。
- **userInput**: 用户干预。参数: instruction (明确告诉用户此处需要输入什么信息)。
- **aiChat**: AI 顾问。参数: instruction (如"请以毒舌编辑身份对上述设定进行逻辑审核")。
- **reuseDirectory**: 关联目录。参数: folderName (要复用的目录名)。

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

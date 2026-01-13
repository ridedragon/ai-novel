# 正文生成节点代码分析报告

## 1. 核心执行流程

工作流中的正文生成逻辑是由 `WorkflowEditor.tsx` 调度并驱动 `AutoWriteEngine` 完成的。

### 1.1 调度逻辑 (WorkflowEditor.tsx)
当工作流运行到类型为 `chapter` 的节点时，系统会执行以下操作：
- **大纲定位**：通过 [`WorkflowEditor.tsx:3182`](../src/components/WorkflowEditor.tsx:3182) 寻找关联的大纲集（OutlineSet）。
- **配置聚合**：从全局设置和节点预设中聚合 API 参数、提示词模板。
- **分卷锚定**：确定生成的正文应当写入哪一个分卷。优先使用 `activeVolumeAnchor`（由前置“保存至分卷”节点设置）。
- **引擎启动**：初始化 `AutoWriteEngine` 并开始异步循环生成。

### 1.2 执行逻辑 (AutoWriteEngine)
在 [`src/utils/auto-write/index.ts`](../src/utils/auto-write/index.ts) 中：
- **查重过滤**：遍历大纲，对比目标分卷中是否已存在同名章节且有内容。若有，则跳过。
- **上下文构建**：调用 `getChapterContextMessages` 收集前文背景，包括：
  - 世界观和角色设定。
  - 前文的剧情摘要（小总结/大总结）。
  - 最近几章的历史正文（取决于 `contextChapterCount`）。
- **流式请求**：向 AI 发起请求并实时更新章节内容。

---

## 2. 数据来源详细说明

| 数据项         | 获取方式                                     | 代码参考                  |
| :------------- | :------------------------------------------- | :------------------------ |
| **当前大纲项** | 从 `currentSet.items` 中按索引获取           | `WorkflowEditor.tsx:3285` |
| **参考设定**   | 从 `selectedWorldviewSets` 等关联集合中提取  | `WorkflowEditor.tsx:3054` |
| **前文背景**   | 线性五段式构建（总结+细节正文+最近内容）     | `core.ts:384`             |
| **全局输入**   | 从前置 `userInput` 节点的 `instruction` 累积 | `WorkflowEditor.tsx:2867` |

---

## 3. 章节不匹配问题原因分析

您发现的“生成内容不是现在大纲节点里的章节”的问题，经代码研读，主要存在以下风险点：

### 3.1 模糊的大纲集匹配机制 (主要原因)
在 [`WorkflowEditor.tsx:3182`](../src/components/WorkflowEditor.tsx:3182) 附近，如果用户没有在节点属性中**手动勾选**大纲集，系统会按以下顺序寻找：
1. 寻找名称与“当前工作目录”相同的大纲集。
2. **风险**：如果用户重命名了大纲集或目录，导致名称不匹配。
3. **兜底逻辑偏差**：如果上述匹配失败，代码会执行 `localNovel.outlineSets?.[localNovel.outlineSets.length - 1]`，即直接抓取**最后一个**创建的大纲集。如果您的工作流中有多个大纲节点，这极易导致正文生成节点抓错了别的大纲。

### 3.2 查重逻辑的空隙
在 [`index.ts:80`](../src/utils/auto-write/index.ts:80) 中，查重逻辑依赖于 `c.title === item.title`。
- 如果大纲节点更新了标题，但旧分卷中还残留着旧标题的章节，查重可能会失效，导致 AI 认为这是一个“新章节”，但其内容读取的却是旧的上下文。

### 3.3 异步状态同步延迟
工作流节点切换非常快。如果大纲生成节点的 `onChapterComplete` 回调（负责将 AI 生成的大纲写回 `Novel` 对象）还没完成，正文生成节点就已经启动并读取了 `localNovel` 快照，它拿到的将是空的大纲列表。

---

## 4. 优化建议

1. **强绑定 ID**：修改 `chapter` 节点，使其在创建时就记录前置 `outline` 节点的 ID，实现精准的大纲数据流。
2. **移除模糊兜底**：在 `WorkflowEditor.tsx` 中，若找不到匹配的大纲集，应抛出明确错误或暂停，而不是随机选取最后一个大纲集。
3. **视觉反馈**：在正文生成节点的 UI 上实时显示“当前正在使用的大纲集名称”，方便用户排查。

---
*报告编写人：Kilo Code*
*日期：2024-05-23*
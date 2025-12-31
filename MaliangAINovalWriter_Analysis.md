# MaliangAINovalWriter (马良AI小说) 深度功能分析报告

## 1. 项目架构全景
马良AI小说采用 **Flutter + BLoC + SSE** 的技术栈，是一个工业级的 AI 创作辅助工具。

### 核心模块职责：
- **`agentChat`**：多智能体协作、时间旅行、工具调用审批。
- **`setting_generation`**：小说设定树的生命周期管理（生成、修改、快照）。
- **`analytics`**：Token 消耗、模型使用频率、用户活动分布。
- **`utils/ai_generated_content_processor.dart`**：富文本编辑器的 AI 样式层。

---

## 2. 按钮功能与实现逻辑详细清单

### 2.1 设定生成界面 (Setting Generation)

#### A. 顶部工具栏 (AppBar)
-   **[保存设定]**
    -   **实现**：调用 `saveGeneratedSettings`。
    -   **处理逻辑**：如果是新建小说，支持三种分支：1. 存为独立快照；2. 更新当前选中的历史记录；3. 关联到现有小说。
-   **[生成黄金三章]**
    -   **实现**：弹出 `GoldenThreeChaptersDialog`。基于当前设定树（Context），发起 `NOVEL_COMPOSE` 请求。
-   **[开始写作]**
    -   **实现**：调用 `startWriting` API。
    -   **逻辑**：将当前 Session 的 UUID 发给后端，后端将其转化为正式的小说 Entity，前端跳转到 `EditorScreen`。

#### B. 创作控制台 (Left Panel)
-   **[生成/重新生成]**
    -   **实现**：`StartGenerationEvent` -> `Repository.startGeneration` -> 建立 SSE 连接。
-   **[策略选择]**：加载预设模板（九线法等），定义 AI 生成设定的“生长路径”。
-   **[知识库模式切换]**：支持 `Reuse` (物理拷贝节点), `Imitation` (参考风格), `Hybrid` (混合)。

#### C. 结果预览与微调 (Right Panel)
-   **[应用微调]**：针对 AI 生成的内容发送修改指令（Refine Prompt），局部重写文本。
-   **[追加章节]**：在当前章节列表末尾利用 `Slider` 选择数量，继续生成后续大纲。

### 2.2 Agent Chat (智能体对话)
-   **[时间旅行 (Time Travel)]**：点击历史消息，触发 `restoreSnapshot`，整个 UI 状态（包括上下文引用、选中的智能体）物理回退。
-   **[工具审批 (Approval)]**：当 AI 尝试修改项目文件时，UI 渲染 `ApprovalBlock` 阻塞执行，直到用户手动批准。

---

## 3. 内容处理与 AI 交互深度逻辑

### 3.1 设定树的流式生长 (Structural Growth)
这是该项目最高级的实现：
1.  **事件流**：后端发送 `NodeCreatedEvent`。
2.  **拓扑排序**：`_improvedTopologicalSort` 算法确保在复杂的异步流中，子节点永远在父节点渲染完成后才出现。
3.  **交错渲染**：`ProcessRenderQueueEvent` 配合 `Timer` 实现节点“生长”动画，而不是瞬间刷出。

### 3.2 写作内容实时解析 (Stream Parsing)
生成黄金三章时，前端通过正则监听 Buffer：
-   **分隔符**：`[CHAPTER_\d+_OUTLINE]` 和 `[CHAPTER_\d+_CONTENT]`。
-   **解析逻辑**：`_parseChaptersToPreview` 实时将流式字符串切片，并同步更新到左侧的 `ChapterPreviewData` 列表中。

### 3.3 富文本样式的“后悔药”机制
-   **AI 内容隔离**：为 `flutter_quill` 引入 `ai-generated` 自定义属性，文本自动变蓝。
-   **隐藏式修改 (Soft Replace)**：
    -   旧文本标记为 `hidden-text` (删除线 + 40% 透明)。
    -   新生成的文本高亮显示。
    -   保存时调用 `getVisibleTextOnly` 物理剔除所有带 `hidden` 属性的内容。

---

## 4. 建议集成到“自动化创作中心”的功能建议

1.  **节点式大纲管理**：摒弃“全量文本”生成，改用树状节点生长，支持用户对单一设定节点进行“局部 Refine”。
2.  **对话快照回滚**：集成 `agentChat` 的快照机制，记录每一次 AI 修改大纲的操作，防止 AI “写歪了”无法找回。
3.  **AI 样式审计**：采用 `AIGeneratedContentProcessor` 的逻辑，清晰标记哪些字是 AI 写的，哪些是用户写的。
4.  **结构化标签协议**：前后端统一 `[TAG_CONTENT]` 协议，实现长文本的实时结构化显示。

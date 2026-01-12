# AI 小说工作流引擎 V2 深度技术解析与运行逻辑指南

> **版本**: V2.0  
> **适用对象**: 开发者、高级提示词工程师、工作流架构师、深度用户  
> **关键词**: 有向无环图 (DAG)、异步调度、上下文穿透、变量插值、自动写作引擎、React Flow、状态持久化

---

## 1. 系统架构总览 (System Architecture)

AI 小说工作流引擎 V2 是一个专为长篇小说创作设计的、基于浏览器端的**异步任务编排与执行系统**。它不仅仅是一个简单的 LLM（大语言模型）调用链，而是一个集成了**状态管理**、**逻辑判断**、**上下文记忆**和**自动化文件操作**的微型操作系统。

### 1.1 核心设计理念

1. **无状态 UI 与有状态内核分离**：
    为了解决网页端应用常见的“刷新丢失状态”或“组件卸载导致中断”的问题，引擎采用了双层架构。
    * **表现层 (View Layer)**：由 React Flow 驱动的 `WorkflowEditor` 组件，负责可视化渲染、拖拽交互和实时动画。它是“无状态”的，随时可以被销毁或重建。
    * **逻辑层 (Logic Layer)**：由 `WorkflowManager` 单例驱动的后台引擎。它独立于 UI 组件生命周期，负责维护全局上下文（Global Context）、执行队列（Execution Queue）和插件系统。即使 UI 关闭，逻辑层仍在内存中运行。

2. **数据驱动与自愈 (Data-Driven & Self-Healing)**：
    所有节点的执行状态（Pending/Executing/Completed/Failed）和产出内容（Output Entries）都实时同步到浏览器的 IndexedDB 中。
    * **快照机制**：每当节点状态发生变化，`syncNodeStatus` 函数会将当前完整的节点图（Node Graph）快照写入存储。
    * **恢复机制**：页面重载时，系统会从 IndexedDB 读取最后一次成功的快照，并根据 `activeWorkflowId` 恢复现场。

3. **上下文流式穿透 (Streamlined Context)**：
    区别于传统的 Chat 模式，工作流引擎采用了**累积式上下文（Accumulated Context）**设计。
    * 前序节点（如“大纲生成”）的输出，会自动成为后序节点（如“正文生成”）的输入。
    * 系统内置了智能去重和滑动窗口机制，防止上下文无限膨胀导致 Token 溢出。

---

## 2. 核心运行逻辑深度拆解 (Execution Logic)

当用户点击“运行”按钮时，引擎内部发生了一系列精密的调度操作。以下是 `runWorkflow` 函数背后的原子级逻辑。

### 2.1 拓扑排序 (Topological Sort)

工作流本质上是一个**有向无环图 (DAG)**。引擎首先需要确定节点的执行顺序。

* **入度计算 (In-Degree Calculation)**：
    系统遍历 `edges`（连线）数组，计算每个节点的“入度”（即有多少个箭头指向它）。
* **排序算法**：
    1. 找到所有入度为 0 的节点（起始节点），放入队列。
    2. 从图中移除这些节点及其发出的连线。
    3. 更新剩余节点的入度。
    4. 重复上述过程，直到所有节点都被处理。
* **结果**：产生一个线性的 `sortedNodes` 数组。这就是实际的执行指令带。

### 2.2 异步串行调度 (Async Serial Scheduling)

虽然图结构看起来是并行的，但在 V2 引擎中，为了保证上下文的连贯性，默认采用**异步串行**执行模式。

* **调度器循环**：

    ```typescript
    for (let i = startIndex; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        // 1. 检查暂停/停止信号
        if (stopRequested) break;
        
        // 2. 更新状态为 Executing
        await syncNodeStatus(node.id, { status: 'executing' });
        
        // 3. 执行节点逻辑 (根据 typeKey 分发)
        await executeNodeLogic(node);
        
        // 4. 更新状态为 Completed
        await syncNodeStatus(node.id, { status: 'completed' });
        
        // 5. 累积上下文
        accumulateContext(node);
    }
    ```

* **非阻塞 UI**：
    尽管是串行执行，但每个步骤都使用了 `await`。在等待 AI 响应（通常耗时 30s-120s）期间，JS 主线程不会被阻塞。用户依然可以缩放画布、查看已生成的章节，甚至进行其他写作操作。

### 2.3 变量系统与插值引擎 (Variable System)

这是 V2 引擎实现“动态逻辑”的关键。

#### 2.3.1 变量绑定 (Variable Binding)

在 **用户输入 (User Input)** 节点中，支持配置 `variableBinding`。

* **捕获 (Capture)**：用户输入的文本（例如 "10-20"）会被捕获。
* **存储 (Storage)**：存储到 `WorkflowManager.globalContext.variables` 对象中，键名为用户定义的变量名（如 `batch_range`）。

#### 2.3.2 动态插值 (Interpolation)

在后续的所有节点（Prompt、指令、甚至文件名）中，都可以使用 `{{variable}}` 语法。

* **解析时机**：在节点即将执行的**那一瞬间**，引擎会调用 `workflowManager.interpolate(text)`。
* **替换逻辑**：
  * 正则匹配 `\{\{([^}]+)\}\}`。
  * 从 `GlobalContext` 查找对应的值。
  * 如果找到，替换为字符串值；如果没找到，保留原样或替换为空（取决于配置）。
* **系统级变量**：
  * `{{active_volume_anchor}}`：当前活跃的分卷 ID。
  * `{{loop_index}}`：循环容器当前的迭代次数。
  * `{{current_date}}`：当前日期。

---

## 3. 节点功能与原子能力全解 (Node Capabilities)

引擎定义了 11 种核心节点，每种节点都封装了特定的原子能力（Atomic Capability）。

### 3.1 基础设施类 (Infrastructure)

这类节点负责流程控制、文件系统操作和人机交互，通常不消耗 Token。

#### 📂 创建项目目录 (Create Folder)

* **原子能力**: `FileSystem Operation`, `Anchor Setting`
* **输入参数**: `folderName` (支持变量插值)
* **运行逻辑**:
    1. **查重**: 检查小说结构中是否已存在同名分卷。
    2. **创建/复用**: 不存在则创建新分卷对象，存在则获取其 ID。
    3. **设置锚点 (Set Anchor)**: 调用 `workflowManager.setActiveVolumeAnchor(id)`。这是核心操作，标志着后续所有的“正文生成”操作，默认都会写入这个 ID 对应的分卷。
    4. **全量初始化**: 自动创建同名的 `WorldviewSet`, `CharacterSet`, `OutlineSet`, `InspirationSet`。这是为了实现“分卷隔离”——每一卷有自己独立的世界观和角色库。

#### 🔄 复用已有目录 (Reuse Directory)

* **原子能力**: `Context Switching`
* **运行逻辑**:
    不创建任何新数据，仅执行 `setActiveVolumeAnchor(id)`。用于在长工作流中切换写入目标（例如：先写第一卷，再跳回序章进行修改）。

#### 👤 用户输入 (User Input)

* **原子能力**: `Interrupt`, `Variable Capture`
* **运行逻辑**:
    1. **中断**: 工作流状态置为 `paused`，UI 弹出模态框。
    2. **渲染指令**: 显示经过插值处理的提示语（如 "请确认第 {{loop_index}} 卷的大纲"）。
    3. **捕获**: 用户提交后，将输入内容写入全局变量池，并追加到 `accumContext` 中，供后续 AI 节点参考。

### 3.2 设定构建类 (World Building)

这类节点负责生成结构化数据，构建小说的“数据库”。

#### 🌍 世界观 (Worldview) / 👥 角色集 (Characters) / 💡 灵感集 (Inspiration)

* **原子能力**: `Structured Generation (JSON)`, `Auto-Archiving`
* **核心技术**:
  * **Prompt 注入**: 系统会在用户的 Prompt 后强制追加 `WORKFLOW_DSL_PROMPT` 或特定的 JSON Schema 约束，要求 AI 返回严格的 JSON 格式（如 `[{item: "...", setting: "..."}]`）。
  * **鲁棒解析 (Robust Parsing)**: 内置 `cleanAndParseJSON` 函数。
    * 自动去除 Markdown 代码块标记（```json ...```）。
    * 修复常见的 JSON 语法错误（如末尾多余逗号）。
    * 处理“灾难性回溯”：使用异步正则处理，防止大文本解析卡死 UI。
  * **自动归档**: 解析成功后，直接调用 `updateLocalAndGlobal`，将数据写入小说的对应 Set 中（如 `novel.characterSets`）。这意味着生成完就能在左侧边栏看到。

### 3.3 剧情规划类 (Planning)

#### 📝 粗纲 (Plot Outline)

* **功能**: 生成宏观剧情节奏（起承转合）。
* **输出**: `Scene` 类型的节点列表，通常用于控制整卷书的 pacing。

#### 📖 大纲 (Outline)

* **功能**: 生成具体的章节列表。
* **关键机制**: **协议对接**。
  * 大纲节点生成的 `items` 数组（包含 `title`, `summary`），是后续“正文生成”节点的直接输入源。
  * 如果你在大纲节点生成了 10 个条目，正文节点就会自动识别这 10 个任务。

### 3.4 核心生产类 (Production)

#### 📄 正文生成 (Chapter)

这是引擎中最复杂、最核心的节点，它不是简单的 API 调用，而是实例化了一个完整的 **AutoWriteEngine**。

* **原子能力**: `AutoWrite Engine`, `Context Sliding Window`, `Merge Delta`
* **运行逻辑**:
    1. **目标锁定**: 读取 `activeVolumeAnchor` 确定写入哪个分卷。
    2. **任务识别**: 读取前序“大纲”节点的输出，确定要写多少章。
    3. **上下文组装 (Context Assembly)**:
        * **静态上下文**: 世界观、角色卡、全局设定。
        * **动态上下文 (Sliding Window)**: 读取**最近 N 章**（默认 1-3 章）的正文内容。这是为了保证剧情连贯，让 AI 知道上一章结尾发生了什么。
        * **摘要上下文**: 读取前序生成的 `Big Summary`（剧情摘要）。这是 AI 的“长期记忆”。
    4. **循环执行**:
        * `for each chapter in outline`:
            * 构建 Prompt。
            * 调用 AI 生成正文。
            * **自动润色 (Auto Optimize)**: (可选) 生成后立即进行一轮逻辑/文笔优化。
            * **增量存储 (Merge Delta)**: 每生成一章，立即写入 IndexedDB。不要等到所有章节都写完才存，防止浏览器崩溃导致全军覆没。

#### 💬 AI 聊天 (AI Chat)

* **功能**: 通用的 LLM 调用节点。
* **场景**: 用于润色、审核、头脑风暴，或者生成非结构化的文本（如“写一段上架感言”）。

#### 🧙‍♂️ 智能生成工作流 (Workflow Generator)

* **原子能力**: `Meta-Programming` (元编程/代码生成代码)
* **运行逻辑**:
    1. 用户输入自然语言需求（如“写一个凡人流修仙，200章”）。
    2. **Prompt**: 向 AI 发送 `WORKFLOW_DSL_PROMPT`，要求 AI 返回一个描述图结构的 JSON（包含 `nodes` 和 `edges` 数组）。
    3. **热重载 (Hot Reload)**: 前端接收到 JSON 后，验证合法性，然后直接调用 React Flow 的 `setNodes` 和 `setEdges`，**瞬间替换**当前的画布。
    4. 这是一个“上帝节点”，它能创造其他节点。

---

## 4. 自动写作引擎 (AutoWrite Engine) 核心机制

`src/utils/auto-write/core.ts` 是正文生成的心脏。

### 4.1 上下文构建策略 (The 5-Step Context Builder)

为了在有限的 Context Window（如 128k）内实现最佳的写作效果，引擎采用了精细的上下文构建策略：

1. **世界观与角色 (System Prompt)**: 始终置顶，保证人设不崩。
2. **本卷规划 (Volume Outline)**: 注入当前分卷的粗纲，确保不跑题。
3. **剧情摘要 (Summaries)**:
    * 读取所有 `subtype === 'big_summary'` 的章节。
    * 按时间顺序排列，作为长期记忆。
4. **前文回顾 (Recap)**:
    * 读取最近 `N` 章（由 `contextChapterCount` 控制）的完整正文。
    * 用于保持对话、场景的连续性。
5. **当前任务 (Current Task)**:
    * 本章的大纲、标题、以及具体的写作指令。

### 4.2 正则脚本与后处理 (Regex Scripting)

在 AI 生成内容后，引擎会自动运行一组正则替换脚本（Regex Scripts）。

* **用途**:
  * **格式清理**: 去除多余的空行、`Chapter` 标记、`###` 标题。
  * **敏感词过滤**: 替换特定词汇。
  * **排版优化**: 统一标点符号格式。
* **性能优化**: 正则处理采用了 `Time Slicing`（时间分片）技术，每处理一定量的文本会 `await new Promise(r => setTimeout(r, 0))`，防止在大文本处理时卡死 UI 渲染线程。

---

## 5. 数据持久化与状态恢复 (Persistence & Recovery)

### 5.1 存储结构

数据存储在浏览器的 IndexedDB 中（通过 `idb-keyval` 或类似库封装）。

* **Key**: `novel_workflow` (存储工作流定义), `novel_data` (存储小说内容).
* **Structure**: 包含完整的 `nodes`（含状态、位置、输出内容）、`edges`、`activeWorkflowId`。

### 5.2 自动保存策略 (Auto-Save Policy)

1. **防抖保存 (Debounce)**: 监听 `nodes` 和 `edges` 的变化，延迟 500ms - 5000ms 触发保存，防止频繁 IO。
2. **关键帧保存 (Keyframe Save)**: 在关键生命周期（节点开始执行、节点完成执行、发生错误）时，**立即**触发强制保存。

### 5.3 竞态条件处理 (Race Condition Handling)

由于 `WorkflowManager`（后台）和 `React Component`（前台）可能同时尝试更新状态，系统采用了 **Ref 优先** 策略。

* 所有的状态更新首先写入 `nodesRef.current`（内存中的最新快照）。
* 然后同步给 React 的 `setNodes` 以触发重绘。
* 最后异步写入 DB。
* 这确保了即使 UI 渲染滞后，后台逻辑读取到的永远是最新的数据。

---

## 6. 开发者扩展指南

### 6.1 如何添加一种新节点？

1. **定义类型**: 在 `src/types.ts` 的 `NodeTypeKey` 中添加新类型。
2. **配置元数据**: 在 `src/components/WorkflowEditor.tsx` 的 `NODE_CONFIGS` 对象中配置图标、颜色、默认标签。
3. **实现逻辑**:
    * 在 `runWorkflow` 函数的主循环中，添加 `case 'newNodeType':` 分支。
    * 编写具体的执行逻辑（API 调用、数据处理等）。
    * 调用 `syncNodeStatus` 更新状态。
4. **UI 适配**: 如果新节点需要特殊的配置面板，在 `NodePropertiesModal` 组件中添加对应的表单项。

### 6.2 性能优化建议

对于超长工作流（超过 100 个节点）：

* **虚拟化**: React Flow 自带了 Viewport Culling，但在处理大量数据同步时仍需注意。
* **分片处理**: 尽量不要在一个工作流中塞入 200 个正文节点。建议利用“循环容器”或拆分为多个分卷工作流。

---

## 7. 常见问题排查 (Troubleshooting)

* **Q: 为什么生成的正文没有写入目录？**
  * A: 检查 `Active Volume Anchor`。确保在正文节点之前，有一个“创建目录”节点被成功执行，且正文节点的“目标分卷”设置为“自动匹配”。
* **Q: AI 忘记了前文设定？**
  * A: 检查“正文生成”节点的上下文设置。确认是否勾选了正确的世界观/角色集。对于长篇，务必定期使用“生成剧情摘要”功能，手动固化长期记忆。
* **Q: 工作流卡在“执行中”无法停止？**
  * A: 这是一个典型的状态不同步问题。点击编辑器右上角的“重置状态”按钮，或者刷新页面。V2 引擎的自愈机制会在初始化时检测并修复这种僵死状态。

---

> **结语**: AI 小说工作流引擎 V2 是一个高度复杂且强大的系统。它通过标准化的协议（JSON DSL）和自动化的调度器，将人类的创作意图转化为机器可执行的指令流。理解其底层的“上下文流”和“锚点机制”，是掌握这一工具、创作出高质量长篇小说的关键。

# AI 交互逻辑详细报告

本报告详细说明了“AI 小说”项目中所有调用 AI 的场景、使用的模型选择逻辑、发送给 AI 的内容及其发送顺序。

## 1. 模型选择逻辑 (Model Selection Priority)

系统中所有 AI 调用均遵循以下优先级来确定使用的模型（见 [`src/App.tsx:2596`](src/App.tsx:2596) 中的 [`getApiConfig`](src/App.tsx:2596) 函数）：

1. **功能预设配置 (Preset API Config)**: 如果当前选中的功能预设（如特定的润色预设、大纲预设）配置了独立的 `model`，则优先使用。
2. **功能全局默认 (Feature Specific Global)**: 如果预设未配置，则使用全局设置中为该功能指定的模型（如 `outlineModel`, `characterModel` 等）。
3. **全局默认模型 (Global Default)**: 如果以上均未配置，则使用全局设置中的“默认模型”。

---

## 2. 核心功能调用详情

### 2.1 正文生成 (Chapter Generation)

* **触发位置**: [`src/App.tsx:4972`](src/App.tsx:4972) ([`handleGenerate`](src/App.tsx:4972))
* **发送顺序**:
    1. **System Prompt**: 小说全局设定的系统提示词（默认：“你是一个专业的小说家...”）。
    2. **Active Prompts**: 用户在“对话补全源”中启用的所有自定义提示词条目。
    3. **User Message**: 包含以下内容的组合字符串：
        * **World Info**: 选中的世界观设定和角色档案。
        * **Context**: 根据“长文模式”设置提取的前文剧情回顾（包含小总结、大总结和前序章节）。
        * **User Prompt**: 用户在输入框输入的具体指令（如“继续写”或特定情节要求）。

### 2.2 自动化写作 (Auto Writing Loop)

* **触发位置**: [`src/App.tsx:4471`](src/App.tsx:4471) ([`autoWriteLoop`](src/App.tsx:4471))
* **发送顺序**:
    1. **System Prompt**: 小说全局系统提示词。
    2. **Active Prompts**: “对话补全源”中启用的提示词。
    3. **User Message**:
        * **World Info**: 全局世界观和角色。
        * **Context**: 前文剧情回顾。
        * **Full Outline**: (可选) 全书大纲参考。
        * **Task Description**: 包含当前要写的章节标题和大纲。如果是“连续创作模式”，会一次性发送多个章节的标题和大纲，并要求 AI 使用 `###` 分隔符。

### 2.3 章节润色与优化 (Optimization)

* **触发位置**: [`src/App.tsx:4159`](src/App.tsx:4159) ([`handleOptimize`](src/App.tsx:4159))
* **模式 A: 单阶段优化**:
    1. **Preset Prompts**: 优化预设中定义的提示词链（通常包含 System 和 User 角色）。
    2. **Content**: 待优化的正文内容（替换 `{{content}}` 占位符）。
* **模式 B: 两阶段优化 (Analysis + Optimize)**:
  * **第一阶段 (分析)**: 发送正文给 AI，使用“分析预设”要求其指出问题。
  * **第二阶段 (优化)**: 将**第一阶段的分析结果**作为上下文（替换 `{{analysis}}`），连同原正文一起发送给 AI 进行针对性修改。

### 2.4 剧情总结 (Summary Generation)

* **触发位置**: [`src/utils/SummaryManager.ts:27`](src/utils/SummaryManager.ts:27) ([`checkAndGenerateSummary`](src/utils/SummaryManager.ts:27))
* **发送顺序**:
    1. **System Message**: "You are a professional editor helper."
    2. **User Message**:
        * **Source Text**: 待总结的章节正文（小总结）或已生成的小总结列表（大总结）。
        * **Prompt**: 用户配置的总结指令（如“请把以上内容总结成300字以内...”）。

### 2.5 模块化生成 (Outline / Character / Worldview / Inspiration)

* **触发位置**: `handleGenerateOutline`, `handleGenerateCharacters` 等。
* **发送顺序**:
    1. **Global Creation Prompt**: (可选) 用户在自动化中心设置的全局系统指令。
    2. **Preset Prompts**: 对应模块预设中的提示词链。
    3. **Context**: 包含参考的其他模块内容（如生成大纲时参考的角色和世界观）。
    4. **Input**: 用户的具体要求或默认的“生成新条目”指令。
    5. **Format Requirement**: 强制要求返回 JSON 数组格式。

### 2.6 AI 创作助手 (Chat Modal)

* **触发位置**: [`src/components/AIChatModal.tsx:52`](src/components/AIChatModal.tsx:52) ([`handleSend`](src/components/AIChatModal.tsx:52))
* **发送顺序**:
    1. **System Prompt**: 小说全局系统提示词。
    2. **Chapter Context**: (如果存在) 当前正在处理的章节正文。
    3. **Chat History**: 当前对话框中的历史往来消息。

---

## 3. 数据处理流程

1. **输入预处理**: 发送前会运行“正则脚本”（Placement: Input），对上下文和用户输入进行清洗或替换。
2. **AI 调用**: 使用 `openai` SDK 进行流式或非流式请求。
3. **输出后处理**:
    * **正则清洗**: 对 AI 返回的内容运行“正则脚本”（Placement: Output）。
    * **JSON 解析**: 对于大纲/角色等模块，使用 [`safeParseJSONArray`](src/App.tsx:484) 进行容错解析（处理 Markdown 代码块、截断等问题）。
    * **版本保存**: 优化后的正文会自动存入章节的 `versions` 历史中。

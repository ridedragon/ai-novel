# 润色优化功能升级计划：两阶段优化 (分析 + 执行)

## 1. 概述
本计划旨在优化现有的“润色优化”功能。通过引入“两阶段优化”机制，提升 AI 优化的质量和针对性。
- **阶段一 (分析)**：AI 分析原文，指出不足并提出修改建议。
- **阶段二 (执行)**：AI 根据原文和修改建议，进行实质性的润色和重写。

## 2. 核心变更

### 2.1 状态管理
在 `App.tsx` 中新增以下状态：
1.  **`twoStepOptimization` (boolean)**: 控制是否启用两阶段优化，默认关闭。持久化到 localStorage。
2.  **`analysisPresets` (GeneratorPreset[])**: 存储“分析阶段”使用的预设列表。持久化到 localStorage。
3.  **`activeAnalysisPresetId` (string)**: 当前选中的分析预设 ID。持久化到 localStorage。
4.  **`analysisResult` (string)**: 用于存储和展示第一阶段 AI 返回的修改建议。

### 2.2 数据结构
新增默认的分析预设 `defaultAnalysisPresets`，内容如下：
- **System**: 你是一个严厉的小说主编。请犀利地指出文章中的问题。
- **User**: 请分析以下正文：\n\n{{content}}\n\n用户要求：{{input}}\n\n请列出具体的修改建议（如剧情节奏、人物性格、描写细节等），不需要重写正文。

### 2.3 UI 调整
1.  **优化助手设置 (Generator Settings - Optimize)**:
    - 添加一个“启用两阶段分析优化”的开关（Toggle）。
    - 当开关开启时，显示“分析阶段预设”的选择和配置区域（允许切换、编辑分析预设）。
2.  **主界面 / 优化过程**:
    - 在执行优化时，如果启用了两阶段优化，界面上需要有一个区域（文本框）实时显示第一阶段的“分析建议”。
    - 用户要求“储存在一个文本框中”，我们可以在侧边栏或者模态框中展示这个过程，或者在正文编辑器旁边/下方增加一个可折叠的“AI 分析建议”面板。

## 3. 实现步骤

### 步骤 1: 基础状态与预设初始化
- 在 `App.tsx` 中添加 `twoStepOptimization`, `analysisPresets`, `activeAnalysisPresetId` 的 state 定义。
- 定义 `defaultAnalysisPresets` 常量。
- 添加 `useEffect` 进行 localStorage 持久化。

### 步骤 2: 设置界面升级
- 修改 `showGeneratorSettingsModal` 逻辑或内部渲染逻辑。
- 当 `generatorSettingsType === 'optimize'` 时，在设置面板顶部添加“启用两阶段优化”开关。
- 如果开启，在侧边栏预设列表中，增加切换“优化预设”和“分析预设”的选项（或者在主编辑区提供两个 Tab：配置优化预设、配置分析预设）。
- *简化方案*：在优化设置里，增加一个下拉框选择“分析使用的预设”，点击旁边的按钮可以编辑该分析预设（复用现有的预设编辑 UI，只需临时切换 `generatorSettingsType` 或数据源）。

### 步骤 3: 优化逻辑重构 (`handleOptimize`)
- 修改 `handleOptimize` 函数。
- 检查 `twoStepOptimization` 是否为 true。
- **分支 A (两阶段)**:
    1.  **Request 1 (Analysis)**:
        - 使用 `activeAnalysisPresetId` 对应的预设。
        - Prompt 替换 `{{content}}` 为原文，`{{input}}` 为用户指令。
        - 获取 AI 响应，存入 `analysisResult` 状态，并更新到 UI 文本框中。
    2.  **Request 2 (Execution)**:
        - 立即发起。
        - 使用 `activeOptimizePresetId` 对应的预设。
        - Prompt 需要特殊处理：构造一个新的 prompt，包含 `原文` 和 `Step 1 的建议`。
        - 建议修改优化预设的 Prompt 模板支持一个新变量 `{{analysis}}`，或者在代码逻辑中将 `{{analysis}}` 自动追加到 `{{input}}` 后面。
        - 执行流式输出，更新章节内容。
- **分支 B (单阶段)**:
    - 保持原有逻辑不变。

### 步骤 4: 结果展示
- 在主界面（可能是“优化助手设置”弹窗外，或者正文区域附近）添加一个只读（或可编辑）的文本域，用于显示 `analysisResult`。
- 或者是优化开始时，自动清空该文本域。

## 4. 技术细节与风险
- **Prompt 变量**: 现有的优化预设可能没有 `{{analysis}}` 占位符。
    - **解决方案**: 在两阶段模式下，如果优化预设中没有 `{{analysis}}`，我们默认将分析结果追加到 `User Input` 中，格式如：`\n\n【AI 分析建议】：\n${analysisResult}`。
- **API 成本**: 两阶段优化会消耗双倍（甚至更多）的 Token，需在 UI 上提示用户。
- **状态同步**: 确保 `analysisPresets` 的增删改查逻辑与现有的 `outlinePresets` 等保持一致，复用现有函数（需做适当抽象或复制修改）。

## 5. 验收标准
1.  在“优化助手设置”中可以开启两阶段优化。
2.  开启后，可以配置“分析阶段”的 Prompt。
3.  点击“润色”按钮后，先看到 AI 生成分析建议（显示在指定文本框），随后正文开始流式更新。
4.  最终的正文内容应该是基于分析建议优化后的结果。

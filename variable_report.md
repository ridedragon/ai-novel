# 大纲UI变量报告

## 1. 组件 Props (`OutlineManagerProps`)

这些属性由父组件 (`App.tsx`) 传递给 `OutlineManager`，用于控制数据流和回调。

*   **核心数据**:
    *   `novel`: `Novel` 类型。包含当前小说的完整数据，如 `outlineSets` (大纲集列表), `characterSets` (角色集列表), `worldviewSets` (世界观集列表) 等。
    *   `activeOutlineSetId`: `string | null`。当前选中的大纲集 ID。

*   **核心操作**:
    *   `onSetActiveOutlineSetId`: `(id: string | null) => void`。切换当前大纲集。
    *   `onUpdateNovel`: `(updatedNovel: Novel) => void`。当大纲数据发生变化（如添加章节、修改大纲集名称）时调用，更新整个小说数据。

*   **自动写作控制**:
    *   `onStartAutoWrite`: `() => void`。启动自动写作流程。
    *   `isAutoWriting`: `boolean`。指示是否正在进行自动写作。
    *   `autoWriteStatus`: `string`。自动写作的当前状态文本（如"正在创作：第一章..."）。
    *   `onStopAutoWrite`: `() => void`。停止自动写作。
    *   `includeFullOutlineInAutoWrite`: `boolean`。自动写作配置：是否将完整大纲作为上下文。
    *   `setIncludeFullOutlineInAutoWrite`: `(val: boolean) => void`。设置上述配置。

*   **AI 辅助生成 (可选)**:
    *   `onGenerateOutline`: `() => void`。触发 AI 生成大纲。
    *   `isGenerating`: `boolean`。指示 AI 是否正在生成大纲。
    *   `userPrompt`: `string`。用户输入的 AI 生成提示词。
    *   `setUserPrompt`: `(val: string) => void`。更新用户提示词。
    *   `onShowSettings`: `() => void`。打开设置面板的回调。
    *   `modelName`: `string`。当前使用的 AI 模型名称，用于显示。

*   **UI 配置**:
    *   `sidebarHeader`: `React.ReactNode`。侧边栏顶部的自定义内容（通常用于放置导航或切换模块的按钮）。

## 2. 组件内部 State

这些状态仅在 `OutlineManager` 组件内部使用，用于控制 UI 交互。

*   **大纲集管理**:
    *   `newSetName`: `string`。用于新建大纲集时的输入框内容。
    *   `editingSetId`: `string | null`。当前正在重命名的大纲集 ID。
    *   `editSetName`: `string`。重命名时的临时名称输入。

*   **拖拽排序**:
    *   `draggedItemIndex`: `number | null`。当前正在被拖拽的章节索引。

*   **章节编辑**:
    *   `editingChapterIndex`: `number | null`。当前正在编辑（弹窗中）的章节索引。
    *   `editChapterTitle`: `string`。编辑弹窗中的标题输入。
    *   `editChapterSummary`: `string`。编辑弹窗中的摘要输入。

*   **移动端适配**:
    *   `isMobileListOpen`: `boolean`。在移动端视图下，侧边栏的大纲列表是否处于展开状态。

*   **确认弹窗**:
    *   `confirmState`: 对象。控制确认对话框的显示和内容。
        *   `isOpen`: `boolean`。
        *   `title`: `string`。
        *   `message`: `string`。
        *   `onConfirm`: `() => void`。

## 3. 衍生变量 (Derived)

*   `activeSet`: `OutlineSet | undefined`。根据 `novel` 和 `activeOutlineSetId` 计算得出的当前大纲集对象。

## 4. 建议新增变量 (用于修复需求)

为了实现"选择世界观和角色集发给大纲AI"的功能，建议在 Props 中添加以下变量：

*   `characterSets`: `CharacterSet[]` (可选，可直接从 `novel` 获取，也可以单独传)。
*   `worldviewSets`: `WorldviewSet[]` (可选，同上)。
*   `selectedCharacterSetId`: `string | null`。用于 AI 生成时参考的选中角色集 ID。
*   `setSelectedCharacterSetId`: `(id: string | null) => void`。
*   `selectedWorldviewSetId`: `string | null`。用于 AI 生成时参考的选中世界观集 ID。
*   `setSelectedWorldviewSetId`: `(id: string | null) => void`。

## 5. 新增组件 Props (`InspirationManagerProps`)

*   **核心数据**:
    *   `novel`: `Novel` 类型。包含当前小说的完整数据，新增了 `inspirationSets`。
    *   `activeInspirationSetId`: `string | null`。当前选中的灵感集 ID。

*   **核心操作**:
    *   `onSetActiveInspirationSetId`: `(id: string | null) => void`。切换当前灵感集。
    *   `onUpdateNovel`: `(updatedNovel: Novel) => void`。更新小说数据。

*   **AI 辅助生成**:
    *   `onGenerateInspiration`: `() => void`。触发 AI 生成灵感。
    *   `isGenerating`: `boolean`。
    *   `userPrompt`: `string`。
    *   `setUserPrompt`: `(val: string) => void`。
    *   `onStopGeneration`: `() => void`。
    *   `onShowSettings`: `() => void`。
    *   `modelName`: `string`。

*   **UI 配置**:
    *   `sidebarHeader`: `React.ReactNode`。

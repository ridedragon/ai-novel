# App.tsx 瘦身重构计划

## 1. 背景与目标

目前 [`src/App.tsx`](src/App.tsx) 文件已超过 10,000 行，包含了状态管理、业务逻辑、工具函数、常量定义以及复杂的 UI 渲染。这导致 AI 处理时容易出错，开发者维护困难。
**目标**：通过模块化重构，将 `App.tsx` 缩减至 500 行以内，提高代码可读性、可维护性和 AI 辅助编程的准确性。

---

## 2. 核心计划步骤

### 第一阶段：常量与工具函数抽取 (Constants & Utils)

- **目标**：将所有非 React 组件逻辑搬离 `App.tsx`。
- **具体操作**：
    1. **常量迁移**：将 `defaultInspirationPresets`, `defaultOutlinePresets`, `defaultCharacterPresets`, `defaultPrompts` 等所有默认预设和固定配置迁移至 [`src/constants/aiPresets.ts`](src/constants/aiPresets.ts)。
    2. **UI 工具函数**：将 `adjustColor`, `hexToRgb` 迁移至 [`src/utils/uiUtils.ts`](src/utils/uiUtils.ts)。
    3. **JSON 处理工具**：将 `sanitizeJsonString`, `sanitizeAndParseJson`, `safeParseJSONArray` 迁移至新文件 `src/utils/jsonUtils.ts`。
    4. **AI 辅助逻辑**：将 `buildWorldInfoMessages`, `buildReferenceContext`, `normalizeGeneratorResult`, `parseAnyNumber` 等迁移至 [`src/utils/aiHelpers.ts`](src/utils/aiHelpers.ts)。
    5. **章节处理逻辑**：将 `ensureChapterVersions` 等逻辑迁移至新的 `src/utils/chapterUtils.ts`。

### 第二阶段：状态管理 Hook 化 (Custom Hooks)

- **目标**：利用 React Hooks 封装状态和副作用，使 `App.tsx` 变成纯粹的业务编排层。
- **核心 Hook 设计**：
    1. **`useAppConfig`**：
        - 管理 API Key, Base URL, 主题色, 各类模型选择 (Model Selection)。
        - 处理与 `localStorage` 的同步。
        - 暴露配置更新接口。
    2. **`useNovelData` (最关键)**：
        - 管理 `novels` 列表、`activeNovelId`、`activeChapterId`。
        - 封装所有 CRUD 操作：`addChapter`, `deleteChapter`, `updateNovel`, `setChapters` 等。
        - 处理书籍切换时的内容加载 (`storage.loadNovelContent`)。
        - 封装“分卷找回 (Data Healing)”逻辑。
    3. **`useGeneratorPresets`**：
        - 管理大纲、角色、世界观等各类生成器的预设状态。
    4. **`useAutoWriteManager`**：
        - 封装 `autoWriteLoop` 及其相关的状态 (isLoading, isAutoWriting)。

### 第三阶段：复杂 Modal 组件化 (Component Extraction)

- **目标**：将 `App.tsx` 中巨大的弹窗 HTML 结构提取为独立组件。
- **待封装组件**：
  - `AdvancedSettingsModal`: 对话补全源设置。
  - `GeneratorSettingsModal`: 通用预设管理 (大纲/角色/世界观/优化/分析设置)。
  - `AutoWriteConfigModal`: 全自动创作前的分卷配置。
  - `RegexManagerModal`: 正则脚本管理。
  - `OutlineEditModal`: 章节大纲详情编辑。
  - `GlobalDialog`: 统一的确认/提示/输入弹窗。
  - `CreateNovelModal`: 创建新小说。
  - `AnalysisResultModal`: 展示本章 AI 分析结果。
  - `GeneratorPromptEditModal`: 预设中具体的提示词编辑弹窗。
  - `PresetNameModal`: 补全预设的重命名与另存为弹窗。
  - `RegexEditor`: 正则表达式的具体编辑面板。

### 特别任务：清理冗余内联代码
- **现状**：`App.tsx` 在 `!activeNovelId` (Dashboard模式) 和正常的 `return` 中重复定义了大量的 Modal HTML 结构，即使这些 Modal 已经被抽离成组件。
- **目标**：统一使用组件形式调用，删除所有 `App.tsx` 中的内联 Modal HTML（如 `GeneratorSettingsModal` 的内联部分）。

### 第四阶段：UI 布局解耦 (Layout Refactoring)

- **目标**：抽离侧边栏和主功能区域。
- **待封装组件**：
  - `AppSidebarLeft`: 章节列表、分卷管理。
  - `AppSidebarRight`: 世界观/角色/大纲预览与模块切换。
  - `AutomationDashboard`: 自动化中心的菜单面板。

### 第五阶段：App.tsx 最终重构

- **目标**：组装 Hook 和组件。
- **重构后的 App.tsx 结构示例**：

```tsx
function App() {
  const config = useAppConfig();
  const novelData = useNovelData();
  const generators = useGeneratorPresets();
  const autoWrite = useAutoWriteManager();

  return (
    <NovelEditorLayout
      sidebarLeft={<AppSidebarLeft {...novelData} />}
      sidebarRight={<AppSidebarRight {...novelData} />}
      headerLeft={<MainHeaderLeft {...novelData} />}
      // ...
    >
      {showOutline ? <AutomationDashboard /> : <ChapterEditor />}
      
      <GlobalModals />
    </NovelEditorLayout>
  );
}
```

---

## 3. 结果预期

1. **代码量**：`App.tsx` 从 10,000+ 行减少到 300-500 行左右。
2. **性能**：由于状态被切分到不同的 Hook 和 Context，减少了不必要的全局重绘。
3. **适配**：在拆分过程中，将统一检查并保留所有移动端的适配逻辑 (`isMobile`)。
4. **AI 友好**：每个文件职责单一，AI 可以更精准地理解和修改局部功能，不容易引入连锁 Bug。

## 4. 风险控制

- **不破坏功能**：每次拆分后进行全量测试，特别是“冷热分离”的加载逻辑。
- **数据安全**：严格保护版本历史逻辑，防止重构过程中出现“原文丢失”的情况。
- **手机端适配**：在抽取 UI 组件时，必须透传或正确处理 `isMobile` 和侧边栏开启状态。

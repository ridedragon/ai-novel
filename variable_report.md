# AI 小说创作助手 - 全量变量与函数分析报告

## 1. 全局状态管理 (`App.tsx`)

### 1.1 核心数据与持久化

* `novels`: `Novel[]`。应用的核心数据，包含所有小说及其章节、设定。
* `activeNovelId`: `string | null`。当前激活的小说 ID。
* `activeChapterId`: `number | null`。当前正在编辑器中显示的章节 ID。
* `themeColor`: `string`。用户自定义的主题色（十六进制）。

### 1.2 API 与模型路由

* `apiKey`, `baseUrl`: 基础 OpenAI 兼容接口配置。
* `model`: 默认通用模型。
* `outlineModel`, `characterModel`, `worldviewModel`, `inspirationModel`, `optimizeModel`, `analysisModel`: 针对不同创作阶段的专用模型路由。
* `modelList`: `string[]`。用户维护的可选模型下拉列表。

### 1.3 预设与脚本系统

* `outlinePresets` 等: `GeneratorPreset[]`。各模块的 AI 提示词链预设。
* `completionPresets`: `CompletionPreset[]`。正文生成的深度配置（包含温度、TopP、提示词组等）。
* `globalRegexScripts`: `RegexScript[]`。全局正则替换脚本，用于清洗 AI 输出或处理输入上下文。

### 1.4 自动化控制

* `longTextMode`: `boolean`。长文模式开关，决定是否使用总结作为上下文。
* `isAutoWriting`: `boolean`。全自动循环创作状态。
* `optimizationQueue`: `number[]`。待处理的自动润色章节队列。
* `optimizingChapterIds`: `Set<number>`。当前正在执行 AI 请求的章节集合。

---

## 2. 核心逻辑函数分析

### 2.1 AI 创作逻辑 (`App.tsx`)

* [`handleGenerate()`](src/App.tsx:4226): 核心生成函数。整合前文、世界观、角色卡，构建最终 Prompt 并处理流式返回。
* [`autoWriteLoop()`](src/App.tsx:3947): 递归创作函数。支持“连贯创作”，可一次性请求多章并自动处理章节分割。
* [`handleOptimize()`](src/App.tsx:3635): 润色函数。支持“两阶段模式”：先调用分析模型生成修改建议，再由优化模型执行重写。

### 2.2 上下文构建与处理

* [`getChapterContext()`](src/App.tsx:3494): 智能上下文提取。在长文模式下，它会按“大总结 -> 小总结 -> 邻近正文”的优先级构建上下文，以绕过 Token 限制。
* [`buildWorldInfoContext()`](src/App.tsx:214): 提取当前小说关联的角色档案和世界观设定，转化为 AI 可读的文本块。
* [`processTextWithRegex()`](src/App.tsx:1019): 管道函数。按顺序应用所有启用的正则脚本进行文本转换。

### 2.3 数据解析与标准化

* [`safeParseJSONArray()`](src/App.tsx:349): 鲁棒解析器。使用括号计数法从 AI 的自然语言回复中精准提取 JSON 数组，支持处理 Markdown 代码块。
* [`normalizeGeneratorResult()`](src/App.tsx:452): 结构映射器。将 AI 返回的模糊键名（如 `bio`/`description`）标准化为应用内部的 `CharacterItem` 等类型。

---

## 3. 工具类与管理器 (`src/utils/`)

### 3.1 存储管理器 (`storage.ts`)

* [`getNovels()`](src/utils/storage.ts:7): 异步获取数据。优先从 IndexedDB 读取，若无则从 localStorage 迁移并清理旧数据。
* [`saveNovels()`](src/utils/storage.ts:42): 将全量小说数据持久化到 IndexedDB。

### 3.2 总结管理器 (`SummaryManager.ts`)

* [`checkAndGenerateSummary()`](src/utils/SummaryManager.ts:27): 触发逻辑。根据章节索引和配置的间隔（如每3章一小结），自动调用 AI 生成剧情摘要。
* [`getStableContent()`](src/utils/SummaryManager.ts:15): 容错函数。当章节正文为空（如正在生成中）时，自动从版本历史中提取原文作为总结素材。

### 3.3 保活管理器 (`KeepAliveManager.ts`)

* [`enable()`](src/utils/KeepAliveManager.ts:15): 激活保活。通过循环播放 0.01 音量的静音音频并请求 `navigator.wakeLock`，防止移动端浏览器进入休眠导致 AI 请求中断。

---

## 4. 组件 Props 接口摘要

### 4.1 `OutlineManager` (大纲)

* `selectedCharacterSetId`: 联动变量。生成大纲时指定参考的角色集。
* `onRegenerateItem`: 局部重构。仅针对某一章节的大纲进行 AI 重新构思。

### 4.2 `CharacterManager` (角色)

* `selectedWorldviewSetId`: 联动变量。生成角色时指定参考的世界观背景。

### 4.3 `InspirationManager` (灵感)

* `onSendToModule`: 跨模块分发。将灵感碎片一键发送至大纲、角色或世界观模块作为生成提示词。

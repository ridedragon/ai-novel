# Chat History 显示不全问题分析与修复报告

## 1. 问题现象

用户反馈在“对话补全源”中的 `Chat History` 显示不全，通常只能看到当前章节的内容，无法看到同卷中之前的章节内容。

## 2. 原因分析

经过对 [`src/App.tsx`](src/App.tsx) 和 [`src/components/AIChatModal.tsx`](src/components/AIChatModal.tsx) 的代码审计，发现以下原因：

1. **逻辑实现偏差**：在 `handleGenerate` 函数中，`chat_history` 固定项被硬编码为仅包含 `activeChapter.content` 的末尾部分（`slice(-safeLimit)`），而忽略了通过 `getChapterContext` 获取的前文内容。
2. **上下文获取逻辑受限**：原有的 `getChapterContext` 在未开启长上下文模式时，仅在章节明确属于某个分卷时才尝试获取前文，且获取逻辑较为简单，未包含章节标题，导致 AI 难以区分章节界限。
3. **预览界面同步问题**：在“对话补全源”的编辑/查看弹窗中，预览逻辑与实际发送逻辑一致，因此也只显示了截断后的当前章节内容。
4. **AI 助手弹窗遗漏**：[`src/components/AIChatModal.tsx`](src/components/AIChatModal.tsx) 之前完全没有接收前文上下文的参数，仅发送了当前章节内容。

## 3. 修复方案

针对上述问题，进行了以下改进：

### 3.1 增强上下文获取逻辑 ([`src/App.tsx`](src/App.tsx))

- 修改 `getChapterContext`：在标准模式下，现在会获取当前章节之前的所有同卷章节（或同属于“未分卷”状态的章节）。
- 引入章节标题：每个章节内容前都增加了 `### 章节标题` 标识，方便 AI 理解结构。

### 3.2 统一 Chat History 发送逻辑 ([`src/App.tsx`](src/App.tsx))

- 在 `handleGenerate` 中，将 `chat_history` 的内容构造改为：`前文内容 + 当前章节内容`。
- 严格遵守用户设置的 `contextLength`（上下文长度），确保在内容过长时从末尾截断，保留最相关的近期信息。

### 3.3 修复预览与 AI 助手 ([`src/App.tsx`](src/App.tsx) & [`src/components/AIChatModal.tsx`](src/components/AIChatModal.tsx))

- 更新了 `PromptItem` 的预览逻辑，使其在查看 `Chat History` 时能看到完整的上下文（包括前文）。
- 为 `AIChatModal` 增加了 `context` 属性，使其在对话时也能感知到当前卷的全部前文信息。

## 4. 期望行为验证

- **未开启长上下文时**：发送当前正在创作卷的全部章节内容（受限于总上下文长度设置）。
- **开启长上下文模式时**：逻辑保持不变，发送经过总结压缩后的长上下文信息，确保逻辑一致性。
- **显示效果**：在“对话补全源”中查看 `Chat History` 时，现在可以看到从卷首开始的完整内容预览。

## 5. 结论

修复后的系统能够更好地利用已创作的内容作为上下文，显著提升 AI 续写和润色的连贯性。

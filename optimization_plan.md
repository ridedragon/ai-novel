# 自动优化功能并行化与体验改进方案

## 1. 现状分析

当前 `src/App.tsx` 中的 `autoWriteLoop` 函数负责自动化写作的流程控制。其核心逻辑如下：

1.  创建新章节或查找现有章节。
2.  **自动跳转**：调用 `setActiveChapterId(newChapterId)` 将界面切换到正在创作的章节。
3.  **生成内容**：调用 OpenAI API 生成章节正文。
4.  **生成总结**（如果开启长文模式）。
5.  **自动优化**（如果开启）：
    ```typescript
    if (autoOptimizeRef.current) {
         terminal.log(`[AutoWrite] Auto-optimizing chapter ${newChapterId}...`)
         await handleOptimize(newChapterId, finalGeneratedContent)
    }
    ```
    此处使用了 `await`，意味着必须等待优化请求完全结束（包括流式接收完毕），才会进入下一次循环。
6.  **递归下一章**：等待一段时间后，递归调用 `autoWriteLoop` 开始下一章。

这种方式导致了以下问题：
*   **串行阻塞**：优化的时间完全计入了总创作时间，显著降低了多章节生成的效率。
*   **强制跳转**：每次生成新章节都会强制切换视图，打断用户当前可能正在进行的阅读或编辑操作。

## 2. 改进建议与方案

### 2.1 实现 AI 优化与创作并行

**方案**：
在 `autoWriteLoop` 中，移除对 `handleOptimize` 的 `await` 等待。

**修改前**：
```typescript
if (autoOptimizeRef.current) {
     terminal.log(`[AutoWrite] Auto-optimizing chapter ${newChapterId}...`)
     await handleOptimize(newChapterId, finalGeneratedContent)
}
```

**修改后**：
```typescript
if (autoOptimizeRef.current) {
     terminal.log(`[AutoWrite] Auto-optimizing chapter ${newChapterId}...`)
     // 不使用 await，让其在后台执行
     // 添加 catch 以防止未捕获的 Promise 错误影响主流程（虽然 handleOptimize 内部已有 try-catch）
     handleOptimize(newChapterId, finalGeneratedContent).catch(err => {
         console.error("后台优化任务出错:", err);
     });
}
```

**可行性分析**：
*   **API 并发**：OpenAI API 支持并发请求。只要未达到账号的 Rate Limit（每分钟请求数/Token数限制），同时进行“创作下一章”和“优化上一章”是完全可行的。
*   **状态冲突**：
    *   “创作”操作的是 `newChapterId`（下一章）。
    *   “优化”操作的是 `currentChapterId`（当前刚完成的章）。
    *   两者操作不同的章节对象，且 `setChapters` 使用函数式更新（`prev => ...`），在 React 中是安全的。
*   **资源消耗**：浏览器的并发请求限制通常宽松（同域名 6 个，但 API 请求通常不受此严格限制或数量很少），对于 2 个并发请求完全无压力。

### 2.2 移除自动跳转功能

**方案**：
在 `autoWriteLoop` 中，删除或注释掉 `setActiveChapterId(newChapterId)`。

**修改前**：
```typescript
setActiveChapterId(newChapterId)
```

**修改后**：
```typescript
// setActiveChapterId(newChapterId) // 移除自动跳转，以免打扰用户
```

**可行性分析**：
*   **用户体验**：用户可以留在大纲页面看着进度条更新，或者停留在某一章进行精读，而后台自动生成后续章节。
*   **进度反馈**：现有的 `autoWriteStatus` 状态已经在大纲界面提供了“正在创作第 X 章...”的文本反馈，因此移除跳转不会导致用户不知道当前进度。

## 3. 潜在风险与对策

1.  **API Rate Limit**：
    *   **风险**：并发请求会瞬间增加 Token 消耗速率。
    *   **对策**：如果遇到 Rate Limit 错误，API 通常会返回 429。目前的 `handleOptimize` 和 `autoWriteLoop` 都有重试机制，但在并发情况下可能需要更稳健的退避策略。目前先维持现有重试逻辑，通常足够应对。

2.  **错误反馈**：
    *   **风险**：后台优化的错误可能不会明显弹窗提示（因为主流程已经继续了）。
    *   **对策**：`handleOptimize` 内部会将错误输出到 `terminal.log` 或 `terminal.error`，用户可以在控制台看到，不会悄无声息地失败。

## 4. 实施计划

1.  修改 `src/App.tsx` 中的 `autoWriteLoop` 函数。
2.  移除 `setActiveChapterId(newChapterId)` 的调用。
3.  移除调用 `handleOptimize` 时的 `await` 关键字。
4.  测试自动写作流程，验证：
    *   创作是否不再等待优化完成即可开始下一章。
    *   页面是否不再自动跳转。
    *   优化内容是否在后台正确生成并更新到对应章节。

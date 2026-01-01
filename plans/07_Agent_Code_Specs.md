# Agent 代码实现细节规范 (Implementation Specs)

## 1. 导演 Agent (Director)
**职责**: 全局规划，生成章节创作清单 (Manifest)。

### 1.1 输出结构 (JSON)
```typescript
interface ChapterManifestItem {
    id: string;
    title: string;
    focus: string; // 创作侧重点
    keyEvents: string[]; // 必须包含的事件
    wordCountTarget: number; // 目标字数
    characterFocus: string[]; // 重点涉及角色
}
```

### 1.2 系统 Prompt 片段
> "你是一位经验丰富的网文主编。请根据当前的大纲、世界观和角色设定，将后续创作拆分为详细的章节执行清单。输出必须是合法的 JSON 格式，严禁任何解释性文字。"

---

## 2. 作家 Agent (Writer)
**职责**: 具体的文学创作。

### 2.1 上下文构造逻辑 (`src/utils/AgentContextBuilder.ts`)
1.  **全局信息**: 世界观前 10 条、所有核心角色。
2.  **局部信息**: 当前章节的任务清单、前两章的精简摘要（由 `SummaryManager.ts` 提供）。
3.  **约束控制**: “严禁写摘要，严禁使用‘总之’作为结尾”。

### 2.2 工具调用行为
如果在描写过程中发现需要新增设定，必须使用：
`[ACTION:ADD_WORLDVIEW]{"item":"物品名", "setting":"设定描述"}[/ACTION]`

---

## 3. 质检 Agent (Reviewer)
**职责**: 质量把控，防止 AI “偷懒”。

### 3.1 校验逻辑 (Pipeline)
1.  **字数校验**: `actualCount < targetCount * 0.7` -> 判定为“太短”，触发扩写。
2.  **黑名单校验**: 匹配 `["总之", "综上所述", "他们决定", "最后，"]` 等大纲式词汇。
3.  **冲突校验**: 调用 LLM 判断当前章节是否违背了 `Shadow Copy` 中的角色性格。

---

## 4. 核心调度器 (AgentCore)
**职责**: 维护状态机，管理任务队列。

### 4.1 核心状态机 (States)
- `IDLE`: 空闲
- `PLANNING`: 导演规划中
- `AWAITING_USER`: 等待用户确认清单
- `WRITING`: 创作中
- `REVIEWING`: 质检中
- `PAUSED`: 因错误或用户操作暂停

### 4.2 错误处理 (Error Handling)
```typescript
const MAX_RETRY = 3;
if (reviewFailed && retryCount < MAX_RETRY) {
    // 增加引导性 Prompt，要求 Agent 针对错误点重写
    dispatchNextTask({ type: 'REWRITE', reason: reviewResult.errors });
} else if (retryCount >= MAX_RETRY) {
    // 强制暂停，请求人工干预
    updateState('PAUSED', { message: '连续多次质检未通过，请手动调整 Prompt 或大纲' });
}
```

---

## 5. UI 集成计划 (`src/components/AgentControlPanel.tsx`)
- **进度条**: 显示 `(当前章节 / 总章节)`。
- **操作日志**: 滚动显示 Agent 的思考过程（例如：“[质检] 字数达标，正在进行逻辑审查...”）。
- **紧急刹车**: `onClick={() => agentCore.stop()}`。

---

## 6. 文件创建路线图 (Implementation Steps)

1.  **Step 1**: 创建 `src/utils/AgentParser.ts` (基础工具)。
2.  **Step 2**: 扩展 `src/types.ts` 增加 `AgentState` 和 `Manifest` 定义。
3.  **Step 3**: 创建 `src/utils/AgentCore.ts` (核心逻辑)。
4.  **Step 4**: 在 `src/components/` 下创建控制面板组件。
5.  **Step 5**: 在 `App.tsx` 中集成，并在全自动按钮点击处启动。
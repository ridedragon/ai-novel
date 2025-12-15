# 多章节并发优化功能实现计划

## 1. 现状分析
当前系统使用全局单一状态控制章节优化功能：
- **状态变量**：`isOptimizing` (boolean) 控制是否处于优化状态。
- **控制器**：`optimizeAbortControllerRef` (useRef<AbortController>) 存储全局唯一的取消控制器。
- **限制**：这就导致了同一时间只能优化一个章节。当用户切换到其他章节时，如果之前的优化未完成，无法在新章节启动优化，且全局 UI 状态会显示为“正在优化”。

## 2. 目标
实现多章节并发优化支持：
1. 允许用户在章节 A 正在优化的同时，切换到章节 B 并启动优化。
2. 互不干扰：章节 A 的优化进度和取消操作不应影响章节 B。
3. UI 独立：每个章节的工具栏应独立显示该章节的优化状态（润色/停止）。

## 3. 核心修改方案

### 3.1 状态管理重构
将全局的布尔值状态改为基于 ID 的集合管理。

- **`isOptimizing`**: 修改为 `optimizingChapterIds` (Set<number> 或 Array<number>)。
  - 用于 React 渲染层判断哪些章节正在优化中。
- **`optimizeAbortControllerRef`**: 修改为 `optimizeAbortControllersRef` (useRef<Map<number, AbortController>>)。
  - 用于存储每个正在优化的章节对应的 AbortController，以便单独取消。

### 3.2 `handleOptimize` 函数重构
- **入参**：确保支持 `targetId`。
- **前置检查**：检查目标 ID 是否已在 `optimizingChapterIds` 中。
- **控制器管理**：
  - 创建新的 `AbortController`。
  - 将其存入 `optimizeAbortControllersRef.current.set(targetId, controller)`。
- **状态更新**：
  - 将 `targetId` 加入 `optimizingChapterIds`。
- **错误处理与清理**：
  - 无论成功或失败（包括 Abort），在 `finally` 或结束时从 `optimizingChapterIds` 和 `optimizeAbortControllersRef` 中移除该 ID。

### 3.3 UI 组件更新
- **工具栏按钮**：
  - 判断当前 `activeChapterId` 是否存在于 `optimizingChapterIds` 中。
  - 如果在：显示“停止”按钮，点击触发针对该 ID 的停止逻辑。
  - 如果不在：显示“润色”按钮。
- **停止逻辑**：
  - 新增或修改停止函数，根据 `activeChapterId` 从 Map 中取出对应的 Controller 并调用 `.abort()`。

## 4. 实施步骤

### 4.1 修改状态定义
在 `App` 组件中：
```typescript
// 旧
// const [isOptimizing, setIsOptimizing] = useState(false)
// const optimizeAbortControllerRef = useRef<AbortController | null>(null)

// 新
const [optimizingChapterIds, setOptimizingChapterIds] = useState<Set<number>>(new Set())
const optimizeAbortControllersRef = useRef<Map<number, AbortController>>(new Map())
```

### 4.2 重构 `handleOptimize`
- 修改逻辑以支持并发。
- 注意处理 `setOptimizingChapterIds` 的状态更新（创建新的 Set 触发重渲染）。

### 4.3 封装停止函数
- 创建 `handleStopOptimize(chapterId: number)` 函数。

### 4.4 更新 JSX 渲染
- 找到“润色/停止”按钮区域。
- 将 `isOptimizing` 判断改为 `optimizingChapterIds.has(activeChapterId)`。
- 更新点击事件。

## 5. 验证计划
1. 在章节 A 点击“润色”。
2. 立即切换到章节 B，点击“润色”。
3. 观察控制台日志，确认两个请求都在进行。
4. 尝试在章节 A 点击“停止”，确认章节 B 继续运行。
5. 确认章节 B 完成后内容正确更新。

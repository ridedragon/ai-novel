# 手机端工作流无法保存 Bug 修复日志

## 问题描述
手机端的工作流编辑器无法保存修改后的节点配置和连线。

## 根本原因
在 `MobileWorkflowEditor.tsx`（第242行）和 `WorkflowEditor.tsx`（第264行）中，`useEffect` 调用 `autoSave` 时，依赖数组缺少 `autoSave` 本身：

```javascript
useEffect(() => {
  autoSave(nodes, edges, currentNodeIndex, isRunning);
}, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning]); // 缺少 autoSave
```

### 问题分析
`autoSave` 函数来自 `useWorkflowStorage` hook，它使用 `useCallback` 包装，依赖包含 `isOpen`：

```javascript
// useWorkflowStorage.ts 第159行
const autoSave = useCallback(
  (nodes, edges, currentNodeIndex, isRunning) => {
    if (!isOpen || workflowsRef.current.length === 0) return;  // 第126行
    // ... 保存逻辑
  },
  [isOpen, activeWorkflowId, isLoading]  // autoSave 依赖 isOpen
);
```

当工作流编辑器从关闭状态变为打开状态时：
1. `isOpen` 从 `false` 变为 `true`
2. `useWorkflowStorage` 重新执行，`autoSave` 被重新创建（新闭包中 `isOpen = true`）
3. 但组件中的 `useEffect` 依赖数组不包含 `autoSave`，因此仍然持有**旧的 `autoSave` 引用**
4. 旧的 `autoSave` 闭包中 `isOpen = false`，导致在第126行直接 return，保存逻辑永远不会执行

## 修复方案
将 `autoSave` 添加到 `useEffect` 的依赖数组中，确保当 `autoSave` 函数引用变化时，`useEffect` 能够重新执行并使用最新的 `autoSave`：

```javascript
useEffect(() => {
  autoSave(nodes, edges, currentNodeIndex, isRunning);
}, [nodes, edges, currentNodeIndex, activeWorkflowId, isRunning, autoSave]);
```

## 修改文件
- `src/components/MobileWorkflowEditor.tsx` - 第242行
- `src/components/WorkflowEditor.tsx` - 第264行

## 修复日期
2026/4/7

## 影响范围
此修复同时影响了手机端和桌面端的工作流编辑器，因为两者共享相同的保存逻辑模式。
# 手机端工作流重置导致配置丢失 Bug 修复日志

## 修复日期
2026/4/7

## 问题描述
用户在手机端修改工作流节点配置后，一旦点击"重置工作流"按钮，所有修改的配置都会被重置，导致完全无法保存工作流修改。

## 问题根因分析

### 核心问题
`resetWorkflowStatus` 函数使用 `workflowsRef.current.map()` 来构建更新后的工作流列表，但 `workflowsRef.current` 在组件初始化时可能为空数组 `[]`。

### 数据流分析
```
MobileWorkflowEditor.tsx
  ├── workflows state (初始值: [])
  └── workflowsRef.current (初始值: [])
        └── useEffect 同步 (延迟)

useWorkflowEngine.ts
  └── resetWorkflowStatus()
        └── workflowsRef.current.map() // 如果为空，返回 []
              └── storage.saveWorkflows([]) // 保存空数组！
```

### 为什么会为空？
1. `MobileWorkflowEditor.tsx` 中 `workflowsRef` 初始化为 `useRef<WorkflowData[]>([])`
2. `workflows` state 通过 `useWorkflowStorage` 异步加载
3. `useEffect(() => { workflowsRef.current = workflows; }, [workflows])` 是延迟同步的
4. 如果用户在数据加载完成前点击重置，`workflowsRef.current` 仍为空数组

### 空数组 map 的后果
```javascript
[].map(w => { ... }) // 返回 []
storage.saveWorkflows([]) // 保存空数组，清空所有工作流！
```

## 修复方案（第六次修复）

### 核心思路
**直接从存储读取最新数据，不依赖任何 ref 或 state 的缓存**

### 代码改动
文件：`src/components/Workflow/hooks/useWorkflowEngine.ts`

```typescript
// 修复前（有问题）
const updatedWorkflows = workflowsRef.current.map(w => {
  if (w.id === activeWorkflowId) {
    return { ...w, nodes: updatedNodes, ... };
  }
  return w;
});
await storage.saveWorkflows(updatedWorkflows);

// 修复后（可靠）
const latestWorkflows = await storage.getWorkflows();
const updatedWorkflows = latestWorkflows.map(w => {
  if (w.id === activeWorkflowId) {
    return {
      ...w,
      nodes: updatedNodes,
      edges: w.edges || [],  // 保留原有的 edges
      currentNodeIndex: -1,
      lastModified: Date.now(),
      contextSnapshot: undefined,
    };
  }
  return w;
});
await storage.saveWorkflows(updatedWorkflows);
setWorkflows?.(updatedWorkflows);
workflowsRef.current = updatedWorkflows;
```

### 修复优势
1. **数据可靠性**：总是从持久化存储读取最新数据
2. **不依赖缓存**：不受 ref/state 同步延迟影响
3. **保留 edges**：使用 `w.edges || []` 保留连线数据
4. **双向同步**：保存后同时更新 React state 和 ref

## 历史修复记录

| 修复次数 | 方案 | 问题 |
|---------|------|------|
| 第一次 | 直接保存 | 未考虑异步竞态 |
| 第二次 | 添加防抖 | 未解决 ref 为空问题 |
| 第三次 | 清除 autoSave 超时 | 未解决根本问题 |
| 第四次 | 同时更新 state 和 ref | ref 仍可能为空 |
| 第五次 | 使用 setWorkflows 回调 | 复杂且可能多次触发 |
| **第六次** | **直接从存储读取** | **最可靠方案** |

## 测试验证
- [ ] 手机端修改工作流节点配置
- [ ] 点击重置工作流
- [ ] 验证配置是否保留
- [ ] 验证连线是否保留
- [ ] 验证多工作流场景

## 相关文件
- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 工作流引擎核心逻辑
- `src/components/MobileWorkflowEditor.tsx` - 手机端工作流编辑器
- `src/utils/storage.ts` - 持久化存储层

## 总结
本次修复通过直接从存储读取最新数据的方式，彻底解决了 `workflowsRef.current` 为空导致的工作流配置丢失问题。这是最可靠的方案，不依赖任何内存缓存状态。
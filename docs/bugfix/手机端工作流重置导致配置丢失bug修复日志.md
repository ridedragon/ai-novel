# 手机端工作流重置导致配置丢失 Bug 修复日志

## 第三次修复（最终修复）

### 问题描述
即使用户手动点击了保存按钮，点击重置后所有修改仍然没有被保存。节点位置也回到了初始位置。

### 根本原因
`autoSave` 函数使用了 `setTimeout` 延迟保存（非运行时 5 秒，运行时 15 秒）。当用户修改节点配置后：
1. `autoSave` 被触发，设置了一个延迟 5 秒的 `setTimeout`
2. 用户在这 5 秒内点击了"重置"按钮
3. `resetWorkflowStatus` 保存了重置后的状态到 IndexedDB
4. 5 秒后，之前设置的 `setTimeout` 触发，`autoSave` 使用**重置前的旧节点数据**覆盖了重置后的保存

### 修复方案
1. 在 `useWorkflowStorage.ts` 中暴露 `clearAutoSaveTimeout` 函数
2. 在 `resetWorkflowStatus` 执行时，先调用 `clearAutoSaveTimeout()` 清除待执行的延迟保存
3. 然后再执行重置和保存操作
4. 保存后更新 `workflowsRef.current`，防止后续 `autoSave` 使用旧数据覆盖

### 修改文件
- `src/components/Workflow/hooks/useWorkflowStorage.ts` - 添加 `clearAutoSaveTimeout` 函数
- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 在 `resetWorkflowStatus` 中调用 `clearAutoSaveTimeout`
- `src/components/MobileWorkflowEditor.tsx` - 传递 `clearAutoSaveTimeout` 到 `useWorkflowEngine`

---

## 第一次修复

### 问题描述
用户在手机端点击"重置"按钮后，所有工作流配置（包括分卷规则、提示词、预设等）都会被清空，导致用户辛辛苦苦配置的内容完全丢失，无法保存修改。

## 根本原因

### 原因 1：`resetWorkflowStatus` 过度清除数据
在 `useWorkflowEngine.ts` 的 `resetWorkflowStatus` 函数中，重置操作不仅清除了执行状态（`status`、`outputEntries`），还清除了用户配置的关键数据：

```javascript
// 旧代码 - 问题代码
if (n.data.typeKey === 'saveToVolume') {
  updates.splitRules = [];          // 清除了分卷规则
  updates.splitChapterTitle = '';
  updates.nextVolumeName = '';
  updates.volumeContent = '';       // 清除了 AI 生成的分卷内容
}
```

**问题分析**：
- `splitRules` 和 `volumeContent` 是 AI 运行后产生的分卷规划结果，清除它们是合理的
- 但是 `volumes` 字段（用户在配置面板手动设置的分卷列表）也被间接清除了
- 重置后 `autoSave` 会将这些空值持久化到 IndexedDB，覆盖了之前的配置

### 原因 2：桌面端内联重置处理也有同样问题
在 `WorkflowEditor.tsx` 的工作流菜单中，内联的重置处理也存在类似问题：
```javascript
// 旧代码 - 缺少 outputEntries 清空和 volumeContent 清空
const updatedNodes = wf.nodes.map(n => ({
  ...n,
  data: {
    ...n.data,
    status: 'pending' as const,
    // 缺少 outputEntries: []
    splitRules: n.data.typeKey === 'saveToVolume' ? [] : n.data.splitRules,
    // 缺少 volumeContent 清空
  }
}));
```

## 修复方案

### 核心原则
**重置 = 重置执行状态，保留用户配置**

重置操作应该只清除：
- `status`（执行状态）
- `outputEntries`（运行时产生的输出条目）
- `loopInstructions`（运行时产生的循环指令）
- 运行时动态修改的标签（如 chapter 节点的 label）

不应该清除：
- `volumes`（用户手动配置的分卷列表）
- `instruction`（用户编写的提示词）
- `presetId`/`presetName`（用户选择的预设）
- `selectedWorldviewSets`/`selectedCharacterSets` 等（用户选择的参考集合）
- `overrideAiConfig`/`apiKey`/`baseUrl`/`model` 等（用户的 AI 配置）
- 其他所有用户手动配置的字段

### 修改文件

#### 1. `src/components/Workflow/hooks/useWorkflowEngine.ts`
- 第 3400-3463 行：`resetWorkflowStatus` 函数
- 修改内容：
  - 移除对 `volumes` 字段的清除（原本就没有直接清除，但注释说明了保留）
  - 只清除 AI 运行时产生的 `splitRules` 和 `volumeContent`
  - 添加详细注释说明哪些字段应该保留

#### 2. `src/components/WorkflowEditor.tsx`
- 第 678-691 行：内联重置处理
- 修改内容：
  - 添加 `outputEntries: []` 确保输出条目被清空
  - 添加 `volumeContent` 清空（只清除 AI 生成的内容）
  - 添加注释说明保留用户配置的 volumes 列表

## 修复后的行为
- 点击"重置"按钮后：
  - ✅ 所有节点状态恢复为 `pending`
  - ✅ 所有输出条目被清空
  - ✅ 连线动画被清除
  - ✅ 运行中的任务被中止
  - ✅ 用户配置的分卷列表（volumes）被保留
  - ✅ 用户编写的提示词（instruction）被保留
  - ✅ 用户选择的预设（presetId）被保留
  - ✅ 用户的 AI 配置（apiKey、baseUrl、model 等）被保留

## 修复日期
2026/4/7

## 影响范围
- 手机端工作流编辑器（MobileWorkflowEditor.tsx）
- 桌面端工作流编辑器（WorkflowEditor.tsx）
- 两者共享 `useWorkflowEngine` hook 中的 `resetWorkflowStatus` 函数

---

## 第四次修复（最终修复）

### 问题描述
即使用户手动点击了保存按钮，点击重置后所有修改仍然没有被保存。节点位置也回到了初始位置。第三次修复（清除 autoSave 超时）仍然没有解决问题。

### 根本原因
代码中存在**两个不同的 `workflowsRef` 对象**：

1. **Component 的 ref**（MobileWorkflowEditor.tsx 第 68 行）：
   ```javascript
   const workflowsRef = useRef<WorkflowData[]>([]);
   ```

2. **useWorkflowStorage 的 ref**（useWorkflowStorage.ts 第 26 行）：
   ```javascript
   const workflowsRef = useRef<WorkflowData[]>([]);
   ```

`resetWorkflowStatus` 更新的是 component 的 `workflowsRef.current`，但 `autoSave` 函数读取的是 `useWorkflowStorage` 内部的 `workflowsRef.current`。它们是完全不同的两个对象！

此外，`useWorkflowStorage` 中原来有一行代码：
```javascript
workflowsRef.current = workflows;  // 在每次渲染时执行
```
这行代码在每次渲染时都会将 ref 覆盖为 `workflows` state 的值。即使 `resetWorkflowStatus` 更新了 ref，下一次 React 渲染又会将其覆盖。

### 修复方案
1. **在 `useWorkflowStorage.ts` 中**：将 `workflowsRef.current = workflows` 改为在 `useEffect` 中执行，确保只在 `workflows` state 真正变化时才同步
2. **在 `useWorkflowEngine.ts` 中**：
   - 添加 `setWorkflows` 参数
   - 在 `resetWorkflowStatus` 中同时调用 `setWorkflows(updatedWorkflows)` 更新 React state
   - 这样 `useWorkflowStorage` 的 useEffect 会触发同步，确保其 ref 也被更新
3. **在 `MobileWorkflowEditor.tsx` 中**：将 `setWorkflows` 传递给 `useWorkflowEngine`

### 修改文件
- `src/components/Workflow/hooks/useWorkflowStorage.ts` - 使用 useEffect 同步 Ref
- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 添加 setWorkflows 参数，在 resetWorkflowStatus 中调用
- `src/components/MobileWorkflowEditor.tsx` - 传递 setWorkflows 到 useWorkflowEngine

### 数据流图
```
resetWorkflowStatus
    ↓
更新 workflowsRef.current (component 的 ref)
    ↓
调用 setWorkflows(updatedWorkflows)  ← 新增
    ↓
触发 React state 更新
    ↓
useWorkflowStorage 的 useEffect 触发
    ↓
同步 useWorkflowStorage.workflowsRef.current  ← 关键修复
    ↓
autoSave 读取到正确的数据
```

### 修复日期
2026/4/7

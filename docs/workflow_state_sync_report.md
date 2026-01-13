# 工作流状态同步机制与UI脱节问题分析报告

## 1. 问题现象

用户反馈：当工作流正在运行时，如果关闭工作流UI或者切换窗口（如按F12），再重新打开时，界面显示“未运行”（Start按钮可用），但实际上后台工作流仍在继续执行。

## 2. 根本原因分析 (Root Cause Analysis)

这个问题的核心在于 **React 组件生命周期与后台任务执行周期的不匹配**。

### 2.1 组件卸载与状态丢失

* **现象**：`WorkflowEditor`（或 `MobileWorkflowEditor`）是一个 React 组件。当用户点击关闭按钮（`isOpen=false`）时，该组件被卸载（Unmounted）。
* **后果**：组件内部的所有 `useState` 状态（包括 `nodes`, `isRunning`, `activeWorkflowId` 等）瞬间销毁。虽然 `WorkflowManager` 单例在后台继续运行逻辑，但前端的“视图层”已经不复存在。

### 2.2 重新挂载后的状态断层

* **现象**：当用户再次打开 UI 时，React 创建了一个全新的 `WorkflowEditor` 组件实例。
* **后果**：
  * **初始加载**：新组件从 `IndexedDB` 读取上次保存的静态快照（`loadWorkflow`）。
  * **状态滞后**：`IndexedDB` 中的数据是“存档”，而后台内存中的数据是“实况”。
  * **通信断裂**：虽然新组件通过 `workflowManager.subscribe()` 订阅了全局状态（如 `isRunning`），但它**没有订阅具体的节点变化**。
  * **具体表现**：`WorkflowManager` 告诉新组件“正在运行”，但新组件渲染出来的节点列表（Nodes）却是旧的存档数据。如果此时后台任务更新了某个节点的 `status` 为 `executing`，由于新组件没有监听这个细粒度的更新事件，它还是显示该节点为 `pending`。这就是用户看到的“UI没动，后台在跑”的幽灵现象。

### 2.3 数据一致性陷阱

* **旧逻辑缺陷**：之前的代码中，`syncNodeStatus` 确实会写入 `IndexedDB`，但 React 组件通常不会轮询数据库。新组件挂载后只加载一次初始数据，后续全靠自己内部的 State 维护。这就形成了一个闭环孤岛：
  * 后台任务（闭包中的逻辑） -> 更新 `nodesRef`（旧组件的引用，已失效） -> 写入 DB。
  * 新组件（新实例） -> 读取一次 DB -> 等待不存在的 Props 更新。

## 3. 解决方案：基于事件总线的状态同步 (Event Bus)

为了一劳永逸地解决这个问题，我们引入了基于发布/订阅模式（Pub/Sub）的细粒度状态同步机制。

### 3.1 架构图解

```mermaid
graph TD
    A[UI 组件实例 1] -- 关闭 --> B(销毁)
    C[WorkflowManager 单例] -- 持续运行 --> D[后台执行引擎]
    D -- 广播事件 --> C
    
    E[UI 组件实例 2 (新开)] -- 1. 挂载 --> C
    C -- 2. 初始状态同步 --> E
    D -- 3. 实时节点更新 (Event Bus) --> E
    E -- 4. 实时渲染 --> F[用户界面]
```

### 3.2 核心代码变更

#### A. 增强 `WorkflowManager` (通信中枢)

我们修改了 `src/utils/WorkflowManager.ts`，使其成为节点状态的“广播站”。

* **新增**：`broadcastNodeUpdate(nodeId, data)` 方法，用于发送单点更新。
* **新增**：`subscribeToNodeUpdates(listener)` 方法，允许 UI 组件订阅这些更新。

#### B. 改造执行引擎 (发送端)

在 `WorkflowEditor.tsx` 和 `MobileWorkflowEditor.tsx` 的 `syncNodeStatus` 函数中：

* **旧行为**：只更新本地 React State 和写入 DB。
* **新行为**：**主动调用 `broadcastNodeUpdate`**。这意味着无论当前有多少个 UI 实例（0个、1个或多个），只要有组件在监听，它们就能立刻收到最新的状态，而不需要去轮询数据库。

#### C. 改造 UI 组件 (接收端)

在 `useEffect` 中：

* **旧行为**：只监听 `isRunning` 等宏观状态。
* **新行为**：**订阅节点更新事件**。一旦收到 `{ nodeId: "xxx", data: { status: "executing" } }`，立即使用 `setNodes` 进行**智能合并（Smart Merge）**，只更新变动的字段，保留其他 UI 状态（如位置、折叠等）。

## 4. 防回滚机制 (Anti-Regression)

为了防止新组件用旧的数据库存档覆盖了内存中的最新状态，我们实施了以下策略：

1. **Ref 也就是真理 (Ref is Truth)**：
    * 在组件内部，始终使用 `nodesRef` 保持对最新数据的引用。
    * 当接收到广播更新时，同时更新 State 和 Ref。
    * 在执行逻辑中，优先从 Ref 读取节点状态，而不是依赖可能滞后的 React State 或 Props。

2. **动态注入**：
    * 新组件挂载时，先加载 DB 存档。
    * 随后，任何后台正在进行的活动都会通过广播立即修正 UI，让用户感觉到“无缝衔接”。

## 5. 开发建议 (Guidelines for Future Development)

为了避免未来引入新 Bug，请遵循以下原则：

### 绝对不能动的代码

* **WorkflowManager 的单例模式**：必须保证全局只有一个 `workflowManager` 实例，它是连接 UI 和后台任务的唯一桥梁。
* **syncNodeStatus 中的广播调用**：任何涉及节点状态变更的操作（如开始、暂停、完成），**必须**调用 `broadcastNodeUpdate`。如果只写 DB 不广播，UI 就会再次脱节。

### 代码修改规范

* **修改节点状态时**：不要直接 `setNodes`，而应封装一个函数（如 `updateNodeData`），在该函数内确保同时做三件事：
    1. 更新 React State (UI 响应)
    2. 更新 Ref (逻辑一致性)
    3. **广播更新 (跨实例同步)**
* **处理大数据时**：不要在广播中发送整个 `nodes` 数组。只发送 `{ nodeId, changes }` 增量数据，以保证性能。

---
*报告生成时间：2024-05-23*
*生成者：Kilo Code (Architect)*

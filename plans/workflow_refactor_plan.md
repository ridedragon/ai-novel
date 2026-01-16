# 工作流编辑器 (WorkflowEditor) 重构计划书

## 1. 背景与目标

目前 [`src/components/WorkflowEditor.tsx`](src/components/WorkflowEditor.tsx) (~5120行) 和 [`src/components/MobileWorkflowEditor.tsx`](src/components/MobileWorkflowEditor.tsx) (~3846行) 文件体积过大，包含大量重复的逻辑。

**核心架构决策：共用核心，独立 UI (Single Core, Dual UI)**（以PC端为标注）
手机端和电脑端的工作流执行逻辑**完全可以且必须**合并共用一套代码。两者的差异仅在于页面布局、交互方式（拖拽 vs 列表）以及部分 UI 控件的展现形式。

**重构目标：**

- **统一逻辑层**：将数千行的执行引擎（`runWorkflow`）、状态同步（`syncNodeStatus`）、存储管理、布局算法全部抽离为通用的 Hooks。
- **完全同步**：确保 PC 端修复的 Bug 或新增的功能（如循环、变量绑定、分卷自动切换）在手机端立即可用，反之亦然。
- **极致解耦**：将大型 TSX 文件拆分为逻辑清晰的 Hooks、常量、工具函数和小型 UI 组件。

## 2. 拟定的目录结构

建议在 `src/components/Workflow/` 目录下进行组织：

```text
src/components/Workflow/
├── components/             # UI 子组件
│   ├── WorkflowNode.tsx    # 基础节点组件 (响应式壳)
│   ├── WorkflowEdge.tsx    # 科技感连线组件
│   ├── NodeProperties/     # 节点属性编辑界面
│   │   ├── DesktopPanel.tsx
│   │   └── MobilePanel.tsx
│   └── Shared/             # 通用小组件 (OptimizedInput等)
├── hooks/                  # 核心逻辑 (两端共用)
│   ├── useWorkflowEngine.ts  # 执行引擎 (大脑)
│   ├── useWorkflowStorage.ts # 存储管理
│   └── useWorkflowLayout.ts  # 布局与排序算法
├── utils/                  # 工具函数
│   └── workflowHelpers.ts  # 数字解析、JSON 清理等
├── constants.ts            # 共享常量 (NODE_CONFIGS, DSL_PROMPT)
├── types.ts                # 统一类型定义
├── WorkflowEditor.tsx      # PC 端主入口 (ReactFlow 配置 + PC 布局)
└── MobileWorkflowEditor.tsx # 移动端主入口 (ReactFlow 配置 + 列表交互布局)
```

## 3. 详细分离步骤 (逻辑共用方案)

### 第一阶段：基础设施抽离 (共享数据与工具)

1. **共享常量** ([`src/components/Workflow/constants.ts`](src/components/Workflow/constants.ts)):
    - 统一 `NODE_CONFIGS`（包含颜色、图标、默认标签）。
    - 统一 `WORKFLOW_DSL_PROMPT`（AI 架构师指令）。
2. **共享工具** ([`src/components/Workflow/utils/workflowHelpers.ts`](src/components/Workflow/utils/workflowHelpers.ts)):
    - 统一数字解析 (`parseAnyNumber`)、章节提取逻辑。
    - 统一鲁棒的 `cleanAndParseJSON` 异步解析逻辑（解决手机端性能卡顿的关键）。

### 第二阶段：核心 Logic Hook 抽取 (大脑共用)

1. **`useWorkflowEngine.ts` (执行中枢)**:
    - **完全共用代码**：封装 `runWorkflow`, `stopWorkflow`, `resumeWorkflow` 及其内部庞大的 `for` 循环。
    - **职责**：处理 AI 调用、分卷自动检测、循环回跳逻辑、变量绑定、`AutoWriteEngine` 的驱动。
    - **UI 通信**：通过回调函数（如 `onStatusChange`, `onNodeUpdate`）与 UI 层通信。
2. **`useWorkflowStorage.ts` (存储中枢)**:
    - **完全共用代码**：封装 `IndexedDB` 持久化逻辑、自动保存（AutoSave）防抖逻辑、导入/导出文件逻辑。
3. **`useWorkflowLayout.ts` (布局中枢)**:
    - **算法共用**：核心的拓扑排序算法完全共用。
    - **模式切换**：针对 PC (Grid 布局) 和 Mobile (垂直单列布局) 提供不同的坐标计算逻辑。

### 第三阶段：组件化抽离 (表现层分离)

1. **`WorkflowEdge.tsx`**：完全通用的连线渲染逻辑。
2. **`WorkflowNode.tsx`**：提取通用的节点外壳，内部根据 PC/Mobile 传入不同的样式参数。
3. **属性面板重构**：将复杂的 `NodePropertiesModal` 拆分为 API 配置、参考资料、产出列表等微小组件，在 PC 和 Mobile 面板中按需组合。

## 4. 安全性思考 (如何不破坏功能)

- **增量迁移**：每次只迁移一个模块，并确保 PC 和手机端同时更新引用。
- **引用完整性**：在 `types.ts` 中统一接口，确保重构过程中类型检查能发现缺失的属性。
- **Ref 陷阱**：在 Hook 中妥善处理 `nodesRef` 和 `workflowsRef`，这是防止后台执行状态丢失的关键。
- **移动端适配**：在抽取 Hook 时，必须支持移动端特有的交互（如模糊输入、全屏面板表现）。

## 5. 执行计划

1. [ ] 创建目录结构并移动常量/工具函数。
2. [ ] 实现 `useWorkflowLayout` 并同步到两端。
3. [ ] 实现 `useWorkflowStorage`。
4. [ ] **核心攻坚**：抽取 `useWorkflowEngine`，确保执行逻辑在两端行为一致。
5. [ ] 最终清理两端的 `.tsx` 主文件。

---
*注：本计划书已明确 PC/手机端逻辑共用原则。*

# 技术分析报告：Auto-Write Core Bug 分析

基于用户反馈的 F12 日志和需求描述，对 `src/utils/auto-write/core.ts` 和
`src/components/Workflow/hooks/useWorkflowEngine.ts` 进行代码审查，发现以下 6 个问题的根源及修复方案。

## 1. 第7章之前的小总结未发送

- **问题现象**：在生成后续章节时，应该包含的“小总结”（如第 1-6 章总结）未出现在上下文中。
- **根源分析**：在 `getChapterContextMessages` 函数中，筛选小总结的逻辑如下（Line 444）：
  ```typescript
  if (end >= contextStartNum && end < currentNum)
  ```
  `contextStartNum`
  是根据当前章节位置和上下文长度（`contextChapterCount`）计算的。如果当前是第 7 章，`contextChapterCount` 为 1，则
  `contextStartNum` 可能计算为 6 或 7（取决于具体边界计算）。如果小总结恰好在 `contextStartNum`
  之前结束（例如总结了 1-6 章，`end`=6），而 `contextStartNum` 计算为 7（意为保留第 7 章正文），那么 `6 >= 7`
  为假，导致该总结被过滤。实际上，我们需要的是**填补**“全书回顾大纲”与“当前保留正文”之间空白区域的总结。
- **修复方案**：调整筛选条件，允许总结的结束位置在 `contextStartNum`
  之前，只要它是在最近一次大总结之后即可。或者简单地放宽下限，确保连接处的总结被包含。

## 2. 顺序错误（先总结后正文）

- **问题现象**：日志显示顺序为 总结 -> 正文（如 1-7章总结 排在 第7章正文 前面），用户期望顺序为 第7章正文 ->
  1-7章大总结 -> 第8章。
- **根源分析**：在 `itemsToSend.sort` 函数中（Line 276-280），当两个条目（正文和总结）拥有相同的 `end`
  位置时（例如都结束于第 7 章），使用了预定义的 `typeOrder` 进行排序：
  ```typescript
  const typeOrder = { small_summary: 0, big_summary: 1, story: 2 };
  return typeOrder[a.type] - typeOrder[b.type];
  ```
  当前逻辑将 `summary` (0/1) 排在 `story` (2) 之前。
- **修复方案**：反转同位置下的类型排序优先级，将 `story` 放在 `summary` 之前。
  ```typescript
  const typeOrder = { story: 0, small_summary: 1, big_summary: 2 };
  ```

## 3. 当前小说世界观设定为空时不应该存在该条目

- **问题现象**：日志中出现了仅有标题 `【当前小说世界观设定】：` 而无内容的空条目。
- **根源分析**：在 `buildWorldInfoMessages`（Line 90-98）中，仅判断了
  `relevantWorldview.length > 0`（即存在设定集对象），但未检查设定集内是否真的包含有效的 `entries`。
  ```typescript
  if (relevantWorldview.length > 0) {
    let worldviewContent = '【当前小说世界观设定】：\n';
    // ... 拼接内容 ...
    messages.push({ role: 'system', content: worldviewContent });
  }
  ```
  如果设定集存在但内容为空，或者所有条目都为空，会导致发送空标题。
- **修复方案**：在拼接完成后，检查 `worldviewContent` 的长度或实际条目数，只有当内容多于标题长度时才推入 `messages`。

## 4. 需要去除【小说大纲】

- **问题现象**：上下文中包含了冗余的 `【小说大纲】`（对应代码中的 `【全书粗纲】`），因已有
  `【待创作章节大纲参考】`，故不再需要。
- **根源分析**：在 `buildWorldInfoMessages`（Line 68-73）中，无条件地将 `novel.description` 作为 `【全书粗纲】` 注入：
  ```typescript
  if (novel.description && novel.description.trim()) {
    messages.push({
      role: 'system',
      content: `【全书粗纲】：\n${novel.description}`,
    });
  }
  ```
- **修复方案**：删除该段代码，或注释掉该逻辑。

## 5. 发现【小说角色档案】中只有一个角色

- **问题现象**：角色列表缺失，只显示了一个角色（可能是特定分卷的角色），导致全局主角等缺失。
- **根源分析**：在 `buildWorldInfoMessages`（Line 101-104）中，存在激进的过滤逻辑：
  ```typescript
  let relevantCharacters = activeOutlineSetId
    ? characterSets.filter(s => s.id === activeOutlineSetId || (targetName && s.name === targetName))
    : characterSets;
  ```
  当存在
  `activeOutlineSetId`（如正在写第一卷）时，代码强制只保留与该分卷 ID/名称 严格匹配的角色集。这会导致那些 ID 不匹配的“全局角色集”或“主角集”被错误过滤掉。
- **修复方案**：去除针对 `characterSets`
  的过滤逻辑，始终发送所有启用的角色集（`relevantCharacters = characterSets`），确保全局角色不丢失。

## 6. 循环节点信息缺失

- **问题现象**：在循环时，节点没有收到应有的历史信息（小总结、最新大总结、大总结后的章节、已产生的角色集/世界观/灵感集）。
- **根源分析**：
  - **上下文构建缺失**：在 `useWorkflowEngine.ts` 中，`buildDynamicContext` 函数仅收集了前面节点的
    `OutputEntry`，但对于循环节点这种特殊结构，它可能需要重新注入当前小说状态的全局信息（如世界观、角色等），而不仅仅是前序节点的输出。
  - **Summary & Context 逻辑**：目前的 `AutoWriteEngine` 和 `getChapterContextMessages`
    是为线性写作设计的。在工作流循环中，如果直接调用 `AutoWriteEngine`，它会使用 `getChapterContextMessages`
    来拉取上下文。
  - **循环中信息流断裂**：在循环执行时，`buildDynamicContext` 依然是基于线性索引 `currentIndex`
    往前扫描。但循环本质上是回跳。如果我们在循环内部，需要确保：
    1.  **总结信息**：需要显式拉取最新的大总结和小总结。目前 `AutoWriteEngine`
        内部处理了这部分，但在非 Chapter 节点（如大纲生成、细化章节）中，这些信息可能没有被包含在 `messages` 中。
    2.  **角色/世界观/灵感**：在 `useWorkflowEngine.ts` 的 `Standard AI Call` 部分（Line 943-946），它依赖
        `resolvePending`
        来获取选定的集合。如果用户在工作流中动态创建了新的集合（如“第一卷角色”），并且后续循环节点需要用到它，必须确保
        `localNovel` 是最新的，且节点配置能正确选中这些新集合（或者默认全选）。
    3.  **节点信息过滤**：用户反馈“不包含大纲和粗纲”，这意味着在循环节点（如细化章节）中，需要排除这两类信息，专注于世界观、角色、灵感和总结。

- **修复方案**：
  1.  **增强 `useWorkflowEngine.ts` 中的 Context 构建**：在 `Standard AI Call` 和 `Chapter Node`
      的准备阶段，显式注入总结信息。需要引入 `getChapterContextMessages`
      或类似的逻辑来获取“最新大总结 + 后续章节 + 小总结”。
  2.  **动态集合注入**：对于世界观、角色、灵感集，不再仅依赖用户在节点上静态选择的 IDs。在循环模式下（或者默认情况下），应该注入当前
      `localNovel`
      中所有已生成的、相关的集合。特别是对于“大纲生成”类节点，需要过滤掉粗纲和大纲本身（避免递归引用或冗余），只保留设定类信息。
  3.  **代码调整点**：在 `useWorkflowEngine.ts` 的 `Standard AI Call` 循环处理逻辑中，手动构建一个包含 `summary`
      上下文的 Message，并将其插入到 Prompt 中。获取选定的集合。如果用户在工作流中动态创建了新的集合（如“第一卷角色”），并且后续循环节点需要用到它，必须确保 `localNovel` 是最新的，且节点配置能正确选中这些新集合（或者默认全选）。
        3. **节点信息过滤**：用户反馈“不包含大纲和粗纲”，这意味着在循环节点（如细化章节）中，需要排除这两类信息，专注于世界观、角色、灵感和总结。

* **修复方案**：
    1. **增强 `useWorkflowEngine.ts` 中的 Context 构建**：
        在 `Standard AI Call` 和 `Chapter Node` 的准备阶段，显式注入总结信息。
        需要引入 `getChapterContextMessages` 或类似的逻辑来获取“最新大总结 + 后续章节 + 小总结”。
    2. **动态集合注入**：
        对于世界观、角色、灵感集，不再仅依赖用户在节点上静态选择的 IDs。在循环模式下（或者默认情况下），应该注入当前 `localNovel` 中所有已生成的、相关的集合。
        特别是对于“大纲生成”类节点，需要过滤掉粗纲和大纲本身（避免递归引用或冗余），只保留设定类信息。
    3. **代码调整点**：
        在 `useWorkflowEngine.ts` 的 `Standard AI Call` 循环处理逻辑中，手动构建一个包含 `summary` 上下文的 Message，并将其插入到 Prompt 中。

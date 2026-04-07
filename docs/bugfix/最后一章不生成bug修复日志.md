# Bug 修复日志：最后一章不生成（分卷提前切换）

## 基本信息

| 项目 | 内容 |
|------|------|
| Bug 描述 | 每卷的最后一章被错误地分配到下一卷中，导致最后一章不在正确的卷内 |
| 严重程度 | 高 - 章节分卷错误 |
| 发现日期 | 2026-04-07 |
| 修复日期 | 2026-04-07 |
| 修复文件 | `src/utils/WorkflowManager.ts`<br>`src/components/Workflow/hooks/useWorkflowEngine.ts`<br>`src/components/Workflow/components/NodeProperties/Shared/ChapterStartSelector.tsx` |

## 问题分析

### 症状
1. 日志显示 `endChapter=3`，但第三章被分配到第二卷
2. `SAFETY TRIGGER: Reached end of volume, switching to "绣龙于袍" (globalIndex=3, endChapter=2)`
3. 第三章完成后触发分卷切换，但第三章被归入第二卷

### 根因分析

#### Bug 1：`SAFETY TRIGGER` 使用了错误的 `endChapter` 数据

**位置**：`WorkflowManager.ts` 第 514-525 行（修复前）

```typescript
// 【安全机制】：检查 volumePlans 中的分卷规划
if (context.volumePlans && context.volumePlans.length > 1 && currentChapterGlobalIndex !== undefined) {
  const unprocessedVolumes = context.volumePlans.filter((v: any, idx: number) => !v.processed && idx > 0);
  for (const volume of unprocessedVolumes) {
    if (volume.endChapter && currentChapterGlobalIndex > volume.endChapter) {
      terminal.log(`[WorkflowManager] SAFETY TRIGGER: ...`);
      return { chapterTitle: currentChapterTitle, nextVolumeName: volume.volumeName };
    }
  }
}
```

**问题**：
- `volumePlans[1].endChapter=2`（第二卷的 endChapter 值错误）
- 当 `globalIndex=3` 时，`3 > 2 = true`，触发分卷切换
- 但此时第三章还没完成，导致第三章被归入第二卷

#### Bug 2：`onBeforeChapter` 中的 `checkVolumeEndChapter` 在章节生成前就暂停

**位置**：`useWorkflowEngine.ts` 第 2822-2870 行（修复前）

`onBeforeChapter` 在章节**生成之前**被调用。当 `title` 是终止章时（如"第三章"），`checkVolumeEndChapter` 使用 `>=` 比较章节号：

```typescript
shouldSwitch = currentChapterNum >= endChapterNum;  // 3 >= 3 = true!
```

导致引擎在生成第三章之前就暂停了。

#### Bug 3：`ChapterStartSelector` 使用错误的卷ID计算起始章节

**位置**：`ChapterStartSelector.tsx` 第 60-76 行（修复前）

```typescript
const currentVolumeId = activeNovel?.volumes?.[0]?.id || null;  // 总是使用第一卷！
```

#### Bug 4：`continue` 模式不调用 `autoDetectStart`

**位置**：`useWorkflowEngine.ts` 第 2417-2428 行（修复前）

当 `startIdx > 0` 时，直接使用 UI 预计算的索引，不调用 `autoDetectStart` 重新检测。

## 修复方案

### 修复 1：禁用 `SAFETY TRIGGER`

注释掉 `checkTriggerSplit` 中的 SAFETY TRIGGER 逻辑，依赖 `onChapterComplete` 中的主分卷切换机制。

### 修复 2：移除 `onBeforeChapter` 中的 `checkVolumeEndChapter` 检查

删除了 `onBeforeChapter` 中约 94 行代码，移除了 `checkVolumeEndChapter` 检查和相关的分卷切换逻辑。

### 修复 3：修复 `ChapterStartSelector.getAutoStartIndex` 使用正确的卷ID

```typescript
const currentVolumeId = activeNovel?.volumes?.find(v => v.title === currentSet?.name)?.id || null;
```

### 修复 4：始终调用 `autoDetectStart`

```typescript
if (enableAutoDetect) {
  autoDetectStart();
} else if (startMode === 'continue') {
  wStart = startIdx >= 0 && startIdx < currentSet.items.length ? startIdx : 0;
}
```

## 修改的文件

### `src/utils/WorkflowManager.ts`

1. **第 514-525 行**：禁用 SAFETY TRIGGER

### `src/components/Workflow/hooks/useWorkflowEngine.ts`

1. **第 2822-2916 行**：移除 `onBeforeChapter` 中的 `checkVolumeEndChapter` 检查
2. **第 2385-2415 行**：重构 `autoDetectStart` 函数
3. **第 2417-2428 行**：始终调用 `autoDetectStart`
4. **第 2432-2450 行**：添加 `engine.run` 调用前的调试日志

### `src/components/Workflow/components/NodeProperties/Shared/ChapterStartSelector.tsx`

1. **第 60-83 行**：修复 `getAutoStartIndex` 使用正确的卷ID

## 测试建议

1. **重现测试**：
   - 创建一部多卷小说（如 3 卷），每卷 endChapter 设置为不同值
   - 运行工作流
   - 检查每卷的章节是否正确分配

2. **边界情况测试**：
   - 每卷 endChapter=1（每卷只有 1 章）
   - 每卷 endChapter 不一致
   - 最后一卷

## 相关代码路径

- `src/utils/WorkflowManager.ts` - `checkTriggerSplit` 方法
- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 工作流引擎主逻辑
- `src/components/Workflow/components/NodeProperties/Shared/ChapterStartSelector.tsx` - 起始章节选择器

## 备注

这是四个相互关联的 bug，共同导致章节分卷错误和最后一章无法生成的问题。
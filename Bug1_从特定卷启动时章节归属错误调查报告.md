# Bug1：从特定章节特定卷启动时章节归属错误调查报告

## 问题描述

用户反馈：运行从特定章节特定卷开始时，仅第一章正确放在了选定卷中，其他章节存放在了其他错误卷中。

## 代码分析

### 1. 启动卷锁机制

在 [useWorkflowEngine.ts](file:///workspace/src/components/Workflow/hooks/useWorkflowEngine.ts#L350-L356) 中，当用户指定目标卷启动时，系统会设置启动卷锁：

```typescript
if (userSpecifiedTargetVolumeId && userSpecifiedTargetVolumeIndex >= 0) {
  workflowManager.lockStartVolume(userSpecifiedTargetVolumeId, userSpecifiedTargetVolumeIndex);
  workflowManager.setActiveVolumeAnchor(userSpecifiedTargetVolumeId);
  workflowManager.setCurrentVolumeIndex(userSpecifiedTargetVolumeIndex);
} else {
  workflowManager.clearStartVolumeLock();
}
```

### 2. 分卷触发逻辑中的启动卷锁保护

在 [WorkflowManager.ts](file:///workspace/src/utils/WorkflowManager.ts#L587-L608) 中，`checkTriggerSplit` 函数包含了启动卷锁的保护逻辑：

```typescript
// 核心修复：从指定卷/指定位置启动时，禁止旧规则把执行回切到更早的卷。
// 典型场景：用户从第二卷开始，但第一条未处理规则仍是"切到第二卷/第一卷之前的旧规则"，
// 由于 currentChapterGlobalIndex > endChapter，会被误触发，导致当前章节写入错误分卷。
const startLock = this.getStartVolumeLock();
const lockIndex = startLock.volumeIndex;
if (
  lockIndex !== undefined &&
  lockIndex > 0 &&
  currentChapterGlobalIndex !== undefined &&
  rule.startChapter !== undefined &&
  currentChapterGlobalIndex >= rule.startChapter
) {
  const targetRuleVolumeIndex = (context.volumePlans || []).findIndex(
    (v: any) => (v.volumeName || v.folderName) === rule.nextVolumeName,
  );
  if (targetRuleVolumeIndex !== -1 && targetRuleVolumeIndex < lockIndex) {
    terminal.warn(
      `[WorkflowManager]   Split suppressed by start volume lock: targetRuleVolumeIndex=${targetRuleVolumeIndex} < lockIndex=${lockIndex}`,
    );
    return null;
  }
}
```

### 3. 关键问题：启动卷锁保护的条件限制

**问题点1：启动卷锁保护有严格的条件限制**

从上面的代码可以看到，启动卷锁保护生效需要满足以下所有条件：
- `lockIndex !== undefined`
- `lockIndex > 0`
- `currentChapterGlobalIndex !== undefined`
- `rule.startChapter !== undefined`
- `currentChapterGlobalIndex >= rule.startChapter`

**问题点2：启动卷锁保护只在第一个未处理规则中检查**

在 [WorkflowManager.ts](file:///workspace/src/utils/WorkflowManager.ts#L574-L581) 中：

```typescript
// 只检查第一个未处理的规则
if (unprocessedRules.length > 0) {
  const rule = unprocessedRules[0];
  // ... 检查这个规则
}
```

### 4. AutoWriteEngine 中的批量生成逻辑

在 [auto-write/index.ts](file:///workspace/src/utils/auto-write/index.ts#L251-L256) 中，虽然为每个章节都设置了 `volumeId`：

```typescript
batchItems.push({
  item,
  idx: currIdx,
  id: existingChapter ? existingChapter.id : Date.now() + Math.floor(Math.random() * 1000000) + i,
  volumeId: targetVolumeId, // 锁定每一章所属的分卷 ID
});
```

但是存在一个问题：**在章节生成过程中，`onBeforeChapter` 回调可能会触发分卷切换，改变 `targetVolumeId`**。

### 5. onBeforeChapter 回调中的分卷切换

在 [auto-write/index.ts](file:///workspace/src/utils/auto-write/index.ts#L142-L174) 中：

```typescript
if (onBeforeChapter) {
  const beforeResult = await onBeforeChapter(item.title);
  if (beforeResult) {
    // ...
    if (beforeResult.newVolumeId) {
      // 立即切换当前及后续章节的目标分卷
      targetVolumeId = beforeResult.newVolumeId;
      terminal.log(`[AutoWriteEngine] Switched targetVolumeId to ${targetVolumeId} for chapter: ${item.title}`);
      
      // 核心修复：更新批次起始卷ID，确保后续章节使用正确的 volumeId
      batchVolumeId = targetVolumeId;
    }
  }
}
```

**问题点3：即使设置了启动卷锁，onBeforeChapter 仍然可能触发分卷切换**

在 [useWorkflowEngine.ts](file:///workspace/src/components/Workflow/hooks/useWorkflowEngine.ts#L3466-L3497) 中，`onBeforeChapter` 回调会调用 `checkTriggerSplit`：

```typescript
async title => {
  // 计算即将创建的下一个章节的全局索引
  const storyChaptersCount = (localNovel.chapters || []).filter(
    c => !c.subtype || c.subtype === 'story'
  ).length;
  const nextGlobalIndex = storyChaptersCount + 1;
  
  const trg = workflowManager.checkTriggerSplit(title, nextGlobalIndex);
  if (trg) {
    // ... 创建新卷并切换
    return { updatedNovel: localNovel, newVolumeId: tid };
  }
}
```

## Bug 根本原因

通过分析代码，我发现了以下几个关键问题：

### 问题 1：启动卷锁保护条件过于严格

启动卷锁保护在 `checkTriggerSplit` 中的生效条件过于严格，特别是需要 `rule.startChapter !== undefined`。如果分卷规则中没有设置 `startChapter`，则启动卷锁保护不会生效。

### 问题 2：onBeforeChapter 不受单卷模式限制

在 [useWorkflowEngine.ts](file:///workspace/src/components/Workflow/hooks/useWorkflowEngine.ts#L3126-L3132) 中，虽然在 `onChapterComplete` 中禁止了单卷模式下的分卷切换：

```typescript
// 核心修复：重写卷模式下，禁止切换到下一卷
// 重写卷模式的目的是专注重写当前卷，不应自动进入下一卷
if (userSpecifiedTargetVolumeId && mode) {
  shouldSwitch = false;
  nextVolumeName = '';
  terminal.log(`[WORKFLOW] 单卷重写模式：禁止切换到下一卷，shouldSwitch 强制为 false`);
}
```

但是，**在 `onBeforeChapter` 回调中没有类似的保护**！这意味着即使在单卷模式下，`onBeforeChapter` 仍然可能触发分卷切换。

### 问题 3：AutoWriteEngine 中批次内的分卷切换

在 AutoWriteEngine 中，如果在批次内检测到分卷切换，会立即改变 `targetVolumeId`，导致后续章节使用错误的卷ID。虽然设置了 `batchSplitIndex` 来拆分批次，但这个机制并不完善。

## 验证代码位置

### 1. 单卷模式下 onBeforeChapter 没有保护

**文件**: [useWorkflowEngine.ts](file:///workspace/src/components/Workflow/hooks/useWorkflowEngine.ts#L3466-L3497)

**问题**: `onBeforeChapter` 回调调用了 `checkTriggerSplit`，但没有检查是否处于单卷模式。

### 2. checkTriggerSplit 中的启动卷锁保护条件

**文件**: [WorkflowManager.ts](file:///workspace/src/utils/WorkflowManager.ts#L587-L608)

**问题**: 启动卷锁保护需要 `rule.startChapter !== undefined`，这是一个过于严格的条件。

### 3. AutoWriteEngine 中的批次内分卷切换

**文件**: [auto-write/index.ts](file:///workspace/src/utils/auto-write/index.ts#L142-L174)

**问题**: 在批次内检测到分卷切换时，会改变 `targetVolumeId`，但没有考虑启动卷锁的限制。

## 修复建议

### 修复方案 1：在 onBeforeChapter 中添加单卷模式保护

在 [useWorkflowEngine.ts](file:///workspace/src/components/Workflow/hooks/useWorkflowEngine.ts#L3466-L3497) 的 `onBeforeChapter` 回调中，添加单卷模式检查：

```typescript
async title => {
  // 如果是单卷重写模式，直接返回，不进行分卷切换
  if (userSpecifiedTargetVolumeId && mode) {
    terminal.log(`[WORKFLOW] 单卷重写模式：onBeforeChapter 禁止分卷切换`);
    return;
  }
  
  // ... 原有逻辑
}
```

### 修复方案 2：简化启动卷锁保护条件

在 [WorkflowManager.ts](file:///workspace/src/utils/WorkflowManager.ts#L587-L608) 中，简化启动卷锁保护的条件：

```typescript
const startLock = this.getStartVolumeLock();
const lockIndex = startLock.volumeIndex;
if (lockIndex !== undefined && lockIndex >= 0) {
  // 只要设置了启动卷锁，就禁止任何分卷切换
  terminal.warn(
    `[WorkflowManager]   Split suppressed by start volume lock: lockIndex=${lockIndex}`,
  );
  return null;
}
```

或者更精确地：

```typescript
const startLock = this.getStartVolumeLock();
const lockIndex = startLock.volumeIndex;
if (
  lockIndex !== undefined &&
  lockIndex >= 0
) {
  // 检查规则目标卷索引是否小于锁定卷索引
  const targetRuleVolumeIndex = (context.volumePlans || []).findIndex(
    (v: any) => (v.volumeName || v.folderName) === rule.nextVolumeName,
  );
  if (targetRuleVolumeIndex !== -1 && targetRuleVolumeIndex < lockIndex) {
    terminal.warn(
      `[WorkflowManager]   Split suppressed by start volume lock: targetRuleVolumeIndex=${targetRuleVolumeIndex} < lockIndex=${lockIndex}`,
    );
    return null;
  }
}
```

### 修复方案 3：在 AutoWriteEngine 中添加启动卷锁检查

在 [auto-write/index.ts](file:///workspace/src/utils/auto-write/index.ts#L142-L174) 中，添加启动卷锁检查：

```typescript
if (onBeforeChapter) {
  const beforeResult = await onBeforeChapter(item.title);
  if (beforeResult) {
    // 检查是否有启动卷锁，如果有则禁止分卷切换
    const { workflowManager } = await import('../WorkflowManager');
    const startLock = workflowManager.getStartVolumeLock();
    if (startLock.volumeId !== undefined || startLock.volumeIndex !== undefined) {
      terminal.log(`[AutoWriteEngine] Start volume lock active, ignoring volume switch`);
      // 只更新 novel，不切换卷
      if (beforeResult.updatedNovel) {
        this.novel = beforeResult.updatedNovel;
      }
      continue;
    }
    
    // ... 原有逻辑
  }
}
```

## 结论

Bug 的根本原因是：**从特定卷启动时，虽然设置了启动卷锁，但是在 onBeforeChapter 回调中没有检查单卷模式，导致仍然可能触发分卷切换，将后续章节放到错误的卷中**。

建议同时实施修复方案 1 和修复方案 2，以确保从特定卷启动时，所有章节都正确地归属到选定的卷中。

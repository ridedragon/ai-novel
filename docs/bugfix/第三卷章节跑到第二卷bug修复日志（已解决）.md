# 第三卷章节跑到第二卷bug修复日志

## 修复日期
2026/4/7

## 问题描述

用户在侧边栏章节列表中发现：第三卷生成的章节被错误地显示在第二卷下面，没有被正确归类到第三卷。

## 日志分析

从用户提供的日志中可以看到：

```
[ChapterNode] fVolId=9a257976..., loopIndex=3  -- 正确在第三卷
[WorkflowManager] Checking split: 1 rules for "第一章：养性殿的差事" (globalIndex: 7, norm: 1)
[WorkflowManager]   Rule: "皇权绣影" (endChapter: 3) -> globalIndex=7, trigger=true  -- 错误触发！
[WorkflowManager] Active Volume Anchor set to: 30e1d8d1...  -- 被错误切换到第二卷
[AutoWriteEngine] Switched targetVolumeId to 30e1d8d1... for chapter: 第一章：养性殿的差事
```

**问题**：第二卷的规则（endChapter: 3）未被标记为 processed，当第三卷章节运行时（globalIndex 7, 8, 9），7 > 3 错误触发了分卷切换。

## 问题根因分析

### 根因 1：`checkTriggerSplit` 遍历所有未处理规则

在 `WorkflowManager.checkTriggerSplit` 函数中，代码遍历**所有**未处理的 `pendingSplits` 规则：

```javascript
const unprocessedRules = context.pendingSplits.filter(r => !r.processed);
for (const rule of unprocessedRules) {
  if (rule.endChapter && currentChapterGlobalIndex !== undefined) {
    const shouldTrigger = currentChapterGlobalIndex > rule.endChapter;
    if (shouldTrigger) {
      return { chapterTitle: currentChapterTitle, nextVolumeName: rule.nextVolumeName };
    }
  }
}
```

**问题**：
1. 第二卷的规则（endChapter: 3）由于某种原因未被标记为 processed
2. 当第三卷章节运行时（globalIndex 7, 8, 9），7 > 3 条件成立
3. 错误地触发了切换到第二卷（"皇权绣影"）的逻辑

### 根因 2：分卷切换时 `targetVolumeId` 被设置为空字符串

在 `useWorkflowEngine.ts` 第2766行，分卷切换时章节节点的 `targetVolumeId` 被设置为空字符串：

```javascript
if (typeKey === 'chapter' && nextVolumeName) {
  return { ...n, data: { ...n.data, targetVolumeId: '', targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
}
```

这导致后续 `fVolId` 计算为空，`autoDetectStart` 可能错误匹配其他卷的同名章节。

## 修复方案

### 修复 1：`checkTriggerSplit` 只检查第一个未处理规则

**文件**: `src/utils/WorkflowManager.ts`

```javascript
// 只检查第一个未处理的规则
if (unprocessedRules.length > 0) {
  const rule = unprocessedRules[0];
  // ... 检查这一个规则
  // 如果不触发，不再检查后续规则
}
```

**修复逻辑**：
1. 分卷规则是按顺序添加的，第一个未处理的规则就是当前应该检查的规则
2. 如果第一个规则不触发，说明还没到切换点，不应检查后续规则
3. 防止旧规则（如第二卷的 endChapter: 3）误触发

### 修复 2：分卷切换时设置正确的 `targetVolumeId`

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`

```javascript
if (typeKey === 'chapter' && nextVolumeName) {
  const newVolumeId = existingNextVol?.id || localNovel.volumes?.find(v => v.title === nextVolumeName)?.id || '';
  return { ...n, data: { ...n.data, targetVolumeId: newVolumeId, targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
}
```

### 修复 3：`onChapterComplete` 中只修正刚完成章节的 volumeId

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`

```javascript
if (res?.chapters) {
  const activeVolId = workflowManager.getActiveVolumeAnchor() || '';
  const incomingChaptersMap = new Map((res.chapters as any[]).map(c => [c.id, c]));
  
  localNovel = {
    ...res,
    chapters: localNovel.chapters?.map(c => {
      const incoming = incomingChaptersMap.get(c.id);
      if (incoming) {
        if (c.id === cid && activeVolId) {
          return { ...incoming, volumeId: activeVolId };
        }
        return incoming;
      }
      return c;
    }) || res.chapters,
    volumes: res.volumes && res.volumes.length > 0 ? res.volumes : localNovel.volumes,
  };
}
```

## 修改的文件

- `src/utils/WorkflowManager.ts` - 修复 checkTriggerSplit 只检查第一个规则
- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 修复 targetVolumeId 和 onChapterComplete

---

## 第四次修复记录（追加）

### 修复日期
2026/4/7 下午4:38

### 问题发现

前三次修复后，问题依然存在。从新的日志分析：

```
[WorkflowManager] Checking split: 1 unprocessed rules for "第一章：龙息入器" (globalIndex: 3, norm: 1)
[WorkflowManager]   Checking FIRST rule: "龙潜于衣" (endChapter: 1, chapterTitle: undefined)
[WorkflowManager]   endChapter check: globalIndex=3 > endChapter=1 = true
[WorkflowManager]   TRIGGERED by endChapter
```

**真正的问题**：即使只检查第一个规则，该规则本身已经是过期的（endChapter: 1），而 globalIndex 已经是 3。规则从未被标记为 processed，因为 `markSplitProcessed` 只匹配 `chapterTitle`，而新规则只有 `endChapter` 没有 `chapterTitle`。

### 根因分析

`markSplitProcessed` 函数只通过 `chapterTitle` 匹配来标记规则为已处理：

```javascript
const newSplits = context.pendingSplits.map(r => (isMatch(r.chapterTitle) ? { ...r, processed: true } : r));
```

但很多规则只有 `endChapter` 字段，没有 `chapterTitle`，导致这些规则永远不会被标记为 processed，后续章节运行时 globalIndex > endChapter 就会误触发。

### 修复方案

**文件**: `src/utils/WorkflowManager.ts` - `markSplitProcessed` 函数

修改签名，增加 `currentGlobalIndex` 参数，在标记匹配规则的同时，清理所有过期的规则：

```javascript
public markSplitProcessed(chapterTitle: string, nextVolumeName?: string, currentGlobalIndex?: number) {
  // ...
  if (context.pendingSplits) {
    const newSplits = context.pendingSplits.map(r => {
      // 1. 匹配当前章节的规则，标记为已处理
      if (r.chapterTitle && isMatch(r.chapterTitle)) {
        return { ...r, processed: true };
      }
      // 2. 清理所有 endChapter 小于当前全局索引的规则（过期规则）
      if (currentGlobalIndex !== undefined && r.endChapter && currentGlobalIndex > r.endChapter) {
        terminal.log(`[WorkflowManager] Marking stale rule as processed: "${r.nextVolumeName}" (endChapter: ${r.endChapter} < globalIndex: ${currentGlobalIndex})`);
        return { ...r, processed: true };
      }
      return r;
    });
    this.updateContext({ pendingSplits: newSplits });
  }
}
```

**调用处更新**: `src/components/Workflow/hooks/useWorkflowEngine.ts`

```javascript
// 标记 pendingSplit 为已处理，同时清理所有过期规则
workflowManager.markSplitProcessed(currentTitle, nextVolumeName, completedChaptersCount);
```

### 修复逻辑

1. 分卷切换时，传入 `completedChaptersCount` 作为当前全局章节索引
2. `markSplitProcessed` 不仅标记匹配的规则，还清理所有 `endChapter < currentGlobalIndex` 的过期规则
3. 防止旧规则（如 endChapter: 1）在后续章节（globalIndex: 3+）运行时误触发

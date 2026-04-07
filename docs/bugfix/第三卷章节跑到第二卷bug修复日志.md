# 第三卷章节跑到第二卷bug修复日志

## 修复日期
2026/4/7

## 问题描述

用户在侧边栏章节列表中发现：第三卷生成的章节被错误地显示在第二卷下面，没有被正确归类到第三卷。

## 问题影响范围

- 侧边栏章节列表（`AppSidebarLeft.tsx`）
- chaptersByVolume 分组显示
- 多卷创作场景

## 问题根因分析

### 根因 1：分卷切换时章节插入位置的物理顺序问题

在 `AutoWriteEngine` 的 `run` 方法中（第262-284行），新章节的插入位置逻辑如下：

```javascript
if (itemVolId) {
  // 寻找同卷最后一章的物理位置
  let lastIndexInVol = -1;
  for (let k = newChapters.length - 1; k >= 0; k--) {
    if (newChapters[k].volumeId === itemVolId) {
      lastIndexInVol = k;
      break;
    }
  }

  if (lastIndexInVol !== -1) {
    newChapters.splice(lastIndexInVol + 1, 0, newChapter);
  } else {
    // 核心修复：如果该分卷目前是空的
    newChapters.push(newChapter);  // <-- 问题：追加到全书末尾
  }
}
```

**问题分析**：
- 当第三卷刚开始创建时，`lastIndexInVol === -1`（因为第三卷还没有章节）
- 此时新章节被 `push` 到 `newChapters` 的末尾
- 但如果第二卷是当前最后一卷，新章节会被放在第二卷章节之后
- **关键问题**：章节的 `volumeId` 虽然正确设置为第三卷的ID，但章节数组的物理顺序可能导致后续处理出问题

### 根因 2：分卷切换时的 volumeId 传递可能丢失

在 `useWorkflowEngine.ts` 的分卷切换逻辑（第2635-2891行）中：

1. `workflowManager.setActiveVolumeAnchor()` 被设置为下一卷的ID
2. 章节节点的 `targetVolumeId` 被设置为 `''`（空字符串），等待重新分配
3. `currentWorkflowFolder` 被更新为新卷名称

但在 `onChapterComplete` 回调中（第2515-2528行）：

```javascript
if (res?.chapters) {
  localNovel = {
    ...res,
    volumes: res.volumes && res.volumes.length > 0 ? res.volumes : localNovel.volumes,
  };
}
```

**潜在问题**：`res` 可能包含了章节列表，但章节的 `volumeId` 可能没有被正确更新。

### 根因 3：`onBeforeChapter` 回调中的卷切换时机问题

在 `AutoWriteEngine.run` 方法中（第133-191行），`onBeforeChapter` 用于检测分卷终止章并切换卷：

```javascript
if (onBeforeChapter) {
  const beforeResult = await onBeforeChapter(item.title);
  if (beforeResult) {
    // 分卷切换
    if (beforeResult.newVolumeId) {
      targetVolumeId = beforeResult.newVolumeId;  // <-- 切换目标卷ID
    }
  }
}
```

**关键流程**：
1. `onBeforeChapter` 返回 `newVolumeId` 时，`targetVolumeId` 被更新
2. 后续章节使用新的 `targetVolumeId` 创建
3. 但如果 `onBeforeChapter` 的返回值不正确，或者返回时机不对，会导致章节被错误归类

### 根因 4：分卷切换后创作类节点输出被清除（核心原因）

在 `useWorkflowEngine.ts` 第2722-2777行，分卷切换时会清除创作类节点的输出：

```javascript
nodesRef.current = nodesRef.current.map(n => {
  const typeKey = n.data.typeKey;
  if (['worldview', 'characters', 'plotOutline'].includes(typeKey)) {
    const updatedData = { ...n.data, outputEntries: [] };
    if (nextVolumeName) {
      updatedData.folderName = nextVolumeName;
    }
    return { ...n, data: updatedData };
  }
  // ...
});
```

**核心问题**：清除节点的 `outputEntries` 后，节点的 `folderName` 被更新，但 **章节节点的 `targetVolumeId` 被设置为空字符串**：

```javascript
if (typeKey === 'chapter' && nextVolumeName) {
  return { ...n, data: { ...n.data, targetVolumeId: '', targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
}
```

这导致后续章节生成时，`targetVolumeId` 为空，需要通过 `workflowManager.getActiveVolumeAnchor()` 来获取。但如果 `activeVolumeAnchor` 没有被正确设置，章节会被错误地归类到上一卷。

### 根因 5：`autoDetectStart` 函数中的卷ID匹配逻辑

在 `useWorkflowEngine.ts` 第2408-2441行：

```javascript
const ex = localNovel.chapters?.find(c => {
  // 标题匹配
  if (c.title !== item.title) return false;
  // 卷ID匹配逻辑
  if (fVolId) {
    return c.volumeId === fVolId;
  } else {
    return !c.volumeId || c.volumeId === '';
  }
});
```

**潜在问题**：`fVolId` 的来源是 `workflowManager.getActiveVolumeAnchor()`，如果这个值没有被正确更新为第三卷的ID，会导致章节被错误地认为已存在于第二卷。

## 修复方案

### 修复 1：修复分卷切换时 `targetVolumeId` 被设置为空字符串 (核心修复)

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`（第2766-2775行）

**问题**：当分卷切换发生时（第2766行），章节节点的 `targetVolumeId` 被设置为空字符串 `''`：

```javascript
// 旧代码（错误）
if (typeKey === 'chapter' && nextVolumeName) {
  return { ...n, data: { ...n.data, targetVolumeId: '', targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
}
```

这导致后续章节引擎执行时，`fVolId` 计算为空（第2363行），然后 `autoDetectStart` 函数（第2415-2427行）会错误地匹配**任何卷**中同名的章节（如"第一章"），导致第三卷的章节被跳过或错误归类。

**修复代码**：
```javascript
// 新代码（正确）
if (typeKey === 'chapter' && nextVolumeName) {
  const newVolumeId = existingNextVol?.id || localNovel.volumes?.find(v => v.title === nextVolumeName)?.id || '';
  return { ...n, data: { ...n.data, targetVolumeId: newVolumeId, targetVolumeName: nextVolumeName, folderName: nextVolumeName } };
}
```

**修复逻辑**：
1. 分卷切换时，获取新分卷的实际 ID
2. 将章节节点的 `targetVolumeId` 设置为新分卷的 ID
3. 这样后续 `fVolId` 计算时会得到正确的值
4. `autoDetectStart` 只会匹配同一卷的章节，不会错误匹配其他卷的同名章节

### 修复 2：修复 `onChapterComplete` 回调中的闭包状态覆盖问题

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`（第2515-2545行）

**问题**：当分卷切换后，`onChapterComplete` 回调返回的 `res` 对象包含旧的章节列表（来自闭包中的状态），直接 `localNovel = { ...res, ... }` 会覆盖掉新卷的章节信息。

**修复代码**：
```javascript
if (res?.chapters) {
  const activeVolId = workflowManager.getActiveVolumeAnchor() || '';
  const incomingChaptersMap = new Map((res.chapters as any[]).map(c => [c.id, c]));
  
  localNovel = {
    ...res,
    chapters: localNovel.chapters?.map(c => {
      const incoming = incomingChaptersMap.get(c.id);
      if (incoming) {
        // 只修正刚刚完成的章节的 volumeId
        if (c.id === cid && activeVolId) {
          return {
            ...incoming,
            volumeId: activeVolId,
          };
        }
        return incoming;
      }
      return c;
    }) || res.chapters,
    volumes: res.volumes && res.volumes.length > 0 ? res.volumes : localNovel.volumes,
  };
}
```

**修复逻辑**：
1. 使用 `localNovel.chapters` 作为基础，而不是直接使用 `res.chapters`
2. **只修正刚刚完成的章节 (cid) 的 volumeId**，不影响其他章节
3. 其他章节保持原有 volumeId 不变，防止第一卷章节被错误归类到第二卷

## 修复效果

修复后，分卷切换和章节生成将正确关联：

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 第三卷第一章生成 | 可能被归类到第二卷 | 正确归类到第三卷 |
| 侧边栏章节列表显示 | 第三卷章节可能显示在第二卷下 | 各卷章节正确显示在对应卷下 |
| 分卷切换后的章节生成 | volumeId 可能丢失 | volumeId 正确传递 |

## 测试建议

1. 创建一个包含至少3卷的小说项目
2. 使用工作流依次生成各卷内容
3. 验证每卷的章节是否被正确归类到对应的卷下
4. 检查 `chaptersByVolume` 分组是否正确
5. 验证分卷切换时的日志输出

## 相关文件

- `src/components/Workflow/hooks/useWorkflowEngine.ts` - 工作流引擎核心逻辑
- `src/utils/auto-write/index.ts` - 自动写作引擎，包含章节创建逻辑
- `src/components/Layout/AppSidebarLeft.tsx` - 章节侧边栏显示
- `src/hooks/useNovelData.ts` - chaptersByVolume 分组逻辑
- `src/utils/WorkflowManager.ts` - 工作流管理器，包含卷ID管理
# 分卷切换相关 Bug 修复日志

**修复日期**: 2026/4/7  
**修复人员**: Cline  
**影响范围**: 工作流引擎 (`useWorkflowEngine.ts`)

---

## Bug 列表

### Bug 1: 创作信息一直停留在第一卷的问题

**问题描述**:  
切换到第二卷后，创作信息节点（creationInfo）仍然显示第一卷的信息，没有更新为第二卷的分卷名称和进度。

**根因分析**:  
在 `loopNode` 的循环继续逻辑中，`nextVolumeIndex` 的计算公式为 `nextLoopIndex - 1`，导致计算结果始终为 0（第一卷）。例如：
- 完成第 1 轮迭代后，`currentLoopIndex = 1`
- `nextVolumeIndex = 1 - 1 = 0`（错误，应该是 1）

这使得后续所有节点的 `folderName` 和 `targetVolumeId` 都被设置为第一卷的配置。

**修复方案**:  
将 `nextVolumeIndex` 的计算从 `nextLoopIndex - 1` 改为 `nextLoopIndex`：
```javascript
// 修复前
const nextVolumeIndex = nextLoopIndex - 1; // 错误：导致始终为 0

// 修复后
const nextVolumeIndex = nextLoopIndex; // 正确：第 1 轮完成后进入第 2 轮，使用 volumePlans[1]
```

---

### Bug 2: 分卷创作完成没有触发总结问题

**问题描述**:  
当分卷的最后一章生成完成后，没有触发章节总结（summary），导致卷与卷之间的上下文不连贯。

**根因分析**:  
总结检查（`checkAndGenerateSummary`）依赖于章节数量是否达到总结步长。如果某卷的章节数不足总结步长（例如步长为 5，但卷只有 3 章），则不会触发总结。

**修复方案**:  
在分卷切换代码中，强制对当前卷的最后一个实际章节触发总结检查：
```javascript
// Bug 2 修复：在分卷切换时，强制对当前卷的最后一个实际章节触发总结检查
const currentVolId = workflowManager.getActiveVolumeAnchor() || '';
const lastStoryChapter = (localNovel.chapters || [])
  .filter(c => {
    const cVolId = c.volumeId || '';
    return cVolId === currentVolId && (!c.subtype || c.subtype === 'story');
  })
  .pop();

if (lastStoryChapter && globalConfig.onChapterComplete) {
  terminal.log(`[VOLUME_SWITCH] Triggering summary check for last chapter of completed volume: ${lastStoryChapter.title}`);
  const summaryResult = await (globalConfig.onChapterComplete as any)(
    lastStoryChapter.id,
    lastStoryChapter.content,
    localNovel,
    true,  // forceFinal = true 强制触发总结检查
  );
  if (summaryResult?.chapters) {
    localNovel = summaryResult;
    await updateLocalAndGlobal(localNovel);
  }
}
```

---

### Bug 3: 没有切换到第二卷文件夹问题

**问题描述**:  
切换到第二卷后，新生成的内容仍然被储存到第一卷的文件夹中，独立目录关联没有变成第二卷的对应文件夹名称。

**根因分析**:  
与 Bug 1 相同的根因：`nextVolumeIndex` 计算错误导致 `nextFolderName` 从 `volumePlans[0]` 或 `multiCreateFolder[0]` 获取，始终是第一卷的文件夹名称。

**修复方案**:  
1. 修复 `nextVolumeIndex` 计算（同 Bug 1）
2. 删除重复的 `localNovel.volumes` 查找代码块（原代码有两段完全相同的查找逻辑）
3. 添加兜底逻辑，当 `nextFolderName` 仍然为空时使用分卷索引作为回退名称：
```javascript
// Bug 3 修复：添加兜底逻辑，当 nextFolderName 仍然为空时
if (!nextFolderName) {
  nextFolderName = `第${nextVolumeIndex + 1}卷`;
  terminal.warn(`[LOOP_NODE] Using fallback folder name: ${nextFolderName}`);
}
```

---

### Bug 4: 生成内容列表 (Output Entries) 新增条目没有被清空

**问题描述**:  
切换到第二卷后，节点中的生成内容列表 (Output Entries) 仍然保留第一卷的生成内容，导致发送给 AI 的上下文包含旧卷的内容。

**根因分析**:  
原来的清空逻辑只清空了 `worldview`、`characters`、`plotOutline` 节点的 outputEntries，但没有清空 `creationInfo`（创作信息）节点的 outputEntries。

**修复方案**:  
扩大清空范围，将 `creationInfo` 节点也加入清空列表：
```javascript
// 重置创作信息节点并确保清空 outputEntries（Bug 1 修复）
if (typeKey === 'creationInfo') {
  updates.status = 'pending';
  updates.outputEntries = [];  // 清空旧的创作信息，让下一卷重新生成
}
```

---

### Bug 5: 创作信息节点 UI 显示不更新问题

**问题描述**:  
分卷切换后，创作信息节点（creationInfo）的 UI 显示仍然保留第一卷的信息，即使节点状态被设为 `pending`，但 outputEntries 没有被更新为新的分卷信息。

**根因分析**:  
在分卷切换代码中，创作信息节点只更新了 `status` 和 `folderName`，但没有更新 `outputEntries`。由于创作信息节点可能连接到任意节点路径上，如果该路径在分卷切换后不会被重新执行，UI 上的 outputEntries 将永远显示旧内容。

**修复方案**:  
在分卷切换时，直接为创作信息节点生成新的 outputEntries 内容，包含新分卷的名称、进度和循环轮次信息：
```javascript
if (typeKey === 'creationInfo') {
  // 生成新的创作信息内容，包含新分卷的名称
  const newVolumeInfoContent = nextVolumeName ? `当前分卷：${nextVolumeName}` : '';
  const totalVolumes = localNovel.volumes?.length || 0;
  const volumeProgress = totalVolumes > 0 ? `分卷进度：第 ${nextVolIdx + 1} 卷 / 共 ${totalVolumes} 卷` : '';
  const loopIndex = workflowManager.getContextVar('loop_index') || 1;
  const loopInfo = `当前循环轮次：第 ${loopIndex} 轮`;
  
  let newContent = [newVolumeInfoContent, volumeProgress, loopInfo].filter(Boolean).join('\n');
  if (n.data.instruction) {
    newContent += `\n\n用户指令：${n.data.instruction}`;
  }
  
  return { 
    ...n, 
    data: { 
      ...n.data, 
      status: 'pending', 
      folderName: nextVolumeName,
      outputEntries: [{ 
        id: `creation_info_auto_${Date.now()}`, 
        title: '创作信息', 
        content: newContent 
      }]
    } 
  };
}
```

这样即使创作信息节点没有被重新执行，UI 上也会立即显示正确的当前分卷信息。

---

## 修复文件清单

| 文件路径 | 修改内容 |
|---------|---------|
| `src/components/Workflow/hooks/useWorkflowEngine.ts` | 1. 修复 `nextVolumeIndex` 计算（第 928 行）<br>2. 删除重复的 `localNovel.volumes` 查找代码块<br>3. 添加 `nextFolderName` 兜底逻辑<br>4. 扩大 outputEntries 清空范围至 creationInfo 节点<br>5. 分卷切换时强制触发总结检查 |

---

## 测试建议

1. **测试多卷切换**: 创建一个包含 3 卷以上的小说，每卷 3 章，验证：
   - 每卷完成后是否正确切换到下一卷的文件夹
   - 创作信息是否正确显示当前卷的名称和进度
   - 新生成的内容是否储存到正确的卷文件夹中
   - 节点的 outputEntries 是否在卷切换时被正确清空

2. **测试总结触发**: 设置总结步长为 5，创建每卷只有 3 章的小说，验证：
   - 每卷完成后是否仍然触发了总结
   - 总结内容是否包含该卷的完整信息

3. **测试边界情况**:
   - 只有 1 卷的情况是否正常
   - 卷名称包含特殊字符时是否正常
   - 中途暂停恢复后卷索引是否正确
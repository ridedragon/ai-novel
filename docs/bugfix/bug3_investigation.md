# Bug 3 调查报告

## 问题描述
用户反馈了两个与章节列表相关的问题：
1. **章节编号没有被隐藏**：章节列表中显示了完整的章节标题，包括"第1章"这样的编号，没有按照预期隐藏。
2. **章节和总结乱序**：重新加载书籍后，每个卷的章节和小总结、大总结出现乱序，且每个卷似乎都变成了6章的正文内容，可能与小总结间隔章和大总结间隔章设置有关。

## 代码分析

### 问题1：章节编号没有被隐藏

#### 相关代码
1. **AppSidebarLeft.tsx** - 负责渲染章节列表
```typescript
const getDisplayTitle = (chapter: Chapter) => {
  if (chapter.subtype === 'small_summary' || chapter.subtype === 'big_summary') {
    const isVolumeMode = contextScope === 'currentVolume';
    const targetRange = isVolumeMode ? (chapter.summaryRangeVolume || chapter.summaryRange) : chapter.summaryRange;
    const prefix = chapter.subtype === 'small_summary' ? '🔹小总结' : '🔸大总结';
    return `${prefix} (${targetRange})`;
  }
  return chapter.title; // 直接返回完整标题，包括编号
};
```

2. **chapterNumbering.ts** - 负责生成章节标题
```typescript
export const generateChapterTitle = (index: number, originalTitle?: string): string => {
  const baseTitle = `第${index}章`; // 总是生成带有编号的标题
  if (originalTitle) {
    const name = extractChapterName(originalTitle);
    if (name) {
      return `${baseTitle} ${name}`;
    }
  }
  return baseTitle;
};
```

#### 问题分析
- `getDisplayTitle` 函数直接返回 `chapter.title`，没有任何逻辑来隐藏章节编号。
- `generateChapterTitle` 函数总是生成带有"第X章"前缀的标题，并且这个标题被存储在章节对象中。
- 当渲染章节列表时，使用的是存储在章节对象中的完整标题，因此编号总是会显示。

### 问题2：章节和总结乱序

#### 相关代码
1. **useNovelData.ts** - 负责章节标准化处理
```typescript
const normalizeChapters = useCallback(
  (chapterList: Chapter[]) => {
    const recalibratedNumbering = recalibrateChapterNumbering([...chapterList]);
    const mode = activeNovel?.chapterNumberingMode || 'global';
    const renumberedTitles = recalibratedNumbering.map(chapter => {
      if (!chapter.subtype || chapter.subtype === 'story') {
        const displayIndex = mode === 'perVolume' ? chapter.volumeIndex : chapter.globalIndex;
        return { ...chapter, title: generateChapterTitle(displayIndex || 1, chapter.title) };
      }
      return chapter;
    });

    return sortChapters(recalibrateSummaries(renumberedTitles));
  },
  [activeNovel],
);
```

2. **SummaryManager.ts** - 负责章节排序和总结管理
```typescript
export const sortChapters = (chapters: Chapter[]): Chapter[] => {
  if (!chapters || !Array.isArray(chapters)) return [];

  // 1. 分离剧情章与总结章
  const allStories = chapters.filter(c => !isSummaryChapter(c));
  const allSummaries = chapters.filter(c => isSummaryChapter(c));

  if (allStories.length === 0) return chapters;

  // 2. 预对齐：为每个总结寻找它在全局剧情流中的“挂载点”
  const summariesByParentId = new Map<number, Chapter[]>();
  const globalOrphans: Chapter[] = [];

  allSummaries.forEach(s => {
    const range = s.summaryRange?.split('-').map(Number);
    if (range && range.length === 2 && !isNaN(range[1]) && range[1] > 0) {
      // 获取该总结理论上应该跟随的剧情章 (基于全局物理索引)
      const targetStory = allStories[range[1] - 1];
      if (targetStory) {
        if (!summariesByParentId.has(targetStory.id)) summariesByParentId.set(targetStory.id, []);
        summariesByParentId.get(targetStory.id)!.push(s);
        return;
      }
    }
    globalOrphans.push(s);
  });

  // 3. 构建分卷拓扑：按剧情章出现的先后顺序排列分卷
  const volumeOrder: (string | undefined)[] = [];
  const storiesByVol = new Map<string | undefined, Chapter[]>();

  allStories.forEach(s => {
    if (!volumeOrder.includes(s.volumeId)) volumeOrder.push(s.volumeId);
    if (!storiesByVol.has(s.volumeId)) storiesByVol.set(s.volumeId, []);
    storiesByVol.get(s.volumeId)!.push(s);
  });

  const finalResult: Chapter[] = [];

  // 4. 逐卷装配
  volumeOrder.forEach(vid => {
    const volStories = storiesByVol.get(vid) || [];

    volStories.forEach(story => {
      finalResult.push(story);
      // 挂载属于该章的总结
      const related = summariesByParentId.get(story.id);
        if (related) {
          // 保留同一挂载点下总结的物理顺序，支持用户手动调整总结显示位置
          // 这里只负责“挂载到对应正文之后”，不再强制改写同组总结之间的先后顺序
          finalResult.push(...related);
        }
    });

    // 分卷孤儿补救：如果孤儿总结的 volumeId 指向该卷，将其强制堆叠在该卷正文结束之后
    const volOrphans = globalOrphans.filter(o => o.volumeId === vid);
    finalResult.push(...volOrphans);
  });

  // 5. 最终孤儿兜底：完全没分卷且没挂载点的，追加到全书末尾
  const processedIds = new Set(finalResult.map(c => c.id));
  const remaining = chapters.filter(c => !processedIds.has(c.id));
  if (remaining.length > 0) {
    finalResult.push(...remaining);
  }

  // 6. 防护盾：如果结果列表第一项是总结，强行将其下移
  if (finalResult.length > 1 && isSummaryChapter(finalResult[0])) {
    terminal.error(`[SORT SHIELD] 拦截到总结漂移至顶部: ${finalResult[0].title}`);
    const firstStoryIdx = finalResult.findIndex(c => !isSummaryChapter(c));
    if (firstStoryIdx !== -1) {
      const [badItem] = finalResult.splice(0, 1);
      finalResult.splice(firstStoryIdx, 0, badItem);
    }
  }

  return finalResult;
};
```

3. **SummaryManager.ts** - 总结生成逻辑
```typescript
const sInterval = Number(smallSummaryInterval) || 3; // 小总结默认间隔3章
const bInterval = Number(bigSummaryInterval) || 6; // 大总结默认间隔6章
```

#### 问题分析
- **排序逻辑问题**：`sortChapters` 函数在排序时，首先分离所有剧情章和总结章，然后按剧情章的出现顺序排列分卷，最后逐卷装配。这种方法可能导致总结章的位置与预期不符，特别是在重新加载书籍后。
- **分卷装配问题**：在逐卷装配时，函数使用 `storiesByVol` 来获取每个分卷的剧情章，但这个映射是基于原始章节列表中剧情章的顺序构建的，可能不反映用户期望的顺序。
- **总结挂载问题**：总结章是基于 `summaryRange` 来寻找挂载点的，如果 `summaryRange` 计算不正确或在重新加载后发生变化，会导致总结章挂载到错误的位置。
- **间隔设置影响**：小总结默认间隔3章，大总结默认间隔6章，这可能导致每个卷恰好有6章正文内容的现象，因为大总结间隔设置为6章。

## 根本原因

### 问题1的根本原因
- 章节标题的生成和显示逻辑没有分离编号和名称，导致编号总是显示在章节列表中。
- 缺少一个专门用于显示的函数，该函数应该能够根据需要隐藏章节编号。

### 问题2的根本原因
- 章节排序逻辑在处理分卷和总结时存在缺陷，导致重新加载后章节和总结的顺序发生变化。
- 总结章的挂载逻辑依赖于 `summaryRange`，但 `summaryRange` 可能在重新加载后不准确。
- 分卷顺序的确定逻辑可能不反映用户期望的顺序，而是基于剧情章的出现顺序。

## 修复建议

### 问题1：章节编号没有被隐藏

1. **修改 AppSidebarLeft.tsx 中的 getDisplayTitle 函数**：
   - 添加一个参数来控制是否显示章节编号
   - 在渲染章节列表时，调用该函数并设置为不显示编号

2. **或者，在 chapterNumbering.ts 中添加一个函数**：
   - 添加一个 `getChapterDisplayName` 函数，专门用于显示，返回不带编号的章节名称
   - 在 AppSidebarLeft.tsx 中使用这个函数

### 问题2：章节和总结乱序

1. **改进 sortChapters 函数**：
   - 确保分卷顺序的确定逻辑更加可靠，可能需要考虑分卷的创建时间或用户指定的顺序
   - 改进总结章的挂载逻辑，确保它们始终挂载到正确的位置
   - 在重新加载书籍时，确保 `summaryRange` 的计算是准确的

2. **优化 normalizeChapters 函数**：
   - 确保在标准化章节时，保留用户手动调整的章节顺序
   - 在重新编号和排序时，尽量减少对原有顺序的改变

3. **改进总结生成逻辑**：
   - 确保总结章的 `summaryRange` 在重新加载后仍然准确
   - 考虑添加更多的错误处理和日志记录，以便更好地诊断排序问题

## 代码修复方案

### 问题1的修复方案

修改 `AppSidebarLeft.tsx` 中的 `getDisplayTitle` 函数：

```typescript
const getDisplayTitle = (chapter: Chapter, showNumber: boolean = false) => {
  if (chapter.subtype === 'small_summary' || chapter.subtype === 'big_summary') {
    const isVolumeMode = contextScope === 'currentVolume';
    const targetRange = isVolumeMode ? (chapter.summaryRangeVolume || chapter.summaryRange) : chapter.summaryRange;
    const prefix = chapter.subtype === 'small_summary' ? '🔹小总结' : '🔸大总结';
    return `${prefix} (${targetRange})`;
  }
  
  if (showNumber) {
    return chapter.title;
  } else {
    // 提取章节名称，去除编号
    const name = extractChapterName(chapter.title);
    return name || chapter.title;
  }
};
```

然后在渲染章节列表时调用：

```typescript
<span className="truncate flex-1">{getDisplayTitle(chapter, false)}</span>
```

### 问题2的修复方案

1. **改进 sortChapters 函数**：
   - 确保分卷顺序的确定逻辑更加可靠
   - 改进总结章的挂载逻辑

2. **优化 normalizeChapters 函数**：
   - 确保在标准化章节时，保留用户手动调整的章节顺序

3. **改进总结生成逻辑**：
   - 确保总结章的 `summaryRange` 在重新加载后仍然准确

## 测试建议

1. **问题1测试**：
   - 创建多个章节，确保章节列表中只显示章节名称，不显示编号
   - 切换章节编号模式（全局/分卷），确保编号始终不显示
   - 添加新章节，确保新章节的编号也不显示

2. **问题2测试**：
   - 创建多个分卷，每个分卷包含多个章节和总结
   - 手动调整章节和总结的顺序
   - 重新加载书籍，确保章节和总结的顺序保持不变
   - 测试不同的小总结和大总结间隔设置，确保章节和总结的顺序不受影响

## 结论

Bug 3包含两个独立的问题：章节编号显示问题和章节排序问题。这些问题主要源于代码中缺少适当的显示逻辑和排序逻辑。通过实施建议的修复方案，可以解决这些问题，提高用户体验。

### 修复优先级
- **高优先级**：章节排序问题，因为它影响用户对内容的理解和导航
- **中优先级**：章节编号显示问题，虽然不影响功能，但影响用户体验

### 预期修复效果
- 章节列表中只显示章节名称，不显示编号
- 重新加载书籍后，章节和总结的顺序保持不变
- 总结章正确挂载到对应的剧情章之后
- 不同分卷的章节和总结顺序独立且正确
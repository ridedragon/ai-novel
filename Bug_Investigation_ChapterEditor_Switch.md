# 章节版本切换按钮消失问题调查报告

## 问题描述

在重新加载页面后，章节编辑器顶部的“优化版本”与“原文版本”切换按钮消失，导致用户无法查看之前的润色记录或回退到原文。

## 根本原因分析

经过对代码库的调查，发现该问题是由**持久化存储的冷热数据分离逻辑**与**UI渲染条件**之间的不匹配导致的：

1. **冷热分离存储逻辑**：
    在 [`src/utils/storage.ts`](src/utils/storage.ts) 中，为了优化性能和解决 `QuotaExceededError`（存储配额超限），系统采用了剥离策略。
    - `saveNovels` 函数在保存主数据时，会通过以下代码将 `versions` 从章节对象中剔除：

      ```typescript
      const strippedNovels = novels.map(novel => ({
        ...novel,
        chapters: novel.chapters.map(chapter => {
          if (chapter.versions && chapter.versions.length > 0) {
            this.saveChapterVersions(chapter.id, chapter.versions); // 异步存入独立空间
          }
          const { versions, ...rest } = chapter; // 剥离 versions
          return rest;
        }),
      }));
      ```

    - 这意味着保存在 `novels` 键名下的数据是不包含版本历史的。

2. **加载逻辑缺失**：
    当页面刷新时，[`src/App.tsx`](src/App.tsx) 调用 `storage.getNovels()` 加载数据。由于 `versions` 已经被剥离，此时内存状态（State）中的章节对象没有 `versions` 属性。

3. **UI 渲染门槛**：
    在 [`src/components/Editor/ChapterEditor.tsx`](src/components/Editor/ChapterEditor.tsx) 中，切换按钮的显示逻辑如下：

    ```tsx
    {/* Version Switcher */}
    {activeChapter.versions && activeChapter.versions.length > 1 && (
      <div className="...">...</div>
    )}
    ```

    由于刚加载时 `versions` 为 `undefined` 或空数组，条件不成立，按钮因此消失。

4. **被动加载陷阱**：
    虽然 [`src/App.tsx`](src/App.tsx) 中定义了 `loadVersionsIfNeeded` 函数，但它仅在用户点击“上一版本”或“下一版本”时才会被调用。然而，因为按钮本身已经消失了，用户根本没有机会触发这些加载操作。

## 建议修复方案

### 方案一：自动激活加载（推荐）

在 [`src/App.tsx`](src/App.tsx) 中增加一个 `useEffect`，每当 `activeChapterId` 改变时，自动检查并从 IndexedDB 加载该章节的版本历史。

### 方案二：UI 逻辑优化

修改 [`src/components/Editor/ChapterEditor.tsx`](src/components/Editor/ChapterEditor.tsx)，即使 `versions` 尚未加载，只要存在 `activeVersionId`（主数据中保留了此 ID），就渲染占位符或触发加载。

## 修复步骤建议

1. 修改 `App.tsx`，在章节切换时异步加载 `versions`。
2. 确保 `setChapters` 逻辑在合并版本数据时不会引起无限循环更新。
3. 验证自动化写作后的保存逻辑，确保新生成的版本能正确触发冷热分离存储。

---
**调查人员**：Kilo Code
**日期**：2024-10-31

# 三大Bug最终分析报告 (2026-04-09)

## Bug 1：大纲与正文生成节点 - 章节不显示在分卷下

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`

**问题**:
1. targetVolumeId fallback到空字符串时，占位符章节volumeId为空，不归属任何卷
2. volumes数组为空时 `localNovel.volumes[0].id` 会崩溃
3. 大纲解析后更新占位符标题未调用updateLocalAndGlobal刷新UI

**修复**:
- 加固targetVolumeId获取逻辑，增加空数组保护
- 更新占位符标题后立即调用 `await updateLocalAndGlobal(localNovel)` 刷新UI

**状态**: ✅ 已修复

---

## Bug 2：卷无法删除

**文件**: `src/hooks/useNovelData.ts`

**问题**: setActiveChapterId在删除卷后可能引用已删除章节ID。原代码从novelsRef读取章节列表，但setChapters的更新可能还未反映到novelsRef，导致找不到当前章节，逻辑判断出错。

**修复**: 修正setActiveChapterId逻辑：如果当前活跃章节属于被删卷或找不到，切换到剩余章节

**状态**: ✅ 已修复

---

## Bug 3：大纲与正文生成解析大纲逻辑不一致

**文件**: `src/components/Workflow/hooks/useWorkflowEngine.ts`

**问题**: outlineAndChapter节点已使用cleanAndParseJSON+extractEntries，与大纲节点一致

**状态**: ✅ 已修复（此前已修复）

---

## 不能动的代码
- workflowHelpers.ts中的cleanAndParseJSON和extractEntries
- WorkflowManager.ts中的核心状态管理
- storage.ts中的持久化逻辑
- types.ts中的类型定义

## 修复优先级
1. Bug 2（卷删除）- ✅ 已修复
2. Bug 1（章节归属）- ✅ 已修复
3. Bug 3 - ✅ 已修复
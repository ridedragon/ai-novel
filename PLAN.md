# 灵感功能实现计划书

## 1. 需求分析
用户希望在自动化创作中心添加一个“灵感”功能，拥有独立的 UI 界面，功能类似于大纲、角色集和世界观。
位置：放在世界观前面。

## 2. 数据结构设计 (src/types.ts)
需要新增以下类型定义：
- `InspirationItem`: { id: string, content: string, tags?: string[] } (或者简单点，参考 WorldviewItem: { keyword: string, description: string }? 用户说和大纲差不多，可能更像是一个 idea 的列表。暂定 title + content)
- `InspirationSet`: { id: string, name: string, items: InspirationItem[], userNotes?: string }
- 更新 `Novel` 接口，包含 `inspirationSets: InspirationSet[]`
- 预设相关：需要在 `GeneratorSettingsType` 中支持 `inspiration` (虽然 types.ts 里没这个 type，但在 App.tsx 里有字面量类型)

## 3. 组件开发 (src/components/InspirationManager.tsx)
基于 `WorldviewManager.tsx` 进行复用和修改。
- 布局：左侧灵感集列表，右侧灵感条目列表。
- 功能：
  - 管理灵感集 (增删改名)
  - 管理灵感条目 (增删改)
  - AI 生成灵感 (调用 AI 接口)
  - 用户笔记 (Context)

## 4. 主程序集成 (src/App.tsx)
- 状态管理：
  - `inspirationPresets` (默认预设)
  - `activeInspirationPresetId`
  - `activeInspirationSetId`
  - `isGeneratingInspiration` 等状态
- 逻辑处理：
  - 处理灵感集的增删改查
  - 处理 AI 生成灵感的请求 (`handleGenerateInspiration`)
  - 数据持久化 (localStorage)
- UI 更新：
  - 在 `creationModule` 状态中添加 `inspiration` 选项。
  - 在主菜单 (Dashboard) 添加“灵感”入口卡片。
  - 在各模块顶部的导航栏添加“灵感”跳转按钮。
  - 渲染 `InspirationManager` 组件。
  - 全局设置模态框中添加“灵感生成设置”。

## 5. 文档更新
- 更新 `变量和函数.md` (variable_report.md)

## 6. 执行步骤
1. [ ] 更新 `src/types.ts` 定义数据结构。
2. [ ] 更新 `variable_report.md`。
3. [ ] 创建 `src/components/InspirationManager.tsx`。
4. [ ] 更新 `src/App.tsx` 集成新功能。
5. [ ] 验证功能。

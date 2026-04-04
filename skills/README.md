# Skills 文件夹

在此文件夹中存放所有的 Skill 文件。每个 Skill 是一个独立的 `.md` 文件。

## 文件结构

```
skills/
├── chapter-writer.md          # 章节创作专家
├── outline-planner.md         # 大纲规划专家
├── character-designer.md      # 角色设计专家
├── style-polisher.md          # 文笔润色专家
├── worldview-builder.md       # 世界观构建专家
└── your-custom-skill.md       # 你的自定义 Skill
```

## 文件格式

每个 Skill 文件使用 Markdown 格式，以 YAML frontmatter 开头：

```markdown
---
name: skill-name
description: "当用户请求XXX时使用。描述触发条件..."
user-invocable: true
disable-model-invocation: false
---

# Skill 标题

## 使用说明

详细的指令内容...

## 工作流程

1. 第一步
2. 第二步

## 注意事项

- 注意事项1
- 注意事项2
```

## 如何创建新 Skill

1. 复制一个现有的 `.md` 文件作为模板
2. 修改文件名（使用小写字母、数字、连字符）
3. 编辑 frontmatter 中的 `name` 和 `description`
4. 编写你的 Skill 指令内容
5. 在应用中点击"从文件加载"按钮即可导入

## 命名规范

- 文件名：`skill-name.md`（小写字母、数字、连字符）
- name 字段：必须与文件名（不含扩展名）一致
- description：描述"何时触发"而非"是什么"

## 示例

查看 `chapter-writer.md` 作为参考示例。

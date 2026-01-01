# Agent 协同与自动创作执行细节

## 1. 任务防偷懒机制：清单制 (Manifest-Based)

Agent 将不再盲目循环，而是遵循“预计划 -> 逐项执行 -> 强校验”的逻辑。

### 1.1 导演 Agent 预生成清单

在开始全自动创作前，系统强制调用一次导演 Agent 生成 `AgentManifest` 对象：

```typescript
{
  "totalChapters": 10,
  "chapters": [
    { "id": "ch1", "title": "初入仙门", "wordCountGoal": 2000, "keyEvents": ["测灵根", "遭遇嘲讽"] },
    ...
  ]
}
```

### 1.2 强制质量闸门 (Quality Gate)

- **字数对账**：实际输出字数若低于目标的 70%，自动触发“扩写模式”。
- **拒绝摘要**：逻辑质检 Agent 会使用正则匹配“总之”、“最终”、“他们决定”等概括性段落。一旦发现 Agent 在“写剧情大纲”而非“写正文”，则判定为偷懒并重试。

## 2. Agent 功能调用协议 (Internal Tools)

Agent 通过在正文中嵌入特定的 XML 标签来调用现有 UI 功能。

### 2.1 动作指令示例

- **更新角色状态**：`[ACTION:UPDATE_CHARACTER]{"name":"林风", "bio":"已断左臂，性格变得阴冷"}[/ACTION]`
- **新增世界观设定**：`[ACTION:ADD_WORLDVIEW]{"item":"聚灵阵", "setting":"通过消耗灵石聚集周遭灵气的阵法"}[/ACTION]`

### 2.2 拦截器逻辑 (src/App.tsx)

在流式传输结束后，解析器将提取这些标签并直接调用现有的 `updateCharacterSets` 或 `updateWorldviewSets` 方法。

## 3. 冲突预防方案

### 3.1 影子副本 (Shadow Copy)

- **锁定上下文**：全自动模式开启时，快照化当前的 `characters` 和 `worldview`。
- **只读快照**：Agent 创作期间，只读取快照内容，不受用户临时点击界面的影响。

### 3.2 版本合并 (Conflict Resolution)

- Agent 所有的产出统一存入 `src/types.ts` 的 `ChapterVersion` 中，`type` 标记为 `optimized`。
- 永远不自动覆盖用户的 `original` 版本。

## 4. 无审查创作支持

### 4.1 本地模型适配

- 在 `GlobalSettingsModal.tsx` 中增加 `Local Model (Ollama/LM Studio)` 一键配置。
- 默认地址指向 `http://localhost:11434`。

### 4.2 Prompt 脱敏

- 针对本地模型，自动切换到 `Jailbreak` 模式（参考 `defaultPrompts` ID:3）。
- 移除所有包含“请作为 AI 助手，遵守道德准则”的系统前缀。

# 预设参数传递问题调查报告

## 调查背景

用户反馈在“角色集”等模块的预设中，`temperature`、`top_p`、`top_k` 等参数似乎未能正确传递给 AI，导致相同提示词生成的回复内容完全相同（表现为确定性过高，缺乏随机性）。

## 核心发现

经过对 `src/App.tsx` 和 `src/types.ts` 的代码审计，发现以下几个关键问题：

### 1. 参数命名不一致 (Naming Mismatch)

在代码中，预设对象（`GeneratorPreset` 和 `CompletionPreset`）内部使用的是小驼峰命名法（如 `topP`, `topK`），但在调用 OpenAI API 时，API 期望的是蛇形命名法（`top_p`, `top_k`）。虽然代码中进行了手动转换，但这种不一致增加了出错风险。

### 2. 默认值覆盖逻辑问题

在多个生成函数中（如 `handleGenerateCharacters`, `handleGenerateOutline` 等），代码使用了如下逻辑：

```typescript
temperature: activePreset.temperature ?? 0.7,
top_p: activePreset.topP ?? 0.95,
top_k: activePreset.topK && activePreset.topK > 0 ? activePreset.topK : 1,
```

**问题：**

- 如果用户在预设中将 `temperature` 设置为 `0`（这是一个合法的有效值，代表完全确定性），`??` 运算符虽然能正确处理 `0`，但如果某些地方误用了 `||`，则会被覆盖为默认值。
- `top_k` 的逻辑强制将其限制为至少为 `1`。虽然对于大多数模型这是合理的，但如果预设未定义 `topK`，它将始终默认为 `1`。

### 3. OpenAI API 对 top_k 的支持问题

**关键点：** 标准的 OpenAI Chat Completion API **并不支持** `top_k` 参数。

- 如果用户使用的是官方 OpenAI 接口，传递 `top_k` 会被忽略。
- 如果用户使用的是某些兼容 OpenAI 接口的本地模型（如 Ollama, vLLM）或转发服务，`top_k` 可能会生效。
- 如果 `top_k` 被设置为 `1`（代码中的默认行为），AI 将总是选择概率最高的下一个词，这会极大地降低生成的随机性，导致“生成内容完全相同”的现象。

### 4. 主聊天界面与模块预设的脱节

在 `handleGenerate`（主界面生成逻辑）中，使用的是全局状态 `temperature`, `topP`, `topK`。
而在 `handleGenerateCharacters` 等模块逻辑中，使用的是 `activePreset` 对象中的值。
**风险：** 如果用户在主界面修改了参数，但没有点击“保存预设”，那么在模块生成时，依然会使用旧的预设值，导致用户感到设置“没生效”。

## 详细检查：其他预设是否存在同样问题？

是的，以下模块均存在相同的问题逻辑：

1. **大纲生成 (`handleGenerateOutline`)**: 同样硬编码了默认值，且受 `top_k: 1` 的限制。
2. **灵感生成 (`handleGenerateInspiration`)**: 同样存在。
3. **世界观生成 (`handleGenerateWorldview`)**: 同样存在。
4. **润色优化 (`handleOptimize`)**: 同样存在。
5. **章节分析 (`handleOptimize` 中的分析阶段)**: 同样存在。

## 结论

导致“生成内容完全相同”的最核心原因是：

1.  **`top_k` 默认值陷阱**：
    - 在 `src/App.tsx` 的所有生成逻辑中，`top_k` 被硬编码为：`top_k: activePreset.topK && activePreset.topK > 0 ? activePreset.topK : 1`。
    - 所有的默认预设（灵感、大纲、角色、世界观）中，`topK` 都被初始化为了 `1`。
    - **后果**：如果接口支持 `top_k`，设置为 `1` 会导致模型进入“贪婪搜索”模式，永远只选概率最高的词，从而导致输出完全一致。

2.  **UI 限制**：
    - 在预设编辑界面，`Top K` 的最小值被限制为 `1`（`min: 1`），用户无法通过 UI 将其关闭或设置为 `0`。

3.  **参数传递逻辑**：
    - 虽然参数确实传递了，但由于默认值 `1` 的存在，掩盖了 `temperature` 和 `top_p` 带来的随机性。

## 建议修复方案

1.  **修改 `top_k` 默认逻辑**：将默认值改为 `0` 或 `undefined`，并在发送请求时，仅当 `top_k > 0` 时才传递该参数。
2.  **调整 UI 范围**：允许 `Top K` 设置为 `0`（代表不限制）。
3.  **增加调试日志**：在 `terminal.log` 中打印实际发送给 API 的完整参数对象，让用户能直观看到 `temperature` 等值是否生效。
4.  **统一默认预设**：将默认预设中的 `topK` 改为更合理的值（如 `50`）或直接移除。

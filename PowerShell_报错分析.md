# AI 小说项目 PowerShell 终端日志 & 报错全解析

本文档详尽记录了在 PowerShell 中运行本项目时，终端打印的所有关键日志（通过 `virtual:terminal` 插件转发）及环境报错信息。

---

## 1. AI 引擎工作流日志 (AI Engine Logs)

当你执行自动创作、润色或分析任务时，PowerShell 会捕获并打印大模型的请求细节与处理状态。

### 🤖 创作请求启动 (AI Request Header)

每次发起请求时都会打印详细的模型参数配置：

```text
>> AI REQUEST [全自动正文创作]
>> -----------------------------------------------------------
>> Model:       gemini-3-flash-preview
>> Temperature: 1.08
>> Top P:       1
>> Top K:       210
>> -----------------------------------------------------------
```

### 🌊 流式生成进度 (Streaming Progress)

实时显示 Token 接收情况及最终性能统计：

```text
» [AUTOWRITE] 正在生成流式内容: 已接收 150 tokens...
» [PERF] 流式输出统计: Token总数=241, 触发状态更新次数=18, 预估平均每秒更新=1.2次
```

### 🛠️ 后台自动优化 (Background Optimization)

当开启“自动优化”时，系统会在生成章节后静默启动后台任务：

```text
» [AutoWrite] Auto-optimization (background) triggered for chapter 1767677897803.
» [AutoWrite] Max concurrent optimizations reached (3). Skipping auto-optimize to avoid blocking.
```

### 🧠 优化/分析结果摘要

分析结果会被裁剪后打印，以便开发者预览 AI 的判断逻辑：

```text
» [Analysis Result] chapter 1767677897803:
  你好。我是你的主编。看完这段文字，我的第一反应是：你是在写玄幻小说...
» [Optimization Result] chapter 1767677897803 length: 2911
```

---

## 2. 存储与系统日志 (Storage & System Logs)

展示数据持久化状态及性能表现。

### 💾 数据库保存详情 (Atomic Parallel I/O)

每次保存数据时，会打印写入的任务统计：

```text
» [STORAGE] 更新元数据: 《作品标题》
» [STORAGE] 更新章节正文: ChapterID=101, 长度=4328
»
  [PERF] storage.saveNovels (原子化并行模式):
  - 写入任务数: 5 (并发提交)
  - 正文写入: 1 节
  - 数据库 I/O 耗时: 4ms
  - 总执行耗时: 6ms
```

### 📂 按需加载日志 (On-demand Loading)

```text
» [STORAGE] 正在按需加载《书名》的数据 (原子化并行模式)...
» [STORAGE] 《书名》加载完成 (42 章节)，耗时: 12ms
```

---

## 3. 性能警告与限制 (Performance Alerts)

当系统检测到卡顿或资源压力时，会通过黄色或红色文字在终端示警。

### ⚡ 正则处理卡顿 (Regex PERF)

当正则脚本处理超长文本耗时过长：

```text
» [PERF ALERT] applyRegexToText 耗时过长: 156ms (处理 3 个脚本, 文本长度 18240)
» [PERF] applyRegexToText: 处理 2 个脚本, 耗时 16ms, 文本长度 2911
```

### 🚦 写入频率过高 (Frequency Alert)

```text
» [FREQ ALERT] storage.saveNovels 触发频率过高: 500ms内达 8 次 (建议检查组件更新源)
» [MEM] 当前 storage 内存缓存项总数: 582 (注意：长期运行可能导致内存持续增加)
```

---

## 4. 环境及底层报错对照 (Environment Errors)

| 终端打印示例                            | 故障描述                 | 解决方法                                                   |
| :-------------------------------------- | :----------------------- | :--------------------------------------------------------- |
| `UnauthorizedAccess`                    | PowerShell 执行策略限制  | 执行 `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `EADDRINUSE: ... :5173`                 | Vite 端口冲突            | 关闭残留终端进程或运行 `netstat` 清理 PID                  |
| `CommandNotFoundException`              | 未安装 Node.js/npm       | 安装 Node.js 并检查环境变量 `Path`                         |
| `EPERM: operation not permitted`        | 文件/目录被系统进程锁定  | 关闭正在占用文件夹的编辑器、杀毒软件或资源管理器           |
| `TS2339: Property '...' does not exist` | TypeScript 语法/类型错误 | 检查打印出的源码行号，修正类型定义                         |

---
*本报告基于项目 `src/utils/` 下的日志逻辑自动整理。*

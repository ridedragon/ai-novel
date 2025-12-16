# 大纲生成 "Connection error" 错误分析报告

## 1. 问题描述
用户在使用 "大纲生成" 功能时，遇到错误提示：
`[Outline] Attempt 1 failed: Connection error`

这意味着应用程序尝试调用 AI API 生成大纲时，第 1 次尝试就因为连接错误而失败。

## 2. 代码定位
该错误日志产生于 `src/App.tsx` 文件中的 `handleGenerateOutline` 函数。

**相关代码片段 (约第 1718 - 1735 行):**

```typescript
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Aborted') {
            terminal.log('[Outline] Generation aborted.')
            break
        }
        
        let errorMsg = err.message || String(err)
        if (err.status) errorMsg += ` (Status: ${err.status})`
        if (err.error) errorMsg += `\nServer Response: ${JSON.stringify(err.error)}`

        // 关键报错行
        terminal.error(`[Outline] Attempt ${attempt + 1} failed: ${errorMsg}`)
        console.error('[Outline Error]', err)

        attempt++
        if (attempt >= maxAttempts) {
          setError(errorMsg || '生成大纲出错 (重试次数已耗尽)')
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
```

## 3. 触发流程分析
1. 用户点击 "生成" 按钮，触发 `handleGenerateOutline`。
2. 函数内部读取配置 (API Key, Base URL, Model)。
3. 初始化 `OpenAI` 客户端实例。
4. 调用 `openai.chat.completions.create` 方法发起网络请求。
5. **请求失败**，抛出异常。
6. 进入 `catch` 块，获取 `err.message` (即 "Connection error")。
7. 通过 `terminal.error` 将格式化后的错误信息输出到终端。

## 4. 根本原因分析
"Connection error" (连接错误) 通常由以下原因导致，与代码逻辑本身关系不大，更多是**环境配置**问题：

### A. 网络连通性问题 (最常见)
由于 OpenAI API (默认 `api.openai.com`) 在部分地区无法直接访问。如果当前网络环境无法连接该域名，或者网络不稳定，就会报此错。

### B. Base URL 配置错误
如果在设置中配置了自定义的 `Base URL` (例如使用中转服务)，但地址填写错误（如多了空格、协议头错误、域名拼写错误），会导致无法建立连接。

### C. 代理设置问题
如果本地开启了 VPN 或代理软件，但 VSCode 或 Webview 环境没有正确接管代理设置，也可能导致请求发不出去。

## 5. 排查与解决方案

建议按照以下步骤进行排查：

1. **检查 Base URL 设置**：
   - 打开应用的 "设置" 面板。
   - 检查 `Base URL` 是否正确。
   - 如果使用官方 API，应为 `https://api.openai.com/v1`。
   - 如果使用中转 API，确保地址格式正确且服务可用。

2. **检查网络/代理**：
   - 确保你的网络可以访问配置的 API 地址。
   - 如果你在中国大陆使用官方 API，必须确保你的网络环境可以访问 OpenAI。

3. **检查 API Key**：
   - 虽然通常 API Key 错误会报 `401 Unauthorized`，但有时服务商的鉴权网关在 Key 无效时也可能直接阻断连接。

4. **查看完整控制台日志**：
   - 按 `F12` 打开开发者工具，查看 `Console` 面板中的 `[Outline Error]` 详细对象，可能会包含更底层的网络错误代码 (如 `ERR_CONNECTION_REFUSED`, `ERR_TIMED_OUT` 等)。

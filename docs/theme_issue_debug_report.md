# 白天/黑夜主题切换失效排查报告

## 1. 现象描述

用户反馈无法在白天和黑夜模式间切换，或者界面始终维持白色。经初步代码审查，可能涉及 CSS 优先级、初始化脚本或组件样式覆盖问题。

## 2. 核心原因分析

### 2.1 CSS 根样式默认值过于激进 (`src/index.css`)（不是原因）

**现状**：
在最近的修改中，`src/index.css` 的 `:root` 选择器被赋予了深色背景颜色：

```css
:root {
  color-scheme: dark;
  background-color: #09090b; /* 默认纯黑 */
}
```

**问题**：
虽然定义了 `:root.light`，但这种“默认深色”的策略意味着只要 `<html>` 标签上**没有** `light` 类（例如类名移除延迟、脚本执行错误、或 React 状态未及时同步），页面就会立刻回退到深色模式。这使得“浅色模式”变得脆弱，必须显式存在 `light` 类才能生效，而不是默认生效。

### 2.2 `index.html` 初始化脚本逻辑

**现状**：
`index.html` 包含一段内联脚本用于读取 `localStorage` 并设置类名。
**问题**：
该脚本包含 `try...catch` 块，在出错时默认强制启用深色模式：

```javascript
} catch (e) {
  document.documentElement.classList.add('dark');
}
```

如果在某些环境中读取 `localStorage` 失败（权限问题或格式错误），用户将无法切换回浅色模式，因为脚本会在每次刷新时强制覆盖为 Dark。

### 2.3 组件层级的样式覆盖 (`NovelDashboard.tsx` 等)

**现状**：
组件使用了 Tailwind 的 `dark:` 前缀：

```tsx
className="min-h-screen bg-[#F8FAFC] dark:bg-[#09090b] ..."
```

**问题**：
如果 `darkMode: 'class'` 配置生效，且 HTML 标签上确实有 `light` 类，照理说 `dark:bg-[#09090b]` 不会生效，应显示 `#F8FAFC`（灰白）。如果依然显示黑色，可能有两种情况：

1. `bg-[#F8FAFC]` 被 CSS 全局样式（如 `body` 或 `:root` 的背景色）意外覆盖。
2. `min-h-screen` 的容器外部（如 `body`）是黑色的，而容器本身因为某些布局原因（margin/padding）露出了底部的黑色。

## 3. 分步排查与修复计划

我们将按照以下顺序验证并修复：

### 第一步：验证 DOM 状态 (开发者自测)

- 打开浏览器控制台。
- 点击切换主题按钮。
- **观察**：`html` 标签的 `class` 属性是否在 `light` 和 `dark` 之间切换？
  - **如果未切换**：问题出在 `ThemeContext.tsx` 或 `GlobalSettingsModal.tsx` 的事件绑定。
  - **如果已切换但界面仍黑**：问题出在 CSS 样式覆盖。

### 第二步：修正全局 CSS 默认策略 (高优先级)

- **修改 `src/index.css`**：
  - 将 `:root` 的默认颜色恢复为浏览器默认（通常是白）或中性。
  - 将深色样式严格限定在 `:root.dark` 选择器内。
  - 确保 `body` 的背景色跟随主题，而不是硬编码。

### 第三步：检查 ThemeContext 逻辑

- 确保 `setTheme` 正确更新 `localStorage`。
- 确保 `useEffect` 能够正确移除 `dark` 类并添加 `light` 类。

### 第四步：检查 `index.html` 脚本

- 确保初始化脚本逻辑与 React 的 `ThemeContext` 逻辑一致，不会发生“脚本设为黑，React 设为白”的竞争状态。

## 4. 建议修改代码预览

**src/index.css 调整建议：**

```css
:root {
  /* 移除硬编码的深色背景，恢复默认或定义变量但不赋值颜色 */
  /* background-color: #09090b;  <-- 删除此行 */
  font-family: Inter, system-ui, ...;
}

:root.dark {
  /* 仅在 dark 类存在时应用深色 */
  background-color: #09090b;
  color-scheme: dark;
}

:root.light {
  background-color: #ffffff;
  color-scheme: light;
}

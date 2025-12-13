# 在 Android 手机 Termux 上运行 AI 小说写作助手

本教程将指导你如何在 Android 手机上使用 Termux 运行本项目。这样你就可以随时随地在手机上进行 AI 小说创作，并且拥有完整的 PC 端功能体验（已适配移动端布局）。

## 第一步：安装 Termux

1.  **下载**: 建议从 **F-Droid** 下载 Termux，因为 Google Play Store 上的版本已不再维护。
    *   F-Droid 下载地址: [https://f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)
2.  **安装**: 下载 APK 后安装到手机上。

## 第二步：配置基础环境

打开 Termux 应用，依次执行以下命令（复制粘贴即可，按回车执行）：

1.  **更新软件包列表**（遇到提示输入 `y` 确认）：
    ```bash
    pkg update && pkg upgrade
    ```

2.  **安装 Node.js** (运行本项目的核心环境)：
    ```bash
    pkg install nodejs
    ```

3.  **安装 Git** (如果需要从仓库拉取代码)：
    ```bash
    pkg install git
    ```

4.  **授予存储权限** (允许 Termux 访问手机文件，方便传输代码)：
    ```bash
    termux-setup-storage
    ```
    *   执行后手机会弹出权限请求，请点击“允许”。

## 第三步：将项目代码传输到手机

你需要将电脑上的项目文件夹传输到手机上。

**方法 A：使用 USB 数据线**
1.  将手机连接电脑。
2.  将整个 `ai-novel-writer` 文件夹复制到手机的内部存储根目录，例如重命名为 `ai-writer`。

**方法 B：Termux 中操作（推荐）**
可以直接从 GitHub 拉取最新代码：
```bash
git clone https://github.com/ridedragon/ai-novel.git
cd ai-novel
```

## 第四步：在 Termux 中运行项目

假设你使用**方法 B**拉取了代码：

1.  **进入项目目录**：
    ```bash
    cd ai-novel
    ```
    *   如果是**方法 A**，则进入 `cd storage/shared/ai-writer`。

2.  **安装依赖与启动**：
    推荐直接运行启动脚本，它会自动安装依赖、修复权限并启动服务：
    ```bash
    bash start.sh
    ```
    
    *   如果在运行过程中遇到 `sh: 1: vite: Permission denied` 错误，脚本会自动尝试修复。如果仍然报错，请手动运行：`chmod +x node_modules/.bin/vite`。
    *   首次运行会自动执行 `npm install`，可能需要几分钟。
    *   脚本已包含 `--host` 参数，确保可以通过手机 IP 访问。

    或者手动分步运行：
    ```bash
    npm install
    chmod +x node_modules/.bin/vite  # 修复 Termux 下的权限问题
    npm run dev -- --host
    ```

## 第五步：浏览器访问

当 Termux 界面显示如下信息时：
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

1.  打开手机浏览器（推荐 Chrome, Firefox 或 Edge）。
2.  在地址栏输入：`http://localhost:5173`。
3.  现在你应该能看到适配好移动端界面的写作助手了！

## 常见问题与技巧

*   **保持后台运行**：Android 系统可能会杀掉后台的 Termux。建议在通知栏中展开 Termux 通知，点击 "Acquire wakelock" 防止休眠，或者在电池设置中允许 Termux 后台运行。
*   **输入 API Key**：由于是在新设备（手机）上运行，你需要点击右上角的设置图标，重新输入你的 OpenAI API Key 和 Base URL。
*   **局域网访问**：如果你在同一 Wi-Fi 下的平板或电脑上，输入 Termux 显示的 Network 地址（如 `http://192.168.1.5:5173`），也可以访问手机上运行的这个服务。
*   **停止运行**：请务必在 Termux 界面按 `Ctrl + C` 来停止服务器。
    *   **注意**：不要使用 `Ctrl + Z`，那只会把程序挂起到后台而不是关闭，导致下次启动时提示端口被占用。
    *   **解决端口占用**：如果遇到端口占用问题，新版启动脚本会尝试自动清理。为了让自动清理生效，建议在 Termux 中安装 `lsof` 工具：`pkg install lsof`。

祝创作愉快！

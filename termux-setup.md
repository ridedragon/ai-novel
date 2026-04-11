# Termux 环境设置指南

## 📱 适用于 Android 设备的 Termux 环境设置

### 1. 安装 Termux

在 Google Play Store 或 F-Droid 中搜索并安装 Termux。

### 2. 基本设置

打开 Termux 并执行以下命令：

```bash
# 更新系统
pkg update && pkg upgrade -y

# 安装必要的软件包
pkg install nodejs git -y

# 安装 yarn (可选)
pkg install yarn -y
```

### 3. 克隆项目

```bash
# 克隆项目
git clone https://github.com/your-username/ai-novel-writer.git

# 进入项目目录
cd ai-novel-writer
```

### 4. 安装依赖

```bash
# 安装项目依赖
npm install

# 或者使用 yarn
yarn install
```

### 5. 启动应用

```bash
# 给启动脚本添加执行权限
chmod +x start-termux.sh

# 运行启动脚本
./start-termux.sh
```

### 6. 访问应用

在 Termux 中启动服务器后，您可以：

- 在手机浏览器中打开：http://localhost:8002
- 在同一网络的其他设备上打开：http://<Termux-IP>:8002

### 7. 查看日志

所有流式输出相关的日志都会在 Termux 终端中显示：

- **[Stream]** 开头的日志：正文生成的流式传输
- **[AutoWrite Stream]** 开头的日志：自动写作的流式传输
- 错误和警告信息

### 8. 停止服务器

按 `Ctrl+C` 停止所有服务器。

### 9. 常见问题

#### 端口占用
如果遇到端口占用问题，尝试：
```bash
# 查看占用端口的进程
lsof -i :8002

# 终止进程
kill <进程ID>
```

#### 内存不足
Termux 可能会遇到内存限制，建议：
- 关闭其他应用
- 增加 Termux 的内存限制
- 使用较小的模型

#### 网络问题
确保 Termux 有网络权限，并且网络连接稳定。

### 10. 性能优化

- 使用 gpt-3.5-turbo 模型获得更好的性能
- 减少上下文长度
- 关闭不必要的服务

## 🎉 开始使用

现在您可以在 Termux 环境中测试流式输出功能，所有日志都会在终端中显示，无需查看浏览器控制台。

如果遇到任何问题，请参考日志输出进行排查。

#!/bin/bash

echo "============================================="
echo "📝 小说写作应用 - Termux 版本"
echo "============================================="
echo "正在启动所有服务器..."

# 启动数据持久化服务器
echo "1. 启动数据持久化服务器..."
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!
sleep 3

# 启动内存监控服务器
echo "2. 启动内存监控服务器..."
nohup node memory-server.js > memory.log 2>&1 &
MEMORY_PID=$!
sleep 3

echo "============================================="
echo "📋 主应用详细日志 - 流式输出相关信息"
echo "============================================="
echo "🔗 主应用: http://localhost:8002"
echo "🔗 内存监控: http://localhost:8003"
echo "============================================="
echo "📝 日志说明:"
echo "- [Stream] 开头的日志：流式传输相关"
echo "- [AutoWrite Stream] 开头的日志：自动写作流式传输"
echo "- 错误信息：红色显示"
echo "- 警告信息：黄色显示"
echo "============================================="
echo "💡 使用步骤:"
echo "1. 在浏览器中打开 http://localhost:8002"
echo "2. 尝试生成正文内容"
echo "3. 在此窗口查看流式输出日志"
echo "4. 观察是否有 [Stream] 开头的日志"
echo "============================================="
echo "按 Ctrl+C 停止所有服务器"
echo "============================================="

# 启动主应用开发服务器，启用详细日志
export VITE_APP_DEBUG=true
export NODE_ENV=development

# 运行开发服务器
node --trace-warnings node_modules/vite/bin/vite.js

# 当用户按 Ctrl+C 时，停止所有服务器
trap "echo '\n正在停止所有服务器...'; kill $SERVER_PID $MEMORY_PID 2>/dev/null; echo '所有服务器已停止'; exit 0" INT

# 等待用户输入
wait

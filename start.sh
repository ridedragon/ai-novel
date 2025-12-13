#!/bin/bash

echo "Starting AI Novel Writer..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error installing dependencies. Please check your npm installation."
        exit 1
    fi
fi

echo "Starting development server..."

# 端口清理逻辑
PORT=8002
if command -v lsof >/dev/null 2>&1; then
    PID=$(lsof -t -i:$PORT)
    if [ -n "$PID" ]; then
        echo "检测到端口 $PORT 被占用 (PID: $PID)，正在清理..."
        kill -9 $PID
    fi
elif command -v fuser >/dev/null 2>&1; then
    fuser -k $PORT/tcp >/dev/null 2>&1
else
    # 简易检测端口是否被占用 (如果 netstat 存在)
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln | grep -q ":$PORT "; then
            echo "警告: 端口 $PORT 似乎被占用了。"
            echo "提示: 如果你之前使用了 Ctrl+Z 退出，进程实际上还在后台运行。"
            echo "建议: 使用 'fg' 命令回到后台进程并按 Ctrl+C 退出，或者运行 'killall -9 node' (慎用)。"
            echo "推荐: 安装 lsof (pkg install lsof) 以便脚本能自动清理端口。"
        fi
    fi
fi

# 修复 Termux/Linux 下的执行权限问题
if [ -d "node_modules/.bin" ]; then
    chmod +x node_modules/.bin/* 2>/dev/null
fi

npm run dev -- --host

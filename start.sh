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

# 修复 Termux/Linux 下的执行权限问题
if [ -d "node_modules/.bin" ]; then
    chmod +x node_modules/.bin/* 2>/dev/null
fi

npm run dev -- --host

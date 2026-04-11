@echo off

echo =============================================
echo 📝 小说写作应用 - 带详细日志输出

echo =============================================
echo 正在启动数据持久化服务器...
start "Data Server" /min node server.js

ping 127.0.0.1 -n 3 > nul

echo 正在启动内存监控服务器...
start "Memory Monitor" /min node memory-server.js

ping 127.0.0.1 -n 3 > nul

echo 正在启动主应用开发服务器...
echo =============================================
echo 📋 日志输出将显示在此窗口

echo 🔗 主应用: http://localhost:8002
echo 🔗 内存监控: http://localhost:8003
echo =============================================
echo 按 Ctrl+C 停止所有服务器
echo =============================================

node --trace-warnings node_modules\vite\bin\vite.js

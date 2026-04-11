@echo off

echo =============================================
echo 📝 小说写作应用 - 详细日志模式
echo =============================================
echo 正在启动所有服务器...

rem 启动数据持久化服务器
start "Data Server" /min cmd /c "echo 数据服务器日志 && node server.js"

ping 127.0.0.1 -n 3 > nul

rem 启动内存监控服务器
start "Memory Monitor" /min cmd /c "echo 内存监控日志 && node memory-server.js"

ping 127.0.0.1 -n 3 > nul

echo =============================================
echo 📋 主应用详细日志
echo =============================================
echo 🔗 主应用: http://localhost:8002
echo 🔗 内存监控: http://localhost:8003
echo =============================================
echo 所有流式输出相关日志将显示在此窗口
echo 按 Ctrl+C 停止所有服务器
echo =============================================

rem 启动主应用开发服务器，启用详细日志
set VITE_APP_DEBUG=true
set NODE_ENV=development
node --trace-warnings --inspect node_modules\vite\bin\vite.js

@echo off

echo =============================================
echo 📝 小说写作应用 - 完整日志模式
echo =============================================
echo 正在启动所有服务器...

echo 1. 启动数据持久化服务器...
start "Data Server" /min cmd /c "echo 数据服务器日志 && node server.js"

ping 127.0.0.1 -n 3 > nul

echo 2. 启动内存监控服务器...
start "Memory Monitor" /min cmd /c "echo 内存监控日志 && node memory-server.js"

ping 127.0.0.1 -n 3 > nul

echo =============================================
echo 📋 主应用详细日志 - 流式输出相关信息
echo =============================================
echo 🔗 主应用: http://localhost:8002
echo 🔗 内存监控: http://localhost:8003
echo =============================================
echo 📝 日志说明:
echo - [Stream] 开头的日志：流式传输相关
echo - [AutoWrite Stream] 开头的日志：自动写作流式传输
echo - 错误信息：红色显示
echo - 警告信息：黄色显示
echo =============================================
echo 💡 使用步骤:
echo 1. 在浏览器中打开 http://localhost:8002
echo 2. 尝试生成正文内容
echo 3. 在此窗口查看流式输出日志
echo 4. 观察是否有 [Stream] 开头的日志
echo =============================================
echo 按 Ctrl+C 停止所有服务器
echo =============================================

rem 启动主应用开发服务器，启用详细日志
set VITE_APP_DEBUG=true
set NODE_ENV=development
node --trace-warnings node_modules\vite\bin\vite.js

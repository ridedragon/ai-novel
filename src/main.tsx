import { memoryMonitor } from 'memory-monitor-sdk'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LayoutProvider } from './contexts/LayoutContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

// 初始化内存监控 SDK (第四个参数设为 false 以隐藏默认的小悬浮窗)
memoryMonitor.startMonitoring(2000, 300, 20, false);

// 由于现有的 SDK v1.0.2 似乎不直接支持自动上报到 8003 端口
// 我们通过拦截其 logMemoryUsage 或手动创建一个上报循环
setInterval(() => {
  if (window.performance && (window.performance as any).memory) {
    const memory = (window.performance as any).memory;
    fetch('http://localhost:8003/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        // 关键：捕捉 DOM 节点数量，帮助分析渲染进程负担
        domNodes: document.getElementsByTagName('*').length,
        rss: (window.performance as any).memory.jsHeapSizeLimit || 0, // 使用限制作为对比
        external: (window.performance as any).memory.totalJSHeapSize - (window.performance as any).memory.usedJSHeapSize,
        arrayBuffers: 0
      })
    }).catch(() => {}); // 忽略上报错误
  }
}, 2000);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <LayoutProvider>
          <App />
        </LayoutProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

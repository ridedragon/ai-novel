import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8003;

// 解决跨域问题，允许来自主应用的请求
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Middleware for parsing JSON
app.use(express.json());

// 存储连接的 SSE 客户端
let clients = [];

// 托管我们的炫酷 UI 目录
const uiPath = path.join(__dirname, 'monitor-ui');
app.use(express.static(uiPath));

/**
 * 接收来自 SDK 的内存数据上报
 */
app.post('/api/report', (req, res) => {
  const memoryData = req.body;
  console.log(`[Monitor] Received report: ${Math.round(memoryData.heapUsed / 1024 / 1024)}MB`);

  // 广播给所有连接的监控页面
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(memoryData)}\n\n`);
  });

  res.status(204).end();
});

/**
 * SSE (Server-Sent Events) 端点，用于实时推送数据给 UI
 */
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  console.log(`[Monitor] Client ${clientId} connected. Total: ${clients.length}`);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
    console.log(`[Monitor] Client ${clientId} disconnected. Total: ${clients.length}`);
  });
});

// 默认路由指向我们的 index.html (使用中间件作为后备，兼容 Express 5)
app.use((req, res) => {
  res.sendFile(path.join(uiPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Kilo-Memory Cyber-Monitor 3D is active!`);
  console.log(`🔗 Interface: http://localhost:${PORT}`);
  console.log(`📡 API Endpoint: http://localhost:${PORT}/api/report\n`);
});

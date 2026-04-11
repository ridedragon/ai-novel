import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'local_data');

// 确保数据目录存在
try {
  await fs.access(DATA_DIR);
} catch {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// 解决跨域问题
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 增加 JSON 请求体限制，防止大章节保存失败
app.use(express.json({ limit: '100mb' }));

// 辅助函数：将 key 转换为安全的文件名
function getKeyFilename(key) {
  // 简单的替换非法字符，或者直接使用 base64 编码 key 也可以，但明文文件名更易读
  // 这里假设 key 都是相对安全的字符 (字母、数字、下划线)
  // 为了安全，还是做一些替换
  return key.replace(/[^a-zA-Z0-9_\-\.]/g, '_') + '.json';
}

// GET /api/storage/:key
app.get('/api/storage/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const filePath = path.join(DATA_DIR, getKeyFilename(key));

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      res.json(JSON.parse(data));
    } catch (err) {
      if (err.code === 'ENOENT') {
        // 文件不存在，返回 null 或 404，这里模仿 idb-keyval 返回 undefined 的行为，但在 HTTP 中我们返回 404 或 null
        return res.json(null);
      }
      throw err;
    }
  } catch (err) {
    console.error(`Error reading key ${req.params.key}:`, err);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// POST /api/storage/:key
app.post('/api/storage/:key', async (req, res) => {
  try {
    const key = req.params.key;
    let value = req.body;

    // 解包 __wrapped_value__（如果存在）
    if (value && typeof value === 'object' && '__wrapped_value__' in value) {
      value = value.__wrapped_value__;
    }

    const filePath = path.join(DATA_DIR, getKeyFilename(key));

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');

    res.json({ success: true });
  } catch (err) {
    console.error(`[STORAGE] Error writing key ${req.params.key}:`, err);
    res.status(500).json({ error: 'Failed to write data' });
  }
});

// DELETE /api/storage/:key
app.delete('/api/storage/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const filePath = path.join(DATA_DIR, getKeyFilename(key));

    try {
      await fs.unlink(filePath);
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json({ success: true }); // 文件本就不存在，视为成功
      }
      throw err;
    }
  } catch (err) {
    console.error(`Error deleting key ${req.params.key}:`, err);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

// SSE 流式AI回答端点
app.post('/api/ai/stream', async (req, res) => {
  try {
    const { model, messages, apiKey, baseUrl } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: '请提供API Key' });
    }
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '请提供有效的消息数组' });
    }
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // 构建请求体
    const requestBody = {
      model: model || 'gpt-3.5-turbo',
      messages,
      stream: true,
      temperature: 1.0,
      top_p: 1.0
    };
    
    // 发送请求到AI API
    const response = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ error: errorData.error?.message || 'API请求失败' });
    }
    
    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write(`data: [DONE]\n\n`);
            break;
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content;
            if (content) {
              res.write(`data: ${content}\n\n`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      // 确保数据被及时发送
      await new Promise(resolve => res.flushHeaders ? res.flushHeaders() : setImmediate(resolve));
    }
    
    res.end();
  } catch (error) {
    console.error('流式API错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 健康检查端点
app.head('/api/storage/__health', (req, res) => {
  res.status(200).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📦 Data Persistence Server is active!`);
  console.log(`🔗 Endpoint: http://0.0.0.0:${PORT}/api/storage`);
  console.log(`🔗 SSE Endpoint: http://0.0.0.0:${PORT}/api/ai/stream`);
  console.log(`📂 Data Dir: ${DATA_DIR}\n`);
  console.log(`💡 Note: If accessing from a phone, use the PC's IP address instead of localhost.\n`);
});

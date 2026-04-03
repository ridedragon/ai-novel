import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📦 Data Persistence Server is active!`);
  console.log(`🔗 Endpoint: http://0.0.0.0:${PORT}/api/storage`);
  console.log(`📂 Data Dir: ${DATA_DIR}\n`);
  console.log(`💡 Note: If accessing from a phone, use the PC's IP address instead of localhost.\n`);
});

// 健康检查端点
app.head('/api/storage/__health', (req, res) => {
  res.status(200).end();
});

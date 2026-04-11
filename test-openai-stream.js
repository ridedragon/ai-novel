#!/usr/bin/env node

console.log('=== OpenAI 流式输出测试 ===\n');

import OpenAI from 'openai';

// 从环境变量获取 API 密钥
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.log('⚠️  请设置 OPENAI_API_KEY 环境变量');
  console.log('\n示例: export OPENAI_API_KEY=your-api-key-here');
  process.exit(1);
}

// 创建 OpenAI 客户端
const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true
});

// 测试流式输出
async function testStreaming() {
  console.log('开始测试 OpenAI 流式输出...');
  console.log('模型: gpt-3.5-turbo');
  
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: '你是一个小说家，擅长写故事。'
        },
        {
          role: 'user',
          content: '请写一个简短的故事，关于一个年轻人发现了一个神秘的盒子。'
        }
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 300
    });

    console.log('\n开始接收流式响应...');
    let fullContent = '';
    let chunkCount = 0;
    let lastUpdateTime = 0;
    let uiUpdateCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        chunkCount++;
        
        const now = Date.now();
        // 每 100ms 更新一次 UI
        if (now - lastUpdateTime > 100) {
          lastUpdateTime = now;
          uiUpdateCount++;
          console.log(`[UI 更新 ${uiUpdateCount}] 接收内容 (${fullContent.length} 字符):`);
          console.log(fullContent.slice(-80) + (fullContent.length > 80 ? '...' : ''));
        }
      }
    }

    console.log('\n=== 流式输出完成 ===');
    console.log('总接收块数:', chunkCount);
    console.log('总 UI 更新次数:', uiUpdateCount);
    console.log('最终内容长度:', fullContent.length);
    console.log('\n完整内容:');
    console.log(fullContent);

  } catch (error) {
    console.error('❌ 流式请求失败:', error.message);
    console.log('\n错误详情:', error);
  }
}

// 运行测试
testStreaming().catch(console.error);

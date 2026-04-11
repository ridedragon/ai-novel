#!/usr/bin/env node

console.log('=== 流式输出测试脚本 ===\n');

// 模拟 AI 流式回复的脚本
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

// 读取项目配置
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
console.log('项目名称:', packageJson.name);
console.log('项目版本:', packageJson.version);

// 模拟测试数据
const testNovel = {
  id: 'test-novel-1',
  title: '测试小说',
  chapters: [
    {
      id: 1,
      title: '第一章',
      content: '这是第一章的内容，用于测试流式输出。\n\n',
      volumeId: 'volume-1'
    },
    {
      id: 2,
      title: '第二章',
      content: '',
      volumeId: 'volume-1'
    }
  ],
  volumes: [
    {
      id: 'volume-1',
      title: '第一卷'
    }
  ],
  outlineSets: [
    {
      id: 'outline-1',
      name: '测试大纲',
      items: [
        {
          title: '第一章',
          summary: '介绍主要人物和背景'
        },
        {
          title: '第二章',
          summary: '发展故事情节，引入冲突'
        }
      ]
    }
  ]
};

// 模拟 API 配置
const apiConfig = {
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
  baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
};

// 模拟流式输出函数
async function simulateStreamingResponse() {
  console.log('\n=== 开始模拟流式输出 ===');
  console.log('API 配置:', {
    model: apiConfig.model,
    baseUrl: apiConfig.baseUrl
  });
  
  if (!apiConfig.apiKey || apiConfig.apiKey === 'your-api-key-here') {
    console.log('\n⚠️  请设置 OPENAI_API_KEY 环境变量');
    console.log('\n模拟流式输出...');
    await simulateFakeStreaming();
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: apiConfig.apiKey,
      baseURL: apiConfig.baseUrl,
      dangerouslyAllowBrowser: true
    });

    const messages = [
      {
        role: 'system',
        content: '你是一个小说家，擅长写故事。请根据上下文继续撰写小说内容。'
      },
      {
        role: 'user',
        content: `请继续撰写第二章的内容，基于第一章：\n"${testNovel.chapters[0].content}"`
      }
    ];

    console.log('\n发送请求到 AI...');
    const stream = await openai.chat.completions.create({
      model: apiConfig.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 500
    });

    console.log('\n开始接收流式响应...');
    let fullContent = '';
    let lastUpdateTime = 0;
    let chunkCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        chunkCount++;
        
        const now = Date.now();
        // 每 100ms 更新一次，模拟 UI 更新频率
        if (now - lastUpdateTime > 100) {
          lastUpdateTime = now;
          console.log(`\n[Chunk ${chunkCount}] 接收内容 (${fullContent.length} 字符):`);
          console.log(fullContent.slice(-100) + (fullContent.length > 100 ? '...' : ''));
        }
      }
    }

    console.log('\n=== 流式输出完成 ===');
    console.log('总字符数:', fullContent.length);
    console.log('总接收块数:', chunkCount);
    console.log('完整内容:');
    console.log(fullContent);

  } catch (error) {
    console.error('\n❌ 流式请求失败:', error.message);
    console.log('\n模拟流式输出...');
    await simulateFakeStreaming();
  }
}

// 模拟假的流式输出
async function simulateFakeStreaming() {
  const testContent = "第二章开始了，故事继续发展。主角发现了一个神秘的线索，这将改变整个故事的走向。\n\n他沿着线索追查，遇到了各种挑战和困难。每一步都充满了悬念和不确定性。\n\n随着调查的深入，主角逐渐发现了一个更大的阴谋，这个阴谋涉及到他身边的许多人。\n\n在关键时刻，主角必须做出一个重要的决定，这个决定将影响他的一生。\n\n第二章结束，留下了一个巨大的悬念，让读者迫不及待地想知道接下来会发生什么。";
  
  console.log('\n开始模拟流式输出...');
  let fullContent = '';
  let lastUpdateTime = 0;
  let chunkCount = 0;

  for (let i = 0; i < testContent.length; i += 10) {
    const chunk = testContent.slice(i, i + 10);
    fullContent += chunk;
    chunkCount++;
    
    const now = Date.now();
    if (now - lastUpdateTime > 100) {
      lastUpdateTime = now;
      console.log(`\n[Chunk ${chunkCount}] 接收内容 (${fullContent.length} 字符):`);
      console.log(fullContent.slice(-50) + (fullContent.length > 50 ? '...' : ''));
    }
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('\n=== 模拟流式输出完成 ===');
  console.log('总字符数:', fullContent.length);
  console.log('总接收块数:', chunkCount);
  console.log('完整内容:');
  console.log(fullContent);
}

// 检查项目中的流式输出相关代码
function checkStreamingCode() {
  console.log('\n=== 检查项目中的流式输出代码 ===');
  
  const filesToCheck = [
    'src/hooks/useAIGenerators.ts',
    'src/utils/auto-write/index.ts',
    'src/hooks/useAutoWriteManager.ts'
  ];

  filesToCheck.forEach(filePath => {
    if (fs.existsSync(path.join(__dirname, filePath))) {
      const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
      const hasStreaming = content.includes('stream: true');
      const hasStreamProcessing = content.includes('for await (const chunk of');
      
      console.log(`\n${filePath}:`);
      console.log(`  - 包含流式配置: ${hasStreaming}`);
      console.log(`  - 包含流式处理: ${hasStreamProcessing}`);
      
      if (hasStreaming) {
        const streamLines = content.split('\n').filter(line => line.includes('stream: true'));
        console.log(`  - 流式配置行: ${streamLines.length} 处`);
      }
    } else {
      console.log(`\n${filePath}: 文件不存在`);
    }
  });
}

// 主函数
async function main() {
  checkStreamingCode();
  await simulateStreamingResponse();
  
  console.log('\n=== 测试完成 ===');
  console.log('\n建议检查：');
  console.log('1. 确保 API Key 正确设置');
  console.log('2. 检查网络连接是否正常');
  console.log('3. 查看浏览器控制台是否有错误');
  console.log('4. 确认前端组件是否正确处理流式更新');
}

// 运行测试
main().catch(console.error);

#!/usr/bin/env node

console.log('=== 流式输出模拟测试 ===\n');

// 模拟流式输出的测试脚本
import fs from 'fs';
import path from 'path';

// 检查项目中的流式输出相关代码
function checkStreamingCode() {
  console.log('=== 检查项目中的流式输出代码 ===');
  
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
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
      const hasThrottling = content.includes('lastUpdateTime');
      const hasUiUpdates = content.includes('setChapters') || content.includes('onNovelUpdate');
      
      console.log(`\n${filePath}:`);
      console.log(`  - 包含流式配置: ${hasStreaming}`);
      console.log(`  - 包含流式处理: ${hasStreamProcessing}`);
      console.log(`  - 包含节流处理: ${hasThrottling}`);
      console.log(`  - 包含 UI 更新: ${hasUiUpdates}`);
      
      if (hasStreaming) {
        const streamLines = content.split('\n').filter(line => line.includes('stream: true'));
        console.log(`  - 流式配置行: ${streamLines.length} 处`);
      }
      
      if (hasStreamProcessing) {
        const processLines = content.split('\n').filter(line => line.includes('for await (const chunk of'));
        console.log(`  - 流式处理行: ${processLines.length} 处`);
      }
    } else {
      console.log(`\n${filePath}: 文件不存在`);
    }
  });
}

// 模拟流式输出的行为
async function simulateStreamingBehavior() {
  console.log('\n=== 模拟流式输出行为 ===');
  
  // 模拟 AI 生成的内容
  const testContent = "第二章开始了，故事继续发展。主角发现了一个神秘的线索，这将改变整个故事的走向。\n\n他沿着线索追查，遇到了各种挑战和困难。每一步都充满了悬念和不确定性。\n\n随着调查的深入，主角逐渐发现了一个更大的阴谋，这个阴谋涉及到他身边的许多人。\n\n在关键时刻，主角必须做出一个重要的决定，这个决定将影响他的一生。\n\n第二章结束，留下了一个巨大的悬念，让读者迫不及待地想知道接下来会发生什么。";
  
  console.log('模拟 AI 生成内容...');
  console.log(`总内容长度: ${testContent.length} 字符`);
  
  let fullContent = '';
  let lastUpdateTime = 0;
  let chunkCount = 0;
  let uiUpdateCount = 0;
  
  console.log('\n开始流式接收...');
  
  for (let i = 0; i < testContent.length; i += 15) {
    const chunk = testContent.slice(i, i + 15);
    fullContent += chunk;
    chunkCount++;
    
    const now = Date.now();
    // 模拟节流处理：每 50ms 更新一次 UI
    if (now - lastUpdateTime > 50) {
      lastUpdateTime = now;
      uiUpdateCount++;
      console.log(`[UI 更新 ${uiUpdateCount}] 接收内容 (${fullContent.length} 字符):`);
      console.log(fullContent.slice(-80) + (fullContent.length > 80 ? '...' : ''));
      
      // 模拟 UI 更新延迟
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  
  console.log('\n=== 流式输出完成 ===');
  console.log('总接收块数:', chunkCount);
  console.log('总 UI 更新次数:', uiUpdateCount);
  console.log('最终内容长度:', fullContent.length);
  
  return {
    totalChunks: chunkCount,
    totalUiUpdates: uiUpdateCount,
    contentLength: fullContent.length
  };
}

// 分析流式输出问题
function analyzeStreamingIssues() {
  console.log('\n=== 流式输出问题分析 ===');
  
  const possibleIssues = [
    {
      issue: 'API 配置问题',
      description: 'stream 参数未设置为 true',
      check: '检查请求参数中是否包含 stream: true'
    },
    {
      issue: '网络问题',
      description: '网络延迟或连接问题导致流式数据无法及时到达',
      check: '检查网络连接和 API 响应时间'
    },
    {
      issue: '前端处理问题',
      description: '前端没有正确处理流式数据或更新 UI',
      check: '检查 for await 循环和 UI 更新逻辑'
    },
    {
      issue: '节流处理问题',
      description: '节流设置不合理，导致 UI 更新不及时',
      check: '检查节流时间设置，建议 50-100ms'
    },
    {
      issue: '状态管理问题',
      description: '状态更新机制有问题，导致数据不能及时反映到 UI',
      check: '检查 setChapters 或 onNovelUpdate 的调用'
    }
  ];
  
  possibleIssues.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.issue}:`);
    console.log(`   - 描述: ${item.description}`);
    console.log(`   - 检查: ${item.check}`);
  });
}

// 主函数
async function main() {
  checkStreamingCode();
  const result = await simulateStreamingBehavior();
  analyzeStreamingIssues();
  
  console.log('\n=== 测试完成 ===');
  console.log('\n开发服务器运行在: http://localhost:8002/');
  console.log('\n建议操作:');
  console.log('1. 打开浏览器访问开发服务器');
  console.log('2. 尝试生成正文内容');
  console.log('3. 打开浏览器控制台查看是否有错误');
  console.log('4. 观察流式输出是否正常显示');
  console.log('\n模拟结果:');
  console.log(`- 总接收块数: ${result.totalChunks}`);
  console.log(`- 总 UI 更新次数: ${result.totalUiUpdates}`);
  console.log(`- 内容长度: ${result.contentLength}`);
}

// 运行测试
main().catch(console.error);

// 测试流式输出功能
import OpenAI from 'openai';

// 配置 OpenAI 客户端
const openai = new OpenAI({
  apiKey: 'YOUR_API_KEY', // 请替换为实际的 API 密钥
  baseURL: 'https://api.openai.com/v1',
  dangerouslyAllowBrowser: true,
});

async function testStreaming() {
  console.log('开始测试流式输出...');
  
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: '请写一个简短的故事，描述一个人在森林中迷路的经历' }
      ],
      stream: true,
      max_tokens: 200,
    });
    
    console.log('流式传输开始');
    
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        process.stdout.write(content); // 实时输出
        fullResponse += content;
      }
    }
    
    console.log('\n流式传输结束');
    console.log('完整响应:', fullResponse);
  } catch (error) {
    console.error('流式传输错误:', error);
  }
}

testStreaming();
#!/usr/bin/env node

console.log('=== 流式输出问题测试 ===\n');

// 模拟 AutoWriteEngine 的流式更新行为
const simulateAutoWriteEngineUpdate = (fullNovel, batchItemIds) => {
  const deltaChapters = fullNovel.chapters.filter(c => batchItemIds.includes(c.id));
  return { ...fullNovel, chapters: deltaChapters };
};

// 模拟 useNovelData.setNovels 的原始行为
const simulateOriginalSetNovels = (prevNovels, updatedNovel) => {
  return prevNovels.map(n => {
    if (n.id === updatedNovel.id) {
      return updatedNovel; // 直接替换，导致章节丢失
    }
    return n;
  });
};

// 模拟正确的合并行为
const simulateFixedSetNovels = (prevNovels, updatedNovel) => {
  return prevNovels.map(n => {
    if (n.id === updatedNovel.id) {
      // 合并章节，而不是直接替换
      const updatedChapters = n.chapters.map(c => {
        const updatedChapter = updatedNovel.chapters.find(uc => uc.id === c.id);
        return updatedChapter || c;
      });
      return { ...n, chapters: updatedChapters };
    }
    return n;
  });
};

// 测试数据
const testNovels = [
  {
    id: 'test-novel-1',
    title: '测试小说',
    chapters: [
      { id: 1, title: '第一章', content: '第一章原始内容' },
      { id: 2, title: '第二章', content: '第二章原始内容' },
      { id: 3, title: '第三章', content: '' }, // 正在生成的章节
    ]
  }
];

console.log('初始状态:');
console.log('小说章节数:', testNovels[0].chapters.length);
testNovels[0].chapters.forEach(c => console.log(`- ${c.title}: ${c.content ? '有内容' : '无内容'}`));

// 模拟正在生成第三章的流式更新
const batchItemIds = [3];
const updatedChapter3 = { id: 3, title: '第三章', content: '第三章流式内容第一段...' };
const partialNovelUpdate = {
  ...testNovels[0],
  chapters: [updatedChapter3]
};

console.log('\n--- 测试原始行为 ---');
const originalResult = simulateOriginalSetNovels(testNovels, partialNovelUpdate);
console.log('更新后章节数:', originalResult[0].chapters.length);
originalResult[0].chapters.forEach(c => console.log(`- ${c.title}: ${c.content}`));
console.log('❌ 问题：第一章和第二章消失了！');

console.log('\n--- 测试修复后行为 ---');
const fixedResult = simulateFixedSetNovels(testNovels, partialNovelUpdate);
console.log('更新后章节数:', fixedResult[0].chapters.length);
fixedResult[0].chapters.forEach(c => console.log(`- ${c.title}: ${c.content}`));
console.log('✅ 正常：所有章节都保留，第三章内容已更新');

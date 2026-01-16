import { Chapter, ChapterVersion } from '../types';

/**
 * 确保章节具有版本历史记录（初始化）
 * 【BUG 风险点 - 原文丢失】：数据结构标准化陷阱
 * 谨慎修改：此函数在初始化版本历史时，如果当前正文（content）包含未保存的手动编辑，
 * 而 versions 数组尚不存在，它会直接将当前内容锁死为“原文”。
 * 如果调用时机是在 AI 生成之后但在用户保存之前，就会导致原文备份被 AI 内容占据。
 */
export const ensureChapterVersions = (chapter: Chapter): Chapter => {
  // 如果已经有版本历史，只需检查 activeVersionId 的有效性
  if (chapter.versions && chapter.versions.length > 0) {
    const activeVersion = chapter.versions?.find(v => v.id === chapter.activeVersionId);
    if (!activeVersion) {
      return {
        ...chapter,
        activeVersionId: chapter.versions[chapter.versions.length - 1].id,
      };
    }
    return chapter;
  }

  // 核心修复：当初始化版本历史时，必须优先保护当前 content
  // 如果 content 为空且没有已存在的内容，不要强制初始化 0 字符原文
  const initialContent = chapter.content || chapter.sourceContent || '';
  if (!initialContent.trim()) {
    return chapter;
  }

  const versions: ChapterVersion[] = [];
  const baseTime = Date.now();

  versions.push({
    id: `v_${baseTime}_orig`,
    content: initialContent,
    timestamp: baseTime,
    type: 'original',
  });

  // 处理旧数据中的优化内容
  if (chapter.optimizedContent && chapter.optimizedContent !== initialContent) {
    versions.push({
      id: `v_${baseTime}_opt`,
      content: chapter.optimizedContent,
      timestamp: baseTime + 1,
      type: 'optimized',
    });
  }

  // 决定活跃版本
  let activeId = versions[0].id;
  if (chapter.showingVersion === 'optimized' && versions.length > 1) {
    activeId = versions[1].id;
  }

  return {
    ...chapter,
    versions,
    activeVersionId: activeId,
  };
};

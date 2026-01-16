import { Chapter, Novel, NovelVolume } from '../types';
import { storage } from './storage';

/**
 * 辅助函数：下载文件
 */
export const downloadFile = (content: string, filename: string, type: string = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 清理 HTML 标签和多余换行
 */
const processContent = (text: string | undefined) => {
  if (!text) return '';
  let processed = text.replace(/<[^>]+>/g, '');
  processed = processed.replace(/(\r\n|\n|\r)+/g, '\n').trim();
  return processed;
};

/**
 * 导出整本小说
 */
export const handleExportNovel = (novel: Novel) => {
  let content = `${novel.title}\n\n`;
  content += `System Prompt: ${novel.systemPrompt}\n\n`;
  content += `=================================\n\n`;

  // Volumes
  novel.volumes.forEach(vol => {
    content += `【${vol.title}】\n\n`;
    const volChapters = (novel.chapters || []).filter(
      c => c.volumeId === vol.id && (!c.subtype || c.subtype === 'story'),
    );
    volChapters.forEach(chap => {
      content += `${chap.title}\n${processContent(chap.content)}\n\n`;
    });
    content += `\n`;
  });

  // Uncategorized
  const uncategorizedChapters = (novel.chapters || []).filter(
    c => !c.volumeId && (!c.subtype || c.subtype === 'story'),
  );
  if (uncategorizedChapters.length > 0) {
    content += `【未分卷】\n\n`;
    uncategorizedChapters.forEach(chap => {
      content += `${chap.title}\n${processContent(chap.content)}\n\n`;
    });
  }

  downloadFile(content, `${novel.title}.txt`);
};

/**
 * 导出分卷
 */
export const handleExportVolume = async (volume: NovelVolume, chapters: Chapter[]) => {
  // 核心修复：异步并行加载本卷所有章节内容，解决冷热分离导致的内容缺失问题
  const volChapters = chapters.filter(c => c.volumeId === volume.id && (!c.subtype || c.subtype === 'story'));
  const chaptersWithContent = await Promise.all(
    volChapters.map(async chap => {
      if (chap.content && chap.content.trim().length > 0) return chap;
      const fullContent = await storage.getChapterContent(chap.id);
      return { ...chap, content: fullContent || '' };
    }),
  );

  let content = `【${volume.title}】\n\n`;
  chaptersWithContent.forEach(chap => {
    content += `${chap.title}\n${processContent(chap.content)}\n\n`;
  });

  downloadFile(content, `${volume.title}.txt`);
};

/**
 * 导出单章
 */
export const handleExportChapter = (chapter: Chapter) => {
  const content = `${chapter.title}\n${processContent(chapter.content)}`;
  downloadFile(content, `${chapter.title}.txt`);
};

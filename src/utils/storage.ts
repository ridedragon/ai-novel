import { del, get, set } from 'idb-keyval';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel } from '../types';

const NOVELS_KEY = 'novels';
const VERSIONS_PREFIX = 'versions_';

// 用于在内存中缓存章节内容的哈希或副本，实现脏检查，避免重复写入
const lastSavedContentCache = new Map<number, string>();

export const storage = {
  async getNovels(): Promise<Novel[]> {
    try {
      // 1. 先获取主索引数据
      const novels = await get<Novel[]>(NOVELS_KEY);

      if (novels) {
        // 2. 并行加载所有章节的正文内容 (优化 985 个章节的加载速度)
        for (const novel of novels) {
          // 使用 Promise.all 批量获取当前小说的所有章节内容
          const contentPromises = novel.chapters.map(async chapter => {
            const content = await get<string>(`chapter_content_${chapter.id}`);
            if (content !== undefined) {
              chapter.content = content;
              // 同步到脏检查缓存
              lastSavedContentCache.set(chapter.id, content);
            }
          });
          await Promise.all(contentPromises);
        }
        return novels;
      }

      // If not in IndexedDB, try localStorage (migration path)
      const localNovels = localStorage.getItem(NOVELS_KEY);
      if (localNovels) {
        try {
          const parsed = JSON.parse(localNovels);
          // Save to IndexedDB
          await set(NOVELS_KEY, parsed);
          // Clear from localStorage to free up space, but maybe keep it for safety until confirmed?
          // For now, let's just leave it or clear it.
          // Since QuotaExceededError is the issue, we should probably eventually clear it.
          // Let's clear it to ensure we don't hit the limit again with other keys.
          localStorage.removeItem(NOVELS_KEY);
          return parsed;
        } catch (e) {
          console.error('Failed to parse novels from localStorage', e);
          return [];
        }
      }

      return [];
    } catch (e) {
      console.error('Failed to load novels', e);
      return [];
    }
  },

  async saveNovels(novels: Novel[]): Promise<void> {
    const startTime = Date.now();
    let contentWriteCount = 0;
    try {
      // 1. 章节内容增量存储
      for (const novel of novels) {
        for (const chapter of novel.chapters) {
          // 异步保存版本数据 (非常驻内存，无需等待)
          if (chapter.versions && chapter.versions.length > 0) {
            this.saveChapterVersions(chapter.id, chapter.versions);
          }

          // 核心优化：脏检查。只有当内容真正改变时，才写入独立的章节 Key
          const currentContent = chapter.content || '';
          if (currentContent !== lastSavedContentCache.get(chapter.id)) {
            await set(`chapter_content_${chapter.id}`, currentContent);
            lastSavedContentCache.set(chapter.id, currentContent);
            contentWriteCount++;
          }
        }
      }

      const contentEndTime = Date.now();

      // 2. 剥离正文后的主索引瘦身保存
      const strippedNovels = novels.map(novel => ({
        ...novel,
        chapters: novel.chapters.map(chapter => {
          // 从主 JSON 中剥离 content 和 versions
          const { versions, content, ...rest } = chapter;
          return rest; // rest 只包含标题、ID、状态等元数据
        }),
      }));

      const serializeTime = Date.now();
      await set(NOVELS_KEY, strippedNovels);
      const endTime = Date.now();

      // 在 PowerShell 终端打印详细性能数据
      terminal.log(`
[PERF] storage.saveNovels (增量模式):
- 章节增量保存耗时: ${contentEndTime - startTime}ms (更新章节数: ${contentWriteCount})
- 主表瘦身保存耗时: ${endTime - serializeTime}ms
- 总计总计: ${endTime - startTime}ms
- 章节总数: ${novels.reduce((acc, n) => acc + n.chapters.length, 0)}
      `);
    } catch (e) {
      console.error('Failed to save novels to IndexedDB', e);
      throw e;
    }
  },

  async getChapterVersions(chapterId: number): Promise<ChapterVersion[]> {
    try {
      const versions = await get<ChapterVersion[]>(`${VERSIONS_PREFIX}${chapterId}`);
      return versions || [];
    } catch (e) {
      console.error('Failed to get chapter versions', e);
      return [];
    }
  },

  async saveChapterVersions(chapterId: number, versions: ChapterVersion[]): Promise<void> {
    try {
      await set(`${VERSIONS_PREFIX}${chapterId}`, versions);
    } catch (e) {
      console.error('Failed to save chapter versions', e);
    }
  },

  async deleteChapterVersions(chapterId: number): Promise<void> {
    try {
      await del(`${VERSIONS_PREFIX}${chapterId}`);
    } catch (e) {
      console.error('Failed to delete chapter versions', e);
    }
  },
};

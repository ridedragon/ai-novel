import { del, get, set } from 'idb-keyval';
import terminal from 'virtual:terminal';
import { ChapterVersion, Novel } from '../types';

const NOVELS_KEY = 'novels';
const VERSIONS_PREFIX = 'versions_';

export const storage = {
  async getNovels(): Promise<Novel[]> {
    try {
      // First, try to get from IndexedDB
      const novels = await get<Novel[]>(NOVELS_KEY);

      if (novels) {
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
    try {
      // --- 性能调查：监控主数据保存流程 ---
      // 冷热分离：保存主数据时剥离 versions
      const strippedNovels = novels.map(novel => ({
        ...novel,
        chapters: novel.chapters.map(chapter => {
          if (chapter.versions && chapter.versions.length > 0) {
            // 异步保存版本数据，不阻塞主数据保存
            this.saveChapterVersions(chapter.id, chapter.versions);
          }
          // 返回不包含 versions 的章节对象
          const { versions, ...rest } = chapter;
          return rest;
        }),
      }));

      const serializeTime = Date.now();
      await set(NOVELS_KEY, strippedNovels);
      const endTime = Date.now();

      // 在 PowerShell 终端打印耗时
      terminal.log(`
[PERF] storage.saveNovels:
- 处理数据耗时: ${serializeTime - startTime}ms
- IndexedDB 写入耗时: ${endTime - serializeTime}ms
- 总计: ${endTime - startTime}ms
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
